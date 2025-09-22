import { Schema, Document, Connection, Model } from "mongoose";

export interface IScheduledMessage extends Document {
  chatId: string; // Reference to WhatsappChat
  phone: string; // For easy lookup
  company: string; // Company slug
  
  // Message details
  messageType: 'follow_up' | 'reminder' | 'nurture' | 'appointment' | 'custom';
  messageContent?: string; // Pre-defined message (optional)
  
  // Scheduling
  scheduledFor: Date; // When to send the message
  createdAt: Date; // When the schedule was created
  triggerEvent: string; // What triggered this schedule (e.g., "no_response_24h", "property_viewed", "custom")
  
  // Status
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  sentAt?: Date;
  errorMessage?: string;
  
  // Context for AI generation
  context?: {
    lastMessageFrom: 'user' | 'assistant';
    lastMessageAt: Date;
    conversationStage: string;
    extractedFacts?: any;
    customData?: Record<string, any>;
  };
  
  // Retry logic
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: Date;

  // Instance methods
  scheduleRetry(delayMinutes?: number): Promise<IScheduledMessage>;
  markAsSent(): Promise<IScheduledMessage>;
  markAsFailed(error: string): Promise<IScheduledMessage>;
}

export interface IScheduledMessageModel extends Model<IScheduledMessage> {
  findDueMessages(limit?: number): Promise<IScheduledMessage[]>;
  findRetryMessages(limit?: number): Promise<IScheduledMessage[]>;
}

const ScheduledMessageSchema: Schema = new Schema(
  {
    chatId: { type: String, required: true, index: true },
    phone: { type: String, required: true, index: true },
    company: { type: String, required: true, index: true },
    
    // Message details
    messageType: { 
      type: String, 
      required: true,
      enum: ['follow_up', 'reminder', 'nurture', 'appointment', 'custom'],
      index: true
    },
    messageContent: { type: String, maxlength: 1000 },
    
    // Scheduling
    scheduledFor: { type: Date, required: true, index: true },
    triggerEvent: { type: String, required: true },
    
    // Status
    status: { 
      type: String, 
      required: true, 
      enum: ['pending', 'sent', 'failed', 'cancelled'],
      default: 'pending',
      index: true
    },
    sentAt: { type: Date },
    errorMessage: { type: String, maxlength: 500 },
    
    // Context
    context: {
      lastMessageFrom: { type: String, enum: ['user', 'assistant'] },
      lastMessageAt: { type: Date },
      conversationStage: { type: String, maxlength: 100 },
      extractedFacts: { type: Schema.Types.Mixed },
      customData: { type: Schema.Types.Mixed }
    },
    
    // Retry logic
    retryCount: { type: Number, default: 0, min: 0 },
    maxRetries: { type: Number, default: 3, min: 0, max: 10 },
    nextRetryAt: { type: Date },
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Compound indexes for efficient queries
ScheduledMessageSchema.index({ scheduledFor: 1, status: 1 }); // For finding due messages
ScheduledMessageSchema.index({ chatId: 1, status: 1 }); // For chat-specific queries
ScheduledMessageSchema.index({ phone: 1, company: 1, status: 1 }); // For phone-specific queries
ScheduledMessageSchema.index({ status: 1, nextRetryAt: 1 }); // For retry processing
ScheduledMessageSchema.index({ createdAt: 1, status: 1 }); // For cleanup/analytics

// Virtual to check if message is overdue
ScheduledMessageSchema.virtual('isOverdue').get(function() {
  if (this.status !== 'pending') return false;
  return new Date() > this.scheduledFor;
});

// Virtual to get time until scheduled
ScheduledMessageSchema.virtual('timeUntilScheduled').get(function() {
  if (this.status !== 'pending') return null;
  const now = new Date();
  const scheduled = new Date(this.scheduledFor as Date);
  return scheduled.getTime() - now.getTime();
});

// Static method to find due messages
ScheduledMessageSchema.statics.findDueMessages = function(limit: number = 100) {
  return this.find({
    status: 'pending',
    scheduledFor: { $lte: new Date() }
  })
  .sort({ scheduledFor: 1 })
  .limit(limit);
};

// Static method to find retry messages
ScheduledMessageSchema.statics.findRetryMessages = function(limit: number = 50) {
  return this.find({
    status: 'failed',
    nextRetryAt: { $lte: new Date() },
    $expr: { $lt: ['$retryCount', '$maxRetries'] }
  })
  .sort({ nextRetryAt: 1 })
  .limit(limit);
};

// Instance method to schedule retry
ScheduledMessageSchema.methods.scheduleRetry = function(delayMinutes: number = 15) {
  this.retryCount += 1;
  this.nextRetryAt = new Date(Date.now() + delayMinutes * 60 * 1000);
  this.status = 'failed';
  return this.save();
};

// Instance method to mark as sent
ScheduledMessageSchema.methods.markAsSent = function() {
  this.status = 'sent';
  this.sentAt = new Date();
  this.errorMessage = undefined;
  return this.save();
};

// Instance method to mark as failed
ScheduledMessageSchema.methods.markAsFailed = function(error: string) {
  this.status = 'failed';
  this.errorMessage = error.substring(0, 500);
  return this.save();
};

export function getScheduledMessageModel(conn: Connection): IScheduledMessageModel {
  return conn.model<IScheduledMessage, IScheduledMessageModel>("ScheduledMessage", ScheduledMessageSchema);
}
