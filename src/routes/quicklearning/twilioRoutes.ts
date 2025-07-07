import { Router, Request, Response } from "express";
import {
  twilioWebhook,
  sendMessage,
  sendTemplateMessage,
  getServiceStatus,
  getMessageHistory,
  getActiveChats,
  getChatHistory,
} from "../../controllers/quicklearning/twilioController";
import { getDbConnection, getConnectionByCompanySlug } from "../../config/connectionManager";
import getRecordModel from "../../models/record.model";
import getQuickLearningChatModel from "../../models/quicklearning/chat.model";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Twilio Quick Learning
 *   description: Endpoints para integración de Twilio con Quick Learning
 */

/**
 * @swagger
 * /api/quicklearning/twilio/webhook:
 *   post:
 *     summary: Webhook de Twilio para recibir mensajes de WhatsApp
 *     tags: [Twilio Quick Learning]
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               From:
 *                 type: string
 *                 description: Número de teléfono del remitente
 *               To:
 *                 type: string
 *                 description: Número de teléfono de destino
 *               Body:
 *                 type: string
 *                 description: Contenido del mensaje
 *               MessageSid:
 *                 type: string
 *                 description: ID único del mensaje en Twilio
 *               ProfileName:
 *                 type: string
 *                 description: Nombre del perfil de WhatsApp
 *               MediaUrl0:
 *                 type: string
 *                 description: URL del archivo multimedia (si existe)
 *               MediaContentType0:
 *                 type: string
 *                 description: Tipo de contenido multimedia
 *               Latitude:
 *                 type: string
 *                 description: Latitud de ubicación compartida
 *               Longitude:
 *                 type: string
 *                 description: Longitud de ubicación compartida
 *     responses:
 *       200:
 *         description: Mensaje procesado exitosamente
 *       403:
 *         description: Webhook signature inválida
 *       500:
 *         description: Error interno del servidor
 */
router.post("/webhook", twilioWebhook);

/**
 * @swagger
 * /api/quicklearning/twilio/send:
 *   post:
 *     summary: Enviar mensaje de texto a través de Twilio
 *     tags: [Twilio Quick Learning]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - message
 *             properties:
 *               phone:
 *                 type: string
 *                 description: Número de teléfono del destinatario (con código de país)
 *                 example: "+5214521311888"
 *               message:
 *                 type: string
 *                 description: Contenido del mensaje
 *                 example: "Hola, ¿cómo estás?"
 *     responses:
 *       200:
 *         description: Mensaje enviado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 messageId:
 *                   type: string
 *                 message:
 *                   type: string
 *       400:
 *         description: Datos inválidos o error en el envío
 *       500:
 *         description: Error interno del servidor
 */
router.post("/send", sendMessage);

/**
 * @swagger
 * /api/quicklearning/twilio/send-template:
 *   post:
 *     summary: Enviar mensaje con plantilla aprobada de Twilio
 *     tags: [Twilio Quick Learning]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - templateId
 *             properties:
 *               phone:
 *                 type: string
 *                 description: Número de teléfono del destinatario
 *                 example: "+5214521311888"
 *               templateId:
 *                 type: string
 *                 description: ID de la plantilla aprobada en Twilio
 *                 example: "HX1234567890abcdef"
 *               variables:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Variables para reemplazar en la plantilla
 *                 example: ["Juan", "Quick Learning", "mañana"]
 *     responses:
 *       200:
 *         description: Plantilla enviada exitosamente
 *       400:
 *         description: Datos inválidos o error en el envío
 *       500:
 *         description: Error interno del servidor
 */
router.post("/send-template", sendTemplateMessage);

/**
 * @swagger
 * /api/quicklearning/twilio/status:
 *   get:
 *     summary: Obtener estado del servicio Twilio
 *     tags: [Twilio Quick Learning]
 *     responses:
 *       200:
 *         description: Estado del servicio
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   description: Estado de la cuenta Twilio
 *                 phoneNumber:
 *                   type: string
 *                   description: Número de teléfono configurado
 *                 accountSid:
 *                   type: string
 *                   description: SID de la cuenta Twilio
 *       500:
 *         description: Error interno del servidor
 */
