import { Router } from "express";
import {
  twilioWebhook,
  sendMessage,
  sendTemplateMessage,
  getServiceStatus,
  getMessageHistory,
} from "../../controllers/quicklearning/twilioController";

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

export default router;