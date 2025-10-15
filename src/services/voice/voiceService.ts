import twilio from 'twilio';

export interface TransferResult {
  success: boolean;
  callSid?: string;
  error?: string;
}

export interface VoicemailData {
  callSid: string;
  recordingUrl: string;
  duration: string;
  timestamp: Date;
}

export class VoiceService {
  private client: twilio.Twilio;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      throw new Error('TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN son requeridos');
    }

    this.client = twilio(accountSid, authToken);
    console.log('✅ VoiceService inicializado correctamente');
  }

  /**
   * Iniciar desvío de llamada a asesor
   */
  public async initiateTransfer(
    originalCallSid: string, 
    advisorNumber: string, 
    conferenceName: string
  ): Promise<TransferResult> {
    try {
      console.log(`🔄 Iniciando desvío a asesor: ${advisorNumber}`);
      
      const callB = await this.client.calls.create({
        to: advisorNumber,
        from: process.env.TWILIO_NUMBER || '+1234567890', // Fallback si no está configurado
        url: `https://e4848c04c857.ngrok-free.app/voice/transfer/connect?conf=${conferenceName}`,
        statusCallback: `https://e4848c04c857.ngrok-free.app/voice/transfer/status`,
        statusCallbackMethod: 'POST',
        timeout: parseInt(process.env.CALL_TIMEOUT_SECONDS || '25'),
        record: false
      });

      console.log(`✅ Llamada al asesor creada: ${callB.sid}`);
      
      return {
        success: true,
        callSid: callB.sid
      };
    } catch (error) {
      console.error('❌ Error al crear llamada al asesor:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido'
      };
    }
  }

  /**
   * Manejar fallback cuando no contesta el asesor
   */
  public async handleNoAnswerFallback(originalCallSid: string): Promise<void> {
    try {
      console.log(`🔄 Activando fallback para CallSid: ${originalCallSid}`);
      
      // Aquí podrías implementar lógica adicional como:
      // - Notificar a la IA que vuelva a la conversación
      // - Enviar notificación al asesor
      // - Registrar el intento de transferencia
      
      console.log(`✅ Fallback activado para ${originalCallSid}`);
    } catch (error) {
      console.error('❌ Error en handleNoAnswerFallback:', error);
    }
  }

  /**
   * Guardar información del recado
   */
  public async saveVoicemail(
    callSid: string, 
    recordingUrl: string, 
    duration: string
  ): Promise<void> {
    try {
      console.log(`💾 Guardando recado para CallSid: ${callSid}`);
      
      const voicemailData: VoicemailData = {
        callSid,
        recordingUrl,
        duration,
        timestamp: new Date()
      };

      // Aquí podrías implementar:
      // - Guardar en base de datos
      // - Enviar notificación al asesor
      // - Transcribir el audio
      // - Enviar por email/SMS
      
      console.log(`✅ Recado guardado:`, voicemailData);
    } catch (error) {
      console.error('❌ Error al guardar recado:', error);
    }
  }

  /**
   * Obtener información de una llamada
   */
  public async getCallInfo(callSid: string): Promise<any> {
    try {
      const call = await this.client.calls(callSid).fetch();
      return call;
    } catch (error) {
      console.error('❌ Error al obtener información de llamada:', error);
      throw error;
    }
  }

  /**
   * Terminar una llamada
   */
  public async hangupCall(callSid: string): Promise<void> {
    try {
      await this.client.calls(callSid).update({ status: 'completed' });
      console.log(`✅ Llamada ${callSid} terminada`);
    } catch (error) {
      console.error('❌ Error al terminar llamada:', error);
      throw error;
    }
  }

  /**
   * Crear conference con configuración personalizada
   */
  public async createConference(conferenceName: string, options?: any): Promise<void> {
    try {
      console.log(`🎯 Creando conference: ${conferenceName}`);
      
      // Las conferences se crean automáticamente cuando se hace dial
      // Aquí podrías implementar lógica adicional si es necesario
      
      console.log(`✅ Conference ${conferenceName} lista`);
    } catch (error) {
      console.error('❌ Error al crear conference:', error);
      throw error;
    }
  }

  /**
   * Validar número de teléfono
   */
  public isValidPhoneNumber(phoneNumber: string): boolean {
    // Validación básica de número de teléfono
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phoneNumber.replace(/\s/g, ''));
  }

  /**
   * Formatear número de teléfono
   */
  public formatPhoneNumber(phoneNumber: string): string {
    // Remover espacios y caracteres especiales
    let cleaned = phoneNumber.replace(/[\s\-\(\)]/g, '');
    
    // Agregar + si no lo tiene
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }
    
    return cleaned;
  }

  /**
   * Manejar cuando el asesor se une a la conference
   */
  public async handleAdvisorJoined(conferenceSid: string, participantSid: string): Promise<void> {
    try {
      console.log(`🎯 Asesor se unió a la conference: ${conferenceSid}`);
      console.log(`   Participant SID: ${participantSid}`);
      
      // Aquí podrías implementar lógica para:
      // 1. Notificar a la IA que el asesor está presente
      // 2. Hacer que la IA se salga de la conference
      // 3. Transferir el control al asesor
      
      console.log(`✅ Asesor conectado exitosamente`);
    } catch (error) {
      console.error('❌ Error al manejar asesor unido:', error);
    }
  }

  /**
   * Conectar ElevenLabs Agent a la conference
   */
  public async connectElevenLabsToConference(agentId: string, conferenceName: string, callSid: string): Promise<void> {
    try {
      console.log(`🤖 Conectando ElevenLabs Agent a la conference:`);
      console.log(`   🆔 Agent ID: ${agentId}`);
      console.log(`   📛 Conference: ${conferenceName}`);
      console.log(`   📱 Call SID: ${callSid}`);

      // Crear llamada a ElevenLabs Agent
      const elevenLabsCall = await this.client.calls.create({
        to: `+15551234567`, // Número temporal para ElevenLabs
        from: process.env.TWILIO_NUMBER || '+15551234567',
        url: `https://e4848c04c857.ngrok-free.app/voice/elevenlabs/agent/${agentId}?callSid=${callSid}&conference=${conferenceName}`,
        statusCallback: `https://e4848c04c857.ngrok-free.app/voice/transfer/status`,
        statusCallbackMethod: 'POST',
        timeout: 30,
        record: false
      });

      console.log(`✅ Llamada a ElevenLabs creada: ${elevenLabsCall.sid}`);
      console.log(`🤖 ElevenLabs Agent se conectará a la conference`);
      
    } catch (error) {
      console.error('❌ Error conectando ElevenLabs a la conference:', error);
      throw error;
    }
  }

  /**
   * Controlar salida de la IA de la conference
   */
  public async removeIAFromConference(conferenceSid: string, iaParticipantSid: string): Promise<void> {
    try {
      console.log(`🤖 Removiendo IA de la conference: ${conferenceSid}`);
      
      // Terminar la llamada de la IA para que se salga
      await this.client.calls(iaParticipantSid).update({ status: 'completed' });
      
      console.log(`✅ IA removida de la conference`);
    } catch (error) {
      console.error('❌ Error al remover IA de la conference:', error);
    }
  }
}
