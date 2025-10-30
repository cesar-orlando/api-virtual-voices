import { Router } from "express";
import multer from "multer";
import {
  getAllWhatsappMessages,
  getWhatsappUsers,
  getWhatsappUserByPhone,
  MessageToAll,
  sendWhatsappMessage,
  sendWhatsappSimple,
  getChatMessages,
  enviarFichaTecnica,
  assignChatToAdvisor,
  getAvailableAdvisors,
  getFilteredChats,
  getChatAssignments,
  getAssignmentStats,
  resetAssignmentCounter,
  getChatsList,
  getChatMessagesOptimized,
  searchChatsAndRecords
} from "../controllers/whatsapp.controller";

const router = Router();
// In-memory upload handler just for this route (10MB max)
const uploadMem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get("/messages/:c_name/:sessionId/:phone", getChatMessages);
router.get("/messages/:c_name", getAllWhatsappMessages);
router.get("/usuarios/:c_name/:user_id", getWhatsappUsers);
router.get("/usuarios/:c_name/:phone", getWhatsappUserByPhone);
router.post("/session/:c_name/:sessionId", uploadMem.single('attachment'), sendWhatsappMessage);
// Simple endpoint: body carries c_name, sessionId, phone, message; includes retries
router.post("/send", sendWhatsappSimple);
router.post("/messageAll/:c_name/:sessionId", MessageToAll);
router.post('/enviar-ficha-tecnica', enviarFichaTecnica);
router.put("/assign-chat/:c_name", assignChatToAdvisor);
router.get("/advisors/:c_name", getAvailableAdvisors);
router.get("/chats-filtered/:c_name", getFilteredChats);
router.get("/chat-assignments/:c_name", getChatAssignments);
router.get("/assignment-stats/:c_name/:sessionId", getAssignmentStats);
router.post("/reset-counter/:c_name/:sessionId", resetAssignmentCounter);

// ===========================================
// ARQUITECTURA WHATSAPP-LIKE - RUTAS OPTIMIZADAS
// ===========================================

// ENDPOINT 1: Lista de chats (WhatsApp-like) - Solo último mensaje, nombre, hora
router.get("/chats/list/:c_name", getChatsList);

// ENDPOINT 2: Mensajes de UN solo chat (WhatsApp-like)
router.get("/chats/:c_name/:phone/messages", getChatMessagesOptimized);

// ENDPOINT 3: Búsqueda global (WhatsApp-like)
router.get("/search/:c_name", searchChatsAndRecords);

export default router;