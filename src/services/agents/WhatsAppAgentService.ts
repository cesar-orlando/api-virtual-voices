import { AgentManager } from './AgentManager';
import { getDbConnection } from '../../config/connectionManager';
import { getWhatsappChatModel } from '../../models/whatsappChat.model';
import { Connection } from 'mongoose';

export class WhatsAppAgentService {
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
    providedChatHistory?: any[]
  ): Promise<string> {
    try {
      // Check if AI is enabled for this user
      try {
        let aiEnabled = true;
        if (company === 'quicklearning') {
          const getQuickLearningChatModel = (await import('../../models/quicklearning/chat.model')).default;
          const ChatModel = getQuickLearningChatModel(conn);
          const chat = await ChatModel.findOne({ phone: phoneUser });
          aiEnabled = chat?.aiEnabled !== false;
        } else {
          const { getWhatsappChatModel } = await import('../../models/whatsappChat.model');
          const WhatsappChat = getWhatsappChatModel(conn);
          const chat = await WhatsappChat.findOne({ phone: phoneUser });
          aiEnabled = chat?.botActive !== false;
        }

        console.log(`🔍 AI habilitada para ${phoneUser}: ${aiEnabled}`);
        
        if (!aiEnabled) {
          console.log(`🚫 IA desactivada para ${phoneUser}, no procesando mensaje`);
          return "Ya pasé tu consulta a uno de mis compañeros. Te contactará muy pronto para ayudarte.";
        }
      } catch (error) {
        console.error(`❌ Error verificando aiEnabled para ${phoneUser}:`, error);
        // En caso de error, continuar con el procesamiento
      }

      // console.log(`🤖 Processing WhatsApp message for ${company} - ${phoneUser}`);
      
      // Use provided chat history or get from database
      let chatHistory: any[];
      if (providedChatHistory && providedChatHistory.length > 0) {
        // console.log(`📚 Using provided chat history: ${providedChatHistory.length} messages`);
        chatHistory = providedChatHistory;
      } else {
        // console.log(`📚 Getting chat history from database for ${phoneUser}`);
        chatHistory = await this.getChatHistory(phoneUser, conn);
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
            company
          });
          console.log(`🤖 Agent response received: ${response.substring(0, 50)}...`);
          
          // Check for transfer signals and disable AI if needed
          if (response.includes('TRANSFER_PAYMENT_INFO:') || response.includes('TRANSFER_TO_ADVISOR:') ||
              (response.includes('transferencia bancaria') && response.includes('pagoscinf@quicklearning.com'))) {
            console.log(`🔄 Señal de transferencia detectada, desactivando IA para ${phoneUser}`);
            try {
              await this.disableAIForUser(phoneUser, conn, company);
              console.log(`🔴 IA desactivada automáticamente para ${phoneUser} después de transferencia`);
            } catch (disableError) {
              console.error(`❌ Error desactivando IA para ${phoneUser}:`, disableError);
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
              await this.disableAIForUser(phoneUser, conn, company);
              console.log(`🔴 IA desactivada automáticamente para ${phoneUser} después de 3 intentos fallidos`);
              return "Disculpa, en este momento no puedo ayudarte como quisiera. Voy a pasar tu consulta a uno de mis compañeros que te podrá atender mejor. Te contactará en unos minutos.";
            } catch (disableError) {
              console.error(`❌ Error desactivando IA para ${phoneUser}:`, disableError);
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
        await this.disableAIForUser(phoneUser, conn, company);
        console.log(`🔴 IA desactivada automáticamente para ${phoneUser} debido a error`);
      } catch (disableError) {
        console.error(`❌ Error desactivando IA para ${phoneUser}:`, disableError);
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
        const { getWhatsappChatModel } = await import('../../models/whatsappChat.model');
        const WhatsappChat = getWhatsappChatModel(conn);
        await WhatsappChat.updateOne(
          { phone: phoneUser },
          { $set: { botActive: false } },
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
  private async getChatHistory(phoneUser: string, conn: Connection): Promise<any[]> {
    try {
      const WhatsappChat = getWhatsappChatModel(conn);
      const chatHistory = await WhatsappChat.findOne({ phone: phoneUser });
      
      if (!chatHistory || !chatHistory.messages) {
        return [];
      }

      return chatHistory.messages.map((message: any) => ({
        role: message.direction === "inbound" ? "user" : "assistant",
        content: this.cleanMessageContent(message.body || ''),
        timestamp: message.timestamp
      }));
    } catch (error) {
      console.error('❌ Error getting chat history:', error);
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