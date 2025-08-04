import { Router } from "express";
import {
  getAccessTokenWithCredentials,
  createCalendarEvent,
  editCalendarEvent,
  deleteCalendarEvent,
  getTokenStatus,
  ensureValidToken
} from "../controllers/googleCalendar.controller";

const router = Router();

// Token management
router.post("/get-access-token", getAccessTokenWithCredentials);
router.get("/token-status", getTokenStatus);
router.post("/ensure-valid-token", ensureValidToken);

// Calendar event management
router.post("/events", createCalendarEvent);
router.put("/events/:eventId", editCalendarEvent);
router.delete("/events/:eventId", deleteCalendarEvent);

export default router;