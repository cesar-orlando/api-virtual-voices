import { Request, Response } from "express";
import { twilioService } from "../../services/twilio/twilioService";
import { quickLearningOpenAIService } from "../../services/quicklearning/openaiService";
import { getConnectionByCompanySlug, executeQuickLearningWithReconnection } from "../../config/connectionManager";
import getQuickLearningChatModel from "../../models/quicklearning/chat.model";
import getRecordModel from "../../models/record.model";
import fs from "fs";
import axios from "axios";
import FormData from "form-data";
import { getEnvironmentConfig } from "../../config/environments";
import getUserModel from "../../core/users/user.model";
import { Server as SocketIOServer } from "socket.io";

// Configuración del entorno
const envConfig = getEnvironmentConfig();

// Buffer de mensajes para agrupar mensajes rápidos
const messageBuffers = new Map<string, { messages: string[]; timeout: NodeJS.Timeout }>();

/**
 * Emitir notificación por socket cuando llega un mensaje nuevo
 */
function emitNewMessageNotification(phone: string, messageData: any) {
  try {
    // Obtener la instancia de socket.io desde la app
    const io = (global as any).io as SocketIOServer;
    if (!io) {
      console.log("⚠️ Socket.io no está disponible para notificaciones");
      return;
    }

    // Emitir evento a todos los clientes conectados
    io.emit("nuevo_mensaje_whatsapp", {
      type: "nuevo_mensaje",
      phone: phone,
      message: {
        body: messageData.body,
        direction: messageData.direction,
        respondedBy: messageData.respondedBy,
        messageType: messageData.messageType,
        twilioSid: messageData.twilioSid
      },
      timestamp: new Date().toISOString()
    });

    console.log(`📡 Notificación emitida para chat: ${phone}`);
  } catch (error) {
    console.error("❌ Error emitiendo notificación por socket:", error);
  }
}



/**
 * Webhook de Twilio para recibir mensajes
 */
export const twilioWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log("📩 Webhook recibido de Twilio:", req.body);

    const {
      From,
      To,
      Body,
      MessageSid,
      ProfileName,
      MediaUrl0,
      MediaContentType0,
      Latitude,
      Longitude,
    } = req.body;

    // Validar que es para Quick Learning (verificar número de teléfono)
    if (!To.includes(envConfig.twilio.phoneNumber.replace('+', ''))) {
      console.warn("⚠️ Mensaje no dirigido al número de Quick Learning");
      res.status(200).send("OK");
      return;
    }

    // Extraer número de teléfono del usuario
    const phoneUser = From.replace('whatsapp:', '');

