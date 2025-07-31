import { Router } from 'express';
import { getCalendarEvents, getUserCalendarEvents, findEventByReference } from '../controllers/calendarEvent.controller';
import { requireCompanyContext } from '../core/auth/companyMiddleware';

const router = Router();

// Primary endpoint - supports both use cases:
// - Company-wide events (for front page): GET /:company/events
// - User-specific events (for Assistant): GET /:company/events?phoneUser=xxx
router.get('/:company/events', getCalendarEvents);

// Legacy endpoint for backward compatibility
router.get('/:company/user-events', getUserCalendarEvents);

// Find specific event by reference
router.get('/:company/find-event', findEventByReference);

// Protected routes (require JWT authentication) - for future web interface
router.use('/protected', requireCompanyContext);
router.get('/protected/:company/events', getCalendarEvents);
router.get('/protected/:company/find-event', findEventByReference);

export default router;