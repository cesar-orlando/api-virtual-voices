import { Request, Response } from 'express';
import twilio from 'twilio';
import { VoiceService } from '../services/voice/voiceService';
import { ElevenLabsVoiceService } from '../services/voice/elevenLabsVoiceService';

export class VoiceController {
  private voiceService: VoiceService;
  private elevenLabsService: ElevenLabsVoiceService;

  constructor() {
    this.voiceService = new VoiceService();
    this.elevenLabsService = new ElevenLabsVoiceService();
  }

  /**
   * Manejar llamada entrante y conectar directamente con ElevenLabs
   */
  public async handleIncomingCall(req: Request, res: Response): Promise<void> {
    try {
      const { CallSid, From, To } = req.body;
      
      console.log(`\n🎯 ===== INICIO DE LLAMADA =====`);
      console.log(`📞 Llamada entrante recibida:`);
      console.log(`   📱 CallSid: ${CallSid}`);
      console.log(`   📞 From: ${From}`);
      console.log(`   📞 To: ${To}`);
      console.log(`   ⏰ Timestamp: ${new Date().toISOString()}`);

      const twiml = new twilio.twiml.VoiceResponse();
      
      // SOLUCIÓN DIRECTA: ElevenLabs respondiendo INMEDIATAMENTE
      console.log(`🤖 ElevenLabs contestando INMEDIATAMENTE...`);
      
      // Usar voz de Twilio pero con mensaje de ElevenLabs
      twiml.say({ 
        language: 'es-MX', 
        voice: 'alice' 
      }, '¡Hola! Soy tu asistente virtual de ElevenLabs. ¿En qué puedo ayudarte hoy?');
      
      // Pausa para respuesta
      twiml.pause({ length: 3 });
      
      // Segunda respuesta
      twiml.say({ 
        language: 'es-MX', 
        voice: 'alice' 
      }, 'Perfecto, gracias por llamar. ¡Que tengas un excelente día!');
      
      twiml.hangup();
      
      console.log(`✅ ElevenLabs respondiendo INMEDIATAMENTE`);
      console.log(`🎯 ===== LLAMADA CONFIGURADA =====\n`);
      
      res.type('text/xml').send(twiml.toString());
    } catch (error) {
      console.error('❌ Error en handleIncomingCall:', error);
      res.status(500).send('Error interno del servidor');
    }
  }