/*     // Validar webhook si es necesario
    const signature = req.headers['x-twilio-signature'] as string;
    // Construir la URL completa para la validación (soporta ngrok y producción)
    const fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
    if (signature && !twilioService.validateWebhook(signature, fullUrl, req.body)) {
      console.error("❌ Webhook signature inválida");
      res.status(403).send("Forbidden");
      return;
    } */

    // Buscar o crear el cliente usando reconexión mejorada
    const customer = await executeQuickLearningWithReconnection(async (conn) => {
      return await findOrCreateCustomer(phoneUser, ProfileName || "Usuario", Body, conn);
    });

    // Verificar si tiene AI activada
    const aiEnabled = customer.data.aiEnabled !== false;

    // Procesar mensaje usando reconexión mejorada
    await executeQuickLearningWithReconnection(async (conn) => {
      const QuickLearningChat = getQuickLearningChatModel(conn);
      const Record = getRecordModel(conn);

      // Buscar o crear el chat
      let chat = await QuickLearningChat.findOne({ phone: phoneUser });
      if (!chat) {
        chat = new QuickLearningChat({
          phone: phoneUser,
          profileName: ProfileName || "Usuario",
          linkedTable: {
            refModel: "Record",
            refId: customer._id,
          },
          conversationStart: new Date(),
          aiEnabled: aiEnabled,
          messages: [],
        });
      }

      let messageText = "";
      let messageType = "text";
      let mediaUrls: string[] = [];

      // Procesar diferentes tipos de mensaje
      if (Body) {
        messageText = Body;
        messageType = "text";
      } else if (MediaUrl0) {
        if (MediaContentType0?.startsWith('image/')) {
          messageType = "image";
          messageText = `🖼️ El usuario compartió una imagen`;
          mediaUrls = [MediaUrl0];
        } else if (MediaContentType0?.startsWith('audio/')) {
          messageType = "audio";
          const transcription = await transcribeAudio(MediaUrl0);
          messageText = `🎙️ Audio transcrito: ${transcription}`;
          mediaUrls = [MediaUrl0];
        } else if (MediaContentType0?.startsWith('video/')) {
          messageType = "video";
          messageText = `🎥 El usuario compartió un video`;
          mediaUrls = [MediaUrl0];
        } else {
          messageType = "document";
          messageText = `📄 El usuario compartió un documento`;
          mediaUrls = [MediaUrl0];
        }
      } else if (Latitude && Longitude) {
        messageType = "location";
        const lat = parseFloat(Latitude);
        const lng = parseFloat(Longitude);
        messageText = `📍 El usuario compartió su ubicación: https://www.google.com/maps?q=${lat},${lng}`;
      }

      // Agregar mensaje al chat
      const newMessage = {
        direction: "inbound" as const,
        body: messageText,
        respondedBy: "human" as const,
        twilioSid: MessageSid,
        mediaUrl: mediaUrls,
        messageType: messageType as "text" | "image" | "audio" | "video" | "location" | "document",
        metadata: {
          lat: Latitude ? parseFloat(Latitude) : undefined,
          lng: Longitude ? parseFloat(Longitude) : undefined,
        },
      };

      chat.messages.push(newMessage);

      // Actualizar último mensaje
      const currentDate = new Date();
      chat.lastMessage = {
        body: messageText,
        date: currentDate,
        respondedBy: "human",
      };

      await chat.save();

      // Emitir notificación por socket para mensaje nuevo
      emitNewMessageNotification(phoneUser, newMessage);

      // Actualizar ultimo_mensaje y lastMessageDate en la tabla correcta si el usuario ya existe
      const tableSlugs = ["alumnos", "prospectos", "clientes", "sin_contestar"];
      let updated = false;
      for (const tableSlug of tableSlugs) {
        const result = await Record.updateOne(
          { tableSlug, $or: [{ "data.telefono": phoneUser }, { "data.phone": phoneUser }], c_name: "quicklearning" },
          { $set: { "data.ultimo_mensaje": messageText, "data.lastMessageDate": new Date() } }
        );
        if (result.modifiedCount > 0) {
          updated = true;
          break;
        }
      }
      if (!updated) {
        console.warn(`No se encontró el usuario en ninguna tabla para actualizar ultimo_mensaje: ${phoneUser}`);
      }

      console.log("aiEnabled", aiEnabled)

      // Si la AI está desactivada, no procesar con IA
      if (!aiEnabled) {
        console.log("🤖 AI desactivada para este usuario.");
        return;
      }

      // Procesar mensaje con buffer para evitar respuestas múltiples
      await processMessageWithBuffer(phoneUser, messageText, chat, conn);
    });

    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Error en webhook de Twilio:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Procesar mensaje con buffer para agrupar mensajes rápidos
 */
