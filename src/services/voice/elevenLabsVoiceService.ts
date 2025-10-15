import axios from 'axios';
import fs from 'fs';
import path from 'path';

export interface ElevenLabsVoiceConfig {
  agentId: string;
  apiKey: string;
  baseUrl: string;
}

export class ElevenLabsVoiceService {
  private config: ElevenLabsVoiceConfig;

  constructor() {
    this.config = {
      agentId: process.env.ELEVENLABS_AGENT_ID || 'agent_2601k3v42778eq09zsrzqhd68erx',
      apiKey: process.env.ELEVENLABS_API_KEY || 'sk_f553ba40c02f3ef062f505e1697d72ab1d8031661b903b71',
      baseUrl: process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io/v1'
    };

    if (!this.config.apiKey) {
      console.warn('⚠️ ELEVENLABS_API_KEY no configurado');
    }
  }

  /**
   * Crear conversación con ElevenLabs Agent
   */
  public async createConversation(callSid: string): Promise<any> {
    try {
      console.log(`🤖 Creando conversación con ElevenLabs Agent: ${this.config.agentId}`);
      
      const response = await axios.post(
        `${this.config.baseUrl}/agents/${this.config.agentId}/conversations`,
        {
          agent_id: this.config.agentId,
          call_sid: callSid,
          metadata: {
            call_sid: callSid,
            source: 'twilio_voice'
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`✅ Conversación creada: ${response.data.conversation_id}`);
      return response.data;
    } catch (error) {
      console.error('❌ Error al crear conversación con ElevenLabs:', error);
      throw error;
    }
  }

  /**
   * Obtener información del agente
   */
  public async getAgentInfo(): Promise<any> {
    try {
      const response = await axios.get(
        `${this.config.baseUrl}/agents/${this.config.agentId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('❌ Error al obtener información del agente:', error);
      throw error;
    }
  }

  /**
   * Manejar transferencia a asesor
   */
  public async handleTransferRequest(conversationId: string, advisorNumber: string): Promise<any> {
    try {
      console.log(`🔄 Procesando solicitud de transferencia a: ${advisorNumber}`);
      
      // Aquí podrías implementar lógica adicional como:
      // - Notificar al agente que se está transfiriendo
      // - Guardar el contexto de la conversación
      // - Preparar el desvío
      
      return {
        success: true,
        message: 'Transferencia iniciada',
        advisorNumber
      };
    } catch (error) {
      console.error('❌ Error al manejar transferencia:', error);
      throw error;
    }
  }

  /**
   * Manejar fallback cuando no contesta el asesor
   */
  public async handleNoAnswerFallback(conversationId: string): Promise<any> {
    try {
      console.log(`🔄 Activando fallback para conversación: ${conversationId}`);
      
      // Aquí podrías implementar:
      // - Reanudar la conversación con el agente
      // - Ofrecer opciones alternativas
      // - Programar callback
      
      return {
        success: true,
        message: 'Fallback activado',
        options: ['dejar_recado', 'callback', 'continuar_con_ia']
      };
    } catch (error) {
      console.error('❌ Error al manejar fallback:', error);
      throw error;
    }
  }

  /**
   * Generar respuesta de voz usando ElevenLabs Voice API
   */
  public async generateVoiceResponse(text: string, agentId: string): Promise<{success: boolean, audioUrl?: string, error?: string}> {
    try {
      console.log(`🎯 Generando audio con ElevenLabs Voice API:`);
      console.log(`   📝 Texto: ${text}`);
      console.log(`   🆔 Agent ID: ${agentId}`);

      // Obtener el voice ID del agent
      const voiceId = await this.getAgentVoiceId(agentId);
      
      if (!voiceId) {
        return { success: false, error: 'Voice ID no encontrado para el agent' };
      }

      // Generar audio con ElevenLabs
      const audioResponse = await axios.post(
        `${this.config.baseUrl}/text-to-speech/${voiceId}`,
        {
          text: text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5
          }
        },
        {
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': this.config.apiKey
          },
          responseType: 'arraybuffer'
        }
      );

      // Guardar audio temporalmente
      const audioFileName = `elevenlabs_${Date.now()}.mp3`;
      const audioPath = path.join(__dirname, '../../temp_audio', audioFileName);
      
      // Crear directorio si no existe
      const tempDir = path.dirname(audioPath);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      fs.writeFileSync(audioPath, audioResponse.data);
      
      // URL pública para Twilio
      const audioUrl = `https://e4848c04c857.ngrok-free.app/voice/audio/${audioFileName}`;
      
      console.log(`✅ Audio generado exitosamente:`);
      console.log(`   📁 Archivo: ${audioPath}`);
      console.log(`   🔗 URL: ${audioUrl}`);
      
      return { success: true, audioUrl };
      
    } catch (error) {
      console.error('❌ Error generando audio con ElevenLabs:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtener Voice ID del agent
   */
  private async getAgentVoiceId(agentId: string): Promise<string | null> {
    try {
      const response = await axios.get(
        `${this.config.baseUrl}/agents/${agentId}`,
        {
          headers: {
            'xi-api-key': this.config.apiKey
          }
        }
      );
      
      return response.data.voice_id || null;
    } catch (error) {
      console.error('❌ Error obteniendo Voice ID:', error);
      return null;
    }
  }
}
