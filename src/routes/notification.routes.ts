import { Router } from 'express';
import { 
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  createNotification,
  deleteNotification
} from '../controllers/notification.controller';

const router = Router();

// Get user notifications
router.get('/:company/:userId', getUserNotifications);

// Get unread count
router.get('/:company/:userId/unread-count', getUnreadCount);

// Mark notification as read
router.patch('/:company/:notificationId/read', markAsRead);

// Mark all notifications as read
router.patch('/:company/:userId/read-all', markAllAsRead);

// Create manual notification (for testing/admin)
router.post('/:company', createNotification);

// Delete notification
router.delete('/:company/:notificationId', deleteNotification);

export default router;
