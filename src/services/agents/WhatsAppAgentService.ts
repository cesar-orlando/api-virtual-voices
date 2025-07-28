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
      console.log(`🤖 Processing WhatsApp message for ${company} - ${phoneUser}`);
      
      // Use provided chat history or get from database
      let chatHistory: any[];
      if (providedChatHistory && providedChatHistory.length > 0) {
        console.log(`📚 Using provided chat history: ${providedChatHistory.length} messages`);
        chatHistory = providedChatHistory;
      } else {
        console.log(`📚 Getting chat history from database for ${phoneUser}`);
        chatHistory = await this.getChatHistory(phoneUser, conn);
      }
      
      // Process with agent
      console.log(`🤖 Calling agentManager.processMessage for ${company}`);
      try {
        const response = await this.agentManager.processMessage(company, message, {
          phoneUser,
          chatHistory,
          company
        });
        console.log(`🤖 Agent response received: ${response.substring(0, 50)}...`);
        return response;
      } catch (error) {
        console.error(`❌ Error in agentManager.processMessage for ${company}:`, error);
        throw error;
      }
    } catch (error) {
      console.error(`❌ Error in WhatsAppAgentService for ${company}:`, error);
      console.error(`❌ Error details:`, error.message);
      console.error(`❌ Error stack:`, error.stack);
      
      // Fallback response
      return "Disculpa, hubo un problema técnico. Un asesor se pondrá en contacto contigo para ayudarte.";
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