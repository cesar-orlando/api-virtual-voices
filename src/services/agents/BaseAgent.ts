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
        conversationContext = '\n\n### 📝 **HISTORIAL DE CONVERSACIÓN:**\n';
        context.chatHistory.forEach((msg: any, index: number) => {
          const role = msg.role === 'user' ? '👤 Usuario' : '🤖 NatalIA';
          conversationContext += `${role}: ${msg.content}\n`;
        });
        conversationContext += '\n### 🎯 **CONTEXTO ACTUAL:**\n';
        conversationContext += `- Nombre del usuario: ${this.extractUserName(context.chatHistory)}\n`;
        conversationContext += `- Etapa de conversación: ${this.determineConversationStage(context.chatHistory)}\n`;
        conversationContext += `- Modalidad elegida: ${this.extractChosenModality(context.chatHistory)}\n`;
      }
      
      // Add conversation context to the message
      const messageWithContext = conversationContext ? 
        `${conversationContext}\n\n### 💬 **MENSAJE ACTUAL DEL USUARIO:**\n${message}` : 
        message;
      
      const agentContext: AgentContext = {
        company: this.company,
        ...context
      };
      
/*       console.log(`🔧 BaseAgent: About to run agent for ${this.company}`);
      console.log(`🔧 BaseAgent: Agent object:`, this.agent);
      console.log(`🔧 BaseAgent: Message with context:`, messageWithContext.substring(0, 100)); */
      const result = await run(this.agent, messageWithContext, {
        context: agentContext
      });
/*       console.log(`🔧 BaseAgent: Agent run completed for ${this.company}`);
      console.log(`🔧 BaseAgent: Result:`, result);

      console.log(`🔧 BaseAgent: finalOutput:`, result.finalOutput); */
      return result.finalOutput || 'No se pudo generar una respuesta.';
    } catch (error) {
      console.error(`❌ Error processing message for ${this.company}:`, error);
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