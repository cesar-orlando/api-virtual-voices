import { Request, Response } from 'express';
import { MessagingAgentService } from '../../services/agents/MessagingAgentService';
import { getDbConnection } from '../../config/connectionManager';
import getRecordModel from '../../models/record.model';
import getTableModel from '../../models/table.model';
import getIaConfigModel from '../../models/iaConfig.model';

export class TwilioWebhookController {
  private agentService: MessagingAgentService;

  constructor() {
    this.agentService = new MessagingAgentService();
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
      const campaign = this.detectCampaign(message);
      const userRecord = await this.getOrCreateUserRecord(conn, company, cleanPhone, campaign);

      console.log(`🎯 Campaign detected: ${campaign}`);

      const config = await getIaConfigModel(conn).findOne();

      // Process message with new agent system
      const response = await this.agentService.processWhatsAppMessage(
        company,
        message,
        cleanPhone,
        conn,
        config?._id.toString(),
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
   * Detect campaign based on message content
   */
  private detectCampaign(message: string): string {
    const lowerCaseMessage = message.toLowerCase();
    
    // RMKT: Detectar remarketing - tiene "(r)" en el mensaje
    if (lowerCaseMessage.includes('(r)') || lowerCaseMessage.includes(' r)')) {
      return 'RMKT';
    }
    
    // VIRTUAL PROMOS: Detectar promos virtuales primero (más específico)
    if (lowerCaseMessage.includes('promo virtual')) {
      return 'VIRTUAL PROMOS';
    }
    
    // ONLINE PROMOS: Detectar promos online
    if (lowerCaseMessage.includes('promo online')) {
      return 'ONLINE PROMOS';
    }
    
    // PRESENCIAL: Detectar cursos presenciales
    if (lowerCaseMessage.includes('presencial')) {
      return 'PRESENCIAL';
    }
    
    // VIRTUAL: Detectar cursos virtuales (después de promos)
    if (lowerCaseMessage.includes('virtual')) {
      return 'VIRTUAL';
    }
    
    // ONLINE: Detectar cursos online (después de promos)
    if (lowerCaseMessage.includes('online')) {
      return 'ONLINE';
    }
    
    // GENERAL: Por defecto para cualquier mención de cursos de inglés
    if (lowerCaseMessage.includes('cursos') || 
        lowerCaseMessage.includes('inglés') || 
        lowerCaseMessage.includes('ingles') ||
        lowerCaseMessage.includes('información') ||
        lowerCaseMessage.includes('info')) {
      return 'GENERAL';
    }
    
    // Fallback a GENERAL si no coincide con nada específico
    return 'GENERAL';
  }

  /**
   * Ensure prospectos table exists
   */
  private async ensureProspectosTable(conn: any, company: string) {
    try {
      const Table = getTableModel(conn);
      
      let existingTable = await Table.findOne({ 
        slug: "prospectos", 
        c_name: company 
      });

      if (!existingTable) {
        // Crear nueva tabla con todos los campos
        const newTable = new Table({
          name: "Prospectos",
          slug: "prospectos",
          icon: "👤",
          c_name: company,
          createdBy: 'twilio-webhook',
          fields: [
            { name: "name", label: "Nombre", type: "text", order: 1 },
            { name: "number", label: "Número", type: "number", order: 2 },
            { name: "ia", label: "IA", type: "boolean", order: 3 },
            { name: "campana", label: "Campaña", type: "text", order: 4 }
          ]
        });
        await newTable.save();
        console.log(`✅ Tabla "prospectos" creada para ${company} con campo campaña`);
      } else {
        // Verificar si tiene el campo campaña, si no lo tiene, agregarlo
        const hasCampanaField = existingTable.fields.some((field: any) => field.name === 'campana');
        
        if (!hasCampanaField) {
          existingTable.fields.push({
            name: "campana", 
            label: "Campaña", 
            type: "text", 
            order: existingTable.fields.length + 1
          });
          await existingTable.save();
          console.log(`✅ Campo "campaña" agregado a tabla prospectos existente para ${company}`);
        }
      }
    } catch (error) {
      console.error('❌ Error ensuring prospectos table:', error);
    }
  }

  /**
   * Get or create user record
   */
  private async getOrCreateUserRecord(conn: any, company: string, phone: string, campaign: string) {
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
            ia: true,
            campana: campaign
          },
          createdBy: 'twilio-webhook'
        });
        await existingRecord.save();
        console.log(`✅ Nuevo registro creado para ${phone} en ${company} con campaña: ${campaign}`);
      } else {
        // Si ya existe pero no tiene campaña, actualizarla
        if (!existingRecord.data.campana) {
          existingRecord.data.campana = campaign;
          await existingRecord.save();
          console.log(`✅ Campaña actualizada para ${phone}: ${campaign}`);
        }
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