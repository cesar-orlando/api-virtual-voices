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
  checkFileHealth // <--- nuevo endpoint para verificar salud de archivos
} from "../controllers/email.controller";
import { detectCompanyFromToken } from "../core/auth/companyMiddleware";

const router = Router();

// Endpoint principal para enviar emails (con autenticación para usar configuración del usuario)
router.post("/send/:c_name", detectCompanyFromToken, sendEmail);

// Endpoint para enviar correo estructurado con OpenAI (con autenticación)
router.post("/send-structured/:c_name", detectCompanyFromToken, sendStructuredEmail);

// Obtener historial de emails (con autenticación)
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

export default router;