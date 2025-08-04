import { Router } from "express";
import {
  processCalendarRequest,
  getAssistantInfo,
  initializeAssistant
} from "../controllers/calendarAssistant.controller";

const router = Router();

// Process natural language calendar requests
router.post("/process", processCalendarRequest);

// Get assistant information and capabilities
router.get("/info/:company", getAssistantInfo);
router.get("/info", getAssistantInfo);

// Manually initialize assistant for a company
router.post("/initialize", initializeAssistant);

export default router;
