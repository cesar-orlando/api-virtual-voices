import { Request, Response } from 'express';
import { NotificationService } from '../services/internal/notification.service';

/**
 * Get user notifications
 * GET /api/notifications/:company/:userId
 */
export const getUserNotifications = async (req: Request, res: Response) => {
  try {
    const { company, userId } = req.params;
    const { limit = 50, page = 1 } = req.query;
    
    // Validate parameters
    if (!company || !userId) {
      res.status(400).json({ 
        success: false, 
        error: 'Company and userId are required' 
      });
      return;
    }
    
    const notifications = await NotificationService.getUserNotifications(
      userId, 
      company, 
      parseInt(limit as string)
    );

    const unreadCount = await NotificationService.getUnreadCount(userId, company);

    res.json({ 
      success: true, 
      data: { notifications, unreadCount },
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total: notifications.length
      }
    });
  } catch (error: any) {
    console.error('Error getting user notifications:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error.message 
    });
  }
};

/**
 * Get unread notifications count
 * GET /api/notifications/:company/:userId/unread-count
 */
export const getUnreadCount = async (req: Request, res: Response) => {
  try {
    const { company, userId } = req.params;
    
    if (!company || !userId) {
      res.status(400).json({ 
        success: false, 
        error: 'Company and userId are required' 
      });
      return;
    }
    
    const count = await NotificationService.getUnreadCount(userId, company);
    
    res.json({ 
      success: true, 
      count,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error.message 
    });
  }
};

/**
 * Mark specific notification as read
 * PATCH /api/notifications/:company/:notificationId/read
 */
export const markAsRead = async (req: Request, res: Response) => {
  try {
    const { company, notificationId } = req.params;
    
    if (!company || !notificationId) {
      res.status(400).json({ 
        success: false, 
        error: 'Company and notificationId are required' 
      });
      return;
    }
    
    const notification = await NotificationService.markAsRead(notificationId, company);
    
    if (!notification) {
      res.status(404).json({ 
        success: false, 
        error: 'Notification not found' 
      });
      return;
    }
    
    res.json({ 
      success: true, 
      data: notification,
      message: 'Notification marked as read'
    });
  } catch (error: any) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error.message 
    });
  }
};

/**
 * Mark all user notifications as read
 * PATCH /api/notifications/:company/:userId/read-all
 */
export const markAllAsRead = async (req: Request, res: Response) => {
  try {
    const { company, userId } = req.params;
    
    if (!company || !userId) {
      res.status(400).json({ 
        success: false, 
        error: 'Company and userId are required' 
      });
      return;
    }
    
    await NotificationService.markAllAsRead(userId, company);
    
    res.json({ 
      success: true, 
      message: 'All notifications marked as read',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error.message 
    });
  }
};

/**
 * Create a manual notification (for testing or admin purposes)
 * POST /api/notifications/:company
 */
export const createNotification = async (req: Request, res: Response) => {
  try {
    const { company } = req.params;
    const { userId, type, title, message, data, priority } = req.body;
    
    if (!company || !userId || !type || !title || !message) {
      res.status(400).json({ 
        success: false, 
        error: 'Company, userId, type, title, and message are required' 
      });
      return;
    }
    
    // For manual notifications, we'll create them directly through the service
    // This could be extended to support different notification types
    if (type === 'chat_message') {
      res.status(400).json({ 
        success: false, 
        error: 'Chat notifications should be created automatically' 
      });
      return;
    }
    
    // This would need to be implemented in the service for other notification types
    res.status(501).json({ 
      success: false, 
      error: 'Manual notification creation not yet implemented for this type' 
    });
  } catch (error: any) {
    console.error('Error creating notification:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error.message 
    });
  }
};

/**
 * Delete a notification
 * DELETE /api/notifications/:company/:notificationId
 */
export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const { company, notificationId } = req.params;
    
    if (!company || !notificationId) {
      res.status(400).json({ 
        success: false, 
        error: 'Company and notificationId are required' 
      });
      return;
    }
    
    // This would need to be implemented in the service
    res.status(501).json({ 
      success: false, 
      error: 'Notification deletion not yet implemented' 
    });
  } catch (error: any) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error.message 
    });
  }
};
