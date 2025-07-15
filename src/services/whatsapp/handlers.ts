import { Message, Client } from 'whatsapp-web.js';
import { generateResponse, openai, preparePrompt } from '../openai';
import { getDbConnection } from "../../config/connectionManager";
import { getWhatsappChatModel, IWhatsappChat } from '../../models/whatsappChat.model';
import getIaConfigModel from '../../models/iaConfig.model';
import { getSessionModel, IWhatsappSession } from '../../models/whatsappSession.model';
import { io } from '../../server';
import { Connection, Model, Types } from 'mongoose';
import getTableModel from '../../models/table.model';
import getRecordModel from '../../models/record.model';
import { Request, Response } from 'express';

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

// Function to check WhatsApp client health
async function checkClientHealth(client: Client): Promise<{ healthy: boolean; state: string; error?: string }> {
  try {
    if (!client) {
      return { healthy: false, state: 'NULL', error: 'Cliente no inicializado' };
    }

    const state = await client.getState();
    const isConnected = state === 'CONNECTED';
    
    return {
      healthy: isConnected,
      state: state,
      error: isConnected ? undefined : `Estado no válido: ${state}`
    };
  } catch (error) {
    return {
      healthy: false,
      state: 'ERROR',
      error: error.message
    };
  }
}

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
  if (message.from.endsWith('@g.us')) {
    console.log(`🚫 Mensaje de grupo ignorado: ${message.from}`);
    return;
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

    // Crea un nuevo chat si no existe
    if (!existingRecord) {
      const Session = getSessionModel(conn);
      const session = await Session.findOne({ name: sessionName });
      existingRecord = await createNewChatRecord(WhatsappChat, "prospectos", `${cleanUserPhone}@c.us`, message, session);
    }
    // Don't update chat record here - let the delay system handle it

    if (!existingRecord || !existingRecord.botActive) return;

    // --- VALIDACIÓN DE IA EN PROSPECTOS ---
    const Record = getRecordModel(conn);
    const prospecto = await Record.findOne({ tableSlug: 'prospectos', c_name: company, 'data.number': Number(cleanUserPhone) });
    if (prospecto && prospecto.data && prospecto.data.ia === false) {
      console.log(`🤖 IA desactivada para ${userPhone}, debe responder un agente.`);
      // Aquí podrías emitir un evento para el agente humano si lo deseas
      return;
    }
    // --- FIN VALIDACIÓN DE IA ---

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
  
  // Generate and send response using the latest record state - this should only be called ONCE
  await sendAndRecordBotResponse(company, sessionName, client, lastMessage, latestRecord, conn);
}

async function createNewChatRecord(
  WhatsappChat: Model<any>,
  tableSlug: string,
  phone: string,
  message: Message,
  session: IWhatsappSession | null
) {
  const newChat = new WhatsappChat({
    tableSlug: tableSlug,
    phone: phone,
    session: {
      id: session?.id,
      name: session?.name
    },
    //Se le asigna por default al usuario dueño de la sesion
    advisor: {
      id: session?.user.id,
      name: session?.user.name
    },
    messages: [
      {
        msgId: message.id?.id || '', // Safe access with fallback
        direction: message.fromMe ? "outbound" : "inbound",
        body: message.body,
        respondedBy: "human",
      },
    ],
  });
  await newChat.save();
  return newChat;
}

async function updateChatRecord(
  company: string,
  chatRecord: any,
  direction: string,
  message: Message | string,
  respondedBy: string
) {
  const messageId = typeof message === 'string' ? '' : message.id?.id;
  const messageBody = typeof message === 'string' ? message : message.body;
  
  // Check for duplicate messages to prevent multiple recordings
  if (messageId && chatRecord.messages) {
    const existingMessage = chatRecord.messages.find((msg: any) => msg.msgId === messageId);
    if (existingMessage) {
      console.log(`⚠️  Mensaje duplicado detectado, omitiendo: ${messageId}`);
      return;
    }
  }
  
  chatRecord.messages.push({
    msgId: messageId,
    direction: direction,
    body: messageBody,
    respondedBy: respondedBy,
    createdAt: new Date(),
  });
  
  try {
    await chatRecord.save();
    io.emit(`whatsapp-message-${company}`, chatRecord);
  } catch (saveError) {
    console.error("❌ Error guardando mensaje:", saveError);
  }
}

