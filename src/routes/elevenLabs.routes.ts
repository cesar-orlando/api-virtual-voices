import { Router } from "express";
import {
  createElevenLabsAgent,
  getElevenLabsAgents,
  getElevenLabsAgent,
  updateElevenLabsAgent,
  deleteElevenLabsAgent,
  getElevenLabsConversations,
  getElevenLabsConversation,
  getElevenLabsConversationAudio,
  generatePersonalizedPrompt
} from "../controllers/elevenLabs.controller";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: ElevenLabs Agents
 *   description: API para gestionar agents de ElevenLabs
 */

/**
 * @swagger
 * /elevenlabs/agents:
 *   post:
 *     summary: Create a new ElevenLabs Agent
 *     parameters:
 *       - in: query
 *         name: companySlug
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               prompt:
 *                 type: string
 *     responses:
 *       201:
 *         description: Agent created
 */
router.post('/agents', createElevenLabsAgent);
router.get('/agents', getElevenLabsAgents);
router.get('/agents/:id', getElevenLabsAgent);
router.put('/agents/:id', updateElevenLabsAgent);
router.delete('/agents/:id', deleteElevenLabsAgent);

/**
 * @swagger
 * /elevenlabs/conversations:
 *   get:
 *     summary: Obtener historial de conversaciones
 *     tags: [ElevenLabs Agents]
 *     parameters:
 *       - in: query
 *         name: agentId
 *         schema:
 *           type: string
 *         description: Filtrar por agent
 *       - in: query
 *         name: customerPhone
 *         schema:
 *           type: string
 *         description: Filtrar por teléfono del cliente
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, completed, failed]
 *         description: Filtrar por estado
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Límite de resultados por página
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Días para las estadísticas
 *     responses:
 *       200:
 *         description: Historial de conversaciones obtenido exitosamente
 *       404:
 *         description: Empresa no encontrada
 *       500:
 *         description: Error interno del servidor
 */
router.get('/conversations/:agentId', getElevenLabsConversations);
router.get('/conversations/details/:conversationId', getElevenLabsConversation);
router.get('/conversations/audio/:conversationId', getElevenLabsConversationAudio);

export default router;
