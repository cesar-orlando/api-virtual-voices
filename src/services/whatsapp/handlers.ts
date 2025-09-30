import { Message, Client } from 'whatsapp-web.js';
import { updateChatRecord } from './chatRecordUtils';
import { getImageFromUrl, getPDFFromUrl, handleAudioMessage, handleFileMessage, handleImageMessage, handleVideoMessage } from './mediaUtils';
import { getDbConnection } from "../../config/connectionManager";
import { getWhatsappChatModel } from '../../models/whatsappChat.model';
import { getSessionModel } from '../../models/session.model';
import { Connection } from 'mongoose';
import getTableModel from '../../models/table.model';
import getRecordModel from '../../models/record.model';
import getIaConfigModel from '../../models/iaConfig.model';
import { MessagingAgentService } from '../agents/MessagingAgentService';
import * as fs from 'node:fs';

// Track messages sent by our bot so we don't misclassify them as human outbound
const botSentMessageIds = new Set<string>();
function rememberBotSentMessage(id?: string) {
  if (!id) return;
  botSentMessageIds.add(id);
  // Auto-expire after 5 minutes to avoid unbounded growth
  setTimeout(() => botSentMessageIds.delete(id), 5 * 60 * 1000).unref?.();
}

// Initialize the MessagingAgent service
const messagingAgentService = new MessagingAgentService();

// Store Calendar Assistant instances per company

// Store pending timeouts for each user
const pendingResponses = new Map<string, {
  timeout: NodeJS.Timeout;
  messages: Message[];
  client: Client;
  company: string;
  sessionName: string;
  existingRecord: any;
  conn: Connection;
}>();

export async function handleIncomingMessage(message: Message, client: Client, company: string, sessionName: string) {

  if (message.isStatus) return;

  let statusText: string | undefined = undefined;

  if (message.hasQuotedMsg) {
    const quoted = await message.getQuotedMessage();
    // Check if the quoted message is from you
    if (quoted.fromMe) {
      statusText = quoted.body;
      // Puedes guardar statusText para usarlo después
    }
  }

  // Validar que no sea un mensaje de grupo
  if (message.from.endsWith('@g.us') || message.to.endsWith('@g.us')) {
    console.log(`🚫 Mensaje de grupo ignorado: ${message.from}`);
    return;
  }
  
  // Media handling
  if (message.type === 'ptt') {
    message = await handleAudioMessage(message, statusText);
  }
  if (message.type === 'image') {
    message = await handleImageMessage(message, statusText);
  }
  if (message.type === 'video') {
    message = await handleVideoMessage(message, statusText);
  }
  if (message.type === 'document') {
    message = await handleFileMessage(message, statusText);
  }

  // Validar que el mensaje no esté vacío o sea solo espacios
  if (!message.body || message.body.trim().length === 0) {
    console.log(`🚫 Mensaje vacío ignorado de: ${message.from}`);
    return;
  }

  // Validar que no sea solo emojis o caracteres especiales sin texto real
  const cleanMessage = message.body.trim();
  if (cleanMessage.length < 2) {
    console.log(`🚫 Mensaje muy corto ignorado de: ${message.from} - "${cleanMessage}"`);
    return;
  }

  const userPhone = message.fromMe ? message.to : message.from;

  // Permitir que la IA conteste a todos los números, incluyendo 4521311888

  try {
    const conn = await getDbConnection(company);

    const Table = getTableModel(conn);

    // Verifica si la tabla existe
    const table = await Table.findOne({ slug: "prospectos", c_name: company });

    if (!table) {
      const newTable = new Table({
        name: "Prospectos",
        slug: "prospectos",
        icon: "👤",
        c_name: company,
        createdBy: 'whatsapp-bot',
        fields: [
          { name: "name", label: "Nombre", type: "text", order: 1 },
          { name: "number", label: "Número", type: "number", order: 2 },
          { name: "ia", label: "IA", type: "boolean", order: 3 },
          { name: "lastmessage", label: "Ultimo Mensaje", type: "text", required: false, options: [], order: 4 },
          { name: "lastmessagedate", label: "Fecha Ultimo Mensaje", type: "date", required: false, options: [], order: 5 }
        ]
      });
      await newTable.save();
    }

    const WhatsappChat = getWhatsappChatModel(conn);

    // Upsert atómico del chat para evitar duplicados por carreras
    const cleanUserPhone = userPhone.replace('@c.us', '');
    const SessionModel = getSessionModel(conn);
    const session = await SessionModel.findOne({ name: sessionName });
    const existingRecord = await WhatsappChat.findOneAndUpdate(
      {
        'session.name': sessionName,
        $or: [
          { phone: cleanUserPhone },
          { phone: `${cleanUserPhone}@c.us` }
        ]
      },
      {
        $setOnInsert: {
          tableSlug: 'prospectos',
          phone: `${cleanUserPhone}@c.us`,
          messages: []
        },
        $set: {
          ...(session?._id ? { 'session.id': session._id } : {}),
          ...(session?.name ? { 'session.name': session.name } : {}),
          ...(session?.user?.id ? { 'advisor.id': session.user.id } : {}),
          ...(session?.user?.name ? { 'advisor.name': session.user.name } : {}),
        }
      },
      { upsert: true, new: true }
    );

    // --- VALIDACIÓN DE IA EN PROSPECTOS ---

    const Record = getRecordModel(conn);
    const prospecto = await Record.findOne({ tableSlug: 'prospectos', c_name: company, 'data.number': { $in: [cleanUserPhone, Number(cleanUserPhone)] } });
    // Siempre anexar el mensaje actual de forma idempotente
    // If this message was sent by our bot (fromMe and ID is known), skip human classification here;
    // it'll be recorded explicitly as outbound-api by sendCustomResponse.
    let latestMessage;
    if (message.fromMe && botSentMessageIds.has(message.id?.id)) {
      latestMessage = undefined;
    } else {
      latestMessage = await updateChatRecord(
        company,
        existingRecord,
        message.fromMe ? "outbound" : "inbound",
        message,
        "human",
        prospecto
      );
    }
    let auditContext
    auditContext = {
      skipAudit: true,
    };
    await prospecto?.updateOne({
      $set: {
        'data.lastmessage': message.body,
        'data.lastmessagedate': message.timestamp ? new Date(message.timestamp * 1000) : new Date()
      }
    }).setOptions({ context: 'query', auditContext, $locals: { auditContext } } as any);

    if (session.status !== 'connected') {
      console.log(`🚫 AI desconectada para ${company}:${session.name}, ignorando mensaje.`);
      return;
    }

    // --- FIN VALIDACIÓN DE IA ---
    if (prospecto && prospecto.data && prospecto.data.ia === false) {
      console.log(`🤖 IA desactivada para ${userPhone}, debe responder un agente.`);
      // Aquí podrías emitir un evento para el agente humano si lo deseas
      return;
    } else if (!latestMessage) {
      console.log(`📤 Mensaje enviado por el bot, no se requiere respuesta`);
      return;
    } else if (latestMessage.direction === "outbound") {
      console.log(`📤 Mensaje enviado por empleado, apagando IA`);
      auditContext = {
        _updatedByUser: { id: 'Bot', name: session?.IA.name },
        _updatedBy: session?.IA.name,
        _auditSource: 'Intervención Whatsapp',
      }
      await prospecto?.updateOne({ $set: { 'data.ia': false } }).setOptions({ context: 'query', auditContext, $locals: { auditContext } } as any);
      
      
      return;
    }

    // Implement 15-second delay to collect multiple messages
    await handleDelayedResponse(userPhone, message, client, company, sessionName, existingRecord, conn);

  } catch (error) {
    console.error('Error al manejar el mensaje entrante:', error);
  }
}

