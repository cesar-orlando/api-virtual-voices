import { Agent, tool, run } from '@openai/agents';
import { getEnvironmentConfig } from '../../config/environments';
import { DateTime } from 'luxon';
import { IWhatsappChat } from '../../models/whatsappChat.model';
import { MessageSchedulerService } from '../internal/messageSchedulerService';
import { getWhatsappChatModel } from '../../models/whatsappChat.model';
import { getConnectionByCompanySlug } from '../../config/connectionManager';
import getCompanyModel from '../../models/company.model';

interface AgentContext {
  company: string;
  phoneUser?: string;
  chatHistory?: IWhatsappChat;
  sessionId?: string;
  schedulerService?: MessageSchedulerService;
}

export abstract class BaseAgent {
  protected agent: Agent<AgentContext>;
  protected company: string;
  protected openaiApiKey: string;
  protected agentContext: Record<string, any> = {};
  protected schedulerService?: MessageSchedulerService;
  
  // ✅ Cache database connection to avoid repeated lookups
  private cachedConnection?: any;
  
  // Conversation summarization settings
  private readonly SUMMARIZATION_THRESHOLD = 10; // Messages threshold for creating/updating summary
  private readonly MAX_RECENT_MESSAGES = 10; // Keep only last N messages in context

  constructor(company: string) {
    this.company = company;
    const envConfig = getEnvironmentConfig();
    this.openaiApiKey = envConfig.openaiApiKey;
    
    if (!this.openaiApiKey) {
      throw new Error(`❌ OpenAI API key not configured for company: ${company}`);
    }
    
    // Set the environment variable for the OpenAI Agents SDK
    process.env.OPENAI_API_KEY = this.openaiApiKey;
  }

  /**
   * ✅ Get cached database connection or create new one
   * This ensures we only call getConnectionByCompanySlug once per agent instance
   */
  protected async getConnection(): Promise<any> {
    if (!this.cachedConnection || this.cachedConnection.readyState !== 1) {
      this.cachedConnection = await getConnectionByCompanySlug(this.company);
    }
    return this.cachedConnection;
  }

  /**
   * Set the scheduler service for follow-up scheduling
   */
  public setSchedulerService(schedulerService: MessageSchedulerService): void {
    this.schedulerService = schedulerService;
  }

  public async initialize(): Promise<void> {
    try {
        await this.initializeAgent();
    } catch (error) {
        console.error(`❌ Error in BaseAgent initializeAgent for ${this.company}:`, error);
        throw error;
    }
  }

  /**
   * Initialize the agent with company-specific configuration
   */
  protected abstract initializeAgent(): void;

  /**
   * Get the agent instance
   */
  public getAgent(): Agent<AgentContext> {
    return this.agent;
  }

  /**
   * Process a message and return the response
   * @param message - The user message
   * @param context - Agent context
   * @param chatDocument - The WhatsApp chat document (REQUIRED for summarization)
   */
  public async processMessage(
    message: string, 
    context?: AgentContext,
  ): Promise<string> {
    try {
      // Check if we need to update the conversation summary
      if (!Array.isArray(context.chatHistory)) {
        await this.updateConversationSummary(context.chatHistory as any);
      }
      
      // Clean the current message
      const cleanMessage = this.cleanMessageForContext(message);

      // Get current time
      const nowInTimezone = DateTime.now().setZone(this.agentContext.timezone);
      const currentTime = nowInTimezone.toFormat('cccc, dd \'de\' MMMM \'de\' yyyy \'a las\' HH:mm \'horas\' (z)');
      const currentTimeText = `Hora local actual: ${currentTime}`;
      
      // Build optimized context using embedded summary + recent messages + company context
      const companyContext = await this.getCompanyBusinessContext();
      const optimizedContext = this.buildOptimizedContext(
        context.chatHistory, 
        cleanMessage, 
        currentTimeText,
        companyContext
      );

      const agentContext: AgentContext = {
        company: this.company,
        schedulerService: this.schedulerService,
        ...context
      };
      
      const result = await run(this.agent, optimizedContext, {
        context: agentContext
      });
      
      return result.finalOutput || 'No se pudo generar una respuesta.';
    } catch (error) {
      console.error(`❌ Error processing message for ${this.company}:`, error.message);
      throw error;
    }
  }