async function sendAndRecordBotResponse(
  company: string,
  sessionName: string,
  client: Client,
  message: Message,
  existingRecord: IWhatsappChat,
  conn: Connection,
  activeBot: boolean = true,
) {
  const defaultResponse = "Una disculpa, podrias repetir tu mensaje, no pude entenderlo.";
  let aiResponse = defaultResponse;
  const IaConfig = getIaConfigModel(conn);
  const sessionModel = getSessionModel(conn);
  const Record = getRecordModel(conn);
  // SOLO traer registros de prospectos para este usuario específico, no toda la BD
  const userPhone = message.from;
  const records = await Record.find({ 
    tableSlug: 'prospectos', 
    c_name: company,
    'data.number': userPhone 
  }).limit(1); // Solo necesitamos 1 registro
  const session = await sessionModel.findOne({ name: sessionName });
  const config = await IaConfig.findOne({ _id: session?.IA?.id });

  let IAPrompt;

  if (config) {
    IAPrompt = await preparePrompt(config);
  }

  // Mapea historial para OpenAI - LIMPIO Y SEGURO
  const MAX_MSG_LENGTH = 1000;
  const history = (existingRecord.messages || [])
    .slice(-15)
    .map((msg: any) => {
      let content = typeof msg.body === 'string' ? msg.body : '';
      if (content.length > MAX_MSG_LENGTH) content = content.slice(0, MAX_MSG_LENGTH);
      if (msg.direction === "inbound") return { role: "user", content };
      if (msg.direction === "outbound-api" || msg.respondedBy === "bot") return { role: "assistant", content };
      return null;
    })
    .filter(Boolean);

  // LIMPIA el historial para OpenAI - SOLO role y content
  const safeHistoryForOpenAI = history
    .filter((h): h is { role: string, content: string } => !!h && typeof h.content === 'string')
    .map(h => ({ role: h.role, content: h.content }));

  try {
    const response = await generateResponse(
      IAPrompt,
      config,
      safeHistoryForOpenAI,
      records,
      company) // Agregar c_name para las herramientas
    aiResponse = response || defaultResponse;
  } catch (error) {
    console.error("Error al obtener respuesta de OpenAI:", error);
    aiResponse = defaultResponse;
  }

  // Enviar mensaje y obtener respuesta
  let msg: any = null;
  let messageSentSuccessfully = false;
  
  try {
    // Validate client connection before sending
    if (!client || typeof client.sendMessage !== 'function') {
      throw new Error('Cliente de WhatsApp no disponible o desconectado');
    }

    // Check if client is authenticated and ready
    const clientState = await client.getState().catch(() => 'UNKNOWN');
    if (clientState !== 'CONNECTED') {
      throw new Error(`Cliente WhatsApp no conectado. Estado: ${clientState}`);
    }

    // Validate phone number format - more flexible regex
    const phoneRegex = /^[\d+]+@c\.us$/;
    if (!phoneRegex.test(message.from)) {
      console.warn(`⚠️  Formato de teléfono inválido: ${message.from}`);
      // Try to fix common format issues
      const cleanPhone = message.from.replace(/[^\d]/g, '');
      if (cleanPhone.length >= 10) {
        message.from = `${cleanPhone}@c.us`;
      }
    }

    // Check if the chat exists before sending
    try {
      const chat = await client.getChatById(message.from);
      if (!chat) {
        throw new Error(`Chat no encontrado para ${message.from}`);
      }
    } catch (chatError) {
      console.warn(`⚠️  No se pudo verificar el chat: ${chatError.message}`);
      // Continue anyway, might still work
    }
    
    // Add timeout to prevent hanging
    const sendPromise = client.sendMessage(message.from, aiResponse);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout enviando mensaje')), 30000)
    );
    
    msg = await Promise.race([sendPromise, timeoutPromise]);
    messageSentSuccessfully = true;
    console.log(`✅ Mensaje enviado exitosamente a ${message.from}`);
    
  } catch (sendError) {
    console.error("❌ Error enviando mensaje:", sendError);
    
    // More specific error handling
    if (sendError.message.includes('serialize')) {
      console.error("🔌 Error de conexión WhatsApp Web - Chat puede haber sido eliminado o bloqueado");
    } else if (sendError.message.includes('Timeout')) {
      console.error("⏰ Timeout enviando mensaje - WhatsApp Web puede estar lento");
    } else if (sendError.message.includes('not found') || sendError.message.includes('Chat not found')) {
      console.error("📞 Chat no encontrado - Usuario puede haber bloqueado o eliminado la conversación");
    } else if (sendError.message.includes('CONNECTED')) {
      console.error("🔗 Cliente WhatsApp no está conectado - Revisar sesión");
    } else {
      console.error("🚨 Error desconocido:", sendError.message);
    }
    
    console.log(`🚫 No se guardará mensaje mock en BD debido a error de envío`);
    return; // Exit early, don't save failed messages
  }
  
  // Only save to database if message was sent successfully
  if (messageSentSuccessfully && msg && msg.id) {
    // Actualizar el registro existente con la respuesta de la IA
    existingRecord.botActive = activeBot;
    await updateChatRecord(company, existingRecord, "outbound-api", msg, "bot");
  } else if (messageSentSuccessfully && !msg) {
    console.warn(`⚠️  Mensaje enviado pero objeto msg es null - no se guardará en BD`);
  }
}

export async function enviarFichaTecnica(req: Request, res: Response): Promise<any> {
  try {
    const { propertyId, phoneNumber, company, sessionName } = req.body;

    if (company !== 'grupokg') {
      return res.status(403).json({ success: false, message: 'Solo disponible para grupokg' });
    }
    if (!propertyId || !phoneNumber) {
      return res.status(400).json({ success: false, message: 'propertyId y phoneNumber son requeridos' });
    }

    // Obtener la propiedad
    const conn = await getDbConnection(company);
    const Record = getRecordModel(conn);
    const propiedad = await Record.findById(propertyId);
    if (!propiedad || !propiedad.data.link_ficha_tecnica) {
      return res.status(404).json({ success: false, message: 'No se encontró el link de la ficha técnica' });
    }
    const link = propiedad.data.link_ficha_tecnica;
    const mensaje = `¡Gracias por tu interés! Aquí tienes la ficha técnica de la propiedad: ${link}`;

    // Enviar mensaje por WhatsApp Web
    const { clients } = require('./index');
    const clientKey = `${company}:${sessionName}`;
    const client = clients[clientKey];
    if (!client) {
      return res.status(500).json({ success: false, message: 'No se encontró la sesión de WhatsApp activa' });
    }

    await client.sendMessage(`${phoneNumber}@c.us`, mensaje);
    return res.json({ success: true, message: 'Ficha técnica enviada exitosamente', link });
  } catch (error) {
    console.error('===> [enviarFichaTecnica] Error enviando ficha técnica:', error);
    return res.status(500).json({ success: false, message: 'Error interno al enviar ficha técnica' });
  }
}