async function handleDelayedResponse(
  userPhone: string,
  message: Message,
  client: Client,
  company: string,
  sessionName: string,
  existingRecord: any,
  conn: Connection
) {
  const DELAY_MS = 15000; // 15 segundos para mejor responsividad

  // Get the chat to send typing indicator
  const chat = await message.getChat();
  
  // Send typing indicator before sending the message
  await chat.sendStateTyping();

  // Check if there's already a pending response for this user
  const existingPending = pendingResponses.get(userPhone);
  
  if (existingPending) {
    // Clear the existing timeout
    clearTimeout(existingPending.timeout);
    
    // Add this message to the collection
    existingPending.messages.push(message);
    console.log(`📝 Agregando mensaje a la cola para ${userPhone}. Total: ${existingPending.messages.length} mensajes`);
    
    // Update the existing record reference to the latest state
    existingPending.existingRecord = existingRecord;
  } else {

    // Store the pending response data
    pendingResponses.set(userPhone, {
      timeout: setTimeout(() => {}, DELAY_MS), // Will be replaced immediately
      messages: [message],
      client,
      company,
      sessionName,
      existingRecord,
      conn
    });
  }
  
  // Set new timeout
  const pendingData = pendingResponses.get(userPhone)!;
  
  pendingData.timeout = setTimeout(async () => {
    try {
      // Process all accumulated messages
      await processAccumulatedMessages(userPhone, pendingData);
      
      // Clean up
      pendingResponses.delete(userPhone);
    } catch (error) {
      console.error(`❌ Error procesando mensajes acumulados para ${userPhone}:`, error);
      pendingResponses.delete(userPhone);
    }
  }, DELAY_MS);
}

async function processAccumulatedMessages(userPhone: string, pendingData: {
  messages: Message[];
  client: Client;
  company: string;
  sessionName: string;
  existingRecord: any;
  conn: Connection;
}) {
  const { messages, client, company, sessionName, existingRecord, conn } = pendingData;
  
  // Get the latest record state from the stored reference (already updated with all messages)
  const latestRecord = existingRecord;
  
  if (!latestRecord) {
    console.error(`No se encontró el registro para ${userPhone}`);
    return;
  }
  
  // Use the last message for the response context
  const lastMessage = messages[messages.length - 1];
  
  try {

    const sessionModel = getSessionModel(conn);
    const session = await sessionModel.findOne({ name: sessionName });
    const IaConfig = getIaConfigModel(conn);
    const config = await IaConfig.findOne({ _id: session?.IA?.id });

    // Get the chat to send typing indicator
    const chat = await lastMessage.getChat();

    // Send typing indicator before sending the message
    await chat.sendStateTyping();
  
    try {

      const response = await messagingAgentService.processWhatsAppMessage(
        company,
        lastMessage.body,
        userPhone,
        conn,
        config?._id.toString(),
        session?._id.toString(),
        undefined, // providedChatHistory
      );
      
      // Send the response directly
      await sendCustomResponse(client, lastMessage, response, company, sessionName, latestRecord, conn);
      
    } catch (error) {
      console.error(`❌ Error with BaseAgent system:`, error);
      // Fallback response
      await sendCustomResponse(client, lastMessage, "En un momento un asesor se pondrá en contacto con usted.", company, sessionName, latestRecord, conn);
    }

    // Stop typing indicator
    await chat.clearState();

  } catch (error) {
    console.error(`❌ Error in processAccumulatedMessages:`, error);
    // Final fallback response
    await sendCustomResponse(client, lastMessage, "En un momento un asesor se pondrá en contacto con usted.", company, sessionName, latestRecord, conn);
  }
}

/**
 * Send a custom response using the new agent system
 */
async function sendCustomResponse(
  client: Client,
  message: Message,
  response: string,
  company: string,
  sessionName: string,
  existingRecord: any,
  conn: Connection
) {
  try {
    console.log(`📤 Sending custom response for ${company}: ${response.substring(0, 50)}...`);
    
    // Detect image URLs from amazonaws in the response
    const imageRegex = /(https?:\/\/[^\s]+amazonaws[^\s]+\.(jpg|jpeg|png|gif))/gi;
    const foundImages = typeof response === 'string' ? response.match(imageRegex) : [];
    
    // Detect PDF URLs from amazonaws in the response
    const pdfRegex = /(https?:\/\/[^\s]+amazonaws[^\s]+\.pdf)/gi;
    const foundPDFs = typeof response === 'string' ? response.match(pdfRegex) : [];
    
    let textOnly = response;
    
    // Remove image URLs from text
    if (foundImages && foundImages.length > 0) {
      foundImages.forEach(url => {
        textOnly = textOnly.replace(url, '').trim();
      });
    }
    
    // Remove PDF URLs from text
    if (foundPDFs && foundPDFs.length > 0) {
      foundPDFs.forEach(url => {
        textOnly = textOnly.replace(url, '').trim();
      });
    }

    // Send images first
    if (foundImages && foundImages.length > 0) {
      for (let i = 0; i < foundImages.length; i++) {
        const result = await getImageFromUrl({ imageUrls: foundImages[i], i });
        // Enviar imagen desde archivo local
        let sentMessage = await client.sendMessage(message.from, result.media, { 
          caption: i === 0 && !foundPDFs?.length ? textOnly : undefined 
        });
        // Mark as bot-sent before persisting so message_create won't be misclassified
        rememberBotSentMessage(sentMessage.id?.id);
        sentMessage.body = (sentMessage.body || '') + '\n' + foundImages[i];
        await updateChatRecord(company, existingRecord, "outbound-api", sentMessage, "bot", null);
        fs.unlink(result.filePath, (err) => {
          if (err) {
            console.error(`Error deleting file ${result.filePath}:`, err);
          }
        });
      }
    }

    // Send PDFs
    if (foundPDFs && foundPDFs.length > 0) {
      for (let i = 0; i < foundPDFs.length; i++) {
        const result = await getPDFFromUrl({ pdfUrl: foundPDFs[i], index: i });
        
        // Enviar PDF desde archivo local
        let sentMessage = await client.sendMessage(message.from, result.media, { 
          caption: (i === 0 && !foundImages?.length) ? textOnly : `📄 Documento adjunto` 
        });
        
        // Mark as bot-sent before persisting
        rememberBotSentMessage(sentMessage.id?.id);
        sentMessage.body = (sentMessage.body || '') + '\n' + foundPDFs[i];
        await updateChatRecord(company, existingRecord, "outbound-api", sentMessage, "bot", null);
        
        // Limpiar archivo temporal
        fs.unlink(result.filePath, (err) => {
          if (err) {
            console.error(`Error deleting PDF file ${result.filePath}:`, err);
          }
        });
      }
    }

    // Send text message if there's remaining text and no media was sent
    if (textOnly && textOnly.trim().length > 0 && !foundImages?.length && !foundPDFs?.length) {
      const sentMessage = await client.sendMessage(message.from, textOnly);
      // Mark as bot-sent before persisting
      rememberBotSentMessage(sentMessage.id?.id);
      await updateChatRecord(company, existingRecord, "outbound-api", sentMessage, "bot", null);
    }
  } catch (error) {
    console.error(`❌ Error sending custom response for ${company}:`, error);
    throw error;
  }
}