router.get("/status", getServiceStatus);

/**
 * @swagger
 * /api/quicklearning/twilio/history:
 *   get:
 *     summary: Obtener historial de mensajes enviados
 *     tags: [Twilio Quick Learning]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Límite de mensajes a obtener
 *     responses:
 *       200:
 *         description: Historial de mensajes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   sid:
 *                     type: string
 *                   from:
 *                     type: string
 *                   to:
 *                     type: string
 *                   body:
 *                     type: string
 *                   status:
 *                     type: string
 *                   dateCreated:
 *                     type: string
 *       500:
 *         description: Error interno del servidor
 */
router.get("/history", getMessageHistory);

/**
 * @swagger
 * /api/quicklearning/twilio/chats/active:
 *   get:
 *     summary: Listar chats activos de WhatsApp
 *     tags: [Twilio Quick Learning]
 *     responses:
 *       200:
 *         description: Lista de chats activos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/QuickLearningChat'
 */
router.get("/chats/active", getActiveChats);

/**
 * @swagger
 * /api/quicklearning/twilio/chats/{phone}/history:
 *   get:
 *     summary: Obtener historial de mensajes de un chat por teléfono
 *     tags: [Twilio Quick Learning]
 *     parameters:
 *       - in: path
 *         name: phone
 *         required: true
 *         schema:
 *           type: string
 *         description: Número de teléfono del usuario
 *     responses:
 *       200:
 *         description: Historial de mensajes del chat
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Message'
 */
router.get("/chats/:phone/history", getChatHistory);

