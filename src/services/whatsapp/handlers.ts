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
import { Assistant } from '../agents/Assistant';

// Initialize the MessagingAgent service
const messagingAgentService = new MessagingAgentService();

// Store Calendar Assistant instances per company
const calendarAssistants = new Map<string, Assistant>();

// Calendar keywords to detect calendar-related messages
const CALENDAR_KEYWORDS = [
  // Spanish calendar terms
  'cita', 'reunión', 'evento', 'calendario', 'agendar', 'programar', 'reservar',
  'cancelar', 'editar', 'modificar', 'cambiar', 'reprogramar', 'mover',
  'cita médica', 'junta', 'llamada', 'videollamada', 'zoom', 'meet',
  'crear evento', 'nuevo evento', 'eliminar evento', 'borrar evento',
  // English equivalents
  'meeting', 'appointment', 'event', 'calendar', 'schedule', 'book',
  'cancel', 'edit', 'modify', 'change', 'reschedule', 'move',
  'call', 'videocall', 'create event', 'new event', 'delete event'
];

// Time keywords that need to be combined with action words
const TIME_KEYWORDS = [
  'hora', 'fecha', 'día', 'semana', 'mes',
  'mañana', 'hoy', 'pasado mañana', 'ayer', 'ahora', 'tarde', 'noche',
  'próxima semana', 'la semana que viene', 'el próximo', 'la próxima',
  'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo',
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  'time', 'date', 'tomorrow', 'today', 'yesterday', 'now',
  'next week', 'next', 'monday', 'tuesday', 'wednesday', 'thursday',
  'friday', 'saturday', 'sunday'
];

// Action verbs for calendar operations
const ACTION_KEYWORDS = [
  'quiero', 'necesito', 'puedes', 'agenda', 'programa', 'crea', 'elimina', 'borra',
  'want', 'need', 'can you', 'create', 'delete', 'schedule', 'book'
];

function isCalendarRelatedMessage(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  
  // Direct calendar keywords (strong indicators)
  const hasDirectCalendarKeyword = CALENDAR_KEYWORDS.some(keyword => 
    lowerMessage.includes(keyword.toLowerCase())
  );
  
  if (hasDirectCalendarKeyword) {
    return true;
  }
  
  // Check for combination of action + time keywords
  const hasActionKeyword = ACTION_KEYWORDS.some(keyword => 
    lowerMessage.includes(keyword.toLowerCase())
  );
  
  const hasTimeKeyword = TIME_KEYWORDS.some(keyword => 
    lowerMessage.includes(keyword.toLowerCase())
  );
  
  // Return true only if we have both action and time keywords
  return hasActionKeyword && hasTimeKeyword;
}

function getCalendarAssistant(company: string): Assistant {
  if (!calendarAssistants.has(company)) {
    const assistant = new Assistant(company);
    calendarAssistants.set(company, assistant);
  }
  return calendarAssistants.get(company)!;
}

async function initializeCalendarAssistant(company: string): Promise<Assistant> {
  const assistant = getCalendarAssistant(company);
  
  try {
    await assistant.initialize();
    return assistant;
  } catch (error) {
    console.error(`❌ Failed to initialize Calendar Assistant for company ${company}:`, error);
    throw new Error(`Calendar Assistant initialization failed for ${company}: ${error.message}`);
  }
}

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
    console.log(`⏰ Iniciando delay de 5s para ${userPhone}`);
    
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
    
  
  // Check if any of the messages are calendar-related
  const isCalendarMessage = messages.some(msg => isCalendarRelatedMessage(msg.body));
  
  if (isCalendarMessage) {
    console.log(`📅 Calendar-related message detected for ${userPhone}`);
    console.log(`📝 Message content: ${messages.map(msg => msg.body).join(' ').substring(0, 100)}...`);
    
    try {
      console.log(`🔧 Step 1: Attempting to initialize Calendar Assistant for company: ${company}`);
      const calendarAssistant = await initializeCalendarAssistant(company);
      console.log(`✅ Step 1 Complete: Calendar Assistant initialized successfully`);
      
      // Combine all messages into context for the Calendar Assistant
      const combinedMessage = messages.map(msg => msg.body).join(' ');
      
      console.log(`� Step 2: Processing calendar request: "${combinedMessage}"`);
      
      const response = await calendarAssistant.processMessage(combinedMessage, {
        company,
        phoneUser: userPhone.replace('@c.us', ''),
        chatHistory: [] // You could populate this with recent chat history if needed
      });
      
      console.log(`✅ Step 2 Complete: Calendar Assistant response: ${response.substring(0, 100)}...`);
      
      console.log(`🔧 Step 3: Sending calendar assistant response`);
      // Send the calendar assistant response
      await sendCustomResponse(client, lastMessage, response, company, sessionName, latestRecord, conn);
      console.log(`✅ Step 3 Complete: Response sent successfully`);
      
      console.log(`🎯 Calendar message processing completed successfully. Returning early.`);
      return; // CRITICAL: Return early to prevent regular agent processing
      
    } catch (error) {
      console.error(`❌ Calendar Assistant Error for ${userPhone}:`, error);
      console.error(`❌ Calendar Assistant error type:`, error.constructor.name);
      console.error(`❌ Calendar Assistant error message:`, error.message);
      
      // Fallback to regular agent instead of showing error
      console.log(`🔄 Calendar Assistant failed, falling back to regular WhatsApp agent`);
      // Don't return here - let it fall through to regular agent processing
    }
  }
  
  console.log(`🤖 Using BaseAgent system for non-calendar message`);
  
  try {
    console.log(`🔧 Step 4: Using regular WhatsApp agent for ${userPhone}`);
    
    // Add a flag to indicate this is a calendar fallback
    const isCalendarFallback = isCalendarMessage;
    console.log(`📅 Calendar fallback mode: ${isCalendarFallback}`);
    
    const response = await messagingAgentService.processWhatsAppMessage(
      company,
      lastMessage.body,
      userPhone,
      conn,
      config?._id.toString(),
      session?._id.toString(),
      undefined, // providedChatHistory
      isCalendarFallback // Add calendar fallback flag
    );
    
    console.log(`✅ Step 4 Complete: Regular agent response: ${response.substring(0, 100)}...`);
    
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
  } catch (error) {
    console.error(`❌ Error in processAccumulatedMessages:`, error);
    // Final fallback response
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