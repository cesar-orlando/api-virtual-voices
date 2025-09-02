import { Request, Response } from "express";
import { twilioService } from "../../services/twilio/twilioService";
import { quickLearningOpenAIService } from "../../services/quicklearning/openaiService";
import { MessagingAgentService } from "../../services/agents/MessagingAgentService";
import { getConnectionByCompanySlug, executeQuickLearningWithReconnection } from "../../config/connectionManager";
import getQuickLearningChatModel from "../../models/quicklearning/chat.model";
import getRecordModel from "../../models/record.model";
import fs from "fs";
import axios from "axios";
import FormData from "form-data";
import { getEnvironmentConfig } from "../../config/environments";
import getUserModel from "../../core/users/user.model";
import { Server as SocketIOServer } from "socket.io";
import getIaConfigModel from "../../models/iaConfig.model";

// Configuración del entorno
const envConfig = getEnvironmentConfig();

// Instancia del nuevo sistema de agentes
const messagingAgentService = new MessagingAgentService();

// Buffer de mensajes para agrupar mensajes rápidos
const messageBuffers = new Map<string, { messages: string[]; timeout: NodeJS.Timeout }>();

/**
 * Emitir notificación por socket cuando llega un mensaje nuevo
 */
function emitNewMessageNotification(phone: string, messageData: any, chat: any = null) {
  try {
    // Obtener la instancia de socket.io desde la app
    const io = (global as any).io as SocketIOServer;
    if (!io) {
      console.log("⚠️ Socket.io no está disponible para notificaciones");
      return;
    }

    // Preparar datos completos para el frontend
    const notificationData = {
      type: "nuevo_mensaje",
      phone: phone,
      message: {
        body: messageData.body,
        direction: messageData.direction,
        respondedBy: messageData.respondedBy,
        messageType: messageData.messageType,
        twilioSid: messageData.twilioSid,
        timestamp: new Date().toISOString()
      },
      chat: chat ? {
        phone: chat.phone,
        profileName: chat.profileName,
        lastMessage: chat.lastMessage,
        conversationStart: chat.conversationStart,
        status: chat.status,
        aiEnabled: chat.aiEnabled,
        unreadCount: 1, // Se calculará por usuario en el frontend
        isNewChat: false // Se determinará en el frontend
      } : null,
      timestamp: new Date().toISOString(),
      // Metadata para funcionalidades avanzadas
      metadata: {
        shouldBumpChat: true,
        shouldPlaySound: true,
        shouldShowNotification: true,
        priority: messageData.respondedBy === "human" ? "high" : "normal"
      }
    };

    // Emitir evento a todos los clientes conectados
    io.emit("nuevo_mensaje_whatsapp", notificationData);

  } catch (error) {
    console.error("❌ Error emitiendo notificación por socket:", error);
  }
}

/**
 * Emitir evento de "escribiendo" para indicar que alguien está escribiendo
 */
