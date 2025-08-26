import { Request, Response } from 'express';
import { MessagingAgentService } from '../../services/agents/MessagingAgentService';
import { getDbConnection } from '../../config/connectionManager';
import getIaConfigModel from '../../models/iaConfig.model';

export class TwilioTestController {
  private agentService: MessagingAgentService;

  constructor() {
    this.agentService = new MessagingAgentService();
  }

  /**
   * Test endpoint for the new BaseAgent system
   */
  public async testAgentSystem(req: Request, res: Response) {
    try {
      const { message, company = 'quicklearning', companySlug, phone = '1234567890', chatHistory = [] } = req.body;
      
      // Usar companySlug si está disponible, sino usar company, sino usar default
      const actualCompany = companySlug || company || 'quicklearning';

      if (!message) {
        return res.status(400).json({
          success: false,
          error: 'Message is required'
        });
      }

      console.log(`🧪 Testing BaseAgent system for ${actualCompany}`);
      console.log(`📝 Message: "${message}"`);
      console.log(`📱 Phone: ${phone}`);
      console.log(`📚 Chat History: ${chatHistory.length} messages`);

      const startTime = Date.now();

      // Get database connection
      const conn = await getDbConnection(actualCompany);

      const config = await getIaConfigModel(conn).findOne();

      // Process message with new agent system
      const response = await this.agentService.processWhatsAppMessage(
        actualCompany,
        message,
        phone,
        conn,
        config?._id.toString(),
        config?.name,
        chatHistory,
      );

      const responseTime = Date.now() - startTime;

      console.log(`✅ Agent response: ${response}`);
      console.log(`⏱️ Response time: ${responseTime}ms`);

      return res.json({
        success: true,
        data: {
          company: actualCompany,
          phone,
          userMessage: message,
          agentResponse: response,
          responseTime,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('❌ Error in testAgentSystem:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }

  /**
   * Test multiple messages
   */
  public async testMultipleMessages(req: Request, res: Response) {
    try {
      const { messages, company = 'quicklearning', phone = '1234567890' } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({
          success: false,
          error: 'Messages array is required'
        });
      }

      console.log(`🧪 Testing multiple messages for ${company}`);
      console.log(`📝 Messages: ${messages.length}`);

      // Get database connection
      const conn = await getDbConnection(company);

      const results = [];

      const config = await getIaConfigModel(conn).findOne();

      for (const message of messages) {
        const startTime = Date.now();
        
        try {
          const response = await this.agentService.processWhatsAppMessage(
            company,
            message,
            phone,
            conn,
            config?._id.toString(),
            undefined, // sessionId not available in test
            undefined, // providedChatHistory
          );

          const responseTime = Date.now() - startTime;

          results.push({
            userMessage: message,
            agentResponse: response,
            responseTime,
            success: true
          });
        } catch (error) {
          results.push({
            userMessage: message,
            agentResponse: `Error: ${error.message}`,
            responseTime: 0,
            success: false
          });
        }
      }

      return res.json({
        success: true,
        data: {
          company,
          phone,
          results,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('❌ Error in testMultipleMessages:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }

  /**
   * Health check endpoint
   */
  public async healthCheck(req: Request, res: Response) {
    return res.json({
      success: true,
      message: 'BaseAgent system is running',
      timestamp: new Date().toISOString()
    });
  }
} 