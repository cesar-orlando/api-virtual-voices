import { Agent, tool, run } from '@openai/agents';
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
  protected agentContext: Record<string, any> = {};

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
      // console.log(`🔧 BaseAgent: run function imported successfully`);
      
      // Build conversation history for context
      let conversationContext = '';
      if (context?.chatHistory && context.chatHistory.length > 0) {
        conversationContext = '\n\nHISTORIAL DE CONVERSACION:\n';
        context.chatHistory.forEach((msg: any, index: number) => {
          const role = msg.role === 'user' ? 'Usuario' : 'IA';
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
      
      // SMART CONTEXT: If message is too long, use intelligent context reduction
      // Different thresholds for different companies
      let contextThreshold = 4000; // Default
      
      if (messageWithContext.length > contextThreshold) {
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
    
    // Extract key information based on company type
    const contextInfo = this.company === 'grupo-milkasa' || this.company === 'grupokg' || this.company === 'grupo-kg' 
      ? this.extractRealEstateContext(chatHistory)
      : this.extractContextInfo(chatHistory);
    
    // Build intelligent summary
    let smartContext = '';
    
    // Add context summary for real estate
    if (this.company === 'grupo-milkasa' || this.company === 'grupokg' || this.company === 'grupo-kg') {
      const realEstateContext = contextInfo as any; // Cast para evitar errores de tipo
      if (realEstateContext.userName) {
        smartContext += `CONTEXTO: Cliente es ${realEstateContext.userName}. `;
      }
      if (realEstateContext.greeted) {
        smartContext += `Ya se realizó el saludo inicial. `;
      }
      if (realEstateContext.propertyType) {
        smartContext += `Busca: ${realEstateContext.propertyType}. `;
      }
      if (realEstateContext.location) {
        smartContext += `Ubicación: ${realEstateContext.location}. `;
      }
      if (realEstateContext.operation) {
        smartContext += `Operación: ${realEstateContext.operation}. `;
      }
      if (realEstateContext.budget) {
        smartContext += `Presupuesto: ${realEstateContext.budget}. `;
      }
      if (realEstateContext.currentStage) {
        smartContext += `Etapa: ${realEstateContext.currentStage}. `;
      }
    } else {
      // Original logic for QuickLearning
      const quickLearningContext = contextInfo as any; // Cast para evitar errores de tipo  
      if (quickLearningContext.userName) {
        smartContext += `CONTEXTO: Usuario es ${quickLearningContext.userName}. `;
      }
      if (quickLearningContext.chosenModality) {
        smartContext += `Modalidad elegida: ${quickLearningContext.chosenModality}. `;
      }
      if (quickLearningContext.currentStage) {
        smartContext += `Etapa: ${quickLearningContext.currentStage}. `;
      }
      if (quickLearningContext.providedData && quickLearningContext.providedData.length > 0) {
        smartContext += `Datos proporcionados: ${quickLearningContext.providedData.join(', ')}. `;
      }
    }
    
    // Add more recent messages
    const messageCount = 20;
    const recentMessages = chatHistory.slice(-messageCount);
    
    if (recentMessages.length > 0) {
      smartContext += '\n\nULTIMOS MENSAJES:\n';
      recentMessages.forEach((msg: any) => {
        // Usar el nombre correcto según la empresa
        let assistantName = 'Asistente'; // Fallback
        if (this.company === 'grupo-milkasa') {
          assistantName = 'Alejandro';
        } else if (this.company === 'grupokg' || this.company === 'grupo-kg') {
          assistantName = 'Kaigi';
        }
        
        const role = msg.role === 'user' ? 'Cliente' : assistantName;
        // Clean and limit message content
        const cleanContent = this.cleanMessageForContext(msg.content);
        smartContext += `${role}: ${cleanContent}\n`;
      });
    }
    
    // Add current message
    smartContext += `\nMENSAJE ACTUAL DEL CLIENTE:\n${currentMessage}`;
    
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
   * Extract key information for real estate companies
   */
  private extractRealEstateContext(chatHistory: any[]): {
    userName: string | null;
    greeted: boolean;
    propertyType: string | null;
    location: string | null;
    operation: string | null;
    budget: string | null;
    currentStage: string;
    chosenModality?: string | null;  // Para compatibilidad
    providedData?: string[];  // Para compatibilidad
  } {
    let userName: string | null = null;
    let greeted = false;
    let propertyType: string | null = null;
    let location: string | null = null;
    let operation: string | null = null;
    let budget: string | null = null;
    let currentStage = 'Inicio';

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

        // Check if greeting happened
        if (content.includes('hola') || content.includes('buenas') || content.includes('buenos días')) {
          greeted = true;
        }

        // Extract property type
        if (content.includes('casa') || content.includes('departamento') || content.includes('depa') || 
            content.includes('terreno') || content.includes('local') || content.includes('oficina')) {
          propertyType = content.includes('casa') ? 'casa' : 
                        content.includes('departamento') || content.includes('depa') ? 'departamento' :
                        content.includes('terreno') ? 'terreno' : 'propiedad';
        }

        // Extract location (ciudades de Michoacán)
        if (content.includes('morelia') || content.includes('uruapan') || content.includes('zamora') ||
            content.includes('pátzcuaro') || content.includes('patzcuaro') || content.includes('lázaro cárdenas') ||
            content.includes('apatzingán') || content.includes('zitácuaro') || content.includes('michoacán')) {
          location = msg.content.trim();
        }

        // Extract operation
        if (content.includes('comprar') || content.includes('compra') || content.includes('venta')) {
          operation = 'compra';
        } else if (content.includes('rentar') || content.includes('renta') || content.includes('alquiler')) {
          operation = 'renta';
        } else if (content.includes('inversión') || content.includes('inversion')) {
          operation = 'inversión';
        }

        // Extract budget
        if (content.includes('presupuesto') || content.includes('$') || content.includes('pesos') ||
            content.includes('millones') || content.includes('mil') || /\d+[\d,]*/.test(content)) {
          budget = msg.content.substring(0, 50); // Limitar longitud
        }

        // Determine current stage
        if (userName && propertyType && location && operation) {
          currentStage = 'Búsqueda de propiedades';
        } else if (userName && (propertyType || location || operation)) {
          currentStage = 'Recolección de datos';
        } else if (userName) {
          currentStage = 'Identificación completada';
        } else if (greeted) {
          currentStage = 'Saludo completado';
        }
      }
      
      // Check if assistant already greeted
      if (msg.role === 'assistant' && msg.content) {
        const assistantContent = msg.content.toLowerCase();
        // Detectar saludo según la empresa
        const greetingPattern = this.company === 'grupokg' || this.company === 'grupo-kg' ? 'soy kaigi' : 'soy alejandro';
        
        if (assistantContent.includes('¿con quién tengo el gusto?') || 
            assistantContent.includes(greetingPattern)) {
          greeted = true;
        }
      }
    }

    return { userName, greeted, propertyType, location, operation, budget, currentStage };
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
      .substring(0, 100) // Limit length
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