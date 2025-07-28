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
          return response;
        } catch (error) {
          console.error(`❌ Error en intento ${attempt}/3 para ${company}:`, error);
          
          if (attempt === 3) {
            console.log(`⚠️ Todos los intentos fallaron, usando sistema de fallback`);
            // Try fallback to old system
            try {
              return await this.fallbackToOldSystem(company, message, phoneUser, conn, chatHistory);
            } catch (fallbackError) {
              console.error(`❌ Fallback también falló:`, fallbackError);
              throw error; // Throw original error
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
      console.error(`❌ Error stack:`, error.stack);
      
      // Disable AI for this user when error occurs
      try {
        await this.disableAIForUser(phoneUser, conn, company);
        console.log(`🔴 IA desactivada automáticamente para ${phoneUser} debido a error`);
      } catch (disableError) {
        console.error(`❌ Error desactivando IA para ${phoneUser}:`, disableError);
      }
      
      // Fallback response (professional, no mention of technical error)
      return "Un asesor especializado se pondrá en contacto contigo en breve para ayudarte con tu consulta.";
    }
  }

  /**
   * Fallback to old system when new agents fail
   */
  private async fallbackToOldSystem(company: string, message: string, phoneUser: string, conn: Connection, chatHistory: any[]): Promise<string> {
    // console.log(`🔄 Usando sistema de fallback para ${company}`);
    
    try {
      if (company === 'quicklearning') {
        // Use QuickLearning old system
        const { quickLearningOpenAIService } = await import('../quicklearning/openaiService');
        return await quickLearningOpenAIService.generateResponse(message, phoneUser);
      } else {
        // For other companies, provide a basic response and transfer to advisor
        // console.log(`📞 Fallback: Transfiriendo a asesor para ${company}`);
        
        // Basic professional response for other companies
        const responses = {
          'grupokg': 'Gracias por contactarnos. Un asesor especializado en bienes raíces se pondrá en contacto contigo en breve para ayudarte con tu consulta sobre propiedades.',
          'grupo-milkasa': 'Gracias por contactarnos. Un asesor especializado en propiedades se pondrá en contacto contigo en breve para ayudarte con tu consulta inmobiliaria.',
          'britanicomx': 'Gracias por contactarnos al Colegio Británico. Un asesor educativo se pondrá en contacto contigo en breve para ayudarte con información sobre nuestros programas académicos.'
        };
        
        return responses[company as keyof typeof responses] || 
               'Gracias por contactarnos. Un asesor especializado se pondrá en contacto contigo en breve para ayudarte con tu consulta.';
      }
    } catch (fallbackError) {
      console.error(`❌ Error en fallback para ${company}:`, fallbackError);
      // Last resort: professional transfer message
      return 'Gracias por contactarnos. Un asesor especializado se pondrá en contacto contigo en breve para ayudarte con tu consulta.';
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
          { $set: { aiEnabled: false } },
          { upsert: true }
        );
      }
    } catch (error) {
      console.error(`❌ Error disabling AI for ${phoneUser}:`, error);
      throw error;
    }
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
        content: message.body,
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