function emitTypingIndicator(phone: string, isTyping: boolean, userType: "human" | "bot" | "asesor") {
  try {
    const io = (global as any).io as SocketIOServer;
    if (!io) return;

    io.emit("escribiendo_whatsapp", {
      type: "escribiendo",
      phone: phone,
      isTyping: isTyping,
      userType: userType,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ Error emitiendo indicador de escritura:", error);
  }
}

/**
 * Emitir evento de mensaje leído
 */
function emitMessageRead(phone: string, userId: string) {
  try {
    const io = (global as any).io as SocketIOServer;
    if (!io) return;

    io.emit("mensaje_leido_whatsapp", {
      type: "mensaje_leido",
      phone: phone,
      userId: userId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ Error emitiendo mensaje leído:", error);
  }
}

/**
 * Webhook de Twilio para recibir mensajes
 */
export const twilioWebhook = async (req: Request, res: Response): Promise<void> => {
  try {

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
      emitNewMessageNotification(phoneUser, newMessage, chat);

      // Actualizar ultimo_mensaje y lastMessageDate en la tabla correcta si el usuario ya existe
      const tableSlugs = ["alumnos", "prospectos", "clientes", "sin_contestar", "nuevo_ingreso"];
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
      
      console.log(`🤖 Procesando mensaje(s) combinado(s) para ${phoneUser} con NUEVO SISTEMA DE AGENTES`);

      const config = await getIaConfigModel(conn).findOne();
      
      // Generar respuesta usando el NUEVO sistema de agentes
      const aiResponse = await messagingAgentService.processWhatsAppMessage(
        'quicklearning',
        combinedMessage,
        phoneUser,
        conn,
        config?._id.toString(),
        conn,
        undefined, // providedChatHistory
      );

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
          emitNewMessageNotification(phoneUser, botMessage, chat);

          // Verificar si es mensaje de transferencia a asesor
          const isTransferMessage = aiResponse.toLowerCase().includes('transferir con un asesor') || aiResponse.toLowerCase().includes('te voy a transferir');
          
          if (isTransferMessage) {
            console.log(`🔄 Transferencia a asesor detectada para ${phoneUser}. Desactivando IA...`);
            
            // Desactivar IA en el chat
            chat.aiEnabled = false;
            await chat.save();

            // Asignar asesor disponible y enviar mensaje de seguimiento
            try {
              const { advisor, message: advisorMessage } = await assignAvailableAdvisor(phoneUser, conn);
              
              // Enviar mensaje adicional sobre la asignación del asesor
              if (advisorMessage) {
                const followUpResult = await twilioService.sendMessage({
                  to: phoneUser,
                  body: advisorMessage,
                });

                if (followUpResult.success) {
                  // Guardar el mensaje de seguimiento en el chat
                  chat.messages.push({
                    direction: "outbound-api",
                    body: advisorMessage,
                    dateCreated: new Date(),
                    respondedBy: "bot",
                    responseTime: 0,
                    twilioSid: followUpResult.messageId || `follow-${Date.now()}`,
                    mediaUrl: [],
                    messageType: "text",
                    metadata: {}
                  });
                  await chat.save();

                  console.log(`📨 Mensaje de asignación de asesor enviado a ${phoneUser}: ${advisorMessage}`);
                  
                  if (advisor) {
                    console.log(`👨‍💼 Chat asignado al asesor: ${advisor.name} (${advisor.email})`);
                  } else {
                    console.log(`⏰ Transferencia programada para mañana temprano`);
                  }
                } else {
                  console.error(`❌ Error enviando mensaje de asignación: ${followUpResult.error}`);
                }
              }
            } catch (error) {
              console.error(`❌ Error en asignación de asesor para ${phoneUser}:`, error);
            }
          }
          
          // Actualizar registros en TODAS las tablas (alumnos, prospectos, clientes, sin_contestar)
          const tableSlugs = ["alumnos", "prospectos", "clientes", "sin_contestar", "nuevo_ingreso"];
          let updated = false;
          
          for (const tableSlug of tableSlugs) {
            try {
              const updateData: any = {
                "data.ultimo_mensaje": aiResponse,
                "data.lastMessage": aiResponse,
                "data.lastMessageDate": currentDate
              };
              
              // Si es transferencia, también desactivar IA
              if (isTransferMessage) {
                updateData["data.aiEnabled"] = false;
              }
              
              const result = await Record.updateOne(
                { 
                  tableSlug,
                  $or: [
                    { "data.telefono": phoneUser },
                    { "data.phone": phoneUser }
                  ],
                  c_name: "quicklearning"
                },
                { $set: updateData }
              );
              
              if (result.modifiedCount > 0) {
                updated = true;
                if (isTransferMessage) {
                  console.log(`🚫 IA desactivada en tabla ${tableSlug} para ${phoneUser} - Transferencia completada`);
                } else {
                  console.log(`📝 Registro actualizado en tabla ${tableSlug} para ${phoneUser}`);
                }
                break; // Solo actualizar en la primera tabla donde se encuentre
              }
            } catch (error) {
              console.error(`❌ Error actualizando tabla ${tableSlug}:`, error);
            }
          }
          
          if (!updated) {
            console.warn(`⚠️ No se encontró el usuario ${phoneUser} en ninguna tabla para actualizar`);
          }
        });

        console.log(`✅ Respuesta del NUEVO AGENTE enviada a ${phoneUser}`);
      } else {
        console.error(`❌ Error enviando respuesta: ${result.error}`);
      }

      // Limpiar buffer
      messageBuffers.delete(phoneUser);
    } catch (error) {
      console.error("❌ Error procesando mensaje con nuevo agente:", error);
      messageBuffers.delete(phoneUser);
    }
  }, 15000); // Esperar 3 segundos antes de procesar
}

