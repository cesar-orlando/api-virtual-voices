import { Router } from "express";
import { 
  sendEmail,
  getEmailHistory
} from "../controllers/email.controller";

const router = Router();

// Endpoint principal para enviar emails
router.post("/send/:c_name", sendEmail);

// Obtener historial de emails
router.get("/history/:c_name", getEmailHistory);

export default router;