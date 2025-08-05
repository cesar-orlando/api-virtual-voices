import { Router } from "express";
import {
  getAllWhatsappMessages,
  getWhatsappUsers,
  getWhatsappUserByPhone,
  MessageToAll,
  sendWhatsappMessage,
  getChatMessages,
  enviarFichaTecnica,
  updateChatRecord,
  assignChatToAdvisor,
  getAvailableAdvisors,
  getFilteredChats,
  getChatAssignments
} from "../controllers/whatsapp.controller";

const router = Router();

router.get("/messages/:c_name/:sessionId/:phone", getChatMessages);
router.get("/messages/:c_name", getAllWhatsappMessages);
router.get("/usuarios/:c_name/:user_id", getWhatsappUsers);
router.get("/usuarios/:c_name/:phone", getWhatsappUserByPhone);
router.post("/session/:c_name/:sessionId", sendWhatsappMessage);
router.post("/messageAll/:c_name/:sessionId", MessageToAll);
router.post('/enviar-ficha-tecnica', enviarFichaTecnica);
router.put("/change-user/:c_name", updateChatRecord)
router.put("/assign-chat/:c_name", assignChatToAdvisor);
router.get("/advisors/:c_name", getAvailableAdvisors);
router.get("/chats-filtered/:c_name", getFilteredChats);
router.get("/chat-assignments/:c_name", getChatAssignments);

export default router;