// MENSAJES EXACTOS - Coincidencia exacta con los templates de marketing (SIN puntuación final)
const EXACT_MESSAGE_MAPPING: { [key: string]: { campaign: string; medio: string } } = {
  // USA
  'hola, quiero info sobre los cursos de inglés (u)': {
    campaign: 'USA',
    medio: 'Meta'
  },
  
  // CAN
  'hola, quiero info sobre los cursos de inglés (c)': {
    campaign: 'CAN',
    medio: 'Meta'
  },
  
  // PRESENCIAL
  'hola, quiero más info sobre los cursos presenciales': {
    campaign: 'PRESENCIAL',
    medio: 'Meta'
  },
  'hola, quiero más info sobre el curso smart': {
    campaign: 'PRESENCIAL',
    medio: 'Meta'
  },
  'hola. quiero más info de la sucursal satélite': {
    campaign: 'PRESENCIAL',
    medio: 'Meta'
  },
  'hola. quiero más info de la sucursal satelite': {
    campaign: 'PRESENCIAL',
    medio: 'Meta'
  },
  
  // VIRTUAL
  'hola, quiero más info sobre los cursos virtuales': {
    campaign: 'VIRTUAL',
    medio: 'Meta'
  },
  
  // VIRTUAL PROMOS
  'hola, quiero info sobre la promo virtual': {
    campaign: 'VIRTUAL PROMOS',
    medio: 'Meta'
  },
  
  // ONLINE
  'hola, quiero más info sobre los cursos online': {
    campaign: 'ONLINE',
    medio: 'Meta'
  },
  
  // ONLINE PROMOS
  'hola, quiero info sobre la promo online': {
    campaign: 'ONLINE PROMOS',
    medio: 'Meta'
  },
  
  // GENERAL
  'hola, quiero info sobre los cursos de inglés': {
    campaign: 'GENERAL',
    medio: 'Meta'
  },
  
  // RMKT
  'hola, quiero info sobre los cursos de inglés (r)': {
    campaign: 'RMKT',
    medio: 'Meta'
  },
  
  // GOOGLE - Variaciones conocidas
  'hola, me encantaría recibir información de sus cursos': {
    campaign: 'GOOGLE',
    medio: 'Google'
  },
  'hola, quiero más información sobre los cursos de inglés de quick learning. los busque en google': {
    campaign: 'GOOGLE',
    medio: 'Google'
  }
};

/**
 * Detecta la campaña basada en coincidencia exacta del mensaje
 */
function detectCampaign(message: string): { campaign: string; medio: string } {
  if (!message) {
    return { campaign: 'ORGANICO', medio: 'Interno' };
  }
  
  // Normalizar el mensaje: lowercase, trim, quitar espacios extra y puntuación final
  const normalizedMessage = message.toLowerCase().trim()
    .replace(/\s+/g, ' ') // Múltiples espacios a uno solo
    .replace(/[.]{2,}/g, '.') // Múltiples puntos a uno solo
    .replace(/[.,!?;:]$/, ''); // Quitar puntuación al final
  
  // Buscar coincidencia exacta
  if (EXACT_MESSAGE_MAPPING[normalizedMessage]) {
    const match = EXACT_MESSAGE_MAPPING[normalizedMessage];
    console.log(`🎯 Campaña detectada (exacta): ${match.campaign} - Medio: ${match.medio} para mensaje: "${message}"`);
    return match;
  }
  
  // Detectar nuevos planes presenciales (SMART/PLUS/MAX) con palabras de contexto
  const planNames = ['smart', 'plus', 'max'];
  const contextWords = ['curso', 'cursos', 'plan', 'planes', 'paquete', 'paquetes', 'programa', 'programas', 'modalidad', 'modalidades', 'esquema', 'esquemas'];
  const mentionsPlanWithContext = planNames.some(n => normalizedMessage.includes(n)) && contextWords.some(w => normalizedMessage.includes(w));
  
  if (mentionsPlanWithContext) {
    const foundPlans = planNames.filter(n => normalizedMessage.includes(n));
    console.log(`🎯 Campaña detectada (SMART/PLUS/MAX): PRESENCIAL - Medio: Meta para planes: ${foundPlans.join(', ')} en mensaje: "${message}"`);
    return { campaign: 'PRESENCIAL', medio: 'Meta' };
  }
  
  // Si no hay coincidencia exacta, es ORGANICO
  console.log(`🎯 Campaña detectada (fallback): ORGANICO - Medio: Interno para mensaje: "${message}"`);
  return { campaign: 'ORGANICO', medio: 'Interno' };
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
          name: "Asistente",
          _id: "68871c9e8f2515c9310c0611",
          email: "asistente@quicklearning.com"
        });
      }

      // Detectar campaña y medio con coincidencia exacta
      const detectionResult = detectCampaign(body);
      const detectedCampaign = detectionResult.campaign;
      const medio = detectionResult.medio;

      console.log(`🎯 Campaña detectada para ${phone}: ${detectedCampaign} - Medio: ${medio}`);

      // Determinar si AI debe estar desactivada para campañas presenciales (incluyendo SMART y Satélite variants)
      const aiEnabled = detectedCampaign !== 'PRESENCIAL';

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
          medio: medio,
          curso: null,
          ciudad: null,
          campana: detectedCampaign,
          comentario: null,
          asesor: asesorRandom,
          ultimo_mensaje: body || null,
          aiEnabled: aiEnabled,
          lastMessageDate: new Date(),
          createdBy: "twilio-webhook",
          createdAt: new Date()
        },
      });
      await customer.save();
      console.log(`✅ Nuevo cliente creado: ${phone} con campaña: ${detectedCampaign}, medio: ${medio}, AI: ${aiEnabled ? 'activada' : 'desactivada'}`);
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

