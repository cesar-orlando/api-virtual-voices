import { Router } from 'express';
import {
  runReactivationCheck,
  getBotReactivationStatus,
  reactivateBot,
  updateReactivationSettings
} from '../controllers/botReactivation.controller';

const router = Router();

// Check and run reactivation for a company
router.get('/check/:c_name', runReactivationCheck);

// Get status for specific prospect by phone number
router.get('/status/:c_name/:phoneNumber', getBotReactivationStatus);

// Manually reactivate bot for a specific prospect record
router.post('/reactivate/:c_name/:recordId', reactivateBot);

// Update auto-reactivation settings for a specific prospect record
router.put('/settings/:c_name/:recordId', updateReactivationSettings);

export default router;
