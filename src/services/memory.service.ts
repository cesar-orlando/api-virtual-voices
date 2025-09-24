import { Connection } from 'mongoose';
import getThreadModel from '../models/thread.model';
import getMessageModel from '../models/message.model';
import getCompanyMemoryModel from '../models/companyMemory.model';
import { RAGResult } from './rag.service';
import { openai } from '../config/openai';

export interface ContextOptions {
  threadId: string;
  companySlug: string;
  userQuery: string;
  ragTexts?: RAGResult[];
}

export type SummaryMode = 'fast' | 'smart' | 'deep' | 'auto';

export class MemoryService {
  private maxRecentMessages: number;
  private tokenBudget: number;

  constructor() {
    this.maxRecentMessages = parseInt(process.env.MAX_RECENT_MESSAGES || '16');
    this.tokenBudget = parseInt(process.env.TOKEN_BUDGET || '7000');
  }

  /**
   * Obtiene el resumen de un hilo
   */
  async getSummary(connection: Connection, threadId: string) {
    const Thread = getThreadModel(connection);
    const thread = await Thread.findById(threadId);
    return thread?.summary || { facts: '', rolling: '', updatedAt: undefined };
  }

  /**
   * Actualiza el resumen rolling de un hilo
   */
  async updateRolling(connection: Connection, threadId: string, rolling: string) {
    const Thread = getThreadModel(connection);
    await Thread.updateOne(
      { _id: threadId },
      { 
        $set: { 
          'summary.rolling': rolling,
          'summary.updatedAt': new Date()
        }
      }
    );
  }

  /**
   * Upsert facts de empresa
   */
  async upsertFactsForCompany(connection: Connection, companySlug: string, facts: string) {
    const CompanyMemory = getCompanyMemoryModel(connection);
    await CompanyMemory.updateOne(
      { companySlug },
      { 
        $set: { 
          facts,
          factsUpdatedAt: new Date()
        }
      },
      { upsert: true }
    );
  }

  /**
   * Obtiene facts de empresa
   */
  async getCompanyFacts(connection: Connection, companySlug: string): Promise<string> {
    const CompanyMemory = getCompanyMemoryModel(connection);
    const memory = await CompanyMemory.findOne({ companySlug });
    return memory?.facts || '';
  }

  /**
   * Construye contexto completo para el LLM
   */
  async getContext(connection: Connection, options: ContextOptions): Promise<string> {
    const { threadId, companySlug, userQuery, ragTexts = [] } = options;

    // 1. Facts de empresa
    const companyFacts = await this.getCompanyFacts(connection, companySlug);
    
    // 2. Resumen del hilo
    const summary = await this.getSummary(connection, threadId);
    
    // 3. RAG context
    const ragContext = ragTexts.length > 0 
      ? ragTexts.map(r => `[${r.docCollection.toUpperCase()}] ${r.title ? r.title + ': ' : ''}${r.text}`).join('\n\n')
      : '';

    // 4. Construir contexto
    let context = '';
    
    if (companyFacts) {
      context += `COMPANY FACTS:\n${companyFacts}\n\n`;
    }
    
    if (summary.facts) {
      context += `THREAD FACTS:\n${summary.facts}\n\n`;
    }
    
    if (summary.rolling) {
      context += `CONVERSATION SUMMARY:\n${summary.rolling}\n\n`;
    }
    
    if (ragContext) {
      context += `RELEVANT CONTEXT:\n${ragContext}\n\n`;
    }

    return context.trim();
  }

  /**
   * Verifica si necesita resumir y lo hace automáticamente
   */
  async maybeSummarize(connection: Connection, threadId: string): Promise<void> {
    const Thread = getThreadModel(connection);
    const Message = getMessageModel(connection);

    // Obtener hilo y sus mensajes recientes
    const thread = await Thread.findById(threadId);
    if (!thread) return;

    const messages = await Message.find({ threadId })
      .sort({ createdAt: -1 })
      .limit(this.maxRecentMessages * 2); // Buscar más para calcular tokens

    // Estimar tokens (chars/4 como aproximación)
    const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
    const estimatedTokens = Math.ceil(totalChars / 4);

    if (estimatedTokens > this.tokenBudget) {
      console.log(`Thread ${threadId} exceeds token budget (${estimatedTokens}/${this.tokenBudget}), summarizing...`);
      
      // Determinar modo de resumen
      const summaryMode = this.determineSummaryMode(thread.state.summaryMode || 'auto', estimatedTokens);
      
      await this.performSummarization(connection, threadId, messages, summaryMode);
    }
  }