  /**
   * Update the conversation summary embedded in the chat document
   */
  private async updateConversationSummary(chat: any): Promise<void> {
    const lastSummarizedIndex = chat.conversationSummary?.lastSummarizedIndex || 0;
    const newMessagesCount = chat.messages.length - lastSummarizedIndex;
    
    // Check if we need to create or update the summary
    if (newMessagesCount >= this.SUMMARIZATION_THRESHOLD) {
      console.log(`🔄 Updating conversation summary for chat ${chat._id}...`);
      
      try {
        // Get new messages to process
        const newMessages = chat.messages.slice(lastSummarizedIndex);
        
        // For large conversations (30+ new messages), process in chunks to avoid token limits
        if (newMessages.length > 30) {
          console.log(`⚠️  Large conversation detected (${newMessages.length} messages). Processing in chunks...`);
          await this.processLargeConversationSummary(chat, newMessages, lastSummarizedIndex);
        } else {
          // Normal processing for smaller updates
          const updatedSummary = await this.createProgressiveSummary(
            chat.conversationSummary?.summary || '',
            newMessages
          );
          
          // Update the embedded summary
          if (!chat.conversationSummary) {
            chat.conversationSummary = {
              lastSummarizedIndex: 0,
              summary: '',
              extractedFacts: {
                decisions: [],
                preferences: []
              },
              conversationStage: 'Inicio',
              tokensSaved: 0,
              lastUpdated: new Date()
            };
          }
          
          // Use atomic update to avoid version conflicts
          const updateOps = {
            'conversationSummary.lastSummarizedIndex': chat.messages.length,
            'conversationSummary.summary': this.truncateField(updatedSummary.summary, 2000),
            'conversationSummary.extractedFacts': {
              userName: updatedSummary.extractedFacts.userName ? 
                this.truncateField(updatedSummary.extractedFacts.userName, 100) : undefined,
              email: updatedSummary.extractedFacts.email ? 
                this.truncateField(updatedSummary.extractedFacts.email, 200) : undefined,
              phone: updatedSummary.extractedFacts.phone ? 
                this.truncateField(updatedSummary.extractedFacts.phone, 50) : undefined,
              decisions: updatedSummary.extractedFacts.decisions.map(d => this.truncateField(d, 200)),
              preferences: updatedSummary.extractedFacts.preferences.map(p => this.truncateField(p, 200))
            },
            'conversationSummary.conversationStage': this.truncateField(updatedSummary.conversationStage, 100),
            'conversationSummary.tokensSaved': (chat.conversationSummary?.tokensSaved || 0) + updatedSummary.tokensSaved,
            'conversationSummary.lastUpdated': new Date()
          };

          // Get the appropriate Chat model using cached company connection
          const conn = await this.getConnection();
          const ChatModel = getWhatsappChatModel(conn);
          
          // Atomic update with retry logic to prevent version conflicts
          await this.updateConversationSummaryAtomic(String(chat._id), updateOps);

          console.log(`✅ Summary updated.`);
        }
      } catch (error) {
        console.error('❌ Error updating conversation summary:', error);
      }
    }
  }

  /**
   * Process large conversations in chunks to avoid token limits
   */
  private async processLargeConversationSummary(
    chat: IWhatsappChat, 
    allNewMessages: any[], 
    startIndex: number
  ): Promise<void> {
    const CHUNK_SIZE = 20; // Process 20 messages at a time
    let currentSummary = chat.conversationSummary?.summary || '';
    let totalTokensSaved = 0;
    
    // Process messages in chunks
    for (let i = 0; i < allNewMessages.length; i += CHUNK_SIZE) {
      const chunk = allNewMessages.slice(i, i + CHUNK_SIZE);
      const chunkEnd = Math.min(i + CHUNK_SIZE, allNewMessages.length);

      try {
        const chunkSummary = await this.createProgressiveSummary(currentSummary, chunk);
        
        // Update running summary
        currentSummary = chunkSummary.summary;
        totalTokensSaved += chunkSummary.tokensSaved;
        
        // Update progress in database every few chunks
        if ((i + CHUNK_SIZE) % 40 === 0 || chunkEnd === allNewMessages.length) {
          // Update the embedded summary
          if (!chat.conversationSummary) {
            chat.conversationSummary = {
              lastSummarizedIndex: 0,
              summary: '',
              extractedFacts: {
                decisions: [],
                preferences: []
              },
              conversationStage: 'Inicio',
              tokensSaved: 0,
              lastUpdated: new Date()
            };
          }
          
          // Use atomic update to avoid version conflicts
          const updateOps = {
            'conversationSummary.lastSummarizedIndex': startIndex + chunkEnd,
            'conversationSummary.summary': this.truncateField(chunkSummary.summary, 2000),
            'conversationSummary.extractedFacts': {
              userName: chunkSummary.extractedFacts.userName ? 
                this.truncateField(chunkSummary.extractedFacts.userName, 100) : undefined,
              email: chunkSummary.extractedFacts.email ? 
                this.truncateField(chunkSummary.extractedFacts.email, 200) : undefined,
              phone: chunkSummary.extractedFacts.phone ? 
                this.truncateField(chunkSummary.extractedFacts.phone, 50) : undefined,
              decisions: chunkSummary.extractedFacts.decisions.map(d => this.truncateField(d, 200)),
              preferences: chunkSummary.extractedFacts.preferences.map(p => this.truncateField(p, 200))
            },
            'conversationSummary.conversationStage': this.truncateField(chunkSummary.conversationStage, 100),
            'conversationSummary.tokensSaved': (chat.conversationSummary?.tokensSaved || 0) + totalTokensSaved,
            'conversationSummary.lastUpdated': new Date()
          };

          // Get the appropriate Chat model using cached company connection
          const conn = await this.getConnection();
          const ChatModel = getWhatsappChatModel(conn);
          
          // Atomic update with retry logic to prevent version conflicts
          await this.updateConversationSummaryAtomic(String(chat._id), updateOps);

          // Reset for next batch
          totalTokensSaved = 0;
        }
        
        // Small delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`❌ Error processing chunk ${Math.floor(i/CHUNK_SIZE) + 1}:`, error);
        // Continue with next chunk
      }
    }

    console.log(`✅ Large conversation summary updated!`);

  }

