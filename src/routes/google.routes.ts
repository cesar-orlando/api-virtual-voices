import { Router } from "express";
import {
  getAccessTokenWithCredentials,
  createCalendarEvent,
  editCalendarEvent,
  deleteCalendarEvent,
  getTokenStatus,
  ensureValidToken
} from "../controllers/googleCalendar.controller";
import { googleSearch } from "../services/google/googleSearch";
import { scrapeHandler } from "../services/internal/webScraping.service";

const router = Router();

// Token management
router.post("/calendar/get-access-token", getAccessTokenWithCredentials);
router.get("/calendar/token-status", getTokenStatus);
router.post("/calendar/ensure-valid-token", ensureValidToken);

// Calendar event management
router.post("/calendar/events", createCalendarEvent);
router.put("/calendar/events/:eventId", editCalendarEvent);
router.delete("/calendar/events/:eventId", deleteCalendarEvent);

// Google Search
router.get("/search", scrapeHandler);
router.get("/recommend", googleSearch);

export default router;