  /**
   * Determina el modo de resumen según configuración y tokens
   */
  private determineSummaryMode(configMode: SummaryMode, tokens: number): SummaryMode {
    if (configMode !== 'auto') {
      return configMode;
    }

    // AUTO mode logic
    if (tokens >= 6000) return 'fast';
    if (tokens >= 3000) return 'smart';
    return 'deep';
  }

  /**
   * Realiza la sumarización usando OpenAI
   */
  private async performSummarization(
    connection: Connection,
    threadId: string,
    messages: any[],
    mode: SummaryMode
  ): Promise<void> {
    try {
      // Construir prompt según el modo
      const { systemPrompt, maxTokens } = this.getSummaryPromptConfig(mode);
      
      // Preparar conversación para resumir
      const conversationText = messages
        .reverse() // Orden cronológico
        .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
        .join('\n\n');

      const response = await openai.chat.completions.create({
        model: process.env.CHAT_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `CONVERSATION TO SUMMARIZE:\n\n${conversationText}` }
        ],
        max_tokens: maxTokens,
        temperature: 0.3
      });

      const summaryContent = response.choices[0].message.content || '';
      
      // Parsear respuesta estructurada
      const { facts, summary, nextSteps } = this.parseSummaryResponse(summaryContent);
      
      // Actualizar thread
      const Thread = getThreadModel(connection);
      await Thread.updateOne(
        { _id: threadId },
        {
          $set: {
            'summary.facts': facts,
            'summary.rolling': summary,
            'summary.updatedAt': new Date()
          }
        }
      );

      // Opcional: eliminar mensajes viejos ya resumidos
      const Message = getMessageModel(connection);
      const keepMessages = await Message.find({ threadId })
        .sort({ createdAt: -1 })
        .limit(this.maxRecentMessages);
      
      const keepIds = keepMessages.map(m => m._id);
      await Message.deleteMany({ 
        threadId, 
        _id: { $nin: keepIds } 
      });

      console.log(`Thread ${threadId} summarized in ${mode} mode`);

    } catch (error) {
      console.error('Error performing summarization:', error);
      // No fallar silenciosamente, pero no bloquear el chat
    }
  }

  /**
   * Configuración de prompts según modo de resumen
   */
  private getSummaryPromptConfig(mode: SummaryMode) {
    const configs = {
      fast: {
        maxTokens: 200,
        systemPrompt: `Eres un asistente que resume conversaciones largas.
Objetivo: mantener un SUMMARY conciso con decisiones, compromisos, datos validados (slots), TODOs y próximos pasos.

MODO FAST: resumen muy breve (≤ 200 tokens).

Formato de salida:
FACTS_THREAD: (líneas cortas, invariantes)
SUMMARY: (resumen ultra breve)
NEXT_STEPS: (si hay acciones pendientes)
ISSUES: (si se detectan huecos)`
      },
      smart: {
        maxTokens: 600,
        systemPrompt: `Eres un asistente que resume conversaciones largas.
Objetivo: mantener un SUMMARY conciso con decisiones, compromisos, datos validados (slots), TODOs y próximos pasos.

MODO SMART: resumen balanceado (≤ 600 tokens). Incluye decisiones y contexto clave.

Formato de salida:
FACTS_THREAD: (líneas cortas, invariantes)
SUMMARY: (resumen balanceado con decisiones clave)
NEXT_STEPS: (si hay acciones pendientes)
ISSUES: (si se detectan huecos)`
      },
      deep: {
        maxTokens: 1200,
        systemPrompt: `Eres un asistente que resume conversaciones largas.
Objetivo: mantener un SUMMARY conciso con decisiones, compromisos, datos validados (slots), TODOs y próximos pasos.

MODO DEEP: resumen extenso (≤ 1200 tokens). Incluye matices y razonamientos.

Formato de salida:
FACTS_THREAD: (líneas cortas, invariantes)
SUMMARY: (resumen detallado con matices y razonamientos)
NEXT_STEPS: (si hay acciones pendientes)
ISSUES: (si se detectan huecos)`
      }
    };

    return configs[mode] || configs.smart;
  }

  /**
   * Parsea la respuesta estructurada del resumen
   */
  private parseSummaryResponse(content: string) {
    const facts = this.extractSection(content, 'FACTS_THREAD');
    const summary = this.extractSection(content, 'SUMMARY');
    const nextSteps = this.extractSection(content, 'NEXT_STEPS');
    
    return { facts, summary, nextSteps };
  }

  /**
   * Extrae una sección del resumen estructurado
   */
  private extractSection(content: string, sectionName: string): string {
    const regex = new RegExp(`${sectionName}:\\s*([\\s\\S]*?)(?=\\n[A-Z_]+:|$)`, 'i');
    const match = content.match(regex);
    return match ? match[1].trim() : '';
  }
}
