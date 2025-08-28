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

const router = Router();

// Token management
router.post("/get-access-token", getAccessTokenWithCredentials);
router.get("/token-status", getTokenStatus);
router.post("/ensure-valid-token", ensureValidToken);

// Calendar event management
router.post("/events", createCalendarEvent);
router.put("/events/:eventId", editCalendarEvent);
router.delete("/events/:eventId", deleteCalendarEvent);

// Google Search
router.get("/search", googleSearch);

export default router;