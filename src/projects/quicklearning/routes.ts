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