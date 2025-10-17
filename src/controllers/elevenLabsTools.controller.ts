/**
 * 🔧 ELEVENLABS TOOLS CONTROLLER
 * Maneja webhooks de tools llamadas por ElevenLabs Conversational AI
 */

import { Request, Response } from 'express';
import twilio from 'twilio';

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export class ElevenLabsToolsController {
  
  /**
   * Tool: Transferir llamada a asesor
   * 
   * Intenta transferir la llamada a un asesor específico.
   * Si no contesta, regresa control a ElevenLabs para que continúe.
   */
  public async transferToAdvisor(req: Request, res: Response): Promise<void> {
    try {
      console.log('\n🔧 ===== TOOL LLAMADA: transfer_to_advisor =====');
      console.log('Body:', JSON.stringify(req.body, null, 2));
      
      const { 
        advisor_name,
        call_sid,
        conversation_id 
      } = req.body;

      // Validar solo advisor_name (lo único que el usuario debe proporcionar)
      if (!advisor_name) {
        res.status(400).json({
          success: false,
          message: 'Necesito saber el nombre del asesor',
          continue_conversation: true
        });
        return;
      }

      console.log(`📞 Intentando transferir a: ${advisor_name}`);
      if (call_sid) {
        console.log(`📱 Call SID: ${call_sid}`);
      } else {
        console.log(`⚠️ No se recibió call_sid (ElevenLabs lo puede enviar automáticamente)`);
      }

      // Obtener número del asesor/departamento según motivo
      const advisorInfo = await this.getAdvisorPhone(advisor_name);
      
      if (!advisorInfo.phone) {
        console.log(`❌ No se pudo determinar número para: "${advisor_name}"`);
        
        res.json({
          success: false,
          message: `No pude identificar con quién deseas hablar. ¿Podrías ser más específico?`,
          advisor_available: false,
          continue_conversation: true
        });
        return;
      }

      console.log(`📲 Número identificado: ${advisorInfo.phone}`);
      if (advisorInfo.description) {
        console.log(`📋 Departamento: ${advisorInfo.description}`);
      }

      // Usar el mensaje personalizado si está disponible
      const customMessage = advisorInfo.message || 
        `Estoy intentando comunicarte con un asesor. Por favor espera un momento.`;

      // Intentar transferir con timeout
      const transferResult = await this.attemptTransfer(
        call_sid || 'UNKNOWN',
        advisorInfo.phone,
        advisorInfo.description || advisor_name
      );

      if (transferResult.success) {
        console.log(`✅ Asesor contestó, pero aún no sabemos si acepta`);
        
        res.json({
          success: false, // Decimos "false" para que NO cuelgue todavía
          message: customMessage,
          advisor_available: false, // Todavía no está confirmado
          continue_conversation: true, // ✅ MANTENER AL CLIENTE EN LÍNEA
          status: 'calling_advisor',
          department: advisorInfo.description
        });
      } else {
        console.log(`❌ Asesor no disponible`);
        
        res.json({
          success: false,
          message: `En este momento no hay asesores disponibles`,
          advisor_available: false,
          continue_conversation: true // ElevenLabs ofrece dejar recado
        });
      }

    } catch (error) {
      console.error('❌ Error en transfer_to_advisor:', error);
      
      res.status(500).json({
        success: false,
        message: 'Error interno al transferir',
        continue_conversation: true
      });
    }
  }

  /**
   * Tool: Tomar recado/mensaje de voz
   * 
   * Guarda un recado para el asesor y envía notificación.
   */
  public async takeVoicemail(req: Request, res: Response): Promise<void> {
    try {
      console.log('\n📧 ===== TOOL LLAMADA: take_voicemail =====');
      console.log('Body:', JSON.stringify(req.body, null, 2));
      
      const {
        advisor_name,
        client_name, // Cambiado de caller_name para consistencia con ElevenLabs
        caller_name, // Mantener compatibilidad
        caller_phone,
        message,
        conversation_id
      } = req.body;

      // Validar solo los parámetros que el usuario debe proporcionar
      if (!advisor_name || !message) {
        res.status(400).json({
          success: false,
          message: 'Necesito saber para quién es el recado y qué mensaje quieres dejar',
          continue_conversation: true
        });
        return;
      }

      const finalClientName = client_name || caller_name || 'Cliente';

      console.log(`📝 Guardando recado para: ${advisor_name}`);
      console.log(`👤 De: ${finalClientName} (${caller_phone || 'sin número'})`);
      console.log(`💬 Mensaje: ${message}`);

      // Guardar recado en base de datos
      await this.saveVoicemail({
        advisorName: advisor_name,
        callerName: finalClientName,
        callerPhone: caller_phone || 'No proporcionado',
        message: message,
        conversationId: conversation_id || 'UNKNOWN',
        timestamp: new Date()
      });

      // Enviar notificación al asesor (WhatsApp, email, etc.)
      await this.notifyAdvisor(advisor_name, {
        from: finalClientName,
        phone: caller_phone || 'No proporcionado',
        message: message
      });

      console.log(`✅ Recado guardado y notificación enviada`);

      res.json({
        success: true,
        message: `Recado guardado para ${advisor_name}`,
        voicemail_saved: true,
        continue_conversation: true // ElevenLabs confirma y se despide
      });

    } catch (error) {
      console.error('❌ Error en take_voicemail:', error);
      
      res.status(500).json({
        success: false,
        message: 'Error guardando el recado',
        continue_conversation: true
      });
    }
  }

  /**
   * Configuración de transferencias por motivo/departamento
   * TODO: Mover a base de datos por compañía
   */
  private getTransferConfig() {
    return {
      // Número por defecto
      default: '+523131068685',
      
      // Mapeo de motivos/intenciones a números específicos
      motivos: {
        'visita': {
          phone: '+523131068685',
          description: 'Asesor tapatío especializado en visitas',
          message: 'Con mucho gusto, coordino su visita con un asesor tapatío especializado.'
        },
        'foto': {
          phone: '+523131068685',
          description: 'Asesor tapatío especializado en visitas',
          message: 'Con mucho gusto, coordino su visita con un asesor tapatío especializado.'
        },
        'comision': {
          phone: '+523319444737',
          description: 'Lic. Paz Gómez - Colaboraciones',
          message: 'Permítame conectarle con la Lic. Paz Gómez para platicar de colaboraciones.'
        },
        'broker': {
          phone: '+523319444737',
          description: 'Lic. Paz Gómez - Colaboraciones',
          message: 'Permítame conectarle con la Lic. Paz Gómez para platicar de colaboraciones.'
        },
        'empleo': {
          phone: '+523331222882',
          description: 'Recursos Humanos',
          message: 'Con gusto le transfiero al área de recursos humanos.'
        },
        'trabajo': {
          phone: '+523331222882',
          description: 'Recursos Humanos',
          message: 'Con gusto le transfiero al área de recursos humanos.'
        },
        'queja': {
          phone: '+523131068685',
          description: 'Asesor especializado',
          message: 'Para darle la mejor atención, le conecto con un asesor especializado.'
        },
        'duda': {
          phone: '+523131068685',
          description: 'Asesor especializado',
          message: 'Para darle la mejor atención, le conecto con un asesor especializado.'
        },
        'general': {
          phone: '+523131068685',
          description: 'Asesor general',
          message: 'Con mucho gusto le conecto con un asesor.'
        },
        'marcos': {
          phone: '+523359800808',
          description: 'Asesor general',
          message: 'Con mucho gusto le conecto con un asesor.'
        }
      }
    };
  }

  /**
   * Obtener número de teléfono del asesor según motivo o nombre
   */
  private async getAdvisorPhone(advisorNameOrReason: string): Promise<{
    phone: string | null;
    message?: string;
    description?: string;
  }> {
    try {
      const config = this.getTransferConfig();
      const normalized = this.normalizeAdvisorName(advisorNameOrReason);
      
      console.log(`🔍 Buscando contacto: "${advisorNameOrReason}" → normalizado: "${normalized}"`);
      
      // 1. Buscar por motivo/intención
      if (config.motivos[normalized]) {
        const motivo = config.motivos[normalized];
        console.log(`✅ Motivo encontrado: ${normalized} → ${motivo.phone} (${motivo.description})`);
        return {
          phone: motivo.phone,
          message: motivo.message,
          description: motivo.description
        };
      }
      
      // 2. Buscar palabras clave en el texto
      const keywords = {
        'visita': ['visita', 'ver', 'conocer', 'foto', 'propiedad'],
        'comision': ['comision', 'broker', 'colaboracion', 'trabajar', 'inmobiliaria'],
        'empleo': ['empleo', 'trabajo', 'vacante', 'contratar', 'recursos humanos'],
        'queja': ['queja', 'problema', 'inconveniente', 'molestia'],
        'duda': ['duda', 'pregunta', 'informacion', 'ayuda']
      };
      
      for (const [motivo, palabras] of Object.entries(keywords)) {
        if (palabras.some(palabra => normalized.includes(palabra))) {
          const motivoConfig = config.motivos[motivo];
          console.log(`✅ Palabra clave detectada (${motivo}): ${motivoConfig.phone}`);
          return {
            phone: motivoConfig.phone,
            message: motivoConfig.message,
            description: motivoConfig.description
          };
        }
      }
      
      // 3. Usar número por defecto
      console.log(`ℹ️ No se encontró motivo específico, usando número por defecto: ${config.default}`);
      return {
        phone: config.default,
        message: 'Con mucho gusto le conecto con un asesor.',
        description: 'Asesor general'
      };

    } catch (error) {
      console.error('Error obteniendo teléfono del asesor:', error);
      return { phone: null };
    }
  }
  
  /**
   * Normalizar nombre del asesor (quitar tildes, minúsculas)
   */
  private normalizeAdvisorName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .normalize('NFD') // Descomponer caracteres con tildes
      .replace(/[\u0300-\u036f]/g, '') // Quitar tildes
      .replace(/[^a-z0-9]/g, ''); // Quitar caracteres especiales
  }

  /**
   * Obtener número de Twilio verificado
   * 
   * Prioridad:
   * 1. Variable de entorno (si está en formato correcto)
   * 2. Números verificados conocidos
   */
  private getTwilioPhoneNumber(): string {
    const envNumber = '+523359800808'; //process.env.TWILIO_PHONE_NUMBER;
    
    // Números verificados conocidos (de mayor a menor prioridad)
    const verifiedNumbers = [
      '+523359800808', // Número principal ACTUAL: +52 33 5980 0808
      '+523341610750',
      '+523341659889',
      '+19096718416',
      '+523341610749'
    ];
    
    // Si hay número en .env y empieza con +52 (formato correcto)
    if (envNumber && envNumber.startsWith('+52') && !envNumber.startsWith('+521')) {
      console.log(`📱 Usando número de .env: ${envNumber}`);
      return envNumber;
    }
    
    // Si el número en .env tiene formato incorrecto (+521), corregirlo
    if (envNumber && envNumber.startsWith('+521')) {
      const corrected = envNumber.replace('+521', '+52');
      console.log(`⚠️ Número corregido: ${envNumber} → ${corrected}`);
      
      // Verificar si el número corregido está en la lista de verificados
      if (verifiedNumbers.includes(corrected)) {
        return corrected;
      }
    }
    
    // Fallback: usar el primer número verificado
    const fallbackNumber = verifiedNumbers[0];
    console.log(`📱 Usando número verificado por defecto: ${fallbackNumber}`);
    return fallbackNumber;
  }

  /**
   * Intentar transferir llamada con timeout
   * 
   * NOTA: Como ElevenLabs maneja la llamada directamente, no podemos
   * hacer una transferencia tradicional. En su lugar, hacemos que el
   * asesor llame al cliente de vuelta.
   */
  private async attemptTransfer(
    callSid: string,
    advisorPhone: string,
    advisorName: string
  ): Promise<{ success: boolean; reason?: string }> {
    try {
      console.log(`🔄 Iniciando "callback" del asesor...`);
      console.log(`📞 Call SID recibido: ${callSid}`);

      // Como ElevenLabs controla la llamada, haremos que el asesor 
      // reciba una notificación para llamar al cliente

      // Obtener info de la llamada original (si está disponible)
      let clientPhone = 'desconocido';
      try {
        // Intentar obtener datos de la llamada desde Twilio
        // Nota: Esto puede fallar si ElevenLabs maneja todo
        const callInfo = await twilioClient.calls(callSid).fetch();
        clientPhone = callInfo.from;
        console.log(`📱 Número del cliente: ${clientPhone}`);
      } catch (error) {
        console.log(`⚠️ No se pudo obtener info de la llamada (esperado si ElevenLabs la maneja)`);
      }

      // OPCIÓN A: Llamar al asesor para notificarle
      console.log(`📞 Llamando a ${advisorName} para notificar...`);
      
      // Obtener número de Twilio verificado
      const twilioNumber = this.getTwilioPhoneNumber();
      
      const advisorCall = await twilioClient.calls.create({
        from: twilioNumber,
        to: advisorPhone,
        timeout: 30, // 30 segundos para contestar (aumentado de 15)
        twiml: `<Response>
          <Say language="es-MX" voice="Polly.Miguel">
            Hola ${advisorName}, tienes una llamada entrante. 
            El cliente está en línea con la asistente virtual. 
            Presiona 1 para conectarte ahora, o presiona 2 si no estás disponible.
          </Say>
          <Gather 
            numDigits="1" 
            timeout="10"
            action="${process.env.PUBLIC_URL}/api/elevenlabs-tools/advisor-response"
          >
            <Say language="es-MX" voice="Polly.Miguel">
              Presiona 1 para conectar, o 2 si no estás disponible.
            </Say>
          </Gather>
          <Say language="es-MX" voice="Polly.Miguel">
            No recibimos respuesta. Marcaremos como no disponible.
          </Say>
        </Response>`
      });

      console.log(`📞 Llamando al asesor... Call SID: ${advisorCall.sid}`);

      // Esperar y hacer polling del estado (máximo 35 segundos)
      const maxWaitTime = 35; // segundos
      const pollInterval = 2; // verificar cada 2 segundos
      let elapsedTime = 0;
      
      console.log(`⏳ Esperando respuesta del asesor (máximo ${maxWaitTime}s)...`);

      while (elapsedTime < maxWaitTime) {
        await this.waitForSeconds(pollInterval);
        elapsedTime += pollInterval;

        const callStatus = await twilioClient.calls(advisorCall.sid).fetch();
        console.log(`📊 [${elapsedTime}s] Estado: ${callStatus.status}`);

        if (callStatus.status === 'in-progress') {
          // El asesor contestó la llamada
          console.log(`✅ Asesor contestó después de ${elapsedTime}s`);
          return { 
            success: true
          };
        } else if (callStatus.status === 'completed') {
          // Llamada terminada (rechazó, no contestó, o presionó algo)
          console.log(`📞 Llamada completada después de ${elapsedTime}s`);
          // Consideramos como "no disponible" si completó antes de in-progress
          return { 
            success: false, 
            reason: `${advisorName} no contestó` 
          };
        } else if (callStatus.status === 'busy' || callStatus.status === 'failed') {
          console.log(`❌ Llamada ${callStatus.status} después de ${elapsedTime}s`);
          return { 
            success: false, 
            reason: `${advisorName} está ocupado` 
          };
        } else if (callStatus.status === 'no-answer') {
          console.log(`❌ No contestó después de ${elapsedTime}s`);
          return { 
            success: false, 
            reason: `${advisorName} no contestó` 
          };
        }
        
        // Si sigue en "queued" o "ringing", continuar esperando
        if (callStatus.status === 'queued') {
          console.log(`   ⏳ Aún en cola...`);
        } else if (callStatus.status === 'ringing') {
          console.log(`   📞 Sonando...`);
        }
      }

      // Timeout: no contestó en el tiempo esperado
      console.log(`⏰ Timeout después de ${maxWaitTime}s - asesor no disponible`);
      return { 
        success: false, 
        reason: `${advisorName} no está disponible` 
      };

    } catch (error) {
      console.error('Error en attemptTransfer:', error);
      return { 
        success: false, 
        reason: error instanceof Error ? error.message : 'Error desconocido' 
      };
    }
  }
  
  /**
   * Manejar respuesta del asesor (presionó 1 o 2)
   */
  public async advisorResponse(req: Request, res: Response): Promise<void> {
    try {
      const digit = req.body.Digits;
      const callSid = req.body.CallSid;
      
      console.log(`🔢 Asesor presionó: ${digit}`);
      
      const twiml = new twilio.twiml.VoiceResponse();
      
      if (digit === '1') {
        // Asesor acepta la llamada
        twiml.say({ language: 'es-MX', voice: 'Polly.Miguel' }, 
          'Perfecto, conectando con el cliente. Por favor espera un momento.');
        
        // TODO: Aquí conectaríamos con la llamada del cliente
        // Por ahora solo confirmamos
        
        res.type('text/xml').send(twiml.toString());
      } else {
        // Asesor no está disponible
        twiml.say({ language: 'es-MX', voice: 'Polly.Miguel' }, 
          'Entendido, marcaremos como no disponible. Gracias.');
        twiml.hangup();
        
        res.type('text/xml').send(twiml.toString());
      }
      
    } catch (error) {
      console.error('Error en advisorResponse:', error);
      res.sendStatus(500);
    }
  }

  /**
   * Guardar recado en base de datos
   */
  private async saveVoicemail(data: {
    advisorName: string;
    callerName: string;
    callerPhone: string;
    message: string;
    conversationId: string;
    timestamp: Date;
  }): Promise<void> {
    try {
      // TODO: Implementar guardado en base de datos
      console.log('💾 Guardando recado:', data);
      
      // Por ahora solo log
      // En producción: guardar en MongoDB, crear notificación, etc.
      
    } catch (error) {
      console.error('Error guardando recado:', error);
      throw error;
    }
  }

  /**
   * Notificar al asesor del recado
   */
  private async notifyAdvisor(advisorName: string, message: {
    from: string;
    phone: string;
    message: string;
  }): Promise<void> {
    try {
      console.log(`📬 Notificando a ${advisorName}...`);
      
      // TODO: Implementar notificación (WhatsApp, SMS, Email, etc.)
      // Por ahora solo log
      
    } catch (error) {
      console.error('Error notificando asesor:', error);
      // No lanzar error, la notificación es secundaria
    }
  }

  /**
   * Callback de estado de conferencia
   */
  public async conferenceStatus(req: Request, res: Response): Promise<void> {
    try {
      console.log('\n📊 Conference Status:', req.body);
      res.sendStatus(200);
    } catch (error) {
      console.error('Error en conference status:', error);
      res.sendStatus(500);
    }
  }

  /**
   * Utilidad: Esperar X segundos
   */
  private waitForSeconds(seconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }
}

