import { Agent, tool } from '@openai/agents';
import { getEnvironmentConfig } from '../../config/environments';

interface AgentContext {
  company: string;
  phoneUser?: string;
  chatHistory?: any[];
}

export abstract class BaseAgent {
  protected agent: Agent<AgentContext>;
  protected company: string;
  protected openaiApiKey: string;

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

  public async initialize(): Promise<void> {
    // Initialize the agent
    // console.log(`🔧 BaseAgent: Calling initializeAgent for ${this.company}`);
    try {
        await this.initializeAgent();
        // console.log(`🔧 BaseAgent: initializeAgent completed for ${this.company}`);
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
    // console.log(`🔧 BaseAgent: getAgent called for ${this.company}, agent exists: ${!!this.agent}`);
    return this.agent;
  }

  /**
   * Process a message and return the response
   */
  public async processMessage(message: string, context?: AgentContext): Promise<string> {
    try {
      // console.log(`🔧 BaseAgent: processMessage called for ${this.company}`);
      const { run } = await import('@openai/agents');
      // console.log(`🔧 BaseAgent: run function imported successfully`);
      
      // Build conversation history for context
      let conversationContext = '';
      if (context?.chatHistory && context.chatHistory.length > 0) {
        conversationContext = '\n\nHISTORIAL DE CONVERSACION:\n';
        context.chatHistory.forEach((msg: any, index: number) => {
          const role = msg.role === 'user' ? 'Usuario' : 'NatalIA';
          // Escape special characters that could break JSON
          const cleanContent = msg.content
            .replace(/\\/g, '\\\\')  // Escape backslashes first
            .replace(/"/g, '\\"')    // Escape quotes
            .replace(/\n/g, ' ')     // Replace newlines with spaces
            .replace(/\r/g, ' ')     // Replace carriage returns with spaces
            .replace(/\t/g, ' ')     // Replace tabs with spaces
            .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ') // Remove control characters
            // Normalize Spanish characters to ASCII
            .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u')
            .replace(/Á/g, 'A').replace(/É/g, 'E').replace(/Í/g, 'I').replace(/Ó/g, 'O').replace(/Ú/g, 'U')
            .replace(/ñ/g, 'n').replace(/Ñ/g, 'N')
            .replace(/¿/g, '').replace(/¡/g, ''); // Remove Spanish punctuation
          conversationContext += `${role}: ${cleanContent}\n`;
        });
        conversationContext += '\nCONTEXTO ACTUAL:\n';
        conversationContext += `- Nombre del usuario: ${this.extractUserName(context.chatHistory)}\n`;
        conversationContext += `- Etapa de conversacion: ${this.determineConversationStage(context.chatHistory)}\n`;
        conversationContext += `- Modalidad elegida: ${this.extractChosenModality(context.chatHistory)}\n`;
      }
      
      // Clean the current message as well
      const cleanMessage = message
        .replace(/\\/g, '\\\\')  // Escape backslashes first
        .replace(/"/g, '\\"')    // Escape quotes
        .replace(/\n/g, ' ')     // Replace newlines with spaces
        .replace(/\r/g, ' ')     // Replace carriage returns with spaces
        .replace(/\t/g, ' ')     // Replace tabs with spaces
        .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ') // Remove control characters
        // Normalize Spanish characters to ASCII
        .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u')
        .replace(/Á/g, 'A').replace(/É/g, 'E').replace(/Í/g, 'I').replace(/Ó/g, 'O').replace(/Ú/g, 'U')
        .replace(/ñ/g, 'n').replace(/Ñ/g, 'N')
        .replace(/¿/g, '').replace(/¡/g, ''); // Remove Spanish punctuation
      
      // Add conversation context to the message
      const messageWithContext = conversationContext ? 
        `${conversationContext}\n\nMENSAJE ACTUAL DEL USUARIO:\n${cleanMessage}` : 
        cleanMessage;
      
      const agentContext: AgentContext = {
        company: this.company,
        ...context
      };
      
      // DEBUG: Log the exact input being sent to the agent
      console.log(`🔧 BaseAgent: About to run agent for ${this.company}`);
      console.log(`🔧 BaseAgent: messageWithContext length:`, messageWithContext.length);
      
                          // SMART CONTEXT: If message is too long, use intelligent context reduction
       if (messageWithContext.length > 1200) {
         console.log(`🚨 BaseAgent: Using smart context reduction due to length (${messageWithContext.length})`);
         const smartContext = this.buildSmartContext(context?.chatHistory || [], message);
         
         const result = await run(this.agent, smartContext, {
           context: agentContext
         });
         return result.finalOutput || 'No se pudo generar una respuesta.';
       }
      
      const result = await run(this.agent, messageWithContext, {
        context: agentContext
      });
      // console.log(`🔧 BaseAgent: Agent run completed for ${this.company}`);
      // console.log(`🔧 BaseAgent: Result:`, result);

      // console.log(`🔧 BaseAgent: finalOutput:`, result.finalOutput);
      return result.finalOutput || 'No se pudo generar una respuesta.';
    } catch (error) {
      console.error(`❌ Error processing message for ${this.company}:`, error.message);
      throw error;
    }
  }

  /**
   * Extract user name from conversation history
   */
  private extractUserName(chatHistory: any[]): string {
    for (const msg of chatHistory) {
      if (msg.role === 'user' && msg.content.toLowerCase().includes('llamo')) {
        const match = msg.content.match(/llamo\s+([A-Za-zÁáÉéÍíÓóÚúÑñ\s]+)/i);
        if (match) return match[1].trim();
      }
    }
    return 'No proporcionado';
  }

    /**
   * Build smart context that preserves essential information while reducing length
   */
  private buildSmartContext(chatHistory: any[], currentMessage: string): string {
    if (!chatHistory || chatHistory.length === 0) {
      return currentMessage;
    }
    
    // Extract key information
    const contextInfo = this.extractContextInfo(chatHistory);
    
    // Build intelligent summary
    let smartContext = '';
    
    // Add context summary
    if (contextInfo.userName) {
      smartContext += `CONTEXTO: Usuario es ${contextInfo.userName}. `;
    }
    if (contextInfo.chosenModality) {
      smartContext += `Modalidad elegida: ${contextInfo.chosenModality}. `;
    }
    if (contextInfo.currentStage) {
      smartContext += `Etapa: ${contextInfo.currentStage}. `;
    }
    if (contextInfo.providedData.length > 0) {
      smartContext += `Datos proporcionados: ${contextInfo.providedData.join(', ')}. `;
    }
    
    // Add only the most recent relevant messages (max 4)
    const recentMessages = chatHistory.slice(-4);
    if (recentMessages.length > 0) {
      smartContext += '\n\nULTIMOS MENSAJES:\n';
      recentMessages.forEach((msg: any) => {
        const role = msg.role === 'user' ? 'Usuario' : 'NatalIA';
        // Clean and limit message content
        const cleanContent = this.cleanMessageForContext(msg.content);
        smartContext += `${role}: ${cleanContent}\n`;
      });
    }
    
    // Add current message
    smartContext += `\nMENSAJE ACTUAL DEL USUARIO:\n${currentMessage}`;
    
    console.log(`🔧 Smart context length: ${smartContext.length} (reduced from original)`);
    return smartContext;
  }
  
  /**
   * Extract key information from chat history
   */
  private extractContextInfo(chatHistory: any[]): {
    userName: string | null;
    chosenModality: string | null;
    currentStage: string;
    providedData: string[];
  } {
    let userName: string | null = null;
    let chosenModality: string | null = null;
    let currentStage = 'Inicio';
    const providedData: string[] = [];
    
    for (const msg of chatHistory) {
      if (msg.role === 'user' && msg.content) {
        const content = msg.content.toLowerCase();
        
        // Extract user name (likely short responses after greeting)
        if (!userName && msg.content.length > 2 && msg.content.length < 25 && 
            !content.includes('hola') && !content.includes('info') &&
            !content.includes('si') && !content.includes('no') &&
            !content.includes('?') && !content.includes('@') &&
            !/\d{5,}/.test(msg.content)) {
          userName = msg.content.trim();
        }
        
        // Extract chosen modality
        if (content.includes('virtual') || content === '2') {
          chosenModality = 'Virtual';
        } else if (content.includes('presencial') || content === '1') {
          chosenModality = 'Presencial';
        } else if (content.includes('online') || content === '3') {
          chosenModality = 'Online';
        }
        
        // Extract provided data
        if (content.includes('@')) {
          providedData.push('email');
        }
        if (/\d{10,}/.test(msg.content.replace(/\s/g, ''))) {
          providedData.push('telefono');
        }
        
        // Determine current stage
        if (content.includes('inscrib') || content.includes('quiero')) {
          currentStage = 'Inscripción';
        } else if (chosenModality) {
          currentStage = 'Información específica';
        } else if (userName) {
          currentStage = 'Elección de modalidad';
        }
      }
    }
    
    return { userName, chosenModality, currentStage, providedData };
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
      // Normalize Spanish characters to ASCII
      .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u')
      .replace(/Á/g, 'A').replace(/É/g, 'E').replace(/Í/g, 'I').replace(/Ó/g, 'O').replace(/Ú/g, 'U')
      .replace(/ñ/g, 'n').replace(/Ñ/g, 'N')
      .replace(/¿/g, '').replace(/¡/g, '') // Remove Spanish punctuation
      .substring(0, 150) // Limit length
      .trim();
  }

  /**
   * Determine current conversation stage
   */
  private determineConversationStage(chatHistory: any[]): string {
    const lastMessages = chatHistory.slice(-3);
    const content = lastMessages.map(m => m.content.toLowerCase()).join(' ');
    
    if (content.includes('inscribir')) return 'Inscripción';
    if (content.includes('precio') || content.includes('cuesta')) return 'Información de precios';
    if (content.includes('virtual') || content.includes('online')) return 'Elección de modalidad';
    if (content.includes('método')) return 'Explicación del método';
    if (content.includes('interesado')) return 'Confirmación de interés';
    if (content.includes('llamo')) return 'Obtención del nombre';
    
    return 'Inicio';
  }

  /**
   * Extract chosen modality from conversation history
   */
  private extractChosenModality(chatHistory: any[]): string {
    for (const msg of chatHistory) {
      if (msg.role === 'user') {
        if (msg.content.toLowerCase().includes('virtual')) return 'Virtual';
        if (msg.content.toLowerCase().includes('online')) return 'Online';
        if (msg.content.toLowerCase().includes('presencial')) return 'Presencial';
      }
    }
    return 'No elegida';
  }

  /**
   * Get company name
   */
  public getCompany(): string {
    return this.company;
  }
} 