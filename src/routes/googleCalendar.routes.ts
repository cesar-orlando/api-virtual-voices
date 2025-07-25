import { Router } from "express";
import {
  getAccessTokenWithCredentials
} from "../controllers/googleCalendar.controller";

const router = Router();

router.post("/get-access-token", getAccessTokenWithCredentials);

export default router;