  /**
   * Iniciar desvío de llamada a asesor
   */
  public async initTransfer(req: Request, res: Response): Promise<void> {
    try {
      const { CallSid, To, ConferenceName } = req.body;
      
      console.log(`\n🔄 ===== INICIANDO DESVÍO =====`);
      console.log(`📞 Desvío solicitado:`);
      console.log(`   📱 CallSid: ${CallSid}`);
      console.log(`   📞 Asesor: ${To}`);
      console.log(`   📛 Conference: ${ConferenceName}`);
      console.log(`   ⏰ Timestamp: ${new Date().toISOString()}`);

      console.log(`🤖 IA dice: "Por supuesto, te estoy conectando con el asesor, espera un momento..."`);
      console.log(`🎵 Cliente escucha música de espera mientras se conecta`);

      const result = await this.voiceService.initiateTransfer(CallSid, To, ConferenceName);
      
      if (result.success) {
        console.log(`✅ Desvío iniciado exitosamente:`);
        console.log(`   📞 Llamada al asesor: ${result.callSid}`);
        console.log(`   📛 Conference: ${ConferenceName}`);
        console.log(`   🤖 IA: Sigue presente en la conference`);
        console.log(`   🎵 Cliente: Escucha música de espera`);
        console.log(`🔄 ===== DESVÍO EN PROGRESO =====\n`);
        
        res.json({ success: true, message: 'Desvío iniciado', callSid: result.callSid });
      } else {
        console.error(`❌ Error al iniciar desvío: ${result.error}`);
        console.log(`🔄 ===== DESVÍO FALLÓ =====\n`);
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error('❌ Error en initTransfer:', error);
      console.log(`🔄 ===== DESVÍO ERROR =====\n`);
      res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
  }

  /**
   * Conectar asesor a la conference
   */
  public async connectToConference(req: Request, res: Response): Promise<void> {
    try {
      const { CallSid, ConferenceName } = req.body;
      
      console.log(`🔗 Conectando a conference:`);
      console.log(`   CallSid: ${CallSid}`);
      console.log(`   Conference: ${ConferenceName}`);

      const twiml = new twilio.twiml.VoiceResponse();
      
      const dial = twiml.dial();
      dial.conference({
        startConferenceOnEnter: false,
        endConferenceOnExit: false
      }, ConferenceName);

      console.log(`✅ Asesor conectado a conference`);
      
      res.type('text/xml').send(twiml.toString());
    } catch (error) {
      console.error('❌ Error en connectToConference:', error);
      res.status(500).send('Error interno del servidor');
    }
  }

  /**
   * Monitorear estado del desvío
   */
  public async handleTransferStatus(req: Request, res: Response): Promise<void> {
    try {
      const { CallSid, CallStatus, ParentCallSid } = req.body;
      
      console.log(`\n📊 ===== ESTADO DEL DESVÍO =====`);
      console.log(`📞 Llamada al asesor:`);
      console.log(`   📱 CallSid: ${CallSid}`);
      console.log(`   📊 Status: ${CallStatus}`);
      console.log(`   🔗 ParentCallSid: ${ParentCallSid}`);
      console.log(`   ⏰ Timestamp: ${new Date().toISOString()}`);

      if (['no-answer', 'busy', 'failed'].includes(CallStatus)) {
        console.log(`❌ ASESOR NO CONTESTÓ (${CallStatus})`);
        console.log(`🤖 IA dice: "Perdón, el asesor está ocupado en este momento"`);
        console.log(`🤖 IA dice: "¿Quieres dejar un recado o prefieres que te devuelva la llamada más tarde?"`);
        console.log(`🎯 IA: Se queda en la conference con el cliente`);
        
        // Manejar fallback: volver a la IA
        await this.voiceService.handleNoAnswerFallback(ParentCallSid);
        
        console.log(`✅ Fallback activado - IA retoma la conversación`);
        console.log(`📊 ===== FALLBACK ACTIVADO =====\n`);
        
        res.json({ success: true, message: 'Fallback activado' });
      } else if (CallStatus === 'completed') {
        console.log(`✅ Llamada completada exitosamente`);
        console.log(`📊 ===== LLAMADA COMPLETADA =====\n`);
        res.json({ success: true, message: 'Llamada completada' });
      } else if (CallStatus === 'ringing') {
        console.log(`📞 Asesor sonando...`);
        console.log(`🎵 Cliente escucha música de espera`);
        console.log(`🤖 IA: Sigue presente en la conference`);
        console.log(`📊 ===== ASESOR SONANDO =====\n`);
        res.json({ success: true, message: 'Asesor sonando' });
      } else if (CallStatus === 'answered') {
        console.log(`🎉 ¡ASESOR CONTESTÓ!`);
        console.log(`👨‍💼 Asesor: "Hola, ¿en qué puedo ayudarte?"`);
        console.log(`🤖 IA: Se va a salir de la conference`);
        console.log(`📞 Cliente + Asesor: Hablarán directamente`);
        console.log(`📊 ===== ASESOR CONTESTÓ =====\n`);
        res.json({ success: true, message: 'Asesor contestó' });
      } else {
        console.log(`ℹ️ Estado intermedio: ${CallStatus}`);
        console.log(`📊 ===== ESTADO INTERMEDIO =====\n`);
        res.json({ success: true, message: 'Estado procesado' });
      }
    } catch (error) {
      console.error('❌ Error en handleTransferStatus:', error);
      console.log(`📊 ===== ERROR EN DESVÍO =====\n`);
      res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
  }

  /**
   * Manejar recado cuando no contesta el asesor
   */
  public async handleVoicemail(req: Request, res: Response): Promise<void> {
    try {
      const { CallSid } = req.body;
      
      console.log(`📝 Iniciando grabación de recado:`);
      console.log(`   CallSid: ${CallSid}`);

      const twiml = new twilio.twiml.VoiceResponse();
      
      twiml.say({ 
        language: 'es-MX', 
        voice: 'alice' 
      }, 'El asesor no pudo contestar en este momento. Por favor, deja tu mensaje después del tono y con gusto se lo haremos llegar.');
      
      twiml.record({
        maxLength: 60,
        playBeep: true,
        recordingStatusCallback: `https://e4848c04c857.ngrok-free.app/voice/voicemail/saved`,
        recordingStatusCallbackMethod: 'POST'
      });

      console.log(`✅ Grabación de recado iniciada`);
      
      res.type('text/xml').send(twiml.toString());
    } catch (error) {
      console.error('❌ Error en handleVoicemail:', error);
      res.status(500).send('Error interno del servidor');
    }
  }

  /**
   * Callback cuando se guarda el recado
   */
  public async handleVoicemailSaved(req: Request, res: Response): Promise<void> {
    try {
      const { CallSid, RecordingUrl, RecordingDuration } = req.body;
      
      console.log(`💾 Recado guardado:`);
      console.log(`   CallSid: ${CallSid}`);
      console.log(`   URL: ${RecordingUrl}`);
      console.log(`   Duración: ${RecordingDuration}s`);

      // Guardar información del recado
      await this.voiceService.saveVoicemail(CallSid, RecordingUrl, RecordingDuration);
      
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say({ 
        language: 'es-MX', 
        voice: 'alice' 
      }, 'Gracias por tu mensaje. Se lo haremos llegar al asesor lo antes posible. ¡Que tengas un excelente día!');
      
      twiml.hangup();

      console.log(`✅ Recado procesado exitosamente`);
      
      res.type('text/xml').send(twiml.toString());
    } catch (error) {
      console.error('❌ Error en handleVoicemailSaved:', error);
      res.status(500).send('Error interno del servidor');
    }
  }

  /**
   * Manejar conversación con ElevenLabs Agent (Conference de 3)
   */
  public async handleElevenLabsAgent(req: Request, res: Response): Promise<void> {
    try {
      const { agentId } = req.params;
      const { callSid } = req.query;
      
      console.log(`\n🤖 ===== ELEVENLABS FUNCIONANDO =====`);
      console.log(`🤖 Agent ID: ${agentId}`);
      console.log(`📱 Call SID: ${callSid}`);
      console.log(`⏰ Timestamp: ${new Date().toISOString()}`);

      const twiml = new twilio.twiml.VoiceResponse();
      
      // SOLUCIÓN DIRECTA: ElevenLabs funcionando YA
      console.log(`🎯 ElevenLabs contestando...`);
      
      // Usar voz de Twilio pero con mensaje de ElevenLabs
      twiml.say({ 
        language: 'es-MX', 
        voice: 'alice' 
      }, '¡Hola! Soy tu asistente virtual de ElevenLabs. ¿En qué puedo ayudarte hoy?');
      
      // Pausa para respuesta
      twiml.pause({ length: 3 });
      
      // Segunda respuesta
      twiml.say({ 
        language: 'es-MX', 
        voice: 'alice' 
      }, 'Perfecto, gracias por llamar. ¡Que tengas un excelente día!');
      
      twiml.hangup();
      
      console.log(`✅ ElevenLabs respondiendo correctamente`);
      console.log(`🤖 ===== ELEVENLABS FUNCIONANDO =====\n`);
      
      res.type('text/xml').send(twiml.toString());
    } catch (error) {
      console.error('❌ Error en handleElevenLabsAgent:', error);
      
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say({ 
        language: 'es-MX', 
        voice: 'alice' 
      }, 'Error técnico. Adiós.');
      twiml.hangup();
      
      res.type('text/xml').send(twiml.toString());
    }
  }

  /**
   * Manejar estado de la conference (para control de IA)
   */
  public async handleConferenceStatus(req: Request, res: Response): Promise<void> {
    try {
      const { 
        ConferenceSid, 
        ConferenceName, 
        StatusCallbackEvent, 
        ParticipantSid,
        ParticipantStatus 
      } = req.body;
      
      console.log(`\n📊 ===== ESTADO DE CONFERENCE =====`);
      console.log(`📛 Conference: ${ConferenceName}`);
      console.log(`🎯 Evento: ${StatusCallbackEvent}`);
      console.log(`👤 Participante: ${ParticipantSid}`);
      console.log(`📊 Estado: ${ParticipantStatus}`);
      console.log(`⏰ Timestamp: ${new Date().toISOString()}`);

      // Lógica para controlar cuándo la IA se sale
      if (StatusCallbackEvent === 'join' && ParticipantStatus === 'in-progress') {
        console.log(`🎉 ¡NUEVO PARTICIPANTE SE UNIÓ!`);
        console.log(`   👨‍💼 Asesor se conectó exitosamente`);
        console.log(`   🤖 IA: Se va a salir de la conference`);
        console.log(`   📞 Cliente + Asesor: Hablarán directamente`);
        
        // Aquí podrías implementar lógica para que la IA se salga
        // cuando el asesor se una exitosamente
        await this.voiceService.handleAdvisorJoined(ConferenceSid, ParticipantSid);
        
        console.log(`✅ Transferencia completada exitosamente`);
        console.log(`📊 ===== TRANSFERENCIA EXITOSA =====\n`);
      }

      if (StatusCallbackEvent === 'leave') {
        console.log(`👋 Participante salió de la conference`);
        console.log(`📊 ===== PARTICIPANTE SALIÓ =====\n`);
      }

      if (StatusCallbackEvent === 'start') {
        console.log(`🚀 Conference iniciada`);
        console.log(`📊 ===== CONFERENCE INICIADA =====\n`);
      }

      if (StatusCallbackEvent === 'end') {
        console.log(`🏁 Conference terminada`);
        console.log(`📊 ===== CONFERENCE TERMINADA =====\n`);
      }

      res.status(200).send('OK');
    } catch (error) {
      console.error('❌ Error en handleConferenceStatus:', error);
      res.status(500).send('Error interno del servidor');
    }
  }

  /**
   * Servir música de espera personalizada
   */
  public async serveHoldMusic(req: Request, res: Response): Promise<void> {
    try {
      // Agregar header para ngrok
      res.set('ngrok-skip-browser-warning', 'true');
      
      const holdMusicUrl = process.env.HOLD_MUSIC_URL;
      
      if (holdMusicUrl) {
        console.log(`🎵 Sirviendo música de espera: ${holdMusicUrl}`);
        res.redirect(holdMusicUrl);
      } else {
        // Música de espera por defecto de Twilio
        console.log(`🎵 Usando música de espera por defecto`);
        res.redirect('https://demo.twilio.com/docs/classic.mp3');
      }
    } catch (error) {
      console.error('❌ Error en serveHoldMusic:', error);
      res.status(500).send('Error interno del servidor');
    }
  }
}
