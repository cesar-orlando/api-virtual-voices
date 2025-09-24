import { Router } from "express";
import { 
  sendEmail,
  getEmailHistory,
  testSmtpConfig,
  sendStructuredEmail, // <--- importar nuevo endpoint
  sendEmailWithUserConfig, // <--- nueva función auxiliar
  downloadEmailAttachment, // <--- nuevo endpoint de descarga
  debugAttachment, // <--- endpoint de debug
  simpleImageServe, // <--- nuevo endpoint simple para imágenes
  checkFileHealth, // <--- nuevo endpoint para verificar salud de archivos
  // IMAP Email Reading endpoints
  // startEmailMonitoring,
  // stopEmailMonitoring,
  // getEmailMonitoringStatus,
  getEnhancedEmailHistory, // <--- HABILITADO: endpoint mejorado de historial
  // syncHistoricalEmails,
  fullEmailSync, // <--- NUEVO endpoint para sincronización completa
  // syncMissedEmails, // <--- NUEVO endpoint para emails perdidos
  // getEmailStats,
  // Auto-monitoring endpoints
  // enableAutoMonitoring,
  // disableAutoMonitoring,
  // getAutoMonitoringStatus,
  // reinitializeAutoMonitoring,
  // discoverEmailUsers, // <--- NUEVO endpoint
  // stopUserEmailMonitoring, // <--- NUEVO endpoint para logout
  // getUserEmailMonitoringStatus // <--- NUEVO endpoint para estado
} from "../controllers/email.controller";
import { uploadPST, getPSTStatus, processLocalPST, listLocalPST, updateEmailBodies, testHtmlToText, reprocessPSTWithImprovedConversion } from "../controllers/email.import.controller";
import { pstUpload } from "../middlewares/pstUpload.middleware";
import { detectCompanyFromToken } from "../core/auth/companyMiddleware";

const router = Router();

// Endpoint principal para enviar emails (con autenticación para usar configuración del usuario)
router.post("/send/:c_name", detectCompanyFromToken, sendEmail);

// Endpoint para enviar correo estructurado con OpenAI (con autenticación)
router.post("/send-structured/:c_name", detectCompanyFromToken, sendStructuredEmail);

// ===============================
// EMAIL READING (IMAP) ENDPOINTS
// ===============================

// Iniciar monitoreo de emails entrantes (con opción de auto-start)
// router.post("/monitoring/start", startEmailMonitoring);

// Detener monitoreo de emails entrantes (con opción de remover auto-start)
// router.post("/monitoring/stop", stopEmailMonitoring);

// Obtener estado del monitoreo
// router.get("/monitoring/status", getEmailMonitoringStatus);

// ===============================
// AUTO-MONITORING MANAGEMENT
// ===============================

// Habilitar monitoreo automático (se inicia al arrancar servidor)
// router.post("/auto-monitoring/enable", enableAutoMonitoring);

// Deshabilitar monitoreo automático
// router.post("/auto-monitoring/disable", disableAutoMonitoring);

// Estado del servicio auto-monitoring
// router.get("/auto-monitoring/status", getAutoMonitoringStatus);

// Reinicializar servicio auto-monitoring
// router.post("/auto-monitoring/reinitialize", reinitializeAutoMonitoring);

// Descubrir usuarios con configuración de email
// router.post("/auto-monitoring/discover-users", discoverEmailUsers);

// Detener monitoreo para un usuario específico
// router.post("/auto-monitoring/stop-user", stopUserEmailMonitoring);

// Verificar estado del monitoreo para un usuario específico
// router.get("/auto-monitoring/user-status/:userId", getUserEmailMonitoringStatus);
// router.get("/auto-monitoring/user-status/:c_name/:userId", getUserEmailMonitoringStatus);

// ===============================
// EMAIL HISTORY & ANALYSIS
// ===============================

// Obtener historial mejorado con filtros (por companySlug en parámetros)
router.get("/history-enhanced/:c_name", getEnhancedEmailHistory);

// Obtener historial mejorado con filtros (por headers - compatibilidad)
router.get("/history-enhanced", getEnhancedEmailHistory);

// Sincronizar emails históricos
// router.post("/sync-historical", syncHistoricalEmails);
// router.post("/sync-historical/:c_name", syncHistoricalEmails);

// Sincronización completa de cuenta de email (retroactiva)
router.post("/full-sync", fullEmailSync);
router.post("/full-sync/:c_name", fullEmailSync);

// Sincronizar emails perdidos (últimos días)
// router.post("/sync-missed", syncMissedEmails);
// router.post("/sync-missed/:c_name", syncMissedEmails);

// Obtener estadísticas de emails
// router.get("/stats", getEmailStats);

// ===============================
// EMAIL HISTORY & ATTACHMENTS
// ===============================

// Obtener historial de emails (con autenticación) - mantener para compatibilidad
router.get("/history/:c_name", detectCompanyFromToken, getEmailHistory);

// Descargar archivo adjunto de email (con autenticación)
router.get("/download/:c_name/:filename", detectCompanyFromToken, downloadEmailAttachment);

// Endpoint temporal de prueba sin autenticación
router.get("/test-download/:c_name/:filename", downloadEmailAttachment);

// Endpoint de debug sin autenticación
router.get("/debug/:c_name/:filename", debugAttachment);

// Endpoint simple para servir imágenes sin headers complejos
router.get("/simple/:c_name/:filename", simpleImageServe);

// Endpoint para verificar salud de archivos guardados
router.get("/health/:c_name/:filename", checkFileHealth);

// Probar configuración SMTP (sin autenticación necesaria)
router.post("/test-smtp", testSmtpConfig);

// ===============================
// PST IMPORT ENDPOINTS
// ===============================

// Subir archivo PST (frontend)
router.post("/pst/upload/:c_name", pstUpload.single('pstFile'), uploadPST);

// Ver estado de importación PST
router.get("/pst/status/:c_name", getPSTStatus);

// Procesar archivo PST local (archivos grandes ya en servidor)
router.post("/pst/process-local/:c_name", processLocalPST);

// Actualizar cuerpos de emails existentes desde PST
router.post("/pst/update-bodies/:companySlug", updateEmailBodies);

// Test endpoint para probar conversión HTML a texto
router.post("/pst/test-html-to-text", testHtmlToText);

// Re-procesar PST con conversión mejorada
router.post("/pst/reprocess-improved/:companySlug", reprocessPSTWithImprovedConversion);

// Listar archivos PST disponibles localmente
router.get("/pst/list-local", listLocalPST);

export default router;