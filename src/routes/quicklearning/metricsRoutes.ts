import { Router } from "express";
import { 
  getQuickLearningMetrics, 
  getQuickLearningDashboard,
  checkQuickLearningChatsRecordsConsistency
} from "../../controllers/quicklearning/metricsController";

const router = Router();

/**
 * @swagger
 * /api/quicklearning/metrics:
 *   get:
 *     tags:
 *       - QuickLearning Metrics
 *     summary: Obtener métricas completas de QuickLearning
 *     description: Retorna métricas detalladas incluyendo total de chats, mensajes, distribución por horas, etc.
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha de inicio (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha de fin (YYYY-MM-DD)
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [24hours, 7days, 30days]
 *           default: 7days
 *         description: Período predefinido (si no se especifican fechas)
 *       - in: query
 *         name: includeInactive
 *         schema:
 *           type: string
 *           enum: [true, false]
 *           default: false
 *         description: Incluir chats inactivos
 *     responses:
 *       200:
 *         description: Métricas obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalChats:
 *                       type: number
 *                       description: Total de chats
 *                     totalMessages:
 *                       type: number
 *                       description: Total de mensajes
 *                     totalInboundMessages:
 *                       type: number
 *                       description: Total de mensajes entrantes
 *                     totalOutboundMessages:
 *                       type: number
 *                       description: Total de mensajes salientes
 *                     averageMessagesPerChat:
 *                       type: number
 *                       description: Promedio de mensajes por chat
 *                     activeChats:
 *                       type: number
 *                       description: Chats activos
 *                     botResponses:
 *                       type: number
 *                       description: Respuestas del bot
 *                     humanResponses:
 *                       type: number
 *                       description: Respuestas humanas
 *                     dailyBreakdown:
 *                       type: array
 *                       description: Desglose diario
 *                     stageDistribution:
 *                       type: object
 *                       description: Distribución por etapas
 *       500:
 *         description: Error interno del servidor
 */
router.get('/metrics', getQuickLearningMetrics);

/**
 * @swagger
 * /api/quicklearning/dashboard:
 *   get:
 *     tags:
 *       - QuickLearning Metrics
 *     summary: Obtener métricas resumidas para dashboard
 *     description: Retorna métricas básicas optimizadas para dashboard
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [24hours, 7days, 30days]
 *           default: 24hours
 *         description: Período para el dashboard
 *     responses:
 *       200:
 *         description: Dashboard generado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalChats:
 *                       type: number
 *                     activeChats:
 *                       type: number
 *                     totalMessages:
 *                       type: number
 *                     inboundMessages:
 *                       type: number
 *                     outboundMessages:
 *                       type: number
 *                     averageMessagesPerChat:
 *                       type: number
 *                     period:
 *                       type: string
 *                     periodLabel:
 *                       type: string
 *       500:
 *         description: Error interno del servidor
 */
router.get('/dashboard', getQuickLearningDashboard);

/**
 * Verificación de consistencia chats vs dynamicrecords
 * GET /api/quicklearning/consistency
 * Query: startDate, endDate, period, includeInactive, tableSlugs
 */
router.get('/consistency', checkQuickLearningChatsRecordsConsistency);

export default router;