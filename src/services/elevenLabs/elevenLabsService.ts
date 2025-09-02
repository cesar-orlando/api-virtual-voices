import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { getEnvironmentConfig } from '../../config/environments';

export interface ElevenLabsAgentConfig {
  conversation_config: {
    initial_message?: string;
    prompt?: string;
    voice_id?: string;
    model_id?: string;
    temperature?: number;
    max_tokens?: number;
  };
  platform_settings?: {
    name?: string;
    tags?: string[];
  };
}

export class ElevenLabsService {
  private api: AxiosInstance;
  private baseUrl: string = 'https://api.elevenlabs.io/v1';

  constructor() {
    const config = getEnvironmentConfig();
    
    this.api = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'xi-api-key': config.elevenLabsApiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 segundos
    });

    // Interceptor para logging
    this.api.interceptors.request.use(
      (config) => {
        console.log(`🚀 ElevenLabs API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('❌ ElevenLabs API Request Error:', error);
        return Promise.reject(error);
      }
    );

    this.api.interceptors.response.use(
      (response) => {
        console.log(`✅ ElevenLabs API Response: ${response.status} ${response.statusText}`);
        return response;
      },
      (error) => {
        console.error('❌ ElevenLabs API Response Error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Crear un nuevo agent en ElevenLabs
   */
  async createAgent(config: ElevenLabsAgentConfig): Promise<{ agent_id: string }> {
    try {
      const response: AxiosResponse<{ agent_id: string }> = await this.api.post('/convai/agents/create', config);
      return response.data;
    } catch (error) {
      console.error('Error creating ElevenLabs agent:', error);
      throw new Error(`Failed to create ElevenLabs agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Obtener información de un agent
   */
  async getAgent(agentId: string): Promise<any> {
    try {
      const response = await this.api.get(`/convai/agents/${agentId}`);
      return response.data;
    } catch (error) {
      console.error('Error getting ElevenLabs agent:', error);
      throw new Error(`Failed to get ElevenLabs agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Listar todos los agents
   */
  async listAgents(): Promise<any[]> {
    try {
      const response = await this.api.get('/convai/agents');
      return response.data.agents || [];
    } catch (error) {
      console.error('Error listing ElevenLabs agents:', error);
      throw new Error(`Failed to list ElevenLabs agents: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Actualizar un agent
   */
  async updateAgent(agentId: string, config: Partial<ElevenLabsAgentConfig>): Promise<any> {
    try {
      const response = await this.api.patch(`/convai/agents/${agentId}`, config);
      return response.data;
    } catch (error) {
      console.error('Error updating ElevenLabs agent:', error);
      throw new Error(`Failed to update ElevenLabs agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Eliminar un agent
   */
  async deleteAgent(agentId: string): Promise<void> {
    try {
      await this.api.delete(`/convai/agents/${agentId}`);
    } catch (error) {
      console.error('Error deleting ElevenLabs agent:', error);
      throw new Error(`Failed to delete ElevenLabs agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Listar conversaciones
   */
  async listConversations(agentId?: string, limit: number = 50): Promise<any[]> {
    try {
      const params: any = { limit };
      if (agentId) params.agent_id = agentId;
      
      const response = await this.api.get('/convai/conversations', { params });
      return response.data.conversations || [];
    } catch (error) {
      console.error('Error listing ElevenLabs conversations:', error);
      throw new Error(`Failed to list ElevenLabs conversations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Obtener información de una conversación
   */
  async getConversation(conversationId: string): Promise<any> {
    try {
      const response = await this.api.get(`/convai/conversations/${conversationId}`);
      return response.data;
    } catch (error) {
      console.error('Error getting ElevenLabs conversation:', error);
      throw new Error(`Failed to get ElevenLabs conversation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Obtener audio de una conversación
   */
  async getConversationAudio(conversationId: string): Promise<any> {
    try {
      const response = await this.api.get(`/convai/conversations/${conversationId}/audio`, { responseType: 'arraybuffer' });
      return response.data;
    } catch (error) {
      console.error('Error getting ElevenLabs conversation audio:', error);
      throw new Error(`Failed to get ElevenLabs conversation audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generar prompt personalizado con información del cliente
   */
  generatePersonalizedPrompt(basePrompt: string, customerInfo: { name?: string; company?: string; context?: string }): string {
    let personalizedPrompt = basePrompt;

    if (customerInfo.name) {
      personalizedPrompt = personalizedPrompt.replace(
        /{{customer_name}}/g, 
        customerInfo.name
      );
    }

    if (customerInfo.company) {
      personalizedPrompt = personalizedPrompt.replace(
        /{{company_name}}/g, 
        customerInfo.company
      );
    }

    if (customerInfo.context) {
      personalizedPrompt = personalizedPrompt.replace(
        /{{context}}/g, 
        customerInfo.context
      );
    }

    // Agregar instrucciones para usar el nombre del cliente
    if (customerInfo.name) {
      personalizedPrompt += `\n\nIMPORTANTE: Usa el nombre "${customerInfo.name}" en tu saludo inicial y durante la conversación para hacerla más personal.`;
    }

    return personalizedPrompt;
  }
}

export default ElevenLabsService;