/**
 * Marcar mensajes como leídos por un usuario
 */
export const markChatAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone } = req.params;
    const { userId, companySlug } = req.body;

    if (!userId || !companySlug) {
      res.status(400).json({ error: "userId y companySlug son requeridos" });
      return;
    }

    const conn = await getConnectionByCompanySlug(companySlug);
    const QuickLearningChat = getQuickLearningChatModel(conn);

    // Buscar el chat
    let chat = await QuickLearningChat.findOne({ phone });
    if (!chat && phone.startsWith('+')) {
      chat = await QuickLearningChat.findOne({ phone: phone.replace(/^\+/, '') });
    } else if (!chat && !phone.startsWith('+')) {
      chat = await QuickLearningChat.findOne({ phone: `+${phone}` });
    }

    if (!chat) {
      res.status(404).json({ error: "Chat no encontrado" });
      return;
    }

    // Marcar como leído (implementación básica)
    // TODO: Implementar markAsReadBy cuando el modelo esté actualizado
    console.log(`Marcando chat ${phone} como leído para usuario ${userId}`);

    // Emitir evento de mensaje leído
    emitMessageRead(phone, userId);

    res.status(200).json({
      success: true,
      message: "Chat marcado como leído",
      phone: phone,
      userId: userId
    });
  } catch (error) {
    console.error("❌ Error marcando chat como leído:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

/**
 * Obtener información de chats con conteo de no leídos
 */
export const getChatsWithUnreadCount = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, companySlug, limit = "50" } = req.query;

    if (!userId || !companySlug) {
      res.status(400).json({ error: "userId y companySlug son requeridos" });
      return;
    }

    const conn = await getConnectionByCompanySlug(companySlug as string);
    const QuickLearningChat = getQuickLearningChatModel(conn);

    // Obtener chats ordenados por último mensaje
    const chats = await QuickLearningChat.find({ status: "active" })
      .sort({ "lastMessage.date": -1 })
      .limit(parseInt(limit as string))
      .lean();

    // Calcular no leídos para cada chat
    const chatsWithUnread = chats.map(chat => {
      let unreadCount = 0;
      
      // Contar mensajes de las últimas 24 horas como fallback
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      unreadCount = chat.messages?.filter(msg => 
        new Date(msg.dateCreated || (msg as any).timestamp) > last24Hours
      ).length || 0;

      return {
        ...chat,
        unreadCount,
        hasUnread: unreadCount > 0,
        lastMessagePreview: chat.lastMessage?.body?.substring(0, 50) + (chat.lastMessage?.body?.length > 50 ? '...' : '')
      };
    });

    res.status(200).json({
      success: true,
      chats: chatsWithUnread,
      total: chatsWithUnread.length,
      totalUnread: chatsWithUnread.reduce((sum, chat) => sum + chat.unreadCount, 0)
    });
  } catch (error) {
    console.error("❌ Error obteniendo chats:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

/**
 * Obtener historial de un chat específico
 */
export const getChatHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone } = req.params;
    const { companySlug, limit = "100" } = req.query;

    if (!companySlug) {
      res.status(400).json({ error: "companySlug es requerido" });
      return;
    }

    const conn = await getConnectionByCompanySlug(companySlug as string);
    const QuickLearningChat = getQuickLearningChatModel(conn);

    // Buscar el chat
    let chat = await QuickLearningChat.findOne({ phone }).lean();
    if (!chat && phone.startsWith('+')) {
      chat = await QuickLearningChat.findOne({ phone: phone.replace(/^\+/, '') }).lean();
    } else if (!chat && !phone.startsWith('+')) {
      chat = await QuickLearningChat.findOne({ phone: `+${phone}` }).lean();
    }

    if (!chat) {
      res.status(404).json({ error: "Chat no encontrado" });
      return;
    }

    // Ordenar mensajes por fecha y limitar
    const messages = chat.messages
      ?.sort((a, b) => new Date(a.dateCreated || (a as any).timestamp).getTime() - new Date(b.dateCreated || (b as any).timestamp).getTime())
      .slice(-parseInt(limit as string)) || [];

    res.status(200).json({
      success: true,
      chat: {
        phone: chat.phone,
        profileName: chat.profileName,
        conversationStart: chat.conversationStart,
        status: chat.status,
        aiEnabled: chat.aiEnabled
      },
      messages: messages,
      totalMessages: chat.messages?.length || 0
    });
  } catch (error) {
    console.error("❌ Error obteniendo historial de chat:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

/**
 * Manejar indicadores de escritura de WhatsApp Business API
 * Estos eventos vienen del webhook de Twilio cuando el usuario está escribiendo
 */
export const handleWhatsAppTypingIndicators = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      From, 
      To, 
      EventType, 
      EventData 
    } = req.body;

    console.log("📝 Indicador de escritura recibido:", { From, To, EventType, EventData });

    // WhatsApp Business API envía diferentes tipos de eventos
    switch (EventType) {
      case "typing_start":
        // Usuario comenzó a escribir
        emitTypingIndicator(From, true, "human");
        break;
      
      case "typing_stop":
        // Usuario dejó de escribir
        emitTypingIndicator(From, false, "human");
        break;
      
      case "read":
        // Usuario leyó el mensaje
        emitMessageRead(From, "user");
        break;
      
      case "delivered":
        // Mensaje entregado al usuario
        console.log("✅ Mensaje entregado a:", From);
        break;
      
      default:
        console.log("📝 Evento no manejado:", EventType);
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Error manejando indicador de escritura:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

/**
 * Simular indicador de escritura del bot (cuando está procesando)
 */
export const simulateBotTyping = async (phone: string, isTyping: boolean): Promise<void> => {
  try {
    // Emitir evento de escritura del bot
    emitTypingIndicator(phone, isTyping, "bot");
    
    if (isTyping) {
      console.log(`🤖 Bot comenzó a escribir a: ${phone}`);
    } else {
      console.log(`🤖 Bot terminó de escribir a: ${phone}`);
    }
  } catch (error) {
    console.error("❌ Error simulando escritura del bot:", error);
  }
};

/**
 * Simular indicador de escritura del asesor (cuando está escribiendo)
 */
export const simulateAdvisorTyping = async (phone: string, isTyping: boolean, advisorId: string): Promise<void> => {
  try {
    // Emitir evento de escritura del asesor
    emitTypingIndicator(phone, isTyping, "asesor");
    
    if (isTyping) {
      console.log(`👤 Asesor ${advisorId} comenzó a escribir a: ${phone}`);
    } else {
      console.log(`👤 Asesor ${advisorId} terminó de escribir a: ${phone}`);
    }
  } catch (error) {
    console.error("❌ Error simulando escritura del asesor:", error);
  }
};

/**
 * Asignar un asesor activo disponible al chat
 */
async function assignAvailableAdvisor(phoneUser: string, conn: any): Promise<{advisor: any, message: string}> {
  try {
    const User = getUserModel(conn);
    const ChatModel = getQuickLearningChatModel(conn);
    
    // Verificar si el usuario ya tiene un asesor asignado
    const existingChat = await ChatModel.findOne({ phone: phoneUser });
    
    if (existingChat && existingChat.advisor && existingChat.advisor.id) {
      // Verificar si el asesor asignado sigue activo
      const currentAdvisor = await User.findOne({
        _id: existingChat.advisor.id,
        role: 'Asesor',
        status: 'active',
        companySlug: 'quicklearning'
      }).select('_id name email');

      if (currentAdvisor) {
        // El asesor actual sigue activo, mantenerlo
        console.log(`👨‍💼 Asesor actual ${currentAdvisor.name} sigue activo para ${phoneUser}. Manteniendo asignación.`);
        
        const message = `Tu consulta sigue asignada a un asesor especializado. Se pondrá en contacto contigo en breve para ayudarte.`;
        
        return { advisor: currentAdvisor, message };
      } else {
        // El asesor actual ya no está activo, necesitamos reasignar
        console.log(`⚠️ Asesor anterior ${existingChat.advisor.name} ya no está activo para ${phoneUser}. Reasignando...`);
      }
    }
    
    // Buscar asesores activos de QuickLearning (solo si no tiene asesor activo)
    const availableAdvisors = await User.find({
      role: 'Asesor',
      status: 'active',
      companySlug: 'quicklearning'
    }).select('_id name email');

    // Usar hora de México (UTC-6 o UTC-5 según horario de verano)
    const now = new Date();
    const mexicoTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Mexico_City"}));
    const currentHour = mexicoTime.getHours();
    const isAfterHours = currentHour >= 21 || currentHour <= 8; // Después de las 9 PM O hasta las 7 AM (8 AM ya es horario normal)
    
    console.log(`🕐 Hora México detectada: ${currentHour}:${mexicoTime.getMinutes()} (${mexicoTime.toLocaleString()}) - isAfterHours: ${isAfterHours}`);

    if (availableAdvisors.length === 0) {
      // No hay asesores disponibles - LIMPIAR asignación anterior
      await ChatModel.updateOne(
        { phone: phoneUser },
        { 
          $unset: { advisor: "" } // Eliminar asesor anterior
        }
      );

      const message = isAfterHours 
        ? "Gracias por tu interés. Nuestros asesores no están disponibles en este momento. Mañana temprano un asesor se pondrá en contacto contigo para ayudarte. ¡Que tengas buena noche!"
        : "Gracias por tu interés. En este momento nuestros asesores están ocupados. Uno de ellos se pondrá en contacto contigo a la brevedad.";
      
      console.log(`⚠️ Sin asesores disponibles para ${phoneUser}. Asignación anterior eliminada.`);
      return { advisor: null, message };
    }

          if (isAfterHours) {
        // Hay asesores pero es después de las 9 PM - LIMPIAR asignación anterior
        await ChatModel.updateOne(
          { phone: phoneUser },
          { 
            $unset: { advisor: "" } // Eliminar asesor anterior
          }
        );

      const message = "Gracias por tu interés. Aunque tenemos asesores disponibles, nuestro horario de atención ha terminado. Mañana temprano un asesor se pondrá en contacto contigo para ayudarte. ¡Que tengas buena noche!";
      
      console.log(`🌙 Horario nocturno para ${phoneUser}. Asignación anterior eliminada.`);
      return { advisor: null, message };
    }

    // Seleccionar un asesor (por ahora el primero disponible, se puede mejorar con lógica de balanceo)
    const selectedAdvisor = availableAdvisors[0];
    
    // Actualizar el chat con el asesor asignado
    await ChatModel.updateOne(
      { phone: phoneUser },
      { 
        $set: { 
          advisor: {
            id: selectedAdvisor._id,
            name: selectedAdvisor.name
          }
        }
      }
    );

    console.log(`👨‍💼 Asesor asignado: ${selectedAdvisor.name} (${selectedAdvisor.email}) para ${phoneUser}`);
    
    const message = `Tu consulta ha sido transferida a un asesor especializado. Se pondrá en contacto contigo en breve para ayudarte.`;
    
    return { advisor: selectedAdvisor, message };

  } catch (error) {
    console.error(`❌ Error asignando asesor para ${phoneUser}:`, error);
    
    // Usar hora de México (UTC-6 o UTC-5 según horario de verano)
    const now = new Date();
    const mexicoTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Mexico_City"}));
    const currentHour = mexicoTime.getHours();
    const isAfterHours = currentHour >= 21 || currentHour <= 8; // Después de las 9 PM O hasta las 7 AM (8 AM ya es horario normal)
    
    console.log(`🕐 Hora México detectada: ${currentHour}:${mexicoTime.getMinutes()} (${mexicoTime.toLocaleString()}) - isAfterHours: ${isAfterHours}`);
    
    const message = isAfterHours 
      ? "Gracias por tu interés. Mañana temprano un asesor se pondrá en contacto contigo para ayudarte. ¡Que tengas buena noche!"
      : "Gracias por tu interés. Un asesor se pondrá en contacto contigo a la brevedad.";
    
    return { advisor: null, message };
  }
}

