import { Router } from 'express';
import { TwilioTestController } from '../../controllers/quicklearning/twilioTestController';

const router = Router();
const controller = new TwilioTestController();

// Test the new BaseAgent system
router.post('/agent', controller.testAgentSystem.bind(controller));

// Test multiple messages
router.post('/multiple', controller.testMultipleMessages.bind(controller));

// Health check
router.get('/health', controller.healthCheck.bind(controller));

export default router; 