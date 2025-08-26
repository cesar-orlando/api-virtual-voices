import { Schema, Document, Model, Connection } from 'mongoose';

export interface INotification extends Document {
  userId: string;
  company: string;
  type: 'chat_message' | 'calendar_event' | 'system';
  title: string;
  message: string;
  data: {
    chatId?: string;
    phoneNumber?: string;
    senderName?: string;
    messagePreview?: string;
    eventId?: string;
    [key: string]: any;
  };
  isRead: boolean;
  priority: 'low' | 'medium' | 'high';
  createdAt: Date;
  readAt?: Date;
}

const NotificationSchema = new Schema<INotification>({
  userId: { type: String, required: true, index: true },
  company: { type: String, required: true, index: true },
  type: { 
    type: String, 
    enum: ['chat_message', 'calendar_event', 'system'], 
    required: true 
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  data: { type: Schema.Types.Mixed, default: {} },
  isRead: { type: Boolean, default: false, index: true },
  priority: { 
    type: String, 
    enum: ['low', 'medium', 'high'], 
    default: 'medium' 
  },
  readAt: { type: Date }
}, {
  timestamps: true,
  collection: 'notifications'
});

// Compound indexes for efficient queries
NotificationSchema.index({ userId: 1, company: 1, isRead: 1 });
NotificationSchema.index({ userId: 1, company: 1, createdAt: -1 });
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 }); // 30 days TTL

export const getNotificationModel = (connection: Connection): Model<INotification> => {
  return connection.model<INotification>('Notification', NotificationSchema);
};

export default getNotificationModel;
