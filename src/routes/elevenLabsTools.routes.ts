/**
 * 🔧 ELEVENLABS TOOLS ROUTES
 * Endpoints para tools llamadas por ElevenLabs Conversational AI
 */

import { Router } from 'express';
import { ElevenLabsToolsController } from '../controllers/elevenLabsTools.controller';

const router = Router();
const controller = new ElevenLabsToolsController();

/**
 * @swagger
 * /elevenlabs-tools/transfer-to-advisor:
 *   post:
 *     summary: Tool para transferir llamada a asesor
 *     tags: [ElevenLabs Tools]
 *     description: Webhook llamado por ElevenLabs cuando el usuario pide hablar con un asesor
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               advisor_name:
 *                 type: string
 *                 description: Nombre del asesor
 *               call_sid:
 *                 type: string
 *                 description: SID de la llamada de Twilio
 *               conversation_id:
 *                 type: string
 *                 description: ID de conversación de ElevenLabs
 *     responses:
 *       200:
 *         description: Resultado de la transferencia
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 advisor_available:
 *                   type: boolean
 *                 continue_conversation:
 *                   type: boolean
 */
router.post('/transfer-to-advisor', (req, res) => controller.transferToAdvisor(req, res));

/**
 * @swagger
 * /elevenlabs-tools/transfer-to-advisor-simple-green:
 *   post:
 *     summary: Tool EXCLUSIVA para Simple Green
 *     tags: [ElevenLabs Tools - Simple Green]
 *     description: Transferencias para Simple Green (4 asesores)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               advisor_name:
 *                 type: string
 *                 description: Nombre del asesor o extensión (juanita, monica, gerson, guillermo, 100, 105, 115, 103)
 *     responses:
 *       200:
 *         description: Resultado de la transferencia
 */
router.post('/transfer-to-advisor-simple-green', (req, res) => controller.transferToAdvisorSimpleGreen(req, res));

/**
 * @swagger
 * /elevenlabs-tools/take-voicemail:
 *   post:
 *     summary: Tool para tomar recado/mensaje
 *     tags: [ElevenLabs Tools]
 *     description: Webhook llamado por ElevenLabs cuando el usuario quiere dejar un recado
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               advisor_name:
 *                 type: string
 *                 description: Nombre del asesor para quien es el recado
 *               caller_name:
 *                 type: string
 *                 description: Nombre del llamante
 *               caller_phone:
 *                 type: string
 *                 description: Teléfono del llamante
 *               message:
 *                 type: string
 *                 description: Mensaje/recado del llamante
 *               conversation_id:
 *                 type: string
 *                 description: ID de conversación de ElevenLabs
 *     responses:
 *       200:
 *         description: Recado guardado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 voicemail_saved:
 *                   type: boolean
 *                 continue_conversation:
 *                   type: boolean
 */
router.post('/take-voicemail', (req, res) => controller.takeVoicemail(req, res));

/**
 * @swagger
 * /elevenlabs-tools/conference-status:
 *   post:
 *     summary: Callback de estado de conferencia de Twilio
 *     tags: [ElevenLabs Tools]
 *     description: Recibe actualizaciones de estado de la conferencia
 *     responses:
 *       200:
 *         description: Status recibido
 */
router.post('/conference-status', (req, res) => controller.conferenceStatus(req, res));

/**
 * @swagger
 * /elevenlabs-tools/advisor-response:
 *   post:
 *     summary: Respuesta del asesor (presionó 1 o 2)
 *     tags: [ElevenLabs Tools]
 *     description: Maneja la respuesta del asesor cuando se le llama para transferencia
 *     responses:
 *       200:
 *         description: TwiML con siguiente acción
 */
router.post('/advisor-response', (req, res) => controller.advisorResponse(req, res));

/**
 * @swagger
 * /elevenlabs-tools/transfer-to-extension:
 *   post:
 *     summary: Tool para transferir a extensión de conmutador
 *     tags: [ElevenLabs Tools]
 *     description: Webhook para transferir llamadas a extensiones internas usando DTMF
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               extension_number:
 *                 type: string
 *                 description: Número de extensión (ej "103")
 *     responses:
 *       200:
 *         description: Resultado de la transferencia
 */
router.post('/transfer-to-extension', (req, res) => controller.transferToExtension(req, res));

export default router;

