import { Request, Response } from "express";
import { twilioService } from "../../services/twilio/twilioService";
// Servicio OpenAI eliminado - ahora usa sistema dinámico
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
import { s3 } from "../../config/aws";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import path from "path";
import { io } from "../../server";
import { NotificationService } from "../../services/internal/notification.service";
import { getSessionModel } from "../../models/session.model";

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
 * Detectar si el media es un sticker de WhatsApp (comentado - ahora tratamos stickers como imágenes)
 */
// function detectStickerFromTwilio(
//   mediaContentType: string,
//   stickerPackId?: string,
//   stickerId?: string,
//   messageType?: string
// ): boolean {
//   // Verificar si es un sticker basándose en múltiples factores
//   const isWebp = mediaContentType === 'image/webp';
//   const hasStickerInfo = !!(stickerPackId || stickerId);
//   const isStickerMessageType = messageType === 'sticker';
//   
//   // Es sticker si:
//   // 1. Es WebP (formato típico de stickers)
//   // 2. Tiene información de sticker pack/id
//   // 3. El MessageType indica que es sticker
//   const isSticker = isWebp || hasStickerInfo || isStickerMessageType;
//   
//   if (isSticker) {
//     console.log(`🎯 Sticker detectado - ContentType: ${mediaContentType}, PackId: ${stickerPackId}, StickerId: ${stickerId}, MessageType: ${messageType}`);
//   }
//   
//   return isSticker;
// }

/**
 * Procesar archivos multimedia de Twilio y subirlos a S3
 */
async function processMediaFromTwilio(
  mediaUrl: string,
  mediaContentType: string,
  messageId: string
): Promise<string> {
  try {
    
    // Descargar archivo desde Twilio usando autenticación
    const mediaResponse = await axios.get(mediaUrl, {
      responseType: "arraybuffer",
      auth: {
        username: envConfig.twilio.accountSid,
        password: envConfig.twilio.authToken,
      },
    });

    const mediaBuffer = Buffer.from(mediaResponse.data);
    
    // Determinar extensión del archivo basado en el content type
    let extension = 'bin'; // fallback
    const mimeTypeParts = mediaContentType.split('/');
    if (mimeTypeParts.length === 2) {
      const subtype = mimeTypeParts[1];
      extension = subtype === 'jpeg' ? 'jpg' : subtype;
    }

    // Crear nombre único para el archivo
    const fileName = `${messageId}-${Date.now()}.${extension}`;
    let s3Folder = 'whatsapp-media';
    
    // Determinar carpeta según tipo de archivo
    if (mediaContentType.startsWith('image/')) {
      s3Folder = 'whatsapp-images';
    } else if (mediaContentType.startsWith('audio/')) {
      s3Folder = 'whatsapp-audios';
    } else if (mediaContentType.startsWith('video/')) {
      s3Folder = 'whatsapp-videos';
    } else if (mediaContentType.startsWith('application/')) {
      s3Folder = 'whatsapp-documents';
    }

    // Subir a S3
    const bucketName = process.env.AWS_BUCKET_NAME;
    const s3Key = `${s3Folder}/${fileName}`;
    const uploadParams = {
      Bucket: bucketName,
      Key: s3Key,
      Body: mediaBuffer,
      ContentType: mediaContentType,
      ContentDisposition: 'inline' // Permite visualización directa como tu upload.middleware.ts
    };

    await s3.send(new PutObjectCommand(uploadParams));
    
    // Generar URL pública
    const publicUrl = `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
    
    return publicUrl;

  } catch (error) {
    console.error("❌ Error procesando media de Twilio:", error);
    // En caso de error, devolver la URL original (aunque requiera auth)
    return mediaUrl;
  }
}

/**
 * Analizar imagen usando OpenAI Vision (similar al mediaUtils.ts)
 */
async function analyzeImageFromTwilio(
  mediaUrl: string,
  mediaContentType: string
): Promise<{ description: string; extractedText: string }> {
  try {
    // Descargar imagen desde Twilio
    const mediaResponse = await axios.get(mediaUrl, {
      responseType: "arraybuffer",
      auth: {
        username: envConfig.twilio.accountSid,
        password: envConfig.twilio.authToken,
      },
    });

    const mediaBuffer = Buffer.from(mediaResponse.data);
    const base64Data = mediaBuffer.toString('base64');

    // Importar openai aquí para evitar dependencias circulares
    const { openai } = await import("../../config/openai");

    // Analizar con OpenAI Vision
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analiza esta imagen y proporciona: 1) Una descripción detallada de lo que ves, 2) Todo el texto que puedas leer en la imagen. Responde en español."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mediaContentType};base64,${base64Data}`,
                detail: "auto"
              }
            }
          ]
        }
      ],
      max_tokens: 500,
      temperature: 0.3
    });

    const analysis = response.choices[0]?.message?.content || "";
    
    // Parsear respuesta
    const lines = analysis.split('\n');
    let description = "";
    let extractedText = "";
    
    let currentSection = "";
    for (const line of lines) {
      if (line.toLowerCase().includes('descripción') || line.includes('1)')) {
        currentSection = "description";
        description += line.replace(/^\d+\)\s*/, '').replace(/descripción:?/i, '').trim() + " ";
      } else if (line.toLowerCase().includes('texto') || line.includes('2)')) {
        currentSection = "text";
        extractedText += line.replace(/^\d+\)\s*/, '').replace(/texto:?/i, '').trim() + " ";
      } else if (currentSection === "description" && line.trim()) {
        description += line.trim() + " ";
      } else if (currentSection === "text" && line.trim()) {
        extractedText += line.trim() + " ";
      }
    }

    return {
      description: description.trim() || "Imagen analizada por IA",
      extractedText: extractedText.trim() || "Sin texto detectado"
    };

  } catch (error) {
    console.error('❌ Error analizando imagen de Twilio:', error);
    return {
      description: "Error al analizar la imagen",
      extractedText: "No se pudo extraer texto"
    };
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
      // Campos adicionales para stickers de WhatsApp
      StickerPackId,
      StickerPackName,
      StickerId,
      MessageType,
    } = req.body;


    // Validar que es para la empresa correcta (verificar número de teléfono)
    const configuredPhone = envConfig.twilio.phoneNumber;
    if (!To.includes(configuredPhone.replace('+', ''))) {
      console.warn("⚠️ Mensaje no dirigido al número configurado");
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
      try {
        const QuickLearningChat = getQuickLearningChatModel(conn);
        const Record = getRecordModel(conn);

        let messageText = "";
        let messageType = "text";
        let mediaUrls: string[] = [];

        // Procesar diferentes tipos de mensaje
        if (Body) {
          messageText = Body;
          messageType = "text";
        } else if (MediaUrl0) {
          // Tratar todos los archivos de imagen (incluyendo stickers webp) como imágenes normales
          if (MediaContentType0?.startsWith('image/')) {
            messageType = "image";
            
            // Procesar imagen y subirla a S3
            const publicImageUrl = await processMediaFromTwilio(MediaUrl0, MediaContentType0, MessageSid);
            mediaUrls = [publicImageUrl];
            
            // Analizar imagen con IA
            try {
              const imageAnalysis = await analyzeImageFromTwilio(MediaUrl0, MediaContentType0);
              messageText = `🖼️ El usuario compartió una imagen\n\nDescripción: ${imageAnalysis.description}\n\nTexto extraído: ${imageAnalysis.extractedText}\n\nImagen: ${publicImageUrl}`;
            } catch (error) {
              console.error("❌ Error analizando imagen:", error);
              messageText = `🖼️ El usuario compartió una imagen\n\nImagen: ${publicImageUrl}`;
            }
          } else if (MediaContentType0?.startsWith('audio/')) {
            messageType = "audio";
            
            // Procesar audio y subirlo a S3
            const publicAudioUrl = await processMediaFromTwilio(MediaUrl0, MediaContentType0, MessageSid);
            mediaUrls = [publicAudioUrl];
            
            // Transcribir audio
            try {
              const transcription = await transcribeAudio(MediaUrl0);
              messageText = `🎙️ Audio transcrito: ${transcription}\n\nAudio: ${publicAudioUrl}`;
            } catch (error) {
              console.error("❌ Error transcribiendo audio:", error);
              messageText = `🎙️ El usuario envió un audio\n\nAudio: ${publicAudioUrl}`;
            }
          } else if (MediaContentType0?.startsWith('video/')) {
            messageType = "video";
            
            // Procesar video y subirlo a S3
            const publicVideoUrl = await processMediaFromTwilio(MediaUrl0, MediaContentType0, MessageSid);
            mediaUrls = [publicVideoUrl];
            messageText = `🎥 El usuario compartió un video\n\nVideo: ${publicVideoUrl}`;
          } else {
            messageType = "document";
            
            // Procesar documento y subirlo a S3
            const publicDocUrl = await processMediaFromTwilio(MediaUrl0, MediaContentType0, MessageSid);
            mediaUrls = [publicDocUrl];
            messageText = `📄 El usuario compartió un documento\n\nDocumento: ${publicDocUrl}`;
          }
        } else if (Latitude && Longitude) {
          messageType = "location";
          const lat = parseFloat(Latitude);
          const lng = parseFloat(Longitude);
          messageText = `📍 El usuario compartió su ubicación: https://www.google.com/maps?q=${lat},${lng}`;
        }

        // Buscar o crear el chat de forma atómica para evitar duplicados
        let chat = await QuickLearningChat.findOneAndUpdate(
          { phone: phoneUser },
          {
            $setOnInsert: {
              phone: phoneUser,
              profileName: ProfileName || "Usuario",
              linkedTable: {
                refModel: "Record",
                refId: customer._id,
              },
              conversationStart: new Date(),
              aiEnabled: aiEnabled,
              messages: [],
              tableSlug: 'prospectos',
              status: 'active',
            }
          },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true
          }
        );

        // Agregar mensaje al chat
        const newMessage = {
          direction: "inbound" as const,
          body: messageText,
          respondedBy: "human" as const,
          twilioSid: MessageSid,
          mediaUrl: mediaUrls,
          messageType: messageType as "text" | "image" | "audio" | "video" | "location" | "document" | "sticker",
          metadata: {
            lat: Latitude ? parseFloat(Latitude) : undefined,
            lng: Longitude ? parseFloat(Longitude) : undefined,
          },
          msgId: MessageSid
        };

        // Add message and update lastMessage atomically to prevent version conflicts
        const currentDate = new Date();
        await QuickLearningChat.findByIdAndUpdate(
          chat._id,
          {
            $push: { messages: newMessage },
            $set: {
              'lastMessage.body': messageText,
              'lastMessage.date': currentDate,
              'lastMessage.respondedBy': "human"
            }
          },
          { new: true }
        );

        // Emitir notificación por socket para mensaje nuevo
        emitNewMessageNotification(phoneUser, newMessage, chat);
      
        // Crear notificación para el asesor asignado
        let advisorId = null;
        try {
          if (customer?.data?.asesor) {
            if (typeof customer.data.asesor === 'string') {
              // Verificar si es un ObjectId válido (24 caracteres hex)
              if (/^[0-9a-fA-F]{24}$/.test(customer.data.asesor)) {
                advisorId = customer.data.asesor;
              } else {
                // Intentar parsear como JSON
                try {
                  const advisorData = JSON.parse(customer.data.asesor);
                  advisorId = advisorData._id || advisorData.id;
                } catch (jsonError) {
                  console.error("❌ [TwilioWebhook] Error parsing advisor JSON:", jsonError);
                  // Si no es JSON válido, usar el string directamente
                  advisorId = customer.data.asesor;
                }
              }
            } else if (customer.data.asesor._id || customer.data.asesor.id) {
              advisorId = customer.data.asesor._id || customer.data.asesor.id;
            }
          }
        } catch (parseError) {
          console.error("❌ [TwilioWebhook] Error parsing advisor data:", parseError);
        }

        if (advisorId) {
          try {
            
            const notification = await NotificationService.createChatNotification({
              company: "quicklearning",
              userId: advisorId,
              phoneNumber: phoneUser,
              senderName: customer.data.nombre || ProfileName || "Usuario",
              messagePreview: newMessage.body,
              chatId: chat._id.toString()
            });
            
          } catch (notificationError) {
            console.error("❌ [TwilioWebhook] Error creating chat notification:", notificationError);
            console.error("❌ [TwilioWebhook] Error details:", {
              message: notificationError instanceof Error ? notificationError.message : 'Unknown error',
              stack: notificationError instanceof Error ? notificationError.stack : undefined
            });
          }
        } else {
          console.warn("⚠️ [TwilioWebhook] No advisor ID found in customer data, skipping notification");
        }
      
        // Emitir evento genérico de actualización de chat (compatibilidad con listeners existentes)
        try {
          io.emit(`whatsapp-message-quicklearning`, chat);
        } catch (e) {
          console.error("❌ [TwilioWebhook] Error emitting socket event:", e);
        }

        // Actualizar ultimo_mensaje y lastMessageDate en la tabla correcta si el usuario ya existe
        const tableSlugs = ["alumnos", "prospectos", "clientes", "sin_contestar", "nuevo_ingreso"];
        let updated = false;
        for (const tableSlug of tableSlugs) {
          const result = await Record.updateOne(
            { tableSlug, $or: [{ "data.number": phoneUser }, { "data.phone": phoneUser }], c_name: "quicklearning" },
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

        // Si la AI está desactivada, no procesar con IA
        if (!aiEnabled) {
          return;
        }

        // Procesar mensaje con buffer para evitar respuestas múltiples
        await processMessageWithBuffer(phoneUser, messageText, chat, conn);
        
        } catch (innerError) {
          // Handle duplicate key errors specifically in chat processing
          if (innerError.code === 11000) {
            console.warn(`⚠️ Duplicate key error for chat ${phoneUser} - handled gracefully`);
            return; // Exit gracefully
          }
          throw innerError; // Re-throw other errors
        }
      });

    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Error en webhook de Twilio:", error);
    
    // Handle duplicate key errors gracefully
    if (error.code === 11000) {
      console.warn("⚠️ Duplicate key error handled gracefully - this is expected in concurrent scenarios");
      res.status(200).send("OK");
      return;
    }
    
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
      
      const config = await getIaConfigModel(conn).findOne();
      const session = await getSessionModel(conn).findOne();
      
      // Generar respuesta usando el NUEVO sistema de agentes
      const aiResponse = await messagingAgentService.processWhatsAppMessage(
        'quicklearning', // Esta empresa específica está bien aquí
        combinedMessage,
        phoneUser,
        conn,
        config?._id.toString(),
        session?._id.toString(), // sessionId
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
            msgId: result.messageId
          };

          // Add bot message and update lastMessage atomically to prevent version conflicts
          const currentDate = new Date();
          await QuickLearningChat.findByIdAndUpdate(
            chat._id,
            {
              $push: { messages: botMessage },
              $set: {
                'lastMessage.body': aiResponse,
                'lastMessage.date': currentDate,
                'lastMessage.respondedBy': "bot"
              }
            },
            { new: true }
          );

          // Emitir notificación por socket para respuesta del bot
          emitNewMessageNotification(phoneUser, botMessage, chat);
          // Emitir evento genérico de actualización de chat
          try {
            io.emit(`whatsapp-message-quicklearning`, chat);
          } catch (e) {
            console.error("❌ [BotReply] Error emitting socket event:", e);
          }

          // Verificar si es mensaje de transferencia a asesor
          const isTransferMessage = aiResponse.toLowerCase().includes('transferir con un asesor') || aiResponse.toLowerCase().includes('te voy a transferir');
          
          if (isTransferMessage) {
            
            // Desactivar IA en el chat atomically to prevent version conflicts
            await QuickLearningChat.findByIdAndUpdate(
              chat._id,
              { $set: { aiEnabled: false } },
              { new: true }
            );

            // Emitir notificación de que la IA se desactivó a sí misma
            const io = (global as any).io as SocketIOServer;
            if (io) {
              io.emit("chat_updated", {
                phone: phoneUser,
                aiEnabled: false,
                reason: "IA desactivada por IA",
                timestamp: new Date().toISOString()
              });
              console.log(`🔔 IA se desactivó a sí misma para ${phoneUser}`);
            }

            /*

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
                  // Add follow-up message atomically to prevent version conflicts
                  const followUpMessage = {
                    direction: "outbound-api",
                    body: advisorMessage,
                    dateCreated: new Date(),
                    respondedBy: "bot",
                    responseTime: 0,
                    twilioSid: followUpResult.messageId || `follow-${Date.now()}`,
                    mediaUrl: [],
                    messageType: "text",
                    metadata: {}
                  };
                  
                  await QuickLearningChat.findByIdAndUpdate(
                    chat._id,
                    { $push: { messages: followUpMessage } },
                    { new: true }
                  );

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
            }*/
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
                    { "data.number": phoneUser },
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
  }, 15000); // Esperar 15 segundos antes de procesar
}

// La detección de campañas ahora se maneja con la herramienta identify_campaign

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
          { "data.number": phone }
        ],
        c_name: "quicklearning"
      });
      if (customer) break;
    }

    if (!customer) {

      const UserConfig = getUserModel(conn);
      const Session = getSessionModel(conn);
      const detectedCampaign = 'ORGANICO';
      const medio = 'Interno';

      const defaultSession = await Session.findOne();

      const sessionBranchId = defaultSession.branch?.branchId ? String(defaultSession.branch.branchId) : null;
      const branchFilter = sessionBranchId
        ? { role: 'Asesor', status: 'active', 'branch.branchId': sessionBranchId }
        : { role: 'Asesor', status: 'active', $or: [{ 'branch.branchId': { $exists: false } }, { 'branch.branchId': null }] };

      // Ordenar por nombre para mantener consistencia en el orden
      const allUsers = await UserConfig.find(branchFilter).sort({ name: 1 }).lean();

      // Obtener el contador actual de asignaciones para esta sucursal/sesión
      const currentCounter = defaultSession.metadata?.assignmentCounter || 0;
      const nextUserIndex = currentCounter % allUsers.length;
      const selectedUser = allUsers[nextUserIndex];

      // Actualizar el contador en la sesión para la próxima asignación
      await Session.findByIdAndUpdate(
        defaultSession._id,
        { 
          $set: { 
            'metadata.assignmentCounter': currentCounter + 1,
            'metadata.lastAssignmentAt': new Date(),
            'metadata.lastAssignedTo': selectedUser.name
          } 
        }
      );
      const advisor = JSON.stringify({name: selectedUser.name, _id: selectedUser._id , email: selectedUser.email });

      console.log(`🎯 Usando valores por defecto para ${phone}: ${detectedCampaign} - Medio: ${medio} - Asesor: ${selectedUser.name}`);

      // AI habilitada por defecto, se desactivará con herramientas si es necesario
      const aiEnabled = true;

      // Use atomic create to prevent duplicates
      customer = await DynamicRecord.findOneAndUpdate(
        {
          tableSlug: "prospectos",
          c_name: "quicklearning",
          "data.number": phone
        },
        {
          $setOnInsert: {
            tableSlug: "prospectos",
            c_name: "quicklearning",
            createdBy: "twilio-webhook",
            data: {
              nombre: profileName,
              number: phone,
              email: null,
              clasificacion: "prospecto",
              medio: medio,
              curso: null,
              ciudad: null,
              campana: detectedCampaign,
              asesor: advisor,
              comentario: null,
              ultimo_mensaje: body || null,
              aiEnabled: aiEnabled,
              lastMessageDate: new Date(),
              createdBy: "twilio-webhook",
              createdAt: new Date()
            }
          }
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      );
      
      console.log(`✅ Cliente creado/encontrado: ${phone} con campaña: ${detectedCampaign}, medio: ${medio}, AI: ${aiEnabled ? 'activada' : 'desactivada'}`);
    }

    return customer;
  } catch (error) {
    // Handle duplicate key errors gracefully
    if (error.code === 11000) {
      console.warn(`⚠️ Duplicate key error for customer ${phone} - attempting recovery`);
      
      // Try to find the existing customer that was just created by another concurrent request
      const DynamicRecord = getRecordModel(conn);
      const tableSlugs = ["alumnos", "prospectos", "clientes", "sin_contestar"];
      
      for (const tableSlug of tableSlugs) {
        const existingCustomer = await DynamicRecord.findOne({
          tableSlug,
          $or: [
            { "data.phone": phone },
            { "data.number": phone }
          ],
          c_name: "quicklearning"
        });
        if (existingCustomer) {
          console.log(`✅ Recovered existing customer: ${phone} from table: ${tableSlug}`);
          return existingCustomer;
        }
      }
      
      // If we still can't find it, throw the original error
      throw error;
    }
    
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
          { tableSlug, $or: [{ "data.number": phone }, { "data.phone": phone }], c_name: "quicklearning" },
          { $set: { "data.ultimo_mensaje": message, "data.lastMessageDate": new Date() } }
        );
        if (updateResult.modifiedCount > 0) {
          updated = true;
          break;
        }
      }

      // Guardar el mensaje en la colección de chats
      const QuickLearningChat = getQuickLearningChatModel(conn);
      let chat = await QuickLearningChat.findOneAndUpdate(
        { phone },
        {
          $setOnInsert: {
            phone,
            profileName: "Sistema",
            conversationStart: new Date(),
            aiEnabled: false,
            messages: [],
            tableSlug: 'prospectos',
            status: 'active'
          }
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      );
      const currentDate = new Date();
      const asesorMessage = {
        direction: "outbound-api" as const,
        body: message,
        respondedBy: "asesor" as const,
        twilioSid: result.messageId,
        messageType: "text" as const,
        msgId: result.messageId
      };
      
      // Add asesor message and update lastMessage atomically to prevent version conflicts
      await QuickLearningChat.findByIdAndUpdate(
        chat._id,
        {
          $push: { messages: asesorMessage },
          $set: {
            'lastMessage.body': message,
            'lastMessage.date': currentDate,
            'lastMessage.respondedBy': "asesor"
          }
        },
        { new: true }
      );

      // Emitir notificación por socket para mensaje del asesor
      emitNewMessageNotification(phone, asesorMessage);
      // Emitir evento genérico de actualización de chat
      try {
        io.emit(`whatsapp-message-quicklearning`, chat);
      } catch (e) {
        console.error("❌ Error emitting socket event:", e);
      }

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
          { tableSlug, $or: [{ "data.number": phone }, { "data.phone": phone }], c_name: "quicklearning" },
          { $set: { "data.ultimo_mensaje": templateBody, "data.lastMessageDate": new Date() } }
        );
        if (updateResult.modifiedCount > 0) {
          updated = true;
          break;
        }
      }

      // Guardar el mensaje en la colección de chats
      const QuickLearningChat = getQuickLearningChatModel(conn);
      let chat = await QuickLearningChat.findOneAndUpdate(
        { phone },
        {
          $setOnInsert: {
            phone,
            profileName: "Sistema",
            conversationStart: new Date(),
            aiEnabled: false,
            messages: [],
            tableSlug: 'prospectos',
            status: 'active',
          }
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      );
      const currentDate = new Date();
      const templateAsesorMessage = {
        direction: "outbound-api" as const,
        body: templateBody,
        respondedBy: "asesor" as const,
        twilioSid: result.messageId,
        messageType: "text" as const,
        msgId: result.messageId
      };
      
      // Add template message and update lastMessage atomically to prevent version conflicts
      await QuickLearningChat.findByIdAndUpdate(
        chat._id,
        {
          $push: { messages: templateAsesorMessage },
          $set: {
            'lastMessage.body': templateBody,
            'lastMessage.date': currentDate,
            'lastMessage.respondedBy': "asesor"
          }
        },
        { new: true }
      );

      // Emitir notificación por socket para mensaje de template del asesor
      emitNewMessageNotification(phone, templateAsesorMessage);
      // Emitir evento genérico de actualización de chat
      try {
        io.emit(`whatsapp-message-quicklearning`, chat);
      } catch (e) {
        console.error("❌ Error emitting socket event:", e);
      }

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

