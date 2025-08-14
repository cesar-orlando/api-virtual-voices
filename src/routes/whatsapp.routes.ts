import { Router } from "express";
import multer from "multer";
import {
  getAllWhatsappMessages,
  getWhatsappUsers,
  getWhatsappUserByPhone,
  MessageToAll,
  sendWhatsappMessage,
  getChatMessages,
  enviarFichaTecnica,
  assignChatToAdvisor,
  getAvailableAdvisors,
  getFilteredChats,
  getChatAssignments
} from "../controllers/whatsapp.controller";

const router = Router();
// In-memory upload handler just for this route (10MB max)
const uploadMem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get("/messages/:c_name/:sessionId/:phone", getChatMessages);
router.get("/messages/:c_name", getAllWhatsappMessages);
router.get("/usuarios/:c_name/:user_id", getWhatsappUsers);
router.get("/usuarios/:c_name/:phone", getWhatsappUserByPhone);
router.post("/session/:c_name/:sessionId", uploadMem.single('attachment'), sendWhatsappMessage);
router.post("/messageAll/:c_name/:sessionId", MessageToAll);
router.post('/enviar-ficha-tecnica', enviarFichaTecnica);
router.put("/assign-chat/:c_name", assignChatToAdvisor);
router.get("/advisors/:c_name", getAvailableAdvisors);
router.get("/chats-filtered/:c_name", getFilteredChats);
router.get("/chat-assignments/:c_name", getChatAssignments);

export default router;