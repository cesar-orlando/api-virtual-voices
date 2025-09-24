import { getConnectionByCompanySlug } from '../../config/connectionManager';
import { getNotificationModel } from '../../models/notification.model';
import { io } from '../../server';

export class NotificationService {
  
  static async createChatNotification(params: {
    userId: string;
    company: string;
    phoneNumber: string;
    senderName: string;
    messagePreview: string;
    chatId: string;
  }) {
    try {
      const { userId, company, phoneNumber, senderName, messagePreview, chatId } = params;
            
      const conn = await getConnectionByCompanySlug(company);
      
      const Notification = getNotificationModel(conn);
      
      // Check if user already has an unread notification for this chat
      const existingNotification = await Notification.findOne({
        userId,
        company,
        type: 'chat_message',
        'data.phoneNumber': phoneNumber,
        isRead: false
      });

      if (existingNotification) {
        // Update existing notification with latest message and increment count
        const messageCount = (existingNotification.data.messageCount || 1) + 1;
        existingNotification.message = messageCount > 1 
          ? `${messageCount} mensajes nuevos de ${senderName}` 
          : `Nuevo mensaje de ${senderName}`;
        
        // For Mongoose Mixed types, we need to explicitly mark the path as modified
        existingNotification.data = {
          ...existingNotification.data,
          messagePreview: messagePreview,
          messageCount: messageCount,
          lastMessageAt: new Date()
        };
        existingNotification.markModified('data');
        
        // Keep original createdAt, don't overwrite it
        await existingNotification.save();
        
        // Emit updated notification
        if (io) {
          io.emit(`notifications-${company}-${userId}`, {
            type: 'updated',
            notification: existingNotification
          });
        }
        
        return existingNotification;
      } else {
        // Create new notification
        const notification = new Notification({
          userId,
          company,
          type: 'chat_message',
          title: 'Nuevo mensaje de WhatsApp',
          message: `Nuevo mensaje de ${senderName}`,
          data: {
            chatId,
            phoneNumber,
            senderName,
            messagePreview: messagePreview.substring(0, 100) + (messagePreview.length > 100 ? '...' : ''),
            messageCount: 1,
            lastMessageAt: new Date()
          },
          priority: 'medium'
        });
        
        await notification.save();
        
        // Emit new notification via Socket.IO
        if (io) {
          io.emit(`notifications-${company}-${userId}`, {
            type: 'new',
            notification
          });
          
          // Emit unread count update
          const unreadCount = await this.getUnreadCount(userId, company);
          io.emit(`unread-count-${company}-${userId}`, { count: unreadCount });
        }
        
        return notification;
      }
    } catch (error) {
      console.error('Error creating chat notification:', error);
      throw error;
    }
  }

  static async getUnreadCount(userId: string, company: string): Promise<number> {
    try {
      const conn = await getConnectionByCompanySlug(company);
      const Notification = getNotificationModel(conn);
      
      return await Notification.countDocuments({
        userId,
        company,
        isRead: false
      });
    } catch (error) {
      console.error('Error getting unread count:', error);
      return 0;
    }
  }

  static async getUserNotifications(userId: string, company: string, limit: number = 50) {
    try {
      const conn = await getConnectionByCompanySlug(company);
      const Notification = getNotificationModel(conn);
      
      return await Notification.find({
        userId,
        company
      })
      .sort({ createdAt: -1 })
      .limit(limit);
    } catch (error) {
      console.error('Error getting user notifications:', error);
      return [];
    }
  }

  static async markAsRead(notificationId: string, company: string) {
    try {
      const conn = await getConnectionByCompanySlug(company);
      const Notification = getNotificationModel(conn);
      
      const notification = await Notification.findByIdAndUpdate(
        notificationId,
        { 
          isRead: true, 
          readAt: new Date() 
        },
        { new: true }
      );
      
      if (notification && io) {
        // Emit updated unread count
        const unreadCount = await this.getUnreadCount(notification.userId, company);
        io.emit(`unread-count-${company}-${notification.userId}`, { count: unreadCount });
      }
      
      return notification;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  static async markAllAsRead(userId: string, company: string) {
    try {
      const conn = await getConnectionByCompanySlug(company);
      const Notification = getNotificationModel(conn);
      
      await Notification.updateMany(
        { 
          userId, 
          company, 
          isRead: false 
        },
        { 
          isRead: true, 
          readAt: new Date() 
        }
      );
      
      // Emit updated unread count (should be 0)
      if (io) {
        io.emit(`unread-count-${company}-${userId}`, { count: 0 });
      }
      
      return true;
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  }
}