  /**
   * Atomically update conversation summary with retry logic for version conflicts
   */
  private async updateConversationSummaryAtomic(chatId: string, updateOps: any, maxRetries: number = 3): Promise<void> {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const conn = await this.getConnection();
        const ChatModel = getWhatsappChatModel(conn);
        
        await ChatModel.findByIdAndUpdate(
          chatId,
          { $set: updateOps },
          { new: true }
        );
        
        return; // Success, exit retry loop
      } catch (error: any) {
        attempt++;
        
        // Check if it's a version error (optimistic concurrency failure)
        if (error.name === 'VersionError' || error.message?.includes('version') || error.message?.includes('modifiedPaths')) {
          if (attempt < maxRetries) {
            console.warn(`⚠️ Conversation summary update attempt ${attempt}/${maxRetries} failed due to version conflict, retrying...`);
            // Wait a bit before retrying with exponential backoff
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 100));
            continue;
          }
        }
        
        // Re-throw if max retries reached or it's not a version error
        throw error;
      }
    }
  }

  /**
   * Create or update a progressive summary from existing summary + new messages
   */
  private async createProgressiveSummary(
    existingSummary: string,
    newMessages: any[]
  ): Promise<{
    summary: string;
    extractedFacts: {
      userName?: string;
      email?: string;
      phone?: string;
      decisions: string[];
      preferences: string[];
    };
    conversationStage: string;
    tokensSaved: number;
  }> {
    // Prepare new messages for analysis
    const newMessagesText = newMessages.map((msg) => {
      const role = msg.direction === 'inbound' ? 'Cliente' : this.getAssistantName();
      return `${role}: ${msg.body}`;
    }).join('\n');

    // Create progressive summarization prompt
    const summaryPrompt = `Como experto asistente de ${this.company}, actualiza el resumen de conversación:

${existingSummary ? `RESUMEN ANTERIOR:\n${existingSummary}\n\n` : ''}NUEVOS MENSAJES A INTEGRAR:\n${newMessagesText}

Crea un resumen PROGRESIVO que combine la información anterior con los nuevos mensajes. Proporciona la respuesta en formato JSON:

{
  "resumen": "Resumen actualizado y conciso que integre toda la información relevante (máximo 1900 caracteres)",
  "datos_extraidos": {
    "nombre_usuario": "nombre del cliente si se identificó, o null (máximo 90 caracteres)",
    "email": "email si se proporcionó, o null (máximo 190 caracteres)", 
    "telefono": "teléfono si se proporcionó, o null (máximo 40 caracteres)",
    "decisiones": ["lista de decisiones importantes tomadas hasta ahora (cada item máximo 190 caracteres)"],
    "preferencias": ["preferencias o requisitos expresados por el cliente (cada item máximo 190 caracteres)"]
  },
  "etapa_conversacion": "etapa actual de la conversación (máximo 90 caracteres)",
  "progreso": "qué ha progresado en esta actualización"
}

IMPORTANTE: 
- Responde SOLO con el JSON válido, sin texto adicional
- Mantén todos los campos dentro de los límites de caracteres especificados
- Sé conciso pero informativo`;

    try {
      const result = await run(this.agent, summaryPrompt, {
        context: { company: this.company }
      });

      let summaryData;
      try {
        summaryData = JSON.parse(result.finalOutput || '{}');
      } catch (parseError) {
        console.warn('Failed to parse AI summary, creating fallback summary');
        summaryData = this.createFallbackSummaryData(newMessages);
      }

      // Calculate tokens saved (estimate)
      const originalTokens = newMessagesText.length / 4;
      const summaryTokens = (summaryData.resumen?.length || 0) / 4;
      const tokensSaved = Math.round(Math.max(0, originalTokens - summaryTokens));

      return {
        summary: summaryData.resumen || 'Resumen no disponible',
        extractedFacts: {
          userName: summaryData.datos_extraidos?.nombre_usuario || undefined,
          email: summaryData.datos_extraidos?.email || undefined,
          phone: summaryData.datos_extraidos?.telefono || undefined,
          decisions: summaryData.datos_extraidos?.decisiones || [],
          preferences: summaryData.datos_extraidos?.preferencias || []
        },
        conversationStage: summaryData.etapa_conversacion || 'Conversación en progreso',
        tokensSaved
      };
    } catch (error) {
      console.error('Error creating AI summary, using fallback:', error);
      return this.createFallbackSummaryData(newMessages);
    }
  }

  /**
   * Create fallback summary data when AI summarization fails
   */
  private createFallbackSummaryData(messages: any[]): {
    summary: string;
    extractedFacts: {
      userName?: string;
      email?: string;
      phone?: string;
      decisions: string[];
      preferences: string[];
    };
    conversationStage: string;
    tokensSaved: number;
  } {
    const messagesText = messages.map(m => m.body || '').join(' ');
    
    return {
      summary: `Conversación actualizada con ${messages.length} nuevos mensajes. Progreso basado en análisis automático.`,
      extractedFacts: {
        decisions: [],
        preferences: []
      },
      conversationStage: 'Conversación en progreso',
      tokensSaved: Math.round(messagesText.length / 8) // Conservative estimate
    };
  }

  /**
   * Build optimized context using embedded summary + recent messages + company context
   */
  private buildOptimizedContext(
    chat: IWhatsappChat | undefined, 
    currentMessage: string, 
    currentTime: string,
    companyContext?: string
  ): string {
    let context = '';
    
    // Add company-wide business context if available
    if (companyContext) {
      context += `${companyContext}\n`;
    }
    
    // Add existing summary if available
    if (chat?.conversationSummary?.summary) {
      context += `HISTORIAL: ${chat.conversationSummary.summary}\n`;
      
      if (chat.conversationSummary.extractedFacts?.userName) {
        context += `Cliente: ${chat.conversationSummary.extractedFacts.userName}\n`;
      }
      
      if (chat.conversationSummary.extractedFacts?.email) {
        context += `Email: ${chat.conversationSummary.extractedFacts.email}\n`;
      }
      
      if (chat.conversationSummary.extractedFacts?.phone) {
        context += `Teléfono: ${chat.conversationSummary.extractedFacts.phone}\n`;
      }
      
      if (chat.conversationSummary.extractedFacts?.decisions?.length > 0) {
        context += `Decisiones: ${chat.conversationSummary.extractedFacts.decisions.join(', ')}\n`;
      }
      
      if (chat.conversationSummary.extractedFacts?.preferences?.length > 0) {
        context += `Preferencias: ${chat.conversationSummary.extractedFacts.preferences.join(', ')}\n`;
      }
      
      context += `Etapa: ${chat.conversationSummary.conversationStage}\n\n`;
    }
    
    // Add recent messages (not yet summarized or most recent ones)
    if (chat?.messages && chat.messages.length > 0) {
      const lastSummarizedIndex = chat.conversationSummary?.lastSummarizedIndex || 0;
      const recentMessages = chat.messages.slice(
        Math.max(lastSummarizedIndex, chat.messages.length - this.MAX_RECENT_MESSAGES)
      );
      
      if (recentMessages.length > 0) {
        context += 'MENSAJES RECIENTES:\n';
        recentMessages.forEach(msg => {
          const role = msg.direction === 'inbound' ? 'Cliente' : this.getAssistantName();
          const cleanContent = this.cleanMessageForContext(msg.body);
          context += `${role}: ${cleanContent}\n`;
        });
        context += '\n';
      }
    }
    
    // Add current message and time
    context += `MENSAJE ACTUAL: ${currentMessage}\n${currentTime}`;
    
    return context;
  }

  /**
   * Clean message content for context while preserving meaning
   */
  private cleanMessageForContext(content: string): string {
    if (!content) return '';
    
    return content
      .replace(/\\/g, '\\\\')  // Escape backslashes first
      .replace(/"/g, '\\"')    // Escape quotes
      .replace(/\n/g, ' ')     // Replace newlines with spaces
      .replace(/\r/g, ' ')     // Replace carriage returns with spaces
      .replace(/\t/g, ' ')     // Replace tabs with spaces
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ') // Remove control characters
      .substring(0, 150) // Reasonable limit for context
      .trim();
  }

  /**
   * Truncate field to respect database model max length constraints
   */
  private truncateField(value: string, maxLength: number): string {
    if (!value) return '';
    
    if (value.length <= maxLength) {
      return value;
    }
    
    // Truncate and add ellipsis if needed
    const truncated = value.substring(0, maxLength - 3);
    
    // Try to break at word boundary if possible
    const lastSpaceIndex = truncated.lastIndexOf(' ');
    if (lastSpaceIndex > maxLength * 0.8) { // Only if we don't lose too much content
      return truncated.substring(0, lastSpaceIndex) + '...';
    }
    
    return truncated + '...';
  }

  /**
   * Get assistant name based on company
   */
  private getAssistantName(): string {
    return 'Asistente';
  }

  /**
   * Update the company-wide conversation summary
   * This should be called periodically (e.g., daily or after certain number of chat updates)
   */
  public async updateCompanySummary(): Promise<void> {
    try {
      
      const conn = await this.getConnection();
      
      const CompanyModel = getCompanyModel(conn);
      const ChatModel = getWhatsappChatModel(conn);
      
      const companyDoc = await CompanyModel.findOne();
      if (!companyDoc) {
        return;
      }

      // Get all chats that have been updated since last company summary
      const lastSummarizedIndex = companyDoc.conversationSummary?.lastSummarizedChatIndex || 0;
      
      // Get recent chats with meaningful conversation summaries
      const recentChats = await ChatModel.find({
        'conversationSummary.summary': { $exists: true, $ne: '' },
      })
      .select('conversationSummary phone name session messages.createdAt messages.direction')
      .sort({ updatedAt: -1 })
      .limit(50); // Process up to 50 recent chats

      if (recentChats.length === 0) {
        return;
      }

      // Analyze actual message timestamps for active timeframes
      const timestampAnalysis = this.analyzeMessageTimestamps(recentChats);

      // Create company-wide summary
      const companySummary = await this.createCompanySummary(
        companyDoc.conversationSummary?.summary || '',
        recentChats,
        timestampAnalysis
      );

      // Update company document
      if (!companyDoc.conversationSummary) {
        companyDoc.conversationSummary = {
          lastSummarizedChatIndex: 0,
          summary: '',
          aggregatedFacts: {
            totalChats: 0,
            activeCustomers: [],
            commonQuestions: [],
            businessInsights: [],
            customerPreferences: [],
            salesOpportunities: [],
            supportIssues: []
          },
          businessMetrics: {
            customerSatisfactionTrends: [],
            mostActiveTimeframes: [],
            popularProducts: []
          },
          lastUpdated: new Date(),
          tokensSaved: 0
        };
      }

      // Update with new data
      companyDoc.conversationSummary.summary = this.truncateField(companySummary.summary, 3000);
      companyDoc.conversationSummary.aggregatedFacts = {
        totalChats: companySummary.aggregatedFacts.totalChats,
        activeCustomers: companySummary.aggregatedFacts.activeCustomers.map(c => this.truncateField(c, 100)),
        commonQuestions: companySummary.aggregatedFacts.commonQuestions.map(q => this.truncateField(q, 300)),
        businessInsights: companySummary.aggregatedFacts.businessInsights.map(i => this.truncateField(i, 300)),
        customerPreferences: companySummary.aggregatedFacts.customerPreferences.map(p => this.truncateField(p, 200)),
        salesOpportunities: companySummary.aggregatedFacts.salesOpportunities.map(o => this.truncateField(o, 300)),
        supportIssues: companySummary.aggregatedFacts.supportIssues.map(i => this.truncateField(i, 300))
      };
      companyDoc.conversationSummary.businessMetrics = {
        averageResponseTime: companySummary.businessMetrics.averageResponseTime ? 
          this.truncateField(companySummary.businessMetrics.averageResponseTime, 50) : undefined,
        customerSatisfactionTrends: companySummary.businessMetrics.customerSatisfactionTrends.map(t => this.truncateField(t, 200)),
        mostActiveTimeframes: companySummary.businessMetrics.mostActiveTimeframes.map(t => this.truncateField(t, 100)),
        popularProducts: companySummary.businessMetrics.popularProducts.map(p => this.truncateField(p, 150))
      };
      companyDoc.conversationSummary.tokensSaved = (companyDoc.conversationSummary.tokensSaved || 0) + companySummary.tokensSaved;
      companyDoc.conversationSummary.lastUpdated = new Date();

      await companyDoc.save();

    } catch (error) {
      console.error(`❌ Error updating company summary for ${this.company}:`, error);
    }
  }

  /**
   * Analyze message timestamps to determine actual active timeframes
   */
  private analyzeMessageTimestamps(chats: any[]): {
    mostActiveHours: string[];
    mostActiveDays: string[];
    peakActivity: string;
  } {
    const hourCounts: Record<number, number> = {};
    const dayCounts: Record<string, number> = {};
    
    // Process all messages from all chats
    chats.forEach(chat => {
      if (chat.messages && Array.isArray(chat.messages)) {
        chat.messages
          .filter((msg: any) => msg.direction === 'inbound' && (msg.createdAt || msg.dateCreated)) // Only count customer messages
          .forEach((msg: any) => {
            const date = new Date(msg.createdAt || msg.dateCreated);
            const hour = date.getHours();
            const dayName = date.toLocaleDateString('es-ES', { weekday: 'long' });
            
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
            dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;
          });
      }
    });

    // Find most active hours (top 3)
    const topHours = Object.entries(hourCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([hour, count]) => {
        const hourNum = parseInt(hour);
        const timeRange = `${hourNum.toString().padStart(2, '0')}:00-${(hourNum + 1).toString().padStart(2, '0')}:00`;
        return `${timeRange} (${count} mensajes)`;
      });

    // Find most active days (top 3)
    const topDays = Object.entries(dayCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([day, count]) => `${day} (${count} mensajes)`);

    // Determine peak activity period
    const peakHour = Object.entries(hourCounts)
      .sort(([,a], [,b]) => b - a)[0];
    
    const peakActivity = peakHour 
      ? `${parseInt(peakHour[0]).toString().padStart(2, '0')}:00-${(parseInt(peakHour[0]) + 1).toString().padStart(2, '0')}:00 con ${peakHour[1]} mensajes`
      : 'No hay datos suficientes';

    return {
      mostActiveHours: topHours,
      mostActiveDays: topDays,
      peakActivity
    };
  }

  /**
   * Create company-wide summary from individual chat summaries
   */
  private async createCompanySummary(
    existingCompanySummary: string,
    recentChats: any[],
    timestampAnalysis?: {
      mostActiveHours: string[];
      mostActiveDays: string[];
      peakActivity: string;
    }
  ): Promise<{
    summary: string;
    aggregatedFacts: {
      totalChats: number;
      activeCustomers: string[];
      commonQuestions: string[];
      businessInsights: string[];
      customerPreferences: string[];
      salesOpportunities: string[];
      supportIssues: string[];
    };
    businessMetrics: {
      averageResponseTime?: string;
      customerSatisfactionTrends: string[];
      mostActiveTimeframes: string[];
      popularProducts: string[];
    };
    tokensSaved: number;
  }> {
    // Prepare chat summaries for analysis
    const chatSummariesText = recentChats.map((chat, index) => {
      const customerName = chat.conversationSummary?.extractedFacts?.userName || 
                          chat.name || 
                          `Cliente ${chat.phone}`;
      
      return `Chat ${index + 1} - ${customerName}:
Summary: ${chat.conversationSummary?.summary || 'Sin resumen'}
Stage: ${chat.conversationSummary?.conversationStage || 'Desconocido'}
Decisions: ${chat.conversationSummary?.extractedFacts?.decisions?.join(', ') || 'Ninguna'}
Preferences: ${chat.conversationSummary?.extractedFacts?.preferences?.join(', ') || 'Ninguna'}`;
    }).join('\n\n');

    // Create company summarization prompt
    const summaryPrompt = `Como experto analista de negocios para ${this.company}, analiza estos resúmenes de conversaciones y crea un análisis empresarial integral:

${existingCompanySummary ? `ANÁLISIS EMPRESARIAL ANTERIOR:\n${existingCompanySummary}\n\n` : ''}NUEVOS RESÚMENES DE CONVERSACIONES A INTEGRAR:\n${chatSummariesText}

Crea un ANÁLISIS EMPRESARIAL INTEGRAL que combine la información anterior con los nuevos datos. Proporciona la respuesta en formato JSON:

{
  "resumen_empresarial": "Análisis integral del estado del negocio basado en todas las conversaciones (máximo 2900 caracteres)",
  "datos_agregados": {
    "total_chats": ${recentChats.length},
    "clientes_activos": ["lista de clientes identificados activamente comprometidos (máximo 90 caracteres cada uno)"],
    "preguntas_frecuentes": ["patrones en preguntas de clientes (máximo 290 caracteres cada una)"],
    "insights_negocio": ["insights importantes para el negocio (máximo 290 caracteres cada uno)"],
    "preferencias_clientes": ["tendencias en preferencias de clientes (máximo 190 caracteres cada una)"],
    "oportunidades_venta": ["oportunidades de venta identificadas (máximo 290 caracteres cada una)"],
    "problemas_soporte": ["problemas recurrentes de soporte (máximo 290 caracteres cada uno)"]
  },
  "metricas_negocio": {
    "tiempo_respuesta_promedio": "estimación del tiempo de respuesta promedio (máximo 40 caracteres)",
    "tendencias_satisfaccion": ["tendencias en satisfacción del cliente (máximo 190 caracteres cada una)"],
    "horarios_mas_activos": ["horarios de mayor actividad (máximo 90 caracteres cada uno)"],
    "productos_populares": ["productos o servicios más mencionados (máximo 140 caracteres cada uno)"]
  },
  "progreso": "qué nuevo conocimiento empresarial se ha obtenido"
}

IMPORTANTE: 
- Responde SOLO con el JSON válido, sin texto adicional
- Mantén todos los campos dentro de los límites de caracteres especificados
- Enfócate en insights accionables para el negocio
- Identifica patrones y tendencias empresariales`;

    try {
      const result = await run(this.agent, summaryPrompt, {
        context: { company: this.company }
      });

      let summaryData;
      try {
        summaryData = JSON.parse(result.finalOutput || '{}');
      } catch (parseError) {
        console.warn('Failed to parse AI company summary, creating fallback');
        summaryData = this.createFallbackCompanySummaryData(recentChats);
      }

      // Calculate tokens saved (estimate)
      const originalTokens = chatSummariesText.length / 4;
      const summaryTokens = (summaryData.resumen_empresarial?.length || 0) / 4;
      const tokensSaved = Math.round(Math.max(0, originalTokens - summaryTokens));

      return {
        summary: summaryData.resumen_empresarial || 'Análisis empresarial no disponible',
        aggregatedFacts: {
          totalChats: summaryData.datos_agregados?.total_chats || recentChats.length,
          activeCustomers: summaryData.datos_agregados?.clientes_activos || [],
          commonQuestions: summaryData.datos_agregados?.preguntas_frecuentes || [],
          businessInsights: summaryData.datos_agregados?.insights_negocio || [],
          customerPreferences: summaryData.datos_agregados?.preferencias_clientes || [],
          salesOpportunities: summaryData.datos_agregados?.oportunidades_venta || [],
          supportIssues: summaryData.datos_agregados?.problemas_soporte || []
        },
        businessMetrics: {
          averageResponseTime: summaryData.metricas_negocio?.tiempo_respuesta_promedio || undefined,
          customerSatisfactionTrends: summaryData.metricas_negocio?.tendencias_satisfaccion || [],
          mostActiveTimeframes: timestampAnalysis?.mostActiveHours || [],
          popularProducts: summaryData.metricas_negocio?.productos_populares || []
        },
        tokensSaved
      };
    } catch (error) {
      console.error('Error creating AI company summary, using fallback:', error);
      return this.createFallbackCompanySummaryData(recentChats);
    }
  }

  /**
   * Create fallback company summary data when AI summarization fails
   */
  private createFallbackCompanySummaryData(chats: any[]): {
    summary: string;
    aggregatedFacts: {
      totalChats: number;
      activeCustomers: string[];
      commonQuestions: string[];
      businessInsights: string[];
      customerPreferences: string[];
      salesOpportunities: string[];
      supportIssues: string[];
    };
    businessMetrics: {
      averageResponseTime?: string;
      customerSatisfactionTrends: string[];
      mostActiveTimeframes: string[];
      popularProducts: string[];
    };
    tokensSaved: number;
  } {
    const activeCustomers = chats
      .map(chat => chat.conversationSummary?.extractedFacts?.userName || chat.name)
      .filter(Boolean)
      .slice(0, 10); // Limit to 10 active customers

    return {
      summary: `Análisis empresarial actualizado con ${chats.length} conversaciones recientes. Datos procesados automáticamente.`,
      aggregatedFacts: {
        totalChats: chats.length,
        activeCustomers,
        commonQuestions: [],
        businessInsights: [`${chats.length} conversaciones procesadas en el último análisis`],
        customerPreferences: [],
        salesOpportunities: [],
        supportIssues: []
      },
      businessMetrics: {
        customerSatisfactionTrends: [],
        mostActiveTimeframes: [],
        popularProducts: []
      },
      tokensSaved: Math.round(chats.length * 50) // Conservative estimate
    };
  }

  /**
   * Get conversation summary from chat document (for external access)
   */
  public getConversationSummary(chat: IWhatsappChat): any {
    return chat.conversationSummary || null;
  }

  /**
   * Force summary update (useful for testing or manual triggers)
   */
  public async forceSummaryUpdate(chat: any): Promise<void> {
    const originalThreshold = this.SUMMARIZATION_THRESHOLD;
    (this as any).SUMMARIZATION_THRESHOLD = 1; // Temporarily lower threshold
    
    await this.updateConversationSummary(chat);
    
    (this as any).SUMMARIZATION_THRESHOLD = originalThreshold; // Restore original
  }

  public async forceAllChatsSummaryUpdate(limit: number = 100): Promise<void> {
    try {
      const conn = await this.getConnection();
      const ChatModel = getWhatsappChatModel(conn);

      // Get all chats for the company
      const chats = await ChatModel.find({})
        .sort({ updatedAt: -1 })
        .limit(limit); // Limit to specified number for safety

      if (chats.length === 0) {
        console.log('No chats found to update summaries');
        return;
      }

      // Update each chat's summary
      await Promise.all(chats.map(chat => this.updateConversationSummary(chat as any)));
    } catch (error) {
      console.error(`❌ Error forcing summary update for all chats in ${this.company}:`, error);
    }
  }

  /**
   * Calculate estimated token savings for a chat
   */
  public calculateTokenSavings(chat: IWhatsappChat): {
    messagesCount: number;
    summarizedMessages: number;
    recentMessages: number;
    estimatedSavings: number;
    percentageSaved: number;
  } {
    if (!chat.conversationSummary) {
      return {
        messagesCount: chat.messages.length,
        summarizedMessages: 0,
        recentMessages: chat.messages.length,
        estimatedSavings: 0,
        percentageSaved: 0
      };
    }

    const totalMessages = chat.messages.length;
    const summarizedMessages = chat.conversationSummary.lastSummarizedIndex;
    const recentMessages = totalMessages - summarizedMessages;
    
    // Estimate original tokens for summarized messages
    const summarizedContent = chat.messages
      .slice(0, summarizedMessages)
      .map(m => m.body)
      .join(' ');
    
    const originalTokens = summarizedContent.length / 4;
    const summaryTokens = (chat.conversationSummary.summary?.length || 0) / 4;
    const estimatedSavings = Math.max(0, originalTokens - summaryTokens);
    
    const percentageSaved = originalTokens > 0 
      ? Math.round((estimatedSavings / originalTokens) * 100)
      : 0;

    return {
      messagesCount: totalMessages,
      summarizedMessages,
      recentMessages,
      estimatedSavings: Math.round(estimatedSavings),
      percentageSaved
    };
  }

  /**
   * Get company-wide conversation summary (for external access)
   */
  public async getCompanyConversationSummary(): Promise<any> {
    try {
      const conn = await this.getConnection();
      const CompanyModel = getCompanyModel(conn);
      
      const companyDoc = await CompanyModel.findOne({ name: this.company });
      return companyDoc?.conversationSummary || null;
    } catch (error) {
      console.error(`❌ Error getting company summary for ${this.company}:`, error);
      return null;
    }
  }

  /**
   * Force company summary update (useful for testing or manual triggers)
   */
  public async forceCompanySummaryUpdate(): Promise<void> {
    await this.updateCompanySummary();
  }

  /**
   * Get company business insights for context enhancement
   */
  public async getCompanyBusinessContext(): Promise<string> {
    try {
      const companySummary = await this.getCompanyConversationSummary();
      if (!companySummary) return '';

      let context = '';
      
      if (companySummary.summary) {
        context += `CONTEXTO EMPRESARIAL: ${companySummary.summary}\n`;
      }

      if (companySummary.aggregatedFacts?.commonQuestions?.length > 0) {
        context += `PREGUNTAS FRECUENTES: ${companySummary.aggregatedFacts.commonQuestions.slice(0, 3).join(', ')}\n`;
      }

      if (companySummary.aggregatedFacts?.businessInsights?.length > 0) {
        context += `INSIGHTS EMPRESARIALES: ${companySummary.aggregatedFacts.businessInsights.slice(0, 2).join(', ')}\n`;
      }

      if (companySummary.aggregatedFacts?.customerPreferences?.length > 0) {
        context += `PREFERENCIAS COMUNES: ${companySummary.aggregatedFacts.customerPreferences.slice(0, 2).join(', ')}\n`;
      }

      return context;
    } catch (error) {
      console.error(`❌ Error getting company business context for ${this.company}:`, error);
      return '';
    }
  }

  /**
   * Calculate estimated token savings for company-wide summary
   */
  public async calculateCompanyTokenSavings(): Promise<{
    totalChats: number;
    estimatedSavings: number;
    lastUpdated?: Date;
  }> {
    try {
      const companySummary = await this.getCompanyConversationSummary();
      if (!companySummary) {
        return {
          totalChats: 0,
          estimatedSavings: 0
        };
      }

      return {
        totalChats: companySummary.aggregatedFacts?.totalChats || 0,
        estimatedSavings: companySummary.tokensSaved || 0,
        lastUpdated: companySummary.lastUpdated
      };
    } catch (error) {
      console.error(`❌ Error calculating company token savings for ${this.company}:`, error);
      return {
        totalChats: 0,
        estimatedSavings: 0
      };
    }
  }
}