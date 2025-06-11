import { Router } from "express";
import {
  getAllWhatsappMessages,
  createWhatsappSession,
  getAllWhatsappSessions,
} from "../controllers/whatsapp.controller";

const router = Router();

router.get("/messages/:c_name", getAllWhatsappMessages);
router.get("/session/:c_name", getAllWhatsappSessions);
router.post("/session", createWhatsappSession);

export default router;