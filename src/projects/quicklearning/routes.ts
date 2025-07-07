import { Router, Request, Response } from "express";
import { QuickLearningFlows } from "./flows";
import { QuickLearningUtils } from "./utils";
import { detectCompanyFromToken, requireCompanyContext, requireFeature } from "../../core/auth/companyMiddleware";
import { getCurrentCompanyContext } from "../../core/auth/companyMiddleware";

const router = Router();

// Middleware para detectar empresa automáticamente
router.use(detectCompanyFromToken);

// Middleware para requerir contexto de empresa
router.use(requireCompanyContext);

/**
 * @swagger
 * tags:
 *   name: Quick Learning Project
 *   description: Endpoints generales de lógica de negocio para Quick Learning
 */

/**
 * @swagger
 * /api/projects/quicklearning/flows/prospectos:
 *   post:
 *     summary: Ejecutar flujo de prospectos (IA, lógica de negocio)
 *     tags: [Quick Learning Project]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: Mensaje del usuario
 *               chatHistory:
 *                 type: array
 *                 items:
 *                   type: object
 *                 description: Historial de chat previo
 *     responses:
 *       200:
 *         description: Respuesta generada por el flujo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 response:
 *                   type: string
 *                 companySlug:
 *                   type: string
 */
// Ruta para obtener flujo de prospectos
router.post("/flows/prospectos", requireFeature('customFlows'), async (req: Request, res: Response): Promise<void> => {
  try {
    const companyContext = getCurrentCompanyContext(req);
    if (!companyContext) {
      res.status(401).json({ message: "Contexto de empresa requerido" });
      return;
    }

    const { message, chatHistory } = req.body;
    
    if (!message) {
      res.status(400).json({ message: "Mensaje requerido" });
      return;
    }

    const flows = new QuickLearningFlows(companyContext.slug);
    const response = await flows.getProspectoFlow(message, chatHistory || []);

    res.json({
      success: true,
      response,
      companySlug: companyContext.slug
    });
  } catch (error) {
    console.error('Error en flujo de prospectos:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

/**
 * @swagger
 * /api/projects/quicklearning/auto-assignment:
 *   post:
 *     summary: Asignar prospecto automáticamente al mejor asesor disponible
 *     tags: [Quick Learning Project]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prospectType
 *               - phoneNumber
 *             properties:
 *               prospectType:
 *                 type: string
 *                 description: Tipo de prospecto
 *               phoneNumber:
 *                 type: string
 *                 description: Número de teléfono del prospecto
 *     responses:
 *       200:
 *         description: Asignación realizada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 assignment:
 *                   type: object
 *                 companySlug:
 *                   type: string
 */
// Ruta para asignación automática de prospectos
router.post("/auto-assignment", requireFeature('autoAssignment'), async (req: Request, res: Response): Promise<void> => {
  try {
    const companyContext = getCurrentCompanyContext(req);
    if (!companyContext) {
      res.status(401).json({ message: "Contexto de empresa requerido" });
      return;
    }

    const { prospectType, phoneNumber } = req.body;
    
    if (!prospectType || !phoneNumber) {
      res.status(400).json({ message: "Tipo de prospecto y número de teléfono requeridos" });
      return;
    }

    const utils = new QuickLearningUtils(companyContext.slug);
    const assignment = await utils.assignProspectToBestAdvisor(prospectType, phoneNumber);

    if (!assignment) {
      res.status(400).json({ message: "No se pudo realizar la asignación automática" });
      return;
    }

    res.json({
      success: true,
      assignment,
      companySlug: companyContext.slug
    });
  } catch (error) {
    console.error('Error en asignación automática:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

/**
 * @swagger
 * /api/projects/quicklearning/move-prospect:
 *   post:
 *     summary: Mover prospecto a una tabla específica
 *     tags: [Quick Learning Project]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - destinationTable
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 description: Número de teléfono del prospecto
 *               destinationTable:
 *                 type: string
 *                 description: Slug de la tabla de destino
 *     responses:
 *       200:
 *         description: Prospecto movido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 companySlug:
 *                   type: string
 */
// Ruta para mover prospecto a tabla específica
router.post("/move-prospect", requireFeature('autoAssignment'), async (req: Request, res: Response): Promise<void> => {
  try {
    const companyContext = getCurrentCompanyContext(req);
    if (!companyContext) {
      res.status(401).json({ message: "Contexto de empresa requerido" });
      return;
    }

    const { phoneNumber, destinationTable } = req.body;
    
    if (!phoneNumber || !destinationTable) {
      res.status(400).json({ message: "Número de teléfono y tabla de destino requeridos" });
      return;
    }

    const utils = new QuickLearningUtils(companyContext.slug);
    const success = await utils.moveProspectToTable(phoneNumber, destinationTable);

    if (!success) {
      res.status(400).json({ message: "No se pudo mover el prospecto" });
      return;
    }

    res.json({
      success: true,
      message: `Prospecto movido a ${destinationTable}`,
      companySlug: companyContext.slug
    });
  } catch (error) {
    console.error('Error moviendo prospecto:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

/**
 * @swagger
 * /api/projects/quicklearning/reports/prospectos:
 *   get:
 *     summary: Generar reporte de prospectos
 *     tags: [Quick Learning Project]
 *     responses:
 *       200:
 *         description: Reporte generado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 report:
 *                   type: object
 *                 companySlug:
 *                   type: string
 */
// Ruta para generar reporte de prospectos
router.get("/reports/prospectos", requireFeature('autoAssignment'), async (req: Request, res: Response): Promise<void> => {
  try {
    const companyContext = getCurrentCompanyContext(req);
    if (!companyContext) {
      res.status(401).json({ message: "Contexto de empresa requerido" });
      return;
    }

    const utils = new QuickLearningUtils(companyContext.slug);
    const report = await utils.generateProspectsReport();

    if (!report) {
      res.status(400).json({ message: "No se pudo generar el reporte" });
      return;
    }

    res.json({
      success: true,
      report,
      companySlug: companyContext.slug
    });
  } catch (error) {
    console.error('Error generando reporte:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

/**
 * @swagger
 * /api/projects/quicklearning/validate-phone:
 *   post:
 *     summary: Validar número de teléfono
 *     tags: [Quick Learning Project]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 description: Número de teléfono a validar
 *     responses:
 *       200:
 *         description: Resultado de la validación
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 isValid:
 *                   type: boolean
 *                 formatted:
 *                   type: string
 *                 original:
 *                   type: string
 *                 companySlug:
 *                   type: string
 */
// Ruta para validar número de teléfono
router.post("/validate-phone", async (req: Request, res: Response): Promise<void> => {
  try {
    const companyContext = getCurrentCompanyContext(req);
    if (!companyContext) {
      res.status(401).json({ message: "Contexto de empresa requerido" });
      return;
    }

    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      res.status(400).json({ message: "Número de teléfono requerido" });
      return;
    }

    const utils = new QuickLearningUtils(companyContext.slug);
    const isValid = utils.validatePhoneNumber(phoneNumber);
    const formatted = utils.formatPhoneNumber(phoneNumber);

    res.json({
      success: true,
      isValid,
      formatted,
      original: phoneNumber,
      companySlug: companyContext.slug
    });
  } catch (error) {
    console.error('Error validando teléfono:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

/**
 * @swagger
 * /api/projects/quicklearning/business-hours:
 *   get:
 *     summary: Obtener horarios de atención
 *     tags: [Quick Learning Project]
 *     responses:
 *       200:
 *         description: Horarios de atención y estado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 businessHours:
 *                   type: object
 *                 isOpen:
 *                   type: boolean
 *                 companySlug:
 *                   type: string
 */
// Ruta para verificar horarios de atención
router.get("/business-hours", async (req: Request, res: Response): Promise<void> => {
  try {
    const companyContext = getCurrentCompanyContext(req);
    if (!companyContext) {
      res.status(401).json({ message: "Contexto de empresa requerido" });
      return;
    }

    const utils = new QuickLearningUtils(companyContext.slug);
    const hours = utils.getBusinessHours();
    const isOpen = utils.isBusinessHours();

    res.json({
      success: true,
      businessHours: hours,
      isOpen,
      companySlug: companyContext.slug
    });
  } catch (error) {
    console.error('Error obteniendo horarios:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

/**
 * @swagger
 * /api/projects/quicklearning/config:
 *   get:
 *     summary: Obtener configuración específica de Quick Learning
 *     tags: [Quick Learning Project]
 *     responses:
 *       200:
 *         description: Configuración de la empresa
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 config:
 *                   type: object
 *                 companySlug:
 *                   type: string
 */
// Ruta para obtener configuración específica de Quick Learning
router.get("/config", async (req: Request, res: Response): Promise<void> => {
  try {
    const companyContext = getCurrentCompanyContext(req);
    if (!companyContext) {
      res.status(401).json({ message: "Contexto de empresa requerido" });
      return;
    }

    res.json({
      success: true,
      config: companyContext.config,
      companySlug: companyContext.slug
    });
  } catch (error) {
    console.error('Error obteniendo configuración:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

export default router; 