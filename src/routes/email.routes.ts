import { Router } from "express";
import { 
  sendEmail,
  getEmailHistory,
  testSmtpConfig,
  sendStructuredEmail // <--- importar nuevo endpoint
} from "../controllers/email.controller";

const router = Router();

// Endpoint principal para enviar emails
router.post("/send/:c_name", sendEmail);

// Endpoint para enviar correo estructurado con OpenAI
router.post("/send-structured/:c_name", sendStructuredEmail);

// Obtener historial de emails
router.get("/history/:c_name", getEmailHistory);

// Probar configuración SMTP
router.post("/test-smtp", testSmtpConfig);

export default router;