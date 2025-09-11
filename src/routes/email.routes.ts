import { Router } from "express";
import { 
  sendEmail,
  getEmailHistory,
  testSmtpConfig,
  sendStructuredEmail, // <--- importar nuevo endpoint
  sendEmailWithUserConfig // <--- nueva función auxiliar
} from "../controllers/email.controller";
import { detectCompanyFromToken } from "../core/auth/companyMiddleware";

const router = Router();

// Endpoint principal para enviar emails (con autenticación para usar configuración del usuario)
router.post("/send/:c_name", detectCompanyFromToken, sendEmail);

// Endpoint para enviar correo estructurado con OpenAI (con autenticación)
router.post("/send-structured/:c_name", detectCompanyFromToken, sendStructuredEmail);

// Obtener historial de emails (con autenticación)
router.get("/history/:c_name", detectCompanyFromToken, getEmailHistory);

// Probar configuración SMTP (sin autenticación necesaria)
router.post("/test-smtp", testSmtpConfig);

export default router;