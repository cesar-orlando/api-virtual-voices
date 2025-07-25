import { Router } from "express";
import {
  getAccessTokenWithCredentials
} from "../controllers/googleCalendar.controller";

const router = Router();

/**
 * @swagger
 * /api/google-calendar/get-access-token:
 *   post:
 *     summary: Get fresh access token using client credentials
 *     description: Uses client ID and secret from environment to get a fresh access token
 *     tags: [Google Calendar]
 *     responses:
 *       200:
 *         description: Successfully obtained access token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Successfully obtained new access token"
 *                 data:
 *                   type: object
 *                   properties:
 *                     access_token:
 *                       type: string
 *                       description: The fresh access token
 *                     token_type:
 *                       type: string
 *                       example: "Bearer"
 *                     expires_in:
 *                       type: number
 *                       example: 3600
 *                     expiry_date:
 *                       type: string
 *                       format: date-time
 *                     scope:
 *                       type: string
 *                       example: "https://www.googleapis.com/auth/calendar"
 *       400:
 *         description: Missing required credentials
 *       500:
 *         description: Internal server error
 */
router.post("/get-access-token", getAccessTokenWithCredentials);

export default router;