async function processMessageWithBuffer(phoneUser: string, messageText: string, chat: any, conn: any): Promise<void> {
  // Verificar si ya hay un buffer para este usuario
  if (!messageBuffers.has(phoneUser)) {
    messageBuffers.set(phoneUser, { messages: [], timeout: null as any });
  }

  const buffer = messageBuffers.get(phoneUser)!;
  buffer.messages.push(messageText);

  // Limpiar timeout anterior si existe
  if (buffer.timeout) {
    clearTimeout(buffer.timeout);
  }

  // Configurar nuevo timeout para procesar mensajes
  buffer.timeout = setTimeout(async () => {
    try {
      // Combinar todos los mensajes del buffer
      const combinedMessage = buffer.messages.join("\n");
      
      console.log(`🤖 Procesando mensaje(s) combinado(s) para ${phoneUser}`);
      
      // Generar respuesta de IA
      const aiResponse = await quickLearningOpenAIService.generateResponse(combinedMessage, phoneUser);

      // Enviar respuesta
      const result = await twilioService.sendMessage({
        to: phoneUser,
        body: aiResponse,
      });

      if (result.success) {
        // Usar reconexión mejorada para actualizar el chat
        await executeQuickLearningWithReconnection(async (conn) => {
          const QuickLearningChat = getQuickLearningChatModel(conn);
          const Record = getRecordModel(conn);

          // Agregar respuesta al chat
          const botMessage = {
            direction: "outbound-api" as const,
            body: aiResponse,
            respondedBy: "bot" as const,
            twilioSid: result.messageId,
            messageType: "text" as const,
          };

          chat.messages.push(botMessage);

          // Actualizar último mensaje
          const currentDate = new Date();
          chat.lastMessage = {
            body: aiResponse,
            date: currentDate,
            respondedBy: "bot",
          };

          await chat.save();

          // Emitir notificación por socket para respuesta del bot
          emitNewMessageNotification(phoneUser, botMessage);

          // Actualizar campo ultimo_mensaje en la tabla de alumnos
          try {
            await Record.updateOne(
              { 
                tableSlug: "alumnos",
                "data.telefono": phoneUser,
                c_name: "quicklearning"
              },
              { 
                $set: { 
                  "data.ultimo_mensaje": currentDate,
                  "data.lastMessage": aiResponse
                } 
              }
            );
            console.log(`📝 Campo ultimo_mensaje actualizado en tabla alumnos (respuesta bot) para: ${phoneUser}`);
          } catch (error) {
            console.error(`❌ Error actualizando ultimo_mensaje en tabla alumnos (respuesta bot):`, error);
          }
        });

        console.log(`✅ Respuesta enviada a ${phoneUser}`);
      } else {
        console.error(`❌ Error enviando respuesta: ${result.error}`);
      }

      // Limpiar buffer
      messageBuffers.delete(phoneUser);
    } catch (error) {
      console.error("❌ Error procesando mensaje:", error);
      messageBuffers.delete(phoneUser);
    }
  }, 3000); // Esperar 3 segundos antes de procesar
}

/**
 * Buscar o crear cliente en la base de datos
 */
async function findOrCreateCustomer(phone: string, profileName: string, body: string, conn: any) {
  try {
    const DynamicRecord = getRecordModel(conn);
    const tableSlugs = ["alumnos", "prospectos", "clientes", "sin_contestar"];
    let customer = null;
    for (const tableSlug of tableSlugs) {
      customer = await DynamicRecord.findOne({
        tableSlug,
        $or: [
          { "data.phone": phone },
          { "data.telefono": phone }
        ],
        c_name: "quicklearning"
      });
      if (customer) break;
    }

    if (!customer) {
      // Buscar un asesor random en el modelo de usuarios
      const UserModel = getUserModel(conn);
      const asesores = await UserModel.find({ role: "Asesor", status: "active" }).lean();
      let asesorRandom = null;
      if (asesores.length > 0) {
        const idx = Math.floor(Math.random() * asesores.length);
        const asesorData = asesores[idx];
        asesorRandom = JSON.stringify({
          name: asesorData.name,
          _id: asesorData._id.toString(),
          email: asesorData.email
        });
      }
      // Si sigue siendo null, asigna el asesor por defecto
      if (!asesorRandom) {
        asesorRandom = JSON.stringify({
          name: "Luisa Nohemi Jiménez Gutiérrez",
          _id: "68217a92960180b66cfe6da7"
        });
      }

      // Crear nuevo cliente en tabla prospectos con la estructura correcta
      customer = new DynamicRecord({
        tableSlug: "prospectos",
        c_name: "quicklearning",
        createdBy: "twilio-webhook",
        data: {
          nombre: profileName,
          telefono: phone,
          email: null,
          clasificacion: "prospecto",
          medio: "Meta",
          curso: null,
          ciudad: null,
          campana: "RMKT",
          comentario: null,
          asesor: asesorRandom,
          ultimo_mensaje: body || null,
          aiEnabled: false,
          lastMessageDate: new Date(),
          createdBy: "twilio-webhook",
          createdAt: new Date()
        },
      });
      await customer.save();
      console.log(`✅ Nuevo cliente creado: ${phone}`);
    }

    return customer;
  } catch (error) {
    console.error("❌ Error creando/buscando cliente:", error);
    throw error;
  }
}

