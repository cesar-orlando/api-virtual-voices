import { Connection } from 'mongoose';
import { getWhatsappChatModel } from '../models/whatsappChat.model';
import getPromptVersionModel from '../models/promptVersion.model';
import { openai } from '../config/openai';

export interface PromptGenerationOptions {
  objective?: string;
  tone?: string;
  industry?: string;
  includeAnalysis?: boolean;
  maxChars?: number;
}

export interface ValidationResult {
  score: number;
  issues: string[];
}

export interface PromptAnalysis {
  totalChats: number;
  totalMessages: number;
  commonIntents: string[];
  avgResponseTime: number;
  successPatterns: string[];
}

export class PromptBuilderService {
  constructor() {
    // No necesita inicializar OpenAI, usa la instancia compartida
  }

  /**
   * Genera prompt desde chats existentes
   */
  async fromChats(
    connection: Connection,
    companySlug: string,
    options: PromptGenerationOptions = {}
  ): Promise<{ prompt: string; analysis: PromptAnalysis }> {
    try {
      // Analizar chats existentes
      const analysis = await this.analyzeChats(connection, companySlug);
      
      // Generar prompt basado en análisis
      const prompt = await this.generate(companySlug, options, analysis);
      
      return { prompt, analysis };
    } catch (error) {
      console.error('Error generating prompt from chats:', error);
      throw new Error('Failed to generate prompt from chats');
    }
  }

  /**
   * Genera prompt usando IA
   */
  async generate(
    companySlug: string,
    options: PromptGenerationOptions,
    analysis?: PromptAnalysis
  ): Promise<string> {
    try {
      const systemPrompt = this.buildGenerationSystemPrompt();
      const userPrompt = this.buildGenerationUserPrompt(companySlug, options, analysis);

      const response = await openai.chat.completions.create({
        model: process.env.CHAT_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 2000,
        temperature: 0.7
      });

      let prompt = response.choices[0].message.content || '';

      // Aplicar constraints de WhatsApp si es necesario
      if (options.maxChars && options.maxChars <= 1500) {
        prompt = this.applyWhatsAppConstraints(prompt, options.maxChars);
      }

      return prompt;
    } catch (error) {
      console.error('Error generating prompt:', error);
      throw new Error('Failed to generate prompt');
    }
  }

  /**
   * Valida calidad de un prompt
   */
  validate(prompt: string): ValidationResult {
    const issues: string[] = [];
    let score = 100;

    // Validaciones básicas
    if (prompt.length < 100) {
      issues.push('Prompt muy corto (menos de 100 caracteres)');
      score -= 20;
    }

    if (prompt.length > 4000) {
      issues.push('Prompt muy largo (más de 4000 caracteres)');
      score -= 15;
    }

    if (!prompt.includes('Eres') && !prompt.includes('You are')) {
      issues.push('Falta definición clara de identidad');
      score -= 15;
    }

    if (!prompt.toLowerCase().includes('objetivo') && !prompt.toLowerCase().includes('goal')) {
      issues.push('No se especifica objetivo claro');
      score -= 10;
    }

    // Validaciones de estructura
    const sections = ['identidad', 'objetivo', 'personalidad', 'reglas'];
    let foundSections = 0;
    
    sections.forEach(section => {
      if (prompt.toLowerCase().includes(section)) {
        foundSections++;
      }
    });

    if (foundSections < 2) {
      issues.push('Estructura incompleta (faltan secciones clave)');
      score -= 20;
    }

    // Validaciones específicas de WhatsApp
    if (prompt.includes('WhatsApp') || prompt.includes('whatsapp')) {
      if (!prompt.toLowerCase().includes('mensaje') && !prompt.toLowerCase().includes('chat')) {
        issues.push('Para WhatsApp, debe mencionar contexto de mensajería');
        score -= 5;
      }
    }

    return {
      score: Math.max(0, score),
      issues
    };
  }

  /**
   * Guarda versión de prompt
   */
  async saveVersion(
    connection: Connection,
    companySlug: string,
    personaId: string,
    prompt: string,
    createdBy: string,
    draft: boolean = true
  ): Promise<string> {
    try {
      const validation = this.validate(prompt);
      const PromptVersion = getPromptVersionModel(connection);

      const version = new PromptVersion({
        companySlug,
        personaId,
        prompt,
        score: validation.score,
        issues: validation.issues,
        draft,
        createdBy
      });

      await version.save();
      return version._id.toString();
    } catch (error) {
      console.error('Error saving prompt version:', error);
      throw new Error('Failed to save prompt version');
    }
  }

  /**
   * Publica versión de prompt (marca como no draft)
   */
  async publishVersion(
    connection: Connection,
    versionId: string,
    companySlug: string
  ): Promise<void> {
    try {
      const PromptVersion = getPromptVersionModel(connection);
      
      // Marcar versión como publicada
      await PromptVersion.updateOne(
        { _id: versionId, companySlug },
        { $set: { draft: false } }
      );

      console.log(`Prompt version ${versionId} published for ${companySlug}`);
    } catch (error) {
      console.error('Error publishing prompt version:', error);
      throw new Error('Failed to publish prompt version');
    }
  }

