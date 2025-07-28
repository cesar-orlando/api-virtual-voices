import { Router } from 'express';
import { TwilioWebhookController } from '../../controllers/quicklearning/twilioWebhookController';

const router = Router();
const controller = new TwilioWebhookController();

/**
 * @route POST /api/webhook/twilio
 * @desc Twilio WhatsApp webhook endpoint
 * @access Public
 */
router.post('/twilio', controller.handleWebhook.bind(controller));

/**
 * @route GET /api/webhook/health
 * @desc Health check for webhook service
 * @access Public
 */
router.get('/health', controller.healthCheck.bind(controller));

export default router; 