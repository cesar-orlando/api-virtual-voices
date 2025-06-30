import { Request, Response } from "express";
import { twilioService } from "../../services/twilio/twilioService";
import { quickLearningOpenAIService } from "../../services/quicklearning/openaiService";
import { getDbConnection } from "../../config/connectionManager";
import getQuickLearningChatModel from "../../models/quicklearning/chat.model";
import getRecordModel from "../../models/record.model";
import fs from "fs";
import axios from "axios";
import FormData from "form-data";
import { getEnvironmentConfig } from "../../config/environments";

// Configuración del entorno
const envConfig = getEnvironmentConfig();

// Buffer de mensajes para agrupar mensajes rápidos
const messageBuffers = new Map<string, { messages: string[]; timeout: NodeJS.Timeout }>();

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

    // Validar webhook si es necesario
    const signature = req.headers['x-twilio-signature'] as string;
    if (signature && !twilioService.validateWebhook(signature, req.url, req.body)) {
      console.error("❌ Webhook signature inválida");
      res.status(403).send("Forbidden");
      return;
    }

    // Buscar o crear el cliente
    const customer = await findOrCreateCustomer(phoneUser, ProfileName || "Usuario");

    // Verificar si tiene AI activada
    const aiEnabled = customer.data.ai !== false;

    // Obtener conexión a la base de datos
    const conn = await getDbConnection('quicklearning');
    const QuickLearningChat = getQuickLearningChatModel(conn);

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
    chat.messages.push({
      direction: "inbound",
      body: messageText,
      respondedBy: "human",
      twilioSid: MessageSid,
      mediaUrl: mediaUrls,
      messageType: messageType as any,
      metadata: {
        lat: Latitude ? parseFloat(Latitude) : undefined,
        lng: Longitude ? parseFloat(Longitude) : undefined,
      },
    });

    // Actualizar último mensaje
    chat.lastMessage = {
      body: messageText,
      date: new Date(),
      respondedBy: "human",
    };

    await chat.save();

    console.log(`📝 Mensaje guardado: ${messageText.substring(0, 100)}...`);

    // Si la AI está desactivada, no procesar con IA
    if (!aiEnabled) {
      console.log("🤖 AI desactivada para este usuario.");
      res.status(200).send("OK");
      return;
    }

    // Procesar mensaje con buffer para evitar respuestas múltiples
    await processMessageWithBuffer(phoneUser, messageText, chat);

    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Error en webhook de Twilio:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Procesar mensaje con buffer para agrupar mensajes rápidos
 */
async function processMessageWithBuffer(phoneUser: string, messageText: string, chat: any): Promise<void> {
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
         // Agregar respuesta al chat
         chat.messages.push({
           direction: "outbound-api",
           body: aiResponse,
           respondedBy: "bot",
           twilioSid: result.messageId,
           messageType: "text",
         });

         // Actualizar último mensaje
         chat.lastMessage = {
           body: aiResponse,
           date: new Date(),
           respondedBy: "bot",
         };

         await chat.save();

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
async function findOrCreateCustomer(phone: string, profileName: string) {
  try {
    const conn = await getDbConnection('quicklearning');
    const DynamicRecord = getRecordModel(conn);

    // Buscar cliente existente
    let customer = await DynamicRecord.findOne({
      tableSlug: "prospectos",
      "data.phone": phone,
    });

    if (!customer) {
      // Crear nuevo cliente
      customer = new DynamicRecord({
        tableSlug: "prospectos",
        c_name: "quicklearning",
        createdBy: "twilio-webhook",
        data: {
          phone: phone,
          name: profileName,
          status: "Nuevo",
          classification: "Prospecto",
          ai: true,
          createdAt: new Date(),
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