  /**
   * Analiza chats existentes para extraer patrones
   */
  private async analyzeChats(connection: Connection, companySlug: string): Promise<PromptAnalysis> {
    try {
      const WhatsappChat = getWhatsappChatModel(connection);
      
      // Obtener chats recientes
      const chats = await WhatsappChat.find({})
        .sort({ createdAt: -1 })
        .limit(50)
        .select('messages');

      let totalMessages = 0;
      const intents: string[] = [];
      const responseTimes: number[] = [];
      const patterns: string[] = [];

      chats.forEach(chat => {
        if (chat.messages && Array.isArray(chat.messages)) {
          totalMessages += chat.messages.length;
          
          // Extraer intents básicos
          chat.messages.forEach((msg: any) => {
            if (msg.body) {
              const body = msg.body.toLowerCase();
              if (body.includes('hola') || body.includes('buenos')) intents.push('greeting');
              if (body.includes('precio') || body.includes('costo')) intents.push('pricing');
              if (body.includes('horario') || body.includes('hora')) intents.push('schedule');
              if (body.includes('gracias') || body.includes('adiós')) intents.push('goodbye');
            }
          });

          // Calcular tiempo de respuesta promedio basado en mensajes
          if (chat.messages && chat.messages.length > 1) {
            const firstMsg = chat.messages[0];
            const lastMsg = chat.messages[chat.messages.length - 1];
            if (firstMsg.createdAt && lastMsg.createdAt) {
              const diff = (lastMsg.createdAt.getTime() - firstMsg.createdAt.getTime()) / 1000 / 60;
              responseTimes.push(Math.min(diff, 60)); // Cap at 60 minutes
            }
          }
        }
      });

      // Obtener intents más comunes
      const intentCounts = intents.reduce((acc: any, intent) => {
        acc[intent] = (acc[intent] || 0) + 1;
        return acc;
      }, {});

      const commonIntents = Object.entries(intentCounts)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .slice(0, 5)
        .map(([intent]) => intent);

      const avgResponseTime = responseTimes.length > 0 
        ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
        : 0;

      return {
        totalChats: chats.length,
        totalMessages,
        commonIntents,
        avgResponseTime: Math.round(avgResponseTime),
        successPatterns: ['Greeting handled', 'Information provided', 'Polite closure']
      };

    } catch (error) {
      console.error('Error analyzing chats:', error);
      // Return default analysis if error
      return {
        totalChats: 0,
        totalMessages: 0,
        commonIntents: ['greeting', 'information', 'goodbye'],
        avgResponseTime: 0,
        successPatterns: []
      };
    }
  }

  /**
   * Construye system prompt para generación
   */
  private buildGenerationSystemPrompt(): string {
    return `Eres un experto en crear prompts para asistentes virtuales de WhatsApp.

Tu trabajo es generar prompts profesionales, específicos y efectivos basados en:
- Análisis de conversaciones reales
- Objetivos del negocio
- Tono y personalidad deseada
- Mejores prácticas de WhatsApp

ESTRUCTURA REQUERIDA:
1. IDENTIDAD clara del asistente
2. OBJETIVO principal específico
3. PERSONALIDAD y tono
4. INFORMACIÓN CRÍTICA que debe conocer
5. REGLAS IMPORTANTES de comportamiento
6. CONTEXTO específico del negocio

Genera prompts concisos pero completos, optimizados para WhatsApp.`;
  }

  /**
   * Construye user prompt para generación
   */
  private buildGenerationUserPrompt(
    companySlug: string,
    options: PromptGenerationOptions,
    analysis?: PromptAnalysis
  ): string {
    let prompt = `Genera un prompt profesional para el asistente virtual de WhatsApp de: ${companySlug}\n\n`;

    if (options.objective) {
      prompt += `OBJETIVO: ${options.objective}\n`;
    }

    if (options.tone) {
      prompt += `TONO: ${options.tone}\n`;
    }

    if (options.industry) {
      prompt += `INDUSTRIA: ${options.industry}\n`;
    }

    if (analysis && options.includeAnalysis) {
      prompt += `\nANÁLISIS DE CONVERSACIONES REALES:\n`;
      prompt += `- Total de chats analizados: ${analysis.totalChats}\n`;
      prompt += `- Mensajes totales: ${analysis.totalMessages}\n`;
      prompt += `- Intenciones comunes: ${analysis.commonIntents.join(', ')}\n`;
      prompt += `- Tiempo promedio de respuesta: ${analysis.avgResponseTime} minutos\n`;
    }

    prompt += `\nGenera un prompt completo, profesional y específico para WhatsApp.`;

    return prompt;
  }

  /**
   * Aplica constraints específicos de WhatsApp
   */
  private applyWhatsAppConstraints(prompt: string, maxChars: number): string {
    if (prompt.length <= maxChars) {
      return prompt;
    }

    // Si es muy largo, segmentar en partes
    const parts = this.segmentPrompt(prompt, maxChars);
    
    if (parts.length > 1) {
      return parts.map((part, index) => 
        `${part}\n\n--- PARTE ${index + 1}/${parts.length} ---`
      ).join('\n\n');
    }

    return prompt.substring(0, maxChars - 3) + '...';
  }

  /**
   * Segmenta prompt en partes manejables
   */
  private segmentPrompt(prompt: string, maxChars: number): string[] {
    const sections = prompt.split('\n\n');
    const parts: string[] = [];
    let currentPart = '';

    sections.forEach(section => {
      if ((currentPart + section).length <= maxChars) {
        currentPart += (currentPart ? '\n\n' : '') + section;
      } else {
        if (currentPart) {
          parts.push(currentPart);
          currentPart = section;
        } else {
          // Sección muy larga, cortarla
          parts.push(section.substring(0, maxChars - 3) + '...');
        }
      }
    });

    if (currentPart) {
      parts.push(currentPart);
    }

    return parts;
  }
}
