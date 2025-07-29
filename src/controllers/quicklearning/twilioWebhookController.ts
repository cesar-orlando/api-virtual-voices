import { Request, Response } from 'express';
import { WhatsAppAgentService } from '../../services/agents/WhatsAppAgentService';
import { getDbConnection } from '../../config/connectionManager';
import getRecordModel from '../../models/record.model';
import getTableModel from '../../models/table.model';
import getIaConfigModel from '../../models/iaConfig.model';

export class TwilioWebhookController {
  private agentService: WhatsAppAgentService;

  constructor() {
    this.agentService = new WhatsAppAgentService();
  }

  /**
   * Webhook endpoint for Twilio WhatsApp messages
   */
  public async handleWebhook(req: Request, res: Response) {
    try {
      const { 
        Body: message, 
        From: from, 
        To: to,
        MessageSid: messageSid 
      } = req.body;

      console.log('📱 Twilio Webhook received:');
      console.log(`   From: ${from}`);
      console.log(`   To: ${to}`);
      console.log(`   Message: "${message}"`);
      console.log(`   MessageSid: ${messageSid}`);

      if (!message || !from) {
        console.log('❌ Missing required fields');
        return res.status(400).send('Missing required fields');
      }

      // Extract company from the 'to' number or use default
      const company = this.extractCompanyFromNumber(to) || 'quicklearning';
      
      // Clean phone number
      const cleanPhone = this.cleanPhoneNumber(from);

      console.log(`🏢 Processing for company: ${company}`);
      console.log(`📱 Clean phone: ${cleanPhone}`);

      // Get database connection
      const conn = await getDbConnection(company);

      // Ensure prospectos table exists
      await this.ensureProspectosTable(conn, company);

      // Create or get user record
      const userRecord = await this.getOrCreateUserRecord(conn, company, cleanPhone);

      const config = await getIaConfigModel(conn).findOne();

      // Process message with new agent system
      const response = await this.agentService.processWhatsAppMessage(
        company,
        message,
        cleanPhone,
        config?._id.toString(),
        conn
      );

      console.log(`✅ Agent response: ${response}`);

      // Return TwiML response
      const twimlResponse = this.generateTwiMLResponse(response);
      
      res.set('Content-Type', 'text/xml');
      res.send(twimlResponse);

    } catch (error) {
      console.error('❌ Error in Twilio webhook:', error);
      
      // Return error response
      const errorResponse = this.generateTwiMLResponse(
        'Disculpa, hubo un problema técnico. Un asesor se pondrá en contacto contigo para ayudarte.'
      );
      
      res.set('Content-Type', 'text/xml');
      res.status(500).send(errorResponse);
    }
  }

  /**
   * Extract company from phone number
   */
  private extractCompanyFromNumber(to: string): string | null {
    // You can implement logic to extract company from the 'to' number
    // For now, return default
    return 'quicklearning';
  }

  /**
   * Clean phone number format
   */
  private cleanPhoneNumber(phone: string): string {
    // Remove whatsapp: prefix and clean
    return phone.replace('whatsapp:', '').replace(/[^\d]/g, '');
  }

  /**
   * Ensure prospectos table exists
   */
  private async ensureProspectosTable(conn: any, company: string) {
    try {
      const Table = getTableModel(conn);
      
      const existingTable = await Table.findOne({ 
        slug: "prospectos", 
        c_name: company 
      });

      if (!existingTable) {
        const newTable = new Table({
          name: "Prospectos",
          slug: "prospectos",
          icon: "👤",
          c_name: company,
          createdBy: 'twilio-webhook',
          fields: [
            { name: "name", label: "Nombre", type: "text", order: 1 },
            { name: "number", label: "Número", type: "number", order: 2 },
            { name: "ia", label: "IA", type: "boolean", order: 3 }
          ]
        });
        await newTable.save();
        console.log(`✅ Tabla "prospectos" creada para ${company}`);
      }
    } catch (error) {
      console.error('❌ Error ensuring prospectos table:', error);
    }
  }

  /**
   * Get or create user record
   */
  private async getOrCreateUserRecord(conn: any, company: string, phone: string) {
    try {
      const Record = getRecordModel(conn);
      
      let existingRecord = await Record.findOne({ 
        "data.number": phone, 
        c_name: company 
      });

      if (!existingRecord) {
        existingRecord = new Record({
          c_name: company,
          data: {
            name: "Cliente WhatsApp",
            number: phone,
            ia: true
          },
          createdBy: 'twilio-webhook'
        });
        await existingRecord.save();
        console.log(`✅ Nuevo registro creado para ${phone} en ${company}`);
      }

      return existingRecord;
    } catch (error) {
      console.error('❌ Error getting/creating user record:', error);
      return null;
    }
  }

  /**
   * Generate TwiML response
   */
  private generateTwiMLResponse(message: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>${this.escapeXml(message)}</Message>
</Response>`;
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Health check endpoint
   */
  public healthCheck(req: Request, res: Response) {
    res.json({
      status: 'ok',
      service: 'Twilio Webhook Controller',
      timestamp: new Date().toISOString(),
      features: {
        newAgentSystem: true,
        quickLearning: true,
        multiCompany: true
      }
    });
  }
} 