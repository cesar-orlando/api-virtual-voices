import { Router } from "express";
import {
  getAllWhatsappMessages,
  createWhatsappSession,
  getAllWhatsappSessions,
  updateWhatsappSession,
} from "../controllers/whatsapp.controller";

const router = Router();

router.get("/messages/:c_name", getAllWhatsappMessages);
router.get("/session/:c_name/:user_id", getAllWhatsappSessions);
router.post("/session", createWhatsappSession);
router.put("/session/:c_name", updateWhatsappSession);

export default router;