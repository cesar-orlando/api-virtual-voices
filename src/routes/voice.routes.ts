import { Router, Request, Response } from "express";
import { VoiceController } from "../controllers/voice.controller";
import path from "path";
import fs from "fs";

const router = Router();
const controller = new VoiceController();

/**
 * @swagger
 * tags:
 *   name: Voice Calls
 *   description: API para manejo de llamadas de voz con IA y desvío inteligente
 */

/**
 * @swagger
 * /voice/incoming:
 *   post:
 *     summary: Recibir llamada entrante y crear conference
 *     tags: [Voice Calls]
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               CallSid:
 *                 type: string
 *                 description: ID único de la llamada
 *               From:
 *                 type: string
 *                 description: Número del llamante
 *               To:
 *                 type: string
 *                 description: Número de destino
 *     responses:
 *       200:
 *         description: TwiML para manejar la llamada
 *         content:
 *           text/xml:
 *             schema:
 *               type: string
 *       500:
 *         description: Error interno del servidor
 */
router.post('/incoming', controller.handleIncomingCall.bind(controller));

/**
 * @swagger
 * /voice/transfer/init:
 *   post:
 *     summary: Iniciar desvío de llamada a asesor
 *     tags: [Voice Calls]
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               CallSid:
 *                 type: string
 *                 description: ID de la llamada original
 *               To:
 *                 type: string
 *                 description: Número del asesor
 *               ConferenceName:
 *                 type: string
 *                 description: Nombre de la conference
 *     responses:
 *       200:
 *         description: Desvío iniciado exitosamente
 *       500:
 *         description: Error interno del servidor
 */
router.post('/transfer/init', controller.initTransfer.bind(controller));

/**
 * @swagger
 * /voice/transfer/connect:
 *   post:
 *     summary: Conectar asesor a la conference
 *     tags: [Voice Calls]
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               CallSid:
 *                 type: string
 *                 description: ID de la llamada del asesor
 *               ConferenceName:
 *                 type: string
 *                 description: Nombre de la conference
 *     responses:
 *       200:
 *         description: TwiML para conectar a conference
 *         content:
 *           text/xml:
 *             schema:
 *               type: string
 *       500:
 *         description: Error interno del servidor
 */
router.post('/transfer/connect', controller.connectToConference.bind(controller));

/**
 * @swagger
 * /voice/transfer/status:
 *   post:
 *     summary: Monitorear estado del desvío
 *     tags: [Voice Calls]
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               CallSid:
 *                 type: string
 *                 description: ID de la llamada
 *               CallStatus:
 *                 type: string
 *                 description: Estado de la llamada
 *               ParentCallSid:
 *                 type: string
 *                 description: ID de la llamada padre
 *     responses:
 *       200:
 *         description: Estado procesado exitosamente
 *       500:
 *         description: Error interno del servidor
 */
router.post('/transfer/status', controller.handleTransferStatus.bind(controller));

/**
 * @swagger
 * /voice/voicemail:
 *   post:
 *     summary: Manejar recado cuando no contesta el asesor
 *     tags: [Voice Calls]
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               CallSid:
 *                 type: string
 *                 description: ID de la llamada
 *     responses:
 *       200:
 *         description: TwiML para grabar recado
 *         content:
 *           text/xml:
 *             schema:
 *               type: string
 *       500:
 *         description: Error interno del servidor
 */
router.post('/voicemail', controller.handleVoicemail.bind(controller));

/**
 * @swagger
 * /voice/voicemail/saved:
 *   post:
 *     summary: Callback cuando se guarda el recado
 *     tags: [Voice Calls]
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               CallSid:
 *                 type: string
 *                 description: ID de la llamada
 *               RecordingUrl:
 *                 type: string
 *                 description: URL de la grabación
 *               RecordingDuration:
 *                 type: string
 *                 description: Duración de la grabación
 *     responses:
 *       200:
 *         description: Recado guardado exitosamente
 *       500:
 *         description: Error interno del servidor
 */
router.post('/voicemail/saved', controller.handleVoicemailSaved.bind(controller));

/**
 * @swagger
 * /voice/elevenlabs/agent/{agentId}:
 *   get:
 *     summary: Conectar con ElevenLabs Agent
 *     tags: [Voice Calls]
 *     parameters:
 *       - in: path
 *         name: agentId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del agente de ElevenLabs
 *       - in: query
 *         name: callSid
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la llamada
 *     responses:
 *       200:
 *         description: TwiML para conectar con ElevenLabs
 *         content:
 *           text/xml:
 *             schema:
 *               type: string
 *       500:
 *         description: Error interno del servidor
 */
router.get('/elevenlabs/agent/:agentId', controller.handleElevenLabsAgent.bind(controller));

/**
 * @swagger
 * /voice/conference/status:
 *   post:
 *     summary: Monitorear estado de la conference (para control de IA)
 *     tags: [Voice Calls]
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               ConferenceSid:
 *                 type: string
 *                 description: ID de la conference
 *               ConferenceName:
 *                 type: string
 *                 description: Nombre de la conference
 *               StatusCallbackEvent:
 *                 type: string
 *                 description: Evento de la conference
 *               ParticipantSid:
 *                 type: string
 *                 description: ID del participante
 *               ParticipantStatus:
 *                 type: string
 *                 description: Estado del participante
 *     responses:
 *       200:
 *         description: Estado procesado exitosamente
 *       500:
 *         description: Error interno del servidor
 */
router.post('/conference/status', controller.handleConferenceStatus.bind(controller));

/**
 * @swagger
 * /voice/hold-music:
 *   get:
 *     summary: Música de espera personalizada
 *     tags: [Voice Calls]
 *     responses:
 *       200:
 *         description: Audio de música de espera
 *         content:
 *           audio/mpeg:
 *             schema:
 *               type: string
 *               format: binary
 *       500:
 *         description: Error interno del servidor
 */
router.get('/hold-music', controller.serveHoldMusic.bind(controller));

// Ruta para servir archivos de audio de ElevenLabs
router.get('/audio/:filename', (req: Request, res: Response) => {
  try {
    const filename = req.params.filename;
    const audioPath = path.join(__dirname, '../../temp_audio', filename);
    
    if (fs.existsSync(audioPath)) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.sendFile(audioPath);
    } else {
      res.status(404).send('Audio file not found');
    }
  } catch (error) {
    console.error('Error serving audio file:', error);
    res.status(500).send('Error serving audio file');
  }
});

export default router;