/**
 * Transcribir audio usando OpenAI Whisper
 */
async function transcribeAudio(audioUrl: string): Promise<string> {
  try {
    // Descargar el archivo de audio desde Twilio
    const audioResponse = await axios.get(audioUrl, {
      responseType: "arraybuffer",
      auth: {
        username: envConfig.twilio.accountSid,
        password: envConfig.twilio.authToken,
      },
    });

    const audioBuffer = Buffer.from(audioResponse.data, "binary");
    const tempFilePath = `temp_audio_${Date.now()}.ogg`;

    // Guardar archivo temporal
    fs.writeFileSync(tempFilePath, audioBuffer);

    // Crear FormData para enviar a OpenAI
    const formData = new FormData();
    formData.append("file", fs.createReadStream(tempFilePath));
    formData.append("model", "whisper-1");
    formData.append("response_format", "text");

    // Transcribir con OpenAI Whisper
    const transcriptionResponse = await axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${envConfig.openaiApiKey}`,
        },
      }
    );

    // Limpiar archivo temporal
    fs.unlinkSync(tempFilePath);

    return transcriptionResponse.data || "No se pudo transcribir el audio.";
  } catch (error) {
    console.error("❌ Error transcribiendo audio:", error);
    return "No se pudo transcribir el audio.";
  }
}

/**
 * Enviar mensaje directo (para testing)
 */
export const sendMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone, message } = req.body;

    if (!phone || !message) {
      res.status(400).json({ error: "Phone and message are required" });
      return;
    }

    const result = await twilioService.sendMessage({
      to: phone,
      body: message,
    });

    if (result.success) {
      // Actualizar el registro del cliente en la tabla dinámica
      const conn = await getConnectionByCompanySlug("quicklearning");
      const RecordModel = getRecordModel(conn);
      const tableSlugs = ["alumnos", "prospectos", "clientes", "sin_contestar"];
      let updated = false;
      for (const tableSlug of tableSlugs) {
        const updateResult = await RecordModel.updateOne(
          { tableSlug, $or: [{ "data.telefono": phone }, { "data.phone": phone }], c_name: "quicklearning" },
          { $set: { "data.ultimo_mensaje": message, "data.lastMessageDate": new Date() } }
        );
        if (updateResult.modifiedCount > 0) {
          updated = true;
          break;
        }
      }

      // Guardar el mensaje en la colección de chats
      const QuickLearningChat = getQuickLearningChatModel(conn);
      let chat = await QuickLearningChat.findOne({ phone });
      if (!chat) {
        chat = new QuickLearningChat({
          phone,
          profileName: "Sistema",
          conversationStart: new Date(),
          aiEnabled: false,
          messages: [],
        });
      }
      const currentDate = new Date();
      const asesorMessage = {
        direction: "outbound-api" as const,
        body: message,
        respondedBy: "asesor" as const,
        twilioSid: result.messageId,
        messageType: "text" as const,
      };
      chat.messages.push(asesorMessage);
      chat.lastMessage = {
        body: message,
        date: currentDate,
        respondedBy: "asesor",
      };
      await chat.save();

      // Emitir notificación por socket para mensaje del asesor
      emitNewMessageNotification(phone, asesorMessage);

      res.status(200).json({
        success: true,
        messageId: result.messageId,
        message: "Message sent successfully",
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("❌ Error enviando mensaje:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Enviar mensaje con template
 */
export const sendTemplateMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone, templateId, variables } = req.body;

    if (!phone || !templateId) {
      res.status(400).json({ error: "Phone and templateId are required" });
      return;
    }

    const result = await twilioService.sendTemplateMessage({
      to: phone,
      templateId,
      variables: variables || [],
    });

    if (result.success) {
      // Actualizar el registro del cliente en la tabla dinámica
      const conn = await getConnectionByCompanySlug("quicklearning");
      const RecordModel = getRecordModel(conn);
      const tableSlugs = ["alumnos", "prospectos", "clientes", "sin_contestar"];
      let updated = false;
      const templateBody = `[TEMPLATE] ${templateId} ${variables ? variables.join(', ') : ''}`;
      for (const tableSlug of tableSlugs) {
        const updateResult = await RecordModel.updateOne(
          { tableSlug, $or: [{ "data.telefono": phone }, { "data.phone": phone }], c_name: "quicklearning" },
          { $set: { "data.ultimo_mensaje": templateBody, "data.lastMessageDate": new Date() } }
        );
        if (updateResult.modifiedCount > 0) {
          updated = true;
          break;
        }
      }

      // Guardar el mensaje en la colección de chats
      const QuickLearningChat = getQuickLearningChatModel(conn);
      let chat = await QuickLearningChat.findOne({ phone });
      if (!chat) {
        chat = new QuickLearningChat({
          phone,
          profileName: "Sistema",
          conversationStart: new Date(),
          aiEnabled: false,
          messages: [],
        });
      }
      const currentDate = new Date();
      const templateAsesorMessage = {
        direction: "outbound-api" as const,
        body: templateBody,
        respondedBy: "asesor" as const,
        twilioSid: result.messageId,
        messageType: "text" as const,
      };
      chat.messages.push(templateAsesorMessage);
      chat.lastMessage = {
        body: templateBody,
        date: currentDate,
        respondedBy: "asesor",
      };
      await chat.save();

      // Emitir notificación por socket para mensaje de template del asesor
      emitNewMessageNotification(phone, templateAsesorMessage);

      res.status(200).json({
        success: true,
        messageId: result.messageId,
        message: "Template message sent successfully",
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("❌ Error enviando template:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Obtener estado del servicio Twilio
 */
export const getServiceStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = await twilioService.checkServiceStatus();
    res.status(200).json(status);
  } catch (error) {
    console.error("❌ Error obteniendo estado:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Obtener historial de mensajes
 */
export const getMessageHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit = 50 } = req.query;
    const history = await twilioService.getMessageHistory(Number(limit));
    res.status(200).json(history);
  } catch (error) {
    console.error("❌ Error obteniendo historial:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Listar chats activos
export const getActiveChats = async (req: Request, res: Response): Promise<void> => {
  try {
    const conn = await getConnectionByCompanySlug('quicklearning');
    const QuickLearningChat = getQuickLearningChatModel(conn);

    const chats = await QuickLearningChat.find({ status: "active" })
      .sort({ "lastMessage.date": -1 })
      .limit(100)
      .lean();

    res.status(200).json(chats);
  } catch (error) {
    console.error("❌ Error obteniendo chats activos:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Obtener historial de un chat por teléfono
export const getChatHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone } = req.params;
    const companySlug = req.query.companySlug || req.body.companySlug;
    if (!companySlug) {
      res.status(400).json({ error: "companySlug query param is required" });
      return;
    }
    const conn = await getConnectionByCompanySlug(companySlug as string);
    const QuickLearningChat = getQuickLearningChatModel(conn);

    // Buscar primero el valor exacto
    let chat = await QuickLearningChat.findOne({ phone }).lean();
    // Si no lo encuentra, probar con + y sin +
    if (!chat && phone.startsWith('+')) {
      chat = await QuickLearningChat.findOne({ phone: phone.replace(/^\+/, '') }).lean();
    } else if (!chat && !phone.startsWith('+')) {
      chat = await QuickLearningChat.findOne({ phone: `+${phone}` }).lean();
    }
    if (!chat) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }
    res.status(200).json(chat.messages);
  } catch (error) {
    console.error("❌ Error obteniendo historial de chat:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};