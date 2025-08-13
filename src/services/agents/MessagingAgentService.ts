import { AgentManager } from './AgentManager';
import { getWhatsappChatModel } from '../../models/whatsappChat.model';
import { Connection, isValidObjectId } from 'mongoose';
import { getFacebookChatModel } from '../../models/facebookChat.model';

export class MessagingAgentService {
  private agentManager: AgentManager;

  constructor() {
    this.agentManager = AgentManager.getInstance();
  }

  /**
   * Process WhatsApp message using the new agent system
   */
  public async processWhatsAppMessage(
    company: string, 
    message: string, 
    phoneUser: string,
    conn: Connection,
    iaConfigId?: string,
    sessionId?: string,
    providedChatHistory?: any[],
    isCalendarFallback: boolean = false
  ): Promise<string> {
    try {
      
      // Use provided chat history or get from database
      let chatHistory: any[];
      if (providedChatHistory && providedChatHistory.length > 0) {
        // console.log(`📚 Using provided chat history: ${providedChatHistory.length} messages`);
        chatHistory = providedChatHistory;
      } else {
        // console.log(`📚 Getting chat history from database for ${phoneUser}`);
        chatHistory = await this.getChatHistory(phoneUser, conn, sessionId);
      }
      
      // Process with agent - with retry logic
      // console.log(`🤖 Calling agentManager.processMessage for ${company}`);
      
      // Try with new agent system (with retries)
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          // console.log(`🔄 Intento ${attempt}/3 con nuevo sistema de agentes`);
          const response = await this.agentManager.processMessage(company, message, {
            phoneUser,
            chatHistory,
            company,
            sessionId,
            iaConfigId,
          });
          console.log(`🤖 Agent response received: ${response.substring(0, 50)}...`);
          
          // Check for transfer signals and disable AI if needed (skip for calendar fallback)
          if (!isCalendarFallback && (response.includes('TRANSFER_PAYMENT_INFO:') || response.includes('TRANSFER_TO_ADVISOR:') ||
              (response.includes('transferencia bancaria') && response.includes('pagoscinf@quicklearning.com')))) {
            console.log(`🔄 Señal de transferencia detectada, desactivando IA para ${phoneUser}`);
            try {
              await this.disableAIForUser(phoneUser, conn, company);
              console.log(`🔴 IA desactivada automáticamente para ${phoneUser} después de transferencia`);
            } catch (disableError) {
              console.error(`❌ Error desactivando IA para ${phoneUser}:`, disableError);
            }
            // Clean the response from transfer signals
            return response.replace('TRANSFER_PAYMENT_INFO:', '').replace('TRANSFER_TO_ADVISOR:', '').trim();
          } else if (isCalendarFallback && (response.includes('TRANSFER_PAYMENT_INFO:') || response.includes('TRANSFER_TO_ADVISOR:'))) {
            console.log(`📅 Calendar fallback received transfer signal - cleaning but NOT disabling AI`);
            // Clean the response from transfer signals but don't disable AI
            return response.replace('TRANSFER_PAYMENT_INFO:', '').replace('TRANSFER_TO_ADVISOR:', '').trim();
          }
          
          return response;
        } catch (error) {
          console.error(`❌ Error en intento ${attempt}/3 para ${company}:`, error);
          
          if (attempt === 3) {
            console.log(`⚠️ Todos los intentos fallaron`);
            
            // Only disable AI if this is NOT a calendar fallback
            if (!isCalendarFallback) {
              console.log(`⚠️ Disactivando IA y transfiriendo a asesor`);
              try {
                await this.disableAIForUser(phoneUser, conn, company);
                console.log(`🔴 IA desactivada automáticamente para ${phoneUser} después de 3 intentos fallidos`);
                return "Disculpa, en este momento no puedo ayudarte como quisiera. Voy a pasar tu consulta a uno de mis compañeros que te podrá atender mejor. Te contactará en unos minutos.";
              } catch (disableError) {
                console.error(`❌ Error desactivando IA para ${phoneUser}:`, disableError);
                return "Disculpa, no me es posible ayudarte en este momento. Voy a transferir tu consulta para que te atiendan de la mejor manera. Te contactarán pronto.";
              }
            } else {
              console.log(`📅 Calendar fallback failed - NOT disabling AI, returning error message`);
              return "Lo siento, hubo un problema procesando tu solicitud de calendario. Por favor intenta de nuevo o contacta a soporte.";
            }
          } else {
            // Wait before retry (exponential backoff)
            const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
            console.log(`⏳ Esperando ${waitTime}ms antes del siguiente intento...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error in WhatsAppAgentService for ${company}:`, error);
      console.error(`❌ Error details:`, error.message);
      
      // Only disable AI if this is NOT a calendar fallback
      if (!isCalendarFallback) {
        try {
          await this.disableAIForUser(phoneUser, conn, company);
          console.log(`🔴 IA desactivada automáticamente para ${phoneUser} debido a error`);
        } catch (disableError) {
          console.error(`❌ Error desactivando IA para ${phoneUser}:`, disableError);
        }
        
        // Fallback response (human-like, no mention of technical error)
        return "Disculpa, necesito que uno de mis compañeros te ayude con esto. Te van a contactar muy pronto para darte toda la información que necesitas.";
      } else {
        console.log(`📅 Calendar fallback error - NOT disabling AI`);
        return "Lo siento, hubo un problema procesando tu solicitud de calendario. Por favor intenta de nuevo o contacta a soporte.";
      }
    }
  }

  public async processFacebookMessage(
    company: string, 
    message: string, 
    userId: string,
    conn: Connection,
    iaConfigId?: string,
    sessionId?: string,
    providedChatHistory?: any[]
  ): Promise<string> {
    try {
      
      // Use provided chat history or get from database
      let chatHistory: any[];
      if (providedChatHistory && providedChatHistory.length > 0) {
        // console.log(`📚 Using provided chat history: ${providedChatHistory.length} messages`);
        chatHistory = providedChatHistory;
      } else {
        // console.log(`📚 Getting chat history from database for ${userId}`);
        chatHistory = await this.getFacebookChatHistory(userId, conn, sessionId);
      }
      
      // Process with agent - with retry logic
      // console.log(`🤖 Calling agentManager.processMessage for ${company}`);
      
      // Try with new agent system (with retries)
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          // console.log(`🔄 Intento ${attempt}/3 con nuevo sistema de agentes`);
          const response = await this.agentManager.processMessage(company, message, {
            userId,
            chatHistory,
            company,
            sessionId,
            iaConfigId,
          });
          console.log(`🤖 Agent response received: ${response.substring(0, 50)}...`);
          
          // Check for transfer signals and disable AI if needed
          if (response.includes('TRANSFER_PAYMENT_INFO:') || response.includes('TRANSFER_TO_ADVISOR:') ||
              (response.includes('transferencia bancaria') && response.includes('pagoscinf@quicklearning.com'))) {
            console.log(`🔄 Señal de transferencia detectada, desactivando IA para ${userId}`);
            try {
              await this.disableAIForUser(userId, conn, company);
              console.log(`🔴 IA desactivada automáticamente para ${userId} después de transferencia`);
            } catch (disableError) {
              console.error(`❌ Error desactivando IA para ${userId}:`, disableError);
            }
            // Clean the response from transfer signals
            return response.replace('TRANSFER_PAYMENT_INFO:', '').replace('TRANSFER_TO_ADVISOR:', '').trim();
          }
          
          return response;
        } catch (error) {
          console.error(`❌ Error en intento ${attempt}/3 para ${company}:`, error);
          
          if (attempt === 3) {
            console.log(`⚠️ Todos los intentos fallaron, desactivando IA y transfiriendo a asesor`);
            // Disable AI and return professional message
            try {
              await this.disableAIForUser(userId, conn, company);
              console.log(`🔴 IA desactivada automáticamente para ${userId} después de 3 intentos fallidos`);
              return "Disculpa, en este momento no puedo ayudarte como quisiera. Voy a pasar tu consulta a uno de mis compañeros que te podrá atender mejor. Te contactará en unos minutos.";
            } catch (disableError) {
              console.error(`❌ Error desactivando IA para ${userId}:`, disableError);
              return "Disculpa, no me es posible ayudarte en este momento. Voy a transferir tu consulta para que te atiendan de la mejor manera. Te contactarán pronto.";
            }
          } else {
            // Wait before retry (exponential backoff)
            const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
            console.log(`⏳ Esperando ${waitTime}ms antes del siguiente intento...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error in WhatsAppAgentService for ${company}:`, error);
      console.error(`❌ Error details:`, error.message);
      
      // Disable AI for this user when error occurs
      try {
        await this.disableAIForUser(userId, conn, company);
        console.log(`🔴 IA desactivada automáticamente para ${userId} debido a error`);
      } catch (disableError) {
        console.error(`❌ Error desactivando IA para ${userId}:`, disableError);
      }
      
      // Fallback response (human-like, no mention of technical error)
      return "Disculpa, necesito que uno de mis compañeros te ayude con esto. Te van a contactar muy pronto para darte toda la información que necesitas.";
    }
  }

  /**
   * Disable AI for user when error occurs
   */
  private async disableAIForUser(phoneUser: string, conn: Connection, company: string): Promise<void> {
    try {
      if (company === 'quicklearning') {
        const getQuickLearningChatModel = (await import('../../models/quicklearning/chat.model')).default;
        const ChatModel = getQuickLearningChatModel(conn);
        await ChatModel.updateOne(
          { phone: phoneUser },
          { $set: { aiEnabled: false } },
          { upsert: true }
        );
      } else {
        const recordModelModule = await import('../../models/record.model');
        const getRecordModel = recordModelModule.default;
        const Record = getRecordModel(conn);
        await Record.updateOne(
          { tableSlug: 'prospectos', 'data.number': phoneUser },
          { $set: { ia: false } },
          { upsert: true }
        );
      }
    } catch (error) {
      console.error(`❌ Error disabling AI for ${phoneUser}:`, error);
      throw error;
    }
  }

  /**
   * Clean message content to prevent JSON parsing errors
   */
  private cleanMessageContent(content: string): string {
    if (!content) return '';
    
    return content
      .replace(/\\/g, '\\\\')  // Escape backslashes first
      .replace(/"/g, '\\"')    // Escape quotes
      .replace(/\n/g, ' ')     // Replace newlines with spaces
      .replace(/\r/g, ' ')     // Replace carriage returns with spaces
      .replace(/\t/g, ' ')     // Replace tabs with spaces
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ') // Remove control characters
      // Normalize Spanish characters to ASCII
      .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u')
      .replace(/Á/g, 'A').replace(/É/g, 'E').replace(/Í/g, 'I').replace(/Ó/g, 'O').replace(/Ú/g, 'U')
      .replace(/ñ/g, 'n').replace(/Ñ/g, 'N')
      .replace(/¿/g, '').replace(/¡/g, ''); // Remove Spanish punctuation
  }

  /**
   * Get chat history for context
   */
  private async getChatHistory(phoneUser: string, conn: Connection, sessionId?: string): Promise<any[]> {
    try {
      const WhatsappChat = getWhatsappChatModel(conn);
      // Try session-scoped history when sessionId provided and valid
      let chatHistory = null as any;
      if (typeof sessionId === 'string' && isValidObjectId(sessionId)) {
        chatHistory = await WhatsappChat.findOne({ phone: phoneUser, 'session.id': sessionId });
      } else if (sessionId) {
        console.log(`ℹ️ WhatsApp chat history fallback used for ${phoneUser} (sessionId not found)`);
        chatHistory = await WhatsappChat.findOne({ phone: phoneUser }).sort({ updatedAt: -1 });
      }

      if (!chatHistory || !chatHistory.messages) {
        return [];
      }

      // Limit to most recent messages to avoid large payloads
      const recent = chatHistory.messages.slice(-100);

      return recent.map((message: any) => ({
        role: message.direction === "inbound" ? "user" : "assistant",
        content: this.cleanMessageContent(message.body || '')
      }));
    } catch (error) {
      console.error('❌ Error getting chat history:', error);
      return [];
    }
  }

  private async getFacebookChatHistory(userId: string, conn: Connection, sessionId?: string): Promise<any[]> {
    try {
      const FacebookChat = getFacebookChatModel(conn);
      // Try session-scoped history when sessionId provided and valid
      let chatHistory = null as any;
      if (typeof sessionId === 'string' && isValidObjectId(sessionId)) {
        chatHistory = await FacebookChat.findOne({ userId, 'session.id': sessionId });
      } else if (sessionId) {
        chatHistory = await FacebookChat.findOne({ userId }).sort({ updatedAt: -1 });
        console.log(`ℹ️ Facebook chat history fallback used for ${userId} (sessionId not found)`);
      }

      if (!chatHistory || !chatHistory.messages) {
        return [];
      }

      // Limit to most recent messages to avoid large payloads
      const recent = chatHistory.messages.slice(-100);

      return recent.map((message: any) => ({
        role: message.direction === "inbound" ? "user" : "assistant",
        content: this.cleanMessageContent(message.body || ''),
        timestamp: message.createdAt
      }));
    } catch (error) {
      console.error('❌ Error getting Facebook chat history:', error);
      return [];
    }
  }

  /**
   * Get agent manager instance
   */
  public getAgentManager(): AgentManager {
    return this.agentManager;
  }
} 