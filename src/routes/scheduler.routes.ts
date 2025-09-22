import { Router } from 'express';
import {
  scheduleFollowUp,
  scheduleWithTemplate,
  getScheduledMessages,
  cancelScheduledMessages,
  getSchedulerStats
} from '../controllers/scheduler.controller';

const router = Router();

/**
 * @swagger
 * /api/scheduler/{company}/schedule:
 *   post:
 *     summary: Schedule a follow-up message manually
 *     tags: [Scheduler]
 *     parameters:
 *       - in: path
 *         name: company
 *         schema:
 *           type: string
 *         required: true
 *         description: Company slug
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - messageType
 *             properties:
 *               phone:
 *                 type: string
 *                 description: WhatsApp phone number
 *               messageType:
 *                 type: string
 *                 enum: [follow_up, reminder, nurture, offer]
 *                 description: Type of message to schedule
 *               delayHours:
 *                 type: number
 *                 description: Delay in hours (alternative to delayDays)
 *               delayDays:
 *                 type: number
 *                 description: Delay in days (alternative to delayHours)
 *               triggerEvent:
 *                 type: string
 *                 description: Event that triggered this scheduling
 *               messageTemplate:
 *                 type: string
 *                 description: Message template to use
 *               customData:
 *                 type: object
 *                 description: Additional custom data
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high]
 *                 default: medium
 *                 description: Message priority
 *     responses:
 *       200:
 *         description: Message scheduled successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Chat not found
 *       500:
 *         description: Internal server error
 */
router.post('/:company/schedule', scheduleFollowUp);

/**
 * @swagger
 * /api/scheduler/{company}/schedule-template:
 *   post:
 *     summary: Schedule a message using a predefined template
 *     tags: [Scheduler]
 *     parameters:
 *       - in: path
 *         name: company
 *         schema:
 *           type: string
 *         required: true
 *         description: Company slug
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - templateName
 *             properties:
 *               phone:
 *                 type: string
 *                 description: WhatsApp phone number
 *               templateName:
 *                 type: string
 *                 enum: [follow_up_interested, reminder_appointment, nurture_general, offer_special]
 *                 description: Template name to use
 *               delayHours:
 *                 type: number
 *                 description: Delay in hours (alternative to delayDays)
 *               delayDays:
 *                 type: number
 *                 description: Delay in days (alternative to delayHours)
 *               variables:
 *                 type: object
 *                 description: Variables to replace in template
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high]
 *                 default: medium
 *                 description: Message priority
 *     responses:
 *       200:
 *         description: Template message scheduled successfully
 *       400:
 *         description: Bad request or template not found
 *       404:
 *         description: Chat not found
 *       500:
 *         description: Internal server error
 */
router.post('/:company/schedule-template', scheduleWithTemplate);

/**
 * @swagger
 * /api/scheduler/{company}/scheduled:
 *   get:
 *     summary: Get scheduled messages for a company or specific phone
 *     tags: [Scheduler]
 *     parameters:
 *       - in: path
 *         name: company
 *         schema:
 *           type: string
 *         required: true
 *         description: Company slug
 *       - in: query
 *         name: phone
 *         schema:
 *           type: string
 *         description: Filter by phone number
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, sent, failed, cancelled]
 *         description: Filter by message status
 *       - in: query
 *         name: messageType
 *         schema:
 *           type: string
 *           enum: [follow_up, reminder, nurture, offer]
 *         description: Filter by message type
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           default: 50
 *         description: Number of messages per page
 *       - in: query
 *         name: page
 *         schema:
 *           type: number
 *           default: 1
 *         description: Page number
 *     responses:
 *       200:
 *         description: List of scheduled messages
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.get('/:company/scheduled', getScheduledMessages);

/**
 * @swagger
 * /api/scheduler/{company}/cancel:
 *   delete:
 *     summary: Cancel scheduled messages
 *     tags: [Scheduler]
 *     parameters:
 *       - in: path
 *         name: company
 *         schema:
 *           type: string
 *         required: true
 *         description: Company slug
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phone:
 *                 type: string
 *                 description: Phone number to cancel messages for
 *               messageType:
 *                 type: string
 *                 enum: [follow_up, reminder, nurture, offer]
 *                 description: Specific message type to cancel
 *               messageId:
 *                 type: string
 *                 description: Specific message ID to cancel
 *             oneOf:
 *               - required: [phone]
 *               - required: [messageId]
 *     responses:
 *       200:
 *         description: Messages cancelled successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Chat not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:company/cancel', cancelScheduledMessages);

/**
 * @swagger
 * /api/scheduler/{company}/stats:
 *   get:
 *     summary: Get scheduler statistics for a company
 *     tags: [Scheduler]
 *     parameters:
 *       - in: path
 *         name: company
 *         schema:
 *           type: string
 *         required: true
 *         description: Company slug
 *     responses:
 *       200:
 *         description: Scheduler statistics
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.get('/:company/stats', getSchedulerStats);

export default router;
