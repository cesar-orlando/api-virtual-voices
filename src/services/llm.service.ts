import { openai } from '../config/openai';

/**
 * 🤖 SERVICIO UNIVERSAL DE LLM
 * Soporta múltiples proveedores: OpenAI, Anthropic, Google, Meta
 */

export type LLMProvider = 'openai' | 'anthropic' | 'google' | 'meta';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
  provider: LLMProvider;
}

export interface LLMOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
}

export class LLMService {
  constructor() {
    // Servicio listo para múltiples proveedores
    // Por ahora solo OpenAI está activo
  }

  /**
   * Genera respuesta usando el proveedor especificado
   */
  async generate(
    provider: LLMProvider,
    messages: LLMMessage[],
    options: LLMOptions = {}
  ): Promise<LLMResponse> {
    switch (provider) {
      case 'openai':
        return this.generateOpenAI(messages, options);
      case 'anthropic':
        return this.generateAnthropic(messages, options);
      case 'google':
        return this.generateGoogle(messages, options);
      case 'meta':
        return this.generateMeta(messages, options);
      default:
        throw new Error(`Proveedor LLM no soportado: ${provider}`);
    }
  }

  /**
   * Genera respuesta con OpenAI
   */
  private async generateOpenAI(
    messages: LLMMessage[],
    options: LLMOptions
  ): Promise<LLMResponse> {
    try {
      const completion = await openai.chat.completions.create({
        model: options.model || process.env.CHAT_MODEL || 'gpt-4o-mini',
        messages: messages as any[],
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature ?? 0.7,
        top_p: options.topP ?? 1.0
      });

      return {
        content: completion.choices[0].message.content || 'Sin respuesta',
        model: completion.model,
        tokens: {
          prompt: completion.usage?.prompt_tokens || 0,
          completion: completion.usage?.completion_tokens || 0,
          total: completion.usage?.total_tokens || 0
        },
        provider: 'openai'
      };
    } catch (error: any) {
      console.error('Error en OpenAI:', error);
      throw new Error(`OpenAI error: ${error.message}`);
    }
  }

  /**
   * Genera respuesta con Anthropic (Claude)
   */
  private async generateAnthropic(
    messages: LLMMessage[],
    options: LLMOptions
  ): Promise<LLMResponse> {
    throw new Error('Anthropic no está configurado. Por favor instala @anthropic-ai/sdk y configura ANTHROPIC_API_KEY.');
  }

  /**
   * Genera respuesta con Google (Gemini)
   */
  private async generateGoogle(
    messages: LLMMessage[],
    options: LLMOptions
  ): Promise<LLMResponse> {
    // TODO: Implementar Google Gemini cuando esté disponible
    throw new Error('Google Gemini aún no implementado. Próximamente disponible.');
  }

  /**
   * Genera respuesta con Meta (Llama)
   */
  private async generateMeta(
    messages: LLMMessage[],
    options: LLMOptions
  ): Promise<LLMResponse> {
    // TODO: Implementar Meta Llama cuando esté disponible
    throw new Error('Meta Llama aún no implementado. Próximamente disponible.');
  }

  /**
   * Obtiene modelos disponibles para un proveedor
   */
  getAvailableModels(provider: LLMProvider): string[] {
    const models = {
      openai: [
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-4-turbo',
        'gpt-4',
        'gpt-3.5-turbo'
      ],
      anthropic: [
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307'
      ],
      google: [
        'gemini-2.0-flash-exp',
        'gemini-1.5-pro',
        'gemini-1.5-flash'
      ],
      meta: [
        'llama-3.3-70b',
        'llama-3.1-405b',
        'llama-3.1-70b',
        'llama-3.1-8b'
      ]
    };

    return models[provider] || [];
  }

  /**
   * Valida si un modelo está disponible para un proveedor
   */
  isModelAvailable(provider: LLMProvider, model: string): boolean {
    const available = this.getAvailableModels(provider);
    return available.includes(model);
  }

  /**
   * Obtiene el modelo por defecto para un proveedor
   */
  getDefaultModel(provider: LLMProvider): string {
    const defaults = {
      openai: 'gpt-4o-mini',
      anthropic: 'claude-3-5-sonnet-20241022',
      google: 'gemini-2.0-flash-exp',
      meta: 'llama-3.3-70b'
    };

    return defaults[provider];
  }
}
