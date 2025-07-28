import { Router } from "express";
import {
  getChatMetrics,
  getRealTimeChatMetrics,
  getAvailableChatSources,
  getSampleChatData,
  debugChatStructure
} from "../controllers/chatMetrics.controller";

const router = Router();

// Main metrics endpoints
router.get("/:c_name/metrics", getChatMetrics);
router.get("/:c_name/real-time", getRealTimeChatMetrics);

// Debug endpoints
router.get("/:c_name/debug/sources", getAvailableChatSources);
router.get("/:c_name/debug/sample", getSampleChatData);
router.get("/:c_name/debug/structure", debugChatStructure);

export default router;