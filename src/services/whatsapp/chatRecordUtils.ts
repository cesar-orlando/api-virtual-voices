import { Connection, Model } from 'mongoose';
import { generateResponse, openai, preparePrompt } from '../openai';
import { Message, Client } from 'whatsapp-web.js';
import { getSessionModel, ISession } from '../../models/session.model';
import { getWhatsappChatModel, IWhatsappChat } from '../../models/whatsappChat.model';
import { io } from '../../server';
import getIaConfigModel from '../../models/iaConfig.model';
import getRecordModel from '../../models/record.model';

// Create a new WhatsApp chat record
export async function createNewChatRecord(
  WhatsappChat: Model<any>,
  tableSlug: string,
  phone: string,
  message: Message,
  session: ISession | null
) {
  const newChat = new WhatsappChat({
    tableSlug: tableSlug,
    phone: phone,
    session: {
      id: session?.id,
      name: session?.name
    },
    advisor: {
      id: session?.user.id,
      name: session?.user.name
    },
    messages: [
      {
        msgId: message.id?.id || '',
        direction: message.fromMe ? "outbound" : "inbound",
        body: message.body,
        respondedBy: "human",
      },
    ],
  });
  await newChat.save();
  return newChat;
}

// Update WhatsApp chat record
export async function updateChatRecord(
  company: string,
  chatRecord: any,
  direction: string,
  message: Message,
  respondedBy: string,
) {
  const WhatsappChat = chatRecord.constructor; // Get the model from the document instance

  try {
    let updatedChat = null;
    // Step 1: Mark inbound messages as read if outbound
    if (direction === "outbound" || direction === "outbound-api") {
      await WhatsappChat.updateOne(
        { _id: chatRecord._id },
        {
          $set: { "messages.$[inboundMsg].status": "leído" }
        },
        {
          arrayFilters: [
            { "inboundMsg.direction": "inbound", "inboundMsg.status": { $ne: "leído" } }
          ]
        }
      );
    }

    // Step 2: Push the new message if not duplicate
    const newMessage = {
      msgId: message.id?.id,
      direction: direction,
      body: message.body,
      respondedBy: respondedBy,
      createdAt: new Date(),
    };

    // Only push if not duplicate
    updatedChat = await WhatsappChat.findOneAndUpdate(
      { _id: chatRecord._id, ...(message.id?.id ? { "messages.msgId": { $ne: message.id?.id } } : {}) },
      { $push: { messages: newMessage } },
      { new: true }
    );

    if (!updatedChat) {
      return;
    }
    io.emit(`whatsapp-message-${company}`, updatedChat);
  } catch (saveError) {
    console.error("❌ Error guardando mensaje:", saveError);
  }
}

export async function sendAndRecordBotResponse(
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
      company)
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