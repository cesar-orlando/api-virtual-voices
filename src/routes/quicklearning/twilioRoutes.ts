import { Router, Request, Response } from "express";
import {
  twilioWebhook,
  sendMessage,
  sendTemplateMessage,
  getServiceStatus,
  getMessageHistory,
  getActiveChats,
  getChatHistory,
  markChatAsRead,
  getChatsWithUnreadCount,
  handleWhatsAppTypingIndicators,
  simulateBotTyping,
  simulateAdvisorTyping,
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
 * /api/quicklearning/twilio/chats/{phone}/read:
 *   post:
 *     summary: Marcar mensajes de un chat como leídos por un usuario
 *     tags: [Twilio Quick Learning]
 *     parameters:
 *       - in: path
 *         name: phone
 *         required: true
 *         schema:
 *           type: string
 *         description: Número de teléfono del chat
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - companySlug
 *             properties:
 *               userId:
 *                 type: string
 *                 description: ID del usuario que marca como leído
 *               companySlug:
 *                 type: string
 *                 description: Slug de la empresa
 *     responses:
 *       200:
 *         description: Chat marcado como leído exitosamente
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Chat no encontrado
 *       500:
 *         description: Error interno del servidor
 */
router.post("/chats/:phone/read", markChatAsRead);

/**
 * @swagger
 * /api/quicklearning/twilio/chats:
 *   get:
 *     summary: Obtener lista de chats con conteo de mensajes no leídos
 *     tags: [Twilio Quick Learning]
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del usuario
 *       - in: query
 *         name: companySlug
 *         required: true
 *         schema:
 *           type: string
 *         description: Slug de la empresa
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Límite de chats a obtener
 *     responses:
 *       200:
 *         description: Lista de chats con información de no leídos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 chats:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       phone:
 *                         type: string
 *                       profileName:
 *                         type: string
 *                       lastMessage:
 *                         type: object
 *                       unreadCount:
 *                         type: number
 *                       hasUnread:
 *                         type: boolean
 *                       lastMessagePreview:
 *                         type: string
 *                 total:
 *                   type: number
 *                 totalUnread:
 *                   type: number
 *       400:
 *         description: Datos inválidos
 *       500:
 *         description: Error interno del servidor
 */
router.get("/chats", getChatsWithUnreadCount);

/**
 * @swagger
 * /api/quicklearning/twilio/typing-indicators:
 *   post:
 *     summary: Webhook para recibir indicadores de escritura de WhatsApp Business API
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
 *               EventType:
 *                 type: string
 *                 description: Tipo de evento (typing_start, typing_stop, read, delivered)
 *               EventData:
 *                 type: string
 *                 description: Datos adicionales del evento
 *     responses:
 *       200:
 *         description: Evento procesado exitosamente
 *       500:
 *         description: Error interno del servidor
 */
router.post("/typing-indicators", handleWhatsAppTypingIndicators);

/**
 * @swagger
 * /api/quicklearning/twilio/simulate-typing:
 *   post:
 *     summary: Simular indicador de escritura (para testing)
 *     tags: [Twilio Quick Learning]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - isTyping
 *               - userType
 *             properties:
 *               phone:
 *                 type: string
 *                 description: Número de teléfono
 *               isTyping:
 *                 type: boolean
 *                 description: Si está escribiendo o no
 *               userType:
 *                 type: string
 *                 enum: [bot, asesor]
 *                 description: Tipo de usuario que está escribiendo
 *               advisorId:
 *                 type: string
 *                 description: ID del asesor (solo si userType es asesor)
 *     responses:
 *       200:
 *         description: Indicador de escritura simulado exitosamente
 *       400:
 *         description: Datos inválidos
 *       500:
 *         description: Error interno del servidor
 */
router.post("/simulate-typing", async (req: Request, res: Response) => {
  try {
    const { phone, isTyping, userType, advisorId } = req.body;

    if (!phone || typeof isTyping !== 'boolean' || !userType) {
      res.status(400).json({ error: "phone, isTyping y userType son requeridos" });
      return;
    }

    if (userType === "bot") {
      await simulateBotTyping(phone, isTyping);
    } else if (userType === "asesor") {
      if (!advisorId) {
        res.status(400).json({ error: "advisorId es requerido para userType asesor" });
        return;
      }
      await simulateAdvisorTyping(phone, isTyping, advisorId);
    } else {
      res.status(400).json({ error: "userType debe ser 'bot' o 'asesor'" });
      return;
    }

    res.status(200).json({
      success: true,
      message: `Indicador de escritura simulado para ${userType}`,
      phone,
      isTyping,
      userType
    });
  } catch (error) {
    console.error("❌ Error simulando indicador de escritura:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

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
 *         description: Slug de la empresa (ej quicklearning, test)
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
 *         description: Lista de slugs de tablas separadas por comas (ej prospectos,clientes,sin_contestar)
 *       - in: query
 *         name: companySlug
 *         schema:
 *           type: string
 *         required: true
 *         description: Slug de la empresa (ej quicklearning, test)
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [Asesor, Administrador, Gerente, Supervisor]
 *         required: true
 *         description: Rol del usuario para filtrar por asesor
 *       - in: query
 *         name: asesorId
 *         schema:
 *           type: string
 *         required: true
 *         description: ID del asesor para filtrar por rol
 *     responses:
 *       200:
 *         description: Lista de usuarios de las tablas indicadas
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
router.get("/usuarios", async (req: Request, res: Response) => {
  try {
    const { tableSlugs, companySlug, limit = "20", cursor, role, asesorId } = req.query;
    
    if (!tableSlugs) {
      res.status(400).json({ error: "tableSlugs query param is required" });
      return;
    }
    if (!companySlug) {
      res.status(400).json({ error: "companySlug query param is required" });
      return;
    }
    if (!role) {
      res.status(400).json({ error: "role query param is required" });
      return;
    }
    
    const limitNum = Math.min(parseInt(limit as string) || 20, 50); // Máximo 50 por request
    const slugs = (tableSlugs as string).split(",").map(s => s.trim()).filter(Boolean);
    const conn = await getConnectionByCompanySlug(companySlug as string);
    const Record = getRecordModel(conn);

    // Obtener registros de las tablas especificadas
    let records = await Record.find({ 
      tableSlug: { $in: slugs }
    }).lean();

    // Filtrar por asesor si el rol es Asesor
    if (role === "Asesor") {
      if (!asesorId) {
        res.status(400).json({ error: "asesorId query param is required for Asesor role" });
        return;
      }
      records = records.filter((record: any) => {
        let asesor = record.data && record.data.asesor;
      
        // Si es un string que parece JSON, intenta parsear
        if (typeof asesor === "string" && asesor.trim().startsWith("{")) {
          try {
            asesor = JSON.parse(asesor);
          } catch (e) {
            // Si no se puede parsear, ignora
          }
        }
      
        if (!asesor) return false;
        if (typeof asesor === "string") return asesor === asesorId;
        if (typeof asesor === "object" && asesor._id) return asesor._id === asesorId;
        return false;
      });
    }

    // Mapear registros para retornar solo el data, pero mantener lastMessageDate para ordenamiento
    const usuariosMapeados = records.map((record: any) => {
      const data = record.data || {};
      
      // Determinar el último mensaje y la fecha para ordenamiento
      let lastMessageDate = null;
      if (data.ultimo_mensaje) {
        if (data.lastMessageDate) {
          lastMessageDate = new Date(data.lastMessageDate);
        } else if (data.ultimo_mensaje instanceof Date || (typeof data.ultimo_mensaje === 'string' && !isNaN(Date.parse(data.ultimo_mensaje)))) {
          lastMessageDate = new Date(data.ultimo_mensaje);
        }
      }
      
      return {
        data: data,
        lastMessageDate: lastMessageDate, // Solo para ordenamiento interno
        tableSlug: record.tableSlug,
        _id: record._id,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      };
    });
    
    // Ordenar por lastMessageDate (más reciente primero)
    const usuariosOrdenados = usuariosMapeados.sort((a: any, b: any) => {
      const aTime = a.lastMessageDate ? new Date(a.lastMessageDate).getTime() : 0;
      const bTime = b.lastMessageDate ? new Date(b.lastMessageDate).getTime() : 0;
      return bTime - aTime;
    });
    
    // Aplicar paginación con cursor
    let usuariosFiltrados = usuariosOrdenados;
    if (cursor) {
      const cursorDate = new Date(cursor as string);
      usuariosFiltrados = usuariosOrdenados.filter(usuario => {
        if (!usuario.lastMessageDate) return true; // Usuarios sin mensajes van al final
        return new Date(usuario.lastMessageDate) < cursorDate;
      });
    }
    
    // Aplicar límite
    const usuariosLimitados = usuariosFiltrados.slice(0, limitNum);
    
    // Calcular paginación
    const hasMore = usuariosFiltrados.length > limitNum;
    const nextCursor = hasMore && usuariosLimitados.length > 0 
      ? usuariosLimitados[usuariosLimitados.length - 1].lastMessageDate?.toISOString()
      : null;
    
    // Limpiar resultado para retornar solo el data
    const usuariosFinales = usuariosLimitados.map(usuario => usuario);
    
    res.status(200).json({
      usuarios: usuariosFinales,
      pagination: {
        hasMore,
        nextCursor,
        total: records.length,
        limit: limitNum
      }
    });
  } catch (error) {
    console.error("❌ Error obteniendo usuarios de tablas:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Ruta para obtener estadísticas de usuarios
router.get("/usuarios/stats", async (req: Request, res: Response) => {
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
    
    // Contar total de usuarios
    const totalUsuarios = await Record.countDocuments({ tableSlug: { $in: slugs } });
    
    // Contar usuarios con chats activos (último mensaje en las últimas 24 horas)
    const hace24Horas = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const chatsActivos = await QuickLearningChat.countDocuments({
      'lastMessage.date': { $gte: hace24Horas }
    });
    
    // Contar usuarios sin respuesta (último mensaje del usuario hace más de 1 hora)
    const hace1Hora = new Date(Date.now() - 60 * 60 * 1000);
    const usuariosSinRespuesta = await QuickLearningChat.countDocuments({
      'lastMessage.date': { $lt: hace1Hora },
      'lastMessage.respondedBy': 'user'
    });
    
    res.status(200).json({
      total: totalUsuarios,
      activos24h: chatsActivos,
      sinRespuesta: usuariosSinRespuesta
    });
  } catch (error) {
    console.error("❌ Error obteniendo estadísticas:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


export default router;