/**
 * @swagger
 * /api/quicklearning/twilio/prospectos:
 *   get:
 *     summary: Listar todos los prospectos guardados en la tabla dinámica 'prospectos'
 *     tags: [Twilio Quick Learning]
 *     parameters:
 *       - in: query
 *         name: companySlug
 *         schema:
 *           type: string
 *         required: true
 *         description: Slug de la empresa (ej: quicklearning, test)
 *     responses:
 *       200:
 *         description: Lista de prospectos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   data:
 *                     type: object
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 */
router.get("/prospectos", async (req: Request, res: Response) => {
  try {
    const { companySlug } = req.query;
    if (!companySlug) {
      res.status(400).json({ error: "companySlug query param is required" });
      return;
    }
    const conn = await getConnectionByCompanySlug(companySlug as string);
    const Record = getRecordModel(conn);
    const prospectos = await Record.find({ tableSlug: "prospectos" }).sort({ createdAt: -1 }).lean();
    res.status(200).json(prospectos);
  } catch (error) {
    console.error("❌ Error obteniendo prospectos:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/quicklearning/twilio/usuarios:
 *   get:
 *     summary: Listar usuarios de una o varias tablas dinámicas, cada uno con su último mensaje de chat
 *     tags: [Twilio Quick Learning]
 *     parameters:
 *       - in: query
 *         name: tableSlugs
 *         schema:
 *           type: string
 *         required: true
 *         description: Lista de slugs de tablas separadas por comas (ej: prospectos,clientes,sin_contestar)
 *       - in: query
 *         name: companySlug
 *         schema:
 *           type: string
 *         required: true
 *         description: Slug de la empresa (ej: quicklearning, test)
 *     responses:
 *       200:
 *         description: Lista de usuarios de las tablas indicadas
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   phone:
 *                     type: string
 *                   lastMessage:
 *                     type: object
 *                     properties:
 *                       body:
 *                         type: string
 *                       date:
 *                         type: string
 *                         format: date-time
 *                   tableSlug:
 *                     type: string
 */
router.get("/usuarios", async (req: Request, res: Response) => {
  try {
    const { tableSlugs, companySlug } = req.query;
    if (!tableSlugs) {
      res.status(400).json({ error: "tableSlugs query param is required" });
      return;
    }
    if (!companySlug) {
      res.status(400).json({ error: "companySlug query param is required" });
      return;
    }
    const slugs = (tableSlugs as string).split(",").map(s => s.trim()).filter(Boolean);
    const conn = await getConnectionByCompanySlug(companySlug as string);
    const Record = getRecordModel(conn);
    const QuickLearningChat = getQuickLearningChatModel(conn);
    
    // Buscar todos los usuarios de las tablas indicadas
    const records = await Record.find({ tableSlug: { $in: slugs } }).lean();
    
    // Para cada usuario, buscar el chat y el último mensaje
    const usuarios = await Promise.all(records.map(async (rec: any) => {
      // Extraer datos de customFields
      const customFields = rec.customFields || [];
      const nameField = customFields.find((field: any) => field.key === 'name');
      const phoneField = customFields.find((field: any) => field.key === 'phone');
      const lastMessageField = customFields.find((field: any) => field.key === 'lastMessage');
      const lastMessageTimeField = customFields.find((field: any) => field.key === 'lastMessageTime');
      
      const name = nameField?.value || '';
      const phone = phoneField?.value || '';
      
      let lastMessage = null;
      if (phone) {
        const chat = await QuickLearningChat.findOne({ phone }).lean();
        if (chat && chat.lastMessage) {
          lastMessage = chat.lastMessage;
        } else if (lastMessageField?.value) {
          // Si no hay chat, usar el último mensaje guardado en el registro
          lastMessage = {
            body: lastMessageField.value,
            date: lastMessageTimeField?.value ? new Date(lastMessageField.value) : new Date(),
            respondedBy: "human"
          };
        }
      }
      
      return {
        _id: rec._id,
        name,
        phone,
        lastMessage,
        tableSlug: rec.tableSlug
      };
    }));
    
    res.status(200).json(usuarios);
  } catch (error) {
    console.error("❌ Error obteniendo usuarios de tablas:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/quicklearning/twilio/chat:
 *   get:
 *     summary: Obtener historial de mensajes de un chat por teléfono (Quick Learning)
 *     tags: [Twilio Quick Learning]
 *     parameters:
 *       - in: query
 *         name: phone
 *         required: true
 *         schema:
 *           type: string
 *         description: Número de teléfono del usuario (ej: 5214521311888)
 *       - in: query
 *         name: companySlug
 *         schema:
 *           type: string
 *         required: true
 *         description: Slug de la empresa (ej: quicklearning)
 *     responses:
 *       200:
 *         description: Historial de mensajes del chat
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   direction:
 *                     type: string
 *                     enum: [inbound, outbound-api]
 *                     description: Dirección del mensaje (entrante o saliente)
 *                   body:
 *                     type: string
 *                     description: Contenido del mensaje
 *                   respondedBy:
 *                     type: string
 *                     enum: [bot, human, asesor]
 *                     description: Quién respondió el mensaje
 *                   dateCreated:
 *                     type: string
 *                     format: date-time
 *                     description: Fecha de creación del mensaje
 *                   _id:
 *                     type: string
 *                     description: ID del mensaje
 *         examples:
 *           ejemplo:
 *             value:
 *               - direction: inbound
 *                 body: "hola!"
 *                 respondedBy: human
 *                 _id: "68242156534d273327baaf80"
 *                 dateCreated: "2025-05-14T04:51:34.266Z"
 *               - direction: outbound-api
 *                 body: "Inglés en Quick Learning, ¡Hablas o Hablas! Soy NatalIA, ¿Cómo te puedo ayudar hoy?"
 *                 respondedBy: bot
 *                 _id: "68242158534d273327baaf86"
 *                 dateCreated: "2025-05-14T04:51:36.979Z"
 *       404:
 *         description: Chat no encontrado
 *       500:
 *         description: Error interno del servidor
 */
router.get("/chat", async (req: Request, res: Response) => {
  try {
    const { phone, companySlug } = req.query;
    if (!phone) {
      res.status(400).json({ error: "phone query param is required" });
      return;
    }
    if (!companySlug) {
      res.status(400).json({ error: "companySlug query param is required" });
      return;
    }
    // Asignar phone a params para reutilizar getChatHistory
    req.params.phone = phone as string;
    // Llamar directamente a getChatHistory
    return getChatHistory(req, res);
  } catch (error) {
    console.error("❌ Error obteniendo historial de chat:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;