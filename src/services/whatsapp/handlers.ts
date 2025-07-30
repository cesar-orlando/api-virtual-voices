import { Message, Client } from 'whatsapp-web.js';
import { createNewChatRecord, updateChatRecord, sendAndRecordBotResponse } from './chatRecordUtils';
import { handleAudioMessage, handleImageMessage, handleVideoMessage } from './mediaUtils';
import { getDbConnection } from "../../config/connectionManager";
import { getWhatsappChatModel } from '../../models/whatsappChat.model';
import { getSessionModel } from '../../models/session.model';
import { Connection } from 'mongoose';
import getTableModel from '../../models/table.model';
import getRecordModel from '../../models/record.model';
import getIaConfigModel from '../../models/iaConfig.model';
import { MessagingAgentService } from '../agents/MessagingAgentService';

// Initialize the MessagingAgent service
const messagingAgentService = new MessagingAgentService();

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
          { name: "ia", label: "IA", type: "boolean", order: 3 }
        ]
      });
      await newTable.save();
    }

    const WhatsappChat = getWhatsappChatModel(conn);

    // Verifica si el registro ya existe
    const cleanUserPhone = userPhone.replace('@c.us', '');
    let existingRecord = await WhatsappChat.findOne({
      $or: [
        { phone: cleanUserPhone },
        { phone: `${cleanUserPhone}@c.us` }
      ],
      'session.name': sessionName
    });

    // --- VALIDACIÓN DE IA EN PROSPECTOS ---

    const Record = getRecordModel(conn);
    const prospecto = await Record.findOne({ tableSlug: 'prospectos', c_name: company, 'data.number': { $in: [cleanUserPhone, Number(cleanUserPhone)] } });

    // Crea un nuevo chat si no existe
    if (!existingRecord) {
      console.log(`📞 No se encontró chat existente para ${userPhone} con [${company}:${sessionName}], creando uno nuevo...`);
      const Session = getSessionModel(conn);
      const session = await Session.findOne({ name: sessionName });
      existingRecord = await createNewChatRecord(WhatsappChat, "prospectos", `${cleanUserPhone}@c.us`, message, session);
    } else {
      console.log(`📞 Chat existente encontrado para ${userPhone} con [${company}:${sessionName}]`);
      await updateChatRecord(company, existingRecord, message.fromMe ? "outbound" : "inbound", message, "human");
    }

    // --- FIN VALIDACIÓN DE IA ---
    if (prospecto && prospecto.data && prospecto.data.ia === false) {
      console.log(`🤖 IA desactivada para ${userPhone}, debe responder un agente.`);
      // Aquí podrías emitir un evento para el agente humano si lo deseas
      return;
    } else if (message.fromMe) {
      console.log(`📤 Mensaje enviado por el bot/usuario, no se requiere respuesta`);
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
  const DELAY_MS = 5000; // Reducido de 15 a 5 segundos para mejor responsividad
  
  // Always record the incoming message first
  await updateChatRecord(company, existingRecord, "inbound", message, "human");

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
    // First message from this user, start the delay
    console.log(`⏰ Iniciando delay de 15s para ${userPhone}`);
    
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
      console.log(`🚀 Procesando respuesta para ${userPhone} después de ${DELAY_MS/1000}s. Mensajes: ${pendingData.messages.length}`);
      
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
  
  console.log(`📊 Generando respuesta consolidada para ${messages.length} mensajes de ${userPhone}`);
  console.log(`🤖 Using BaseAgent system`);
  
  // Debug específico para empresas inmobiliarias
  if (company === 'grupo-milkasa') {
    console.log(`🔍 MILKASA DEBUG - Procesando mensajes acumulados`);
    console.log(`🔍 MILKASA DEBUG - Número de mensajes:`, messages.length);
    console.log(`🔍 MILKASA DEBUG - Último mensaje:`, lastMessage.body);
    console.log(`🔍 MILKASA DEBUG - Historial total en BD:`, latestRecord.messages?.length || 0);
    if (latestRecord.messages?.length > 0) {
      console.log(`🔍 MILKASA DEBUG - Últimos 3 mensajes del historial:`, 
        latestRecord.messages.slice(-3).map((m: any) => ({
          direction: m.direction,
          body: m.body?.substring(0, 50) + '...',
          respondedBy: m.respondedBy
        }))
      );
    }
  }
  
  if (company === 'grupokg' || company === 'grupo-kg') {
    console.log(`🔍 GRUPO-KG DEBUG - Procesando mensajes acumulados`);
    console.log(`🔍 GRUPO-KG DEBUG - Número de mensajes:`, messages.length);
    console.log(`🔍 GRUPO-KG DEBUG - Último mensaje:`, lastMessage.body);
    console.log(`🔍 GRUPO-KG DEBUG - Historial total en BD:`, latestRecord.messages?.length || 0);
    if (latestRecord.messages?.length > 0) {
      console.log(`🔍 GRUPO-KG DEBUG - Últimos 3 mensajes del historial:`, 
        latestRecord.messages.slice(-3).map((m: any) => ({
          direction: m.direction,
          body: m.body?.substring(0, 50) + '...',
          respondedBy: m.respondedBy
        }))
      );
    }
  }
  
  try {
    console.log('🤖 Using BaseAgent system');

    const sessionModel = getSessionModel(conn);
    const session = await sessionModel.findOne({ name: sessionName });
    const IaConfig = getIaConfigModel(conn);
    const config = await IaConfig.findOne({ _id: session?.IA?.id });
    
    const response = await messagingAgentService.processWhatsAppMessage(
      company,
      lastMessage.body,
      userPhone,
      conn,
      config?._id.toString(),
      session?._id.toString(),
    );
    
    // Debug específico para empresas inmobiliarias
    if (company === 'grupo-milkasa') {
      console.log(`🔍 MILKASA DEBUG - Respuesta generada:`, response?.substring(0, 100) + '...');
    }
    if (company === 'grupokg' || company === 'grupo-kg') {
      console.log(`🔍 GRUPO-KG DEBUG - Respuesta generada:`, response?.substring(0, 100) + '...');
    }
    
    // Send the response directly
    await sendCustomResponse(client, lastMessage, response, company, sessionName, latestRecord, conn);
    
  } catch (error) {
    console.error(`❌ Error with BaseAgent system:`, error);
    // Fallback response
    await sendCustomResponse(client, lastMessage, "Disculpa, hubo un problema técnico. Un asesor se pondrá en contacto contigo.", company, sessionName, latestRecord, conn);
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
    
    // Send the message
    const sentMessage = await client.sendMessage(message.from, response);
    
    // Record the bot response in the chat
    await updateChatRecord(company, existingRecord, "outbound-api", sentMessage, "bot");
    
    console.log(`✅ Custom response sent successfully for ${company}`);
    
  } catch (error) {
    console.error(`❌ Error sending custom response for ${company}:`, error);
    throw error;
  }
}