import { Router } from "express";
import {
  getAllWhatsappMessages,
  getWhatsappUsers,
  getWhatsappUserByPhone,
  createWhatsappSession,
  getAllWhatsappSessions,
  updateWhatsappSession,
  deleteWhatsappSession,
  MessageToAll,
  sendWhatsappMessage,
  getChatMessages,
} from "../controllers/whatsapp.controller";

import { enviarFichaTecnica } from '../services/whatsapp/handlers';

const router = Router();

router.get("/messages/:c_name/:phone", getChatMessages);
router.get("/messages/:c_name", getAllWhatsappMessages);
router.get("/usuarios/:c_name", getWhatsappUsers);
router.get("/usuarios/:c_name/:phone", getWhatsappUserByPhone);
router.get("/session/:c_name/:user_id", getAllWhatsappSessions);
router.post("/session", createWhatsappSession);
router.put("/session/:c_name", updateWhatsappSession);
router.post("/session/:c_name/:sessionId", sendWhatsappMessage);
router.delete("/session/:c_name/:sessionId", deleteWhatsappSession);
router.post("/messageAll/:c_name/:sessionId", MessageToAll);
router.post('/enviar-ficha-tecnica', enviarFichaTecnica);

export default router;