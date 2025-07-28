import twilio from "twilio";
import { getEnvironmentConfig } from "../../config/environments";
import { getProjectConfig } from "../../shared/projectManager";

// Configuración de Twilio
const envConfig = getEnvironmentConfig();
const client = twilio(envConfig.twilio.accountSid, envConfig.twilio.authToken);

// Interfaz para mensajes de Twilio
export interface TwilioMessage {
  to: string;
  body: string;
  from?: string;
  mediaUrl?: string[];
}

// Interfaz para mensajes de template
export interface TwilioTemplateMessage {
  to: string;
  templateId: string;
  variables: string[];
  from?: string;
}

// Interfaz para respuesta de Twilio
export interface TwilioResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  data?: any;
}

/**
 * Servicio principal de Twilio para Quick Learning
 */
export class TwilioService {
  private static instance: TwilioService;
  private readonly client: twilio.Twilio;
  private readonly defaultPhoneNumber: string;

  private constructor() {
    this.client = client;
    this.defaultPhoneNumber = envConfig.twilio.phoneNumber;
    
    // Validar configuración al inicializar
    this.validateConfig();
  }

  /**
   * Obtener instancia singleton del servicio
   */
  public static getInstance(): TwilioService {
    if (!TwilioService.instance) {
      TwilioService.instance = new TwilioService();
    }
    return TwilioService.instance;
  }

  /**
   * Validar configuración de Twilio
   */
  private validateConfig(): void {
    if (!envConfig.twilio.accountSid || !envConfig.twilio.authToken) {
      throw new Error("❌ Twilio credentials are not configured properly");
    }
    
    if (!this.defaultPhoneNumber) {
      console.warn("⚠️ Warning: Twilio phone number not configured");
    }

    console.log("✅ Twilio service initialized successfully");
  }

  /**
   * Enviar mensaje de texto simple
   */
  public async sendMessage(messageData: TwilioMessage): Promise<TwilioResponse> {
    try {
      // Validar número de teléfono
      if (!this.isValidPhoneNumber(messageData.to)) {
        throw new Error(`Invalid phone number format: ${messageData.to}`);
      }

      // Configurar el mensaje
      const messageOptions: any = {
        body: messageData.body,
        from: `whatsapp:${messageData.from || this.defaultPhoneNumber}`,
        to: `whatsapp:${this.formatPhoneNumber(messageData.to)}`
      };

      // Agregar media si existe
      if (messageData.mediaUrl && messageData.mediaUrl.length > 0) {
        messageOptions.mediaUrl = messageData.mediaUrl;
      }

      // Enviar mensaje
      const message = await this.client.messages.create(messageOptions);

      // console.log(`📱 De: ${messageOptions.from} → Para: ${messageOptions.to}`);
      
      return {
        success: true,
        messageId: message.sid,
        data: message
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Error al enviar mensaje:", errorMessage);
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Enviar mensaje con template/plantilla aprobada
   */
  public async sendTemplateMessage(templateData: TwilioTemplateMessage): Promise<TwilioResponse> {
    try {
      // Validar número de teléfono
      if (!this.isValidPhoneNumber(templateData.to)) {
        throw new Error(`Invalid phone number format: ${templateData.to}`);
      }

      // Preparar variables del template
      const contentVariables = templateData.variables.reduce((acc, val, i) => {
        acc[(i + 1).toString()] = val;
        return acc;
      }, {} as Record<string, string>);

      // Configurar el mensaje de template
      const messageOptions = {
        to: `whatsapp:${this.formatPhoneNumber(templateData.to)}`,
        from: `whatsapp:${templateData.from || this.defaultPhoneNumber}`,
        contentSid: templateData.templateId,
        contentVariables: JSON.stringify(contentVariables)
      };

      // Enviar mensaje
      const message = await this.client.messages.create(messageOptions);

      console.log(`✅ Template enviado exitosamente: ${message.sid}`);
      console.log(`📋 Template ID: ${templateData.templateId}`);
      console.log(`📱 De: ${messageOptions.from} → Para: ${messageOptions.to}`);
      
      return {
        success: true,
        messageId: message.sid,
        data: message
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Error al enviar template:", errorMessage);
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Validar webhook de Twilio
   */
  public validateWebhook(signature: string, url: string, params: any): boolean {
    try {
      return twilio.validateRequest(
        envConfig.twilio.authToken,
        signature,
        url,
        params
      );
    } catch (error) {
      console.error("❌ Error validating webhook:", error);
      return false;
    }
  }

  /**
   * Formatear número de teléfono para WhatsApp
   */
  private formatPhoneNumber(phone: string): string {
    // Remover espacios, guiones y paréntesis
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');
    
    // Si no empieza con +, agregarlo
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }
    
    return cleaned;
  }

  /**
   * Validar formato de número de teléfono
   */
  private isValidPhoneNumber(phone: string): boolean {
    // Validar que tenga al menos 10 dígitos
    const cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
    return /^\d{10,15}$/.test(cleaned);
  }

  /**
   * Obtener información del número de Twilio
   */
  public async getPhoneNumberInfo(): Promise<any> {
    try {
      const phoneNumbers = await this.client.incomingPhoneNumbers.list({
        phoneNumber: this.defaultPhoneNumber
      });
      
      return phoneNumbers;
    } catch (error) {
      console.error("❌ Error getting phone number info:", error);
      throw error;
    }
  }

  /**
   * Obtener historial de mensajes
   */
  public async getMessageHistory(limit: number = 50): Promise<any[]> {
    try {
      const messages = await this.client.messages.list({
        limit: limit,
        from: `whatsapp:${this.defaultPhoneNumber}`
      });
      
      return messages;
    } catch (error) {
      console.error("❌ Error getting message history:", error);
      throw error;
    }
  }

  /**
   * Obtener todos los mensajes (entrantes y salientes)
   */
  public async getAllMessages(limit: number = 1000): Promise<any[]> {
    try {
      const messages = await this.client.messages.list({
        limit: limit
      });
      
      return messages;
    } catch (error) {
      console.error("❌ Error getting all messages:", error);
      throw error;
    }
  }

  /**
   * Verificar estado del servicio Twilio
   */
  public async checkServiceStatus(): Promise<{ status: string; phoneNumber: string; accountSid: string }> {
    try {
      const account = await this.client.api.accounts(envConfig.twilio.accountSid).fetch();
      
      return {
        status: account.status,
        phoneNumber: this.defaultPhoneNumber,
        accountSid: envConfig.twilio.accountSid
      };
    } catch (error) {
      console.error("❌ Error checking service status:", error);
      throw error;
    }
  }
}

// Exportar instancia singleton
export const twilioService = TwilioService.getInstance();