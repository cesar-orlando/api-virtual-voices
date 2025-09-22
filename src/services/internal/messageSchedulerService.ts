import { getScheduledMessageModel, IScheduledMessage } from '../../models/scheduledMessage.model';
import { getWhatsappChatModel, IWhatsappChat } from '../../models/whatsappChat.model';
import { clients, blockSession, unblockSession } from '../whatsapp/index';
import { getSessionModel } from '../../models/session.model';
import { BaseAgent } from '../agents/BaseAgent';
import { Connection } from 'mongoose';
import { DateTime } from 'luxon';
import { run } from '@openai/agents';
import { Message } from 'whatsapp-web.js';

export class MessageSchedulerService {
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 30000; // Check every 30 seconds
  private readonly BATCH_SIZE = 50;
  
  
  
  constructor(
    private connection: Connection,
  ) {
  }
  /**
   * Start the scheduler service
   */
  public start(): void {
    if (this.isRunning) {
      console.log('📅 Message scheduler is already running');
      return;
    }

    this.isRunning = true;
    console.log(`📅 Starting message scheduler for ${this.connection.name} (checking every ${this.CHECK_INTERVAL_MS/1000}s)`);
    
    // Process immediately on start
    this.processScheduledMessages();
    
    // Set up interval
    this.intervalId = setInterval(() => {
      this.processScheduledMessages();
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Stop the scheduler service
   */
  public stop(): void {
    if (!this.isRunning) {
      console.log('📅 Message scheduler is not running');
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('📅 Message scheduler stopped');
  }

  /**
   * Schedule a follow-up message
   */
  public async scheduleFollowUp(options: {
    chatId: string;
    phone: string;
    company: string;
    messageType?: string;
    delayHours?: number;
    delayDays?: number;
    triggerEvent: string;
    messageContent?: string;
    customData?: Record<string, any>;
  }): Promise<IScheduledMessage> {
    const ScheduledMessageModel = getScheduledMessageModel(this.connection);
    
    // Calculate scheduled time
    const now = new Date();
    const delayMs = ((options.delayHours || 0) * 60 * 60 * 1000) + 
                   ((options.delayDays || 0) * 24 * 60 * 60 * 1000);
    const scheduledFor = new Date(now.getTime() + delayMs);

    // Get chat context
    const ChatModel = getWhatsappChatModel(this.connection);
    const chat = await ChatModel.findById(options.chatId);
    
    const context = chat ? {
      lastMessageFrom: chat.messages.length > 0 ? 
        (chat.messages[chat.messages.length - 1].direction === 'Inbound' ? 'user' : 'assistant') as 'user' | 'assistant' :
        'user' as 'user',
      lastMessageAt: chat.messages.length > 0 ? 
        chat.messages[chat.messages.length - 1].createdAt || new Date() : 
        new Date(),
      conversationStage: chat.conversationSummary?.conversationStage || 'Inicio',
      extractedFacts: chat.conversationSummary?.extractedFacts,
      customData: options.customData
    } : undefined;

    const scheduledMessage = new ScheduledMessageModel({
      chatId: options.chatId,
      phone: options.phone,
      company: options.company,
      messageType: options.messageType || 'follow_up',
      messageContent: options.messageContent,
      scheduledFor,
      triggerEvent: options.triggerEvent,
      context,
      agentConfig: {
        generateWithAI: true,
        tone: 'friendly',
        includeContext: true
      }
    });

    await scheduledMessage.save();
    
    console.log(`📅 Scheduled ${options.messageType || 'follow_up'} message for ${options.phone} at ${scheduledFor.toISOString()}`);
    return scheduledMessage;
  }

  /**
   * Schedule common follow-up scenarios
   */
  public async scheduleCommonFollowUps(chatId: string, phone: string, company: string): Promise<void> {
    // No response in 24 hours
    await this.scheduleFollowUp({
      chatId,
      phone,
      company,
      messageType: 'follow_up',
      delayHours: 24,
      triggerEvent: 'no_response_24h',
      messageContent: 'Hola {userName}! Vi que estabas interesado en {propertyType}. ¿Hay algo específico en lo que pueda ayudarte?'
    });

    // Property nurture in 3 days
    await this.scheduleFollowUp({
      chatId,
      phone,
      company,
      messageType: 'nurture',
      delayDays: 3,
      triggerEvent: 'property_nurture_3d',
      messageContent: 'Hola {userName}! Tengo algunas propiedades nuevas que podrían interesarte en {location}. ¿Te gustaría verlas?'
    });

    // Check-in after 1 week
    await this.scheduleFollowUp({
      chatId,
      phone,
      company,
      messageType: 'follow_up',
      delayDays: 7,
      triggerEvent: 'weekly_checkin',
      messageContent: 'Hola {userName}! ¿Cómo va tu búsqueda de {propertyType}? ¿En qué puedo ayudarte esta semana?'
    });
  }

  /**
   * Process scheduled messages that are due
   */
  private async processScheduledMessages(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const ScheduledMessageModel = getScheduledMessageModel(this.connection);
      
      // Find due messages
      const dueMessages = await ScheduledMessageModel.findDueMessages(this.BATCH_SIZE);
      
      if (dueMessages.length > 0) {
        console.log(`📤 Processing ${dueMessages.length} due messages`);
        
        for (const message of dueMessages) {
          await this.processSingleMessage(message);
        }
      }

      // Process retry messages
      const retryMessages = await ScheduledMessageModel.findRetryMessages(25);
      
      if (retryMessages.length > 0) {
        console.log(`🔄 Processing ${retryMessages.length} retry messages`);
        
        for (const message of retryMessages) {
          await this.processSingleMessage(message);
        }
      }

    } catch (error) {
      console.error('❌ Error processing scheduled messages:', error);
    }
  }

  /**
   * Process a single scheduled message
   */
  private async processSingleMessage(scheduledMessage: IScheduledMessage): Promise<void> {
    try {
      // Get chat document
      const ChatModel = getWhatsappChatModel(this.connection);
      const chat = await ChatModel.findById(scheduledMessage.chatId);
      
      if (!chat) {
        throw new Error(`Chat not found: ${scheduledMessage.chatId}`);
      }

      let messageContent: string;

      if (scheduledMessage.messageContent) {
        // Use pre-defined message
        messageContent = scheduledMessage.messageContent;
      } else {
        throw new Error('No message content or template configured');
      }

      blockSession(scheduledMessage.company, chat.session.name, scheduledMessage.phone);

      // Send the message using the enhanced method
      const sentMessage = await this.sendWhatsAppMessage(scheduledMessage.phone, messageContent, scheduledMessage.company, scheduledMessage.chatId);

      const newMessage = {
        direction: 'outbound-scheduled-api',
        body: messageContent,
        status: 'enviado',
        createdAt: new Date(),
        respondedBy: `scheduler_${scheduledMessage.company}`,
        msgId: sentMessage.id.id
      };

      await ChatModel.findByIdAndUpdate(
        scheduledMessage.chatId,
        { $push: { messages: newMessage } }
      );

      // Mark as sent
      await scheduledMessage.markAsSent();

      unblockSession(scheduledMessage.company, chat.session.name, scheduledMessage.phone);
      
      console.log(`✅ Sent scheduled ${scheduledMessage.messageType} to ${scheduledMessage.phone}`);

    } catch (error) {
      console.error(`❌ Error sending scheduled message ${scheduledMessage._id}:`, error);
      
      // Schedule retry if within limits
      if (scheduledMessage.retryCount < scheduledMessage.maxRetries) {
        await scheduledMessage.scheduleRetry(15); // Retry in 15 minutes
        console.log(`🔄 Scheduled retry ${scheduledMessage.retryCount + 1}/${scheduledMessage.maxRetries} for message ${scheduledMessage._id}`);
      } else {
        await scheduledMessage.markAsFailed((error as Error).message);
        console.log(`❌ Max retries reached for message ${scheduledMessage._id}`);
      }
    }
  }

  /**
   * Get session details for WhatsApp message sending
   */
  private async getSessionDetails(chatId: string, company: string): Promise<{
    sessionName: string;
    clientKey: string;
    sessionId: string;
  } | null> {
    try {
      const ChatModel = getWhatsappChatModel(this.connection);
      const SessionModel = getSessionModel(this.connection);
      
      // Get chat to find session ID
      const chat = await ChatModel.findById(chatId);
      if (!chat || !chat.session?.id) {
        console.error(`❌ Chat ${chatId} has no session assigned`);
        return null;
      }

      // Get session details
      const session = await SessionModel.findById(chat.session.id);
      if (!session) {
        console.error(`❌ Session ${chat.session.id} not found`);
        return null;
      }

      const sessionName = session.name;
      const clientKey = `${company}:${sessionName}`;
      
      return {
        sessionName,
        clientKey,
        sessionId: session._id.toString()
      };
    } catch (error) {
      console.error('❌ Error getting session details:', error);
      return null;
    }
  }

  /**
   * Send WhatsApp message using the same pattern as whatsapp controller
   */
  private async sendWhatsAppMessage(phone: string, message: string, company: string, chatId: string): Promise<Message> {
    try {
      // Get session details for this chat
      const sessionDetails = await this.getSessionDetails(chatId, company);
      if (!sessionDetails) {
        throw new Error(`Unable to get session details for chat ${chatId}`);
      }

      const { clientKey, sessionName } = sessionDetails;
      
      // Check if client exists
      const client = clients[clientKey];
      if (!client) {
        throw new Error(`WhatsApp client not found for ${clientKey}. Available clients: ${Object.keys(clients).join(', ')}`);
      }

      // Ensure phone has @c.us suffix for WhatsApp Web
      const phoneWithSuffix = phone.includes('@c.us') ? phone : `${phone}@c.us`;
      
      // Send message using the same pattern as whatsapp controller
      console.log(`📱 Sending scheduled message via ${clientKey} to ${phoneWithSuffix}`);
      const sentMessage = await client.sendMessage(phoneWithSuffix, message);
      
      console.log(`✅ Message sent successfully via ${sessionName} (${company})`);

      return sentMessage;
      
    } catch (error) {
      console.error(`❌ Error sending WhatsApp message:`, error);
      throw error;
    }
  }

  /**
   * Get human-readable time since last message
   */
  private getTimeSinceLastMessage(lastMessageAt?: Date): string {
    if (!lastMessageAt) return 'tiempo desconocido';
    
    const now = DateTime.now();
    const last = DateTime.fromJSDate(lastMessageAt);
    const diff = now.diff(last, ['days', 'hours', 'minutes']);
    
    if (diff.days > 0) return `${Math.floor(diff.days)} días`;
    if (diff.hours > 0) return `${Math.floor(diff.hours)} horas`;
    return `${Math.floor(diff.minutes)} minutos`;
  }

  /**
   * Get default follow-up message when no template or AI is available
   */
  private getDefaultFollowUpMessage(messageType: string, context?: any): string {
    const userName = context?.extractedFacts?.userName || 'Cliente';
    
    const defaultMessages = {
      follow_up: `Hola ${userName}! ¿Hay algo en lo que pueda ayudarte hoy?`,
      reminder: `Hola ${userName}! Te recordamos nuestro compromiso. ¿Necesitas alguna información adicional?`,
      nurture: `Hola ${userName}! Esperamos que estés bien. ¿En qué podemos apoyarte?`,
      appointment: `Hola ${userName}! ¿Podrías confirmar tu disponibilidad para la cita?`,
      motivation: `Hola ${userName}! ¿Cómo va todo? Estamos aquí para ayudarte.`,
      offer: `Hola ${userName}! Tenemos algo especial que podría interesarte. ¿Te gustaría conocer más detalles?`
    };

    return defaultMessages[messageType as keyof typeof defaultMessages] || 
           `Hola ${userName}! ¿En qué puedo ayudarte hoy?`;
  }

  /**
   * Cancel scheduled messages for a chat
   */
  public async cancelScheduledMessages(chatId: string, messageType?: string): Promise<number> {
    const ScheduledMessageModel = getScheduledMessageModel(this.connection);
    
    const query: any = { 
      chatId, 
      status: 'pending' 
    };
    
    if (messageType) {
      query.messageType = messageType;
    }
    
    const result = await ScheduledMessageModel.updateMany(
      query,
      { status: 'cancelled' }
    );
    
    console.log(`🚫 Cancelled ${result.modifiedCount} scheduled messages for chat ${chatId}`);
    return result.modifiedCount;
  }

  /**
   * Get status of scheduled messages
   */
  public async getScheduleStatus(): Promise<{
    pending: number;
    overdue: number;
    failed: number;
    sent: number;
  }> {
    const ScheduledMessageModel = getScheduledMessageModel(this.connection);
    
    const [pending, overdue, failed, sent] = await Promise.all([
      ScheduledMessageModel.countDocuments({ status: 'pending' }),
      ScheduledMessageModel.countDocuments({ 
        status: 'pending', 
        scheduledFor: { $lt: new Date() } 
      }),
      ScheduledMessageModel.countDocuments({ status: 'failed' }),
      ScheduledMessageModel.countDocuments({ status: 'sent' })
    ]);

    return { pending, overdue, failed, sent };
  }
}
