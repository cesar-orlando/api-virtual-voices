import { Message, Client } from 'whatsapp-web.js';
import { createNewChatRecord, updateChatRecord, sendAndRecordBotResponse } from './chatRecordUtils';
import { handleAudioMessage, handleImageMessage, handleVideoMessage } from './mediaUtils';
import { getDbConnection } from "../../config/connectionManager";
import { getWhatsappChatModel } from '../../models/whatsappChat.model';
import { getSessionModel } from '../../models/whatsappSession.model';
import { Connection } from 'mongoose';
import getTableModel from '../../models/table.model';
import getRecordModel from '../../models/record.model';

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

  console.log('\n💬💬💬 WHATSAPP MESSAGE RECEIVED IN GENERAL HANDLER! 💬💬💬');
  console.log(`📱 From: ${message.from}`);
  console.log(`📝 Message: "${message.body}"`);
  console.log(`🏢 Company: ${company}`);
  console.log(`📱 Session: ${sessionName}`);
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  
  // Check if message contains intent to CREATE a new calendar event (not just calendar-related words)
  const calendarCreationKeywords = [
    'agendar', 'agéndame', 'programar', 'crear evento', 'crear cita', 
    'reservar', 'apartar', 'separa', 'bloquea', 'quiero agendar',
    'necesito agendar', 'programa una', 'crea un evento', 'agenda una'
  ];
  
  const messageText = message.body?.toLowerCase() || '';
  
  // Check for calendar creation intent (more specific)
  const hasCreationIntent = calendarCreationKeywords.some(keyword => 
    messageText.includes(keyword.toLowerCase())
  );
  
  // Exclude follow-up messages that are just providing info
  const isFollowUpMessage = messageText.match(/^[a-zA-Z0-9@.\s]{1,50}$/) && 
    (messageText.includes('@') || messageText.match(/^\d+$/) || messageText.split(' ').length <= 3);
  
  if (hasCreationIntent && !isFollowUpMessage) {
    console.log('📅 ⚠️  MESSAGE CONTAINS CALENDAR CREATION INTENT - MIGHT TRIGGER GOOGLE CALENDAR TOOL!');
    console.log(`🔍 Creation intent detected in: "${messageText}"`);
  } else if (messageText.includes('calendar') || messageText.includes('evento') || messageText.includes('cita')) {
    console.log('📝 Calendar-related words detected but no creation intent');
  } else {
    console.log('📝 No calendar creation intent detected');
  }
  console.log('='.repeat(70));

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
      ]
    });

    // --- VALIDACIÓN DE IA EN PROSPECTOS ---

    const Record = getRecordModel(conn);
    const prospecto = await Record.findOne({ tableSlug: 'prospectos', c_name: company, 'data.number': { $in: [cleanUserPhone, Number(cleanUserPhone)] } });

    // Crea un nuevo chat si no existe
    if (!existingRecord) {
      const Session = getSessionModel(conn);
      const session = await Session.findOne({ name: sessionName });
      existingRecord = await createNewChatRecord(WhatsappChat, "prospectos", `${cleanUserPhone}@c.us`, message, session);
    } else {
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
  const DELAY_MS = 15000; // 15 seconds

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
  
  // Generate and send response using the latest record state - this should only be called ONCE
  await sendAndRecordBotResponse(company, sessionName, client, lastMessage, latestRecord, conn);
}