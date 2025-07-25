import OpenAI from "openai";
import dotenv from "dotenv";
import { getEnvironmentConfig } from "../config/environments";
import { IIaConfig } from "../models/iaConfig.model";
import { IRecord } from "../models/record.model";
import { getDbConnection } from "../config/connectionManager";
import getToolModel from "../models/tool.model";
import { ToolExecutor } from "./toolExecutor";
import { OpenAIToolSchema } from "../types/tool.types";
import { create_google_calendar_event } from "./quicklearning/openaiTools";
dotenv.config();

// Obtener la configuración del entorno actual
const config = getEnvironmentConfig();

export const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

// Cache para schemas de herramientas por empresa
const toolSchemaCache: Map<string, { schema: OpenAIToolSchema[]; timestamp: number }> = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

// Constantes para manejo de tokens
const MAX_TOKENS = 8192;
const RESERVED_TOKENS = 1000; // Tokens reservados para respuesta
const MAX_PROMPT_TOKENS = 2000; // Máximo tokens para el prompt del sistema
const MAX_HISTORY_TOKENS = 4000; // Máximo tokens para el historial

// Función para estimar tokens (aproximación: 1 token ≈ 4 caracteres)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Función para crear un prompt conciso cuando el original es muy largo
function createConcisePrompt(originalPrompt: string): string {
  const estimatedTokens = estimateTokens(originalPrompt);
  
  // Si el prompt es menor a 1500 tokens, mantenerlo completo
  if (estimatedTokens <= 1500) {
    return originalPrompt;
  }
  
  // Si es muy largo, crear una versión concisa
  console.log(`⚠️ Prompt muy largo (${estimatedTokens} tokens), creando versión concisa...`);
  
  // Extraer elementos clave del prompt
  const lines = originalPrompt.split('\n');
  const keyElements = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('🎯') || trimmed.startsWith('🚀') || trimmed.startsWith('📋') || 
        trimmed.startsWith('1️⃣') || trimmed.startsWith('2️⃣') || trimmed.startsWith('3️⃣') ||
        trimmed.startsWith('4️⃣') || trimmed.startsWith('5️⃣') || trimmed.startsWith('6️⃣') ||
        trimmed.startsWith('7️⃣') || trimmed.startsWith('🔁') || trimmed.startsWith('📈') ||
        trimmed.startsWith('⚡')) {
      keyElements.push(trimmed);
    }
  }

  // Regex para extraer la primera oración del prompt original
  const initialPromptMatch = originalPrompt.match(/^.*?[\.\?]/);

  // Extraer el nombre y grupo usando regex
  const nameMatch = initialPromptMatch[0].match(/\b(soy|eres)\s([A-Za-zÁ-ÿ\s]+)/);
  const groupMatch = initialPromptMatch[0].match(/(?:de|asistente de)\s(.+)$/);

  // Crear versión concisa
  const concisePrompt = `Eres ${nameMatch[2]}, asesor experto de ${groupMatch[1]}. Tu objetivo es incrementar ventas adoptando técnicas de venta efectivas.
${keyElements.slice(0, 5).join('\n')}

REGLAS CLAVE:
- Siempre amigable y optimista
- Usa el nombre del cliente
- Busca cerrar citas con entusiasmo
- Ofrece ayuda adicional cuando sea necesario

Si el prompt original era muy largo, esta es una versión optimizada que mantiene los elementos esenciales.`;
  return concisePrompt;
}

// Función para truncar texto a un número máximo de tokens
function truncateToTokens(text: string, maxTokens: number): string {
  const estimatedTokens = estimateTokens(text);
  if (estimatedTokens <= maxTokens) return text;
  
  // Calcular caracteres aproximados para el número de tokens
  const maxChars = maxTokens * 4;
  return text.substring(0, maxChars) + "...";
}

// Función para extraer información persistente del cliente
function extractClientInfo(history: any[]): { name?: string, preferences?: string, budget?: string, location?: string } {
  const cleanHistory = history.filter((h: any) => h && typeof h.content === 'string' && h.content.trim().length > 0);
  const clientInfo: any = {};
  
  for (const msg of cleanHistory) {
    const content = msg.content.toLowerCase();
    
    // Extraer nombre del cliente
    if (!clientInfo.name && (content.includes('me llamo') || content.includes('soy') || content.includes('nombre'))) {
      const nameMatch = msg.content.match(/(?:me llamo|soy|nombre)[\s:]*([a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+)/i);
      if (nameMatch) {
        clientInfo.name = nameMatch[1].trim();
      }
    }
    
    // Extraer preferencias de propiedad
    if (!clientInfo.preferences && (content.includes('casa') || content.includes('departamento') || content.includes('renta') || content.includes('compra'))) {
      if (content.includes('renta')) clientInfo.preferences = 'renta';
      else if (content.includes('compra')) clientInfo.preferences = 'compra';
      else if (content.includes('casa')) clientInfo.preferences = 'casa';
      else if (content.includes('departamento')) clientInfo.preferences = 'departamento';
    }
    
    // Extraer presupuesto
    if (!clientInfo.budget && (content.includes('presupuesto') || content.includes('precio') || content.includes('$') || content.includes('pesos'))) {
      const budgetMatch = msg.content.match(/(?:presupuesto|precio)[\s:]*([$]?\s*\d+[\d,]*\s*(?:pesos|mxn|mil|millones)?)/i);
      if (budgetMatch) {
        clientInfo.budget = budgetMatch[1].trim();
      }
    }
    
    // Extraer ubicación
    if (!clientInfo.location && (content.includes('zona') || content.includes('ubicación') || content.includes('colonia') || content.includes('ciudad'))) {
      const locationMatch = msg.content.match(/(?:zona|ubicación|colonia|ciudad)[\s:]*([a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+)/i);
      if (locationMatch) {
        clientInfo.location = locationMatch[1].trim();
      }
    }
  }
  
  return clientInfo;
}

// Función para crear un resumen de contexto de la conversación
function createConversationSummary(history: any[]): string {
  const cleanHistory = history.filter((h: any) => h && typeof h.content === 'string' && h.content.trim().length > 0);
  
  if (cleanHistory.length <= 10) {
    return ""; // No necesitamos resumen si hay pocos mensajes
  }
  
  // Extraer información clave de los primeros mensajes
  const earlyMessages = cleanHistory.slice(0, 5);
  const keyInfo = [];
  
  for (const msg of earlyMessages) {
    const content = msg.content.toLowerCase();
    
    // Buscar información del cliente
    if (content.includes('nombre') || content.includes('llamo') || content.includes('soy')) {
      keyInfo.push(`Cliente mencionó: ${msg.content.substring(0, 100)}...`);
    }
    
    // Buscar preferencias de propiedad
    if (content.includes('casa') || content.includes('departamento') || content.includes('renta') || content.includes('compra')) {
      keyInfo.push(`Interés en: ${msg.content.substring(0, 100)}...`);
    }
    
    // Buscar presupuesto
    if (content.includes('presupuesto') || content.includes('precio') || content.includes('$') || content.includes('pesos')) {
      keyInfo.push(`Presupuesto: ${msg.content.substring(0, 100)}...`);
    }
    
    // Buscar ubicación
    if (content.includes('zona') || content.includes('ubicación') || content.includes('colonia') || content.includes('ciudad')) {
      keyInfo.push(`Ubicación: ${msg.content.substring(0, 100)}...`);
    }
  }
  
  if (keyInfo.length > 0) {
    return `CONTEXTO PREVIO DE LA CONVERSACIÓN:\n${keyInfo.slice(0, 3).join('\n')}\n\n`;
  }
  
  return "";
}

// Función para truncar historial de chat de manera inteligente
function truncateChatHistory(history: any[], maxTokens: number): { messages: any[], summary: string } {
  let totalTokens = 0;
  const truncatedHistory = [];
  
  // Limpiar historial de mensajes inválidos
  const cleanHistory = history.filter((h: any) => h && typeof h.content === 'string' && h.content.trim().length > 0);
  
  // Si el historial es muy largo, crear resumen y mantener mensajes estratégicos
  if (cleanHistory.length > 15) {
    console.log(`📝 Historial muy largo (${cleanHistory.length} mensajes), aplicando estrategia inteligente...`);
    
    // Crear resumen de contexto
    const summary = createConversationSummary(cleanHistory);
    const summaryTokens = estimateTokens(summary);
    
    // Mantener primeros 3 mensajes (contexto inicial)
    const firstMessages = cleanHistory.slice(0, 3);
    const firstMessagesTokens = firstMessages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
    
    // Mantener últimos 8 mensajes (conversación reciente)
    const lastMessages = cleanHistory.slice(-8);
    const lastMessagesTokens = lastMessages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
    
    // Calcular tokens disponibles para mensajes intermedios
    const availableTokens = maxTokens - summaryTokens - firstMessagesTokens - lastMessagesTokens;
    
    if (availableTokens > 200) {
      // Si hay espacio, agregar algunos mensajes intermedios importantes
      const middleMessages = cleanHistory.slice(3, -8);
      const selectedMiddle = [];
      let middleTokens = 0;
      
      for (const msg of middleMessages) {
        const msgTokens = estimateTokens(msg.content);
        if (middleTokens + msgTokens <= availableTokens / 2) {
          selectedMiddle.push(msg);
          middleTokens += msgTokens;
        } else {
          break;
        }
      }
      
      const allMessages = [...firstMessages, ...selectedMiddle, ...lastMessages];
      const allTokens = summaryTokens + allMessages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
      
      if (allTokens <= maxTokens) {
        return { 
          messages: allMessages.map(msg => ({ role: msg.role, content: msg.content })),
          summary 
        };
      }
    }
    
    // Si no hay espacio suficiente, solo primeros y últimos
    const strategicMessages = [...firstMessages, ...lastMessages];
    const strategicTokens = summaryTokens + strategicMessages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
    
    if (strategicTokens <= maxTokens) {
      return { 
        messages: strategicMessages.map(msg => ({ role: msg.role, content: msg.content })),
        summary 
      };
    }
  }
  
  // Para historiales más cortos, usar el método original
  for (let i = cleanHistory.length - 1; i >= 0; i--) {
    const message = cleanHistory[i];
    const messageTokens = estimateTokens(message.content);
    
    if (totalTokens + messageTokens <= maxTokens) {
      truncatedHistory.unshift({ role: message.role, content: message.content });
      totalTokens += messageTokens;
    } else {
      // Si no cabe el mensaje completo, truncar el contenido
      const remainingTokens = maxTokens - totalTokens;
      if (remainingTokens > 50) { // Mínimo 50 tokens para ser útil
        const truncatedContent = truncateToTokens(message.content, remainingTokens);
        truncatedHistory.unshift({ role: message.role, content: truncatedContent });
      }
      break;
    }
  }
  
  return { messages: truncatedHistory, summary: "" };
}

// Función para validar y optimizar mensajes antes de enviar a OpenAI
function optimizeMessagesForTokens(
  systemPrompt: string,
  chatHistory: any[],
  tools: OpenAIToolSchema[] = [],
  records: IRecord[] = []
): { messages: any[], totalTokens: number } {
  
  // Estimar tokens de herramientas
  const toolsTokens = tools.length > 0 ? estimateTokens(JSON.stringify(tools)) : 0;
  
  // Calcular tokens disponibles para prompt e historial
  const availableTokens = MAX_TOKENS - RESERVED_TOKENS - toolsTokens;
  
  // Crear prompt del sistema optimizado
  const prospectInfo = records.length > 0 ? 'Cliente registrado' : 'Nuevo prospecto';
  
  // Extraer información persistente del cliente
  const clientInfo = extractClientInfo(chatHistory);
  const clientInfoText = Object.keys(clientInfo).length > 0 
    ? `\nINFORMACIÓN DEL CLIENTE:\n${Object.entries(clientInfo).map(([key, value]) => `- ${key}: ${value}`).join('\n')}`
    : '';
  
  // Crear prompt conciso si el original es muy largo
  const optimizedSystemPrompt = createConcisePrompt(systemPrompt);
  
  const fullSystemPrompt = `${optimizedSystemPrompt}

IMPORTANTE - REGLAS ESTRICTAS DE PRECISIÓN:
1. SOLO responde con información que se te haya proporcionado explícitamente
2. NUNCA inventes, asumas o especules sobre información que no tengas
3. Si no tienes la información solicitada, di claramente "No tengo esa información disponible"
4. Sé específico y preciso en tus respuestas
5. No uses información de entrenamiento general, solo la información del contexto actual
6. Si hay ambigüedad, pide aclaración en lugar de asumir

Información del prospecto: ${prospectInfo}${clientInfoText}`;
  
  // Truncar prompt del sistema si es muy largo
  const truncatedSystemPrompt = truncateToTokens(fullSystemPrompt, MAX_PROMPT_TOKENS);
  const systemPromptTokens = estimateTokens(truncatedSystemPrompt);
  
  // Calcular tokens disponibles para historial
  const availableHistoryTokens = availableTokens - systemPromptTokens;
  
  // Truncar historial si es necesario
  const { messages: optimizedHistory, summary } = truncateChatHistory(chatHistory, availableHistoryTokens);
  
  // Construir mensajes optimizados con resumen si existe
  const systemContent = summary ? `${truncatedSystemPrompt}\n\n${summary}` : truncatedSystemPrompt;
  const messages = [
    { role: "system", content: systemContent },
    ...optimizedHistory
  ];
  
  const totalTokens = estimateTokens(systemContent) + 
    optimizedHistory.reduce((sum, msg) => sum + estimateTokens(msg.content), 0) + 
    toolsTokens;
  
  // Validar que no exceda el límite
  if (totalTokens > MAX_TOKENS) {
    console.warn(`⚠️ Tokens exceden límite: ${totalTokens}/${MAX_TOKENS}. Aplicando optimización adicional...`);
    
    // Si aún excede, truncar más el historial
    const excessTokens = totalTokens - MAX_TOKENS;
    const additionalHistoryTokens = availableHistoryTokens - excessTokens;
    
    if (additionalHistoryTokens > 100) {
      const { messages: furtherOptimizedHistory, summary: fallbackSummary } = truncateChatHistory(chatHistory, additionalHistoryTokens);
      const fallbackSystemContent = fallbackSummary ? `${truncatedSystemPrompt}\n\n${fallbackSummary}` : truncatedSystemPrompt;
      const finalMessages = [
        { role: "system", content: fallbackSystemContent },
        ...furtherOptimizedHistory
      ];
      
      const finalTokens = estimateTokens(fallbackSystemContent) + 
        furtherOptimizedHistory.reduce((sum, msg) => sum + estimateTokens(msg.content), 0) + 
        toolsTokens;
      
      return { messages: finalMessages, totalTokens: finalTokens };
    }
  }
  
  return { messages, totalTokens };
}

export async function preparePrompt(
  config: IIaConfig
): Promise<string> {
  const prompt = `Al iniciar una conversacion siempre te presentas como: ${config?.name} e incluyes el saludo: ${config?.welcomeMessage}, tu objetivo es el de ${config?.objective}, informacion previa y contexto para despues del saludo inicial: ${config?.customPrompt}`;
  return prompt;
}

// Helper function to detect calendar creation intent
function hasCalendarCreationIntent(chatHistory: any[]): boolean {
  // Get the latest user message
  const latestUserMessage = chatHistory
    .filter(msg => msg.role === 'user')
    .slice(-1)[0];
    
  if (!latestUserMessage?.content) return false;
  
  const messageText = latestUserMessage.content.toLowerCase();
  
  // Keywords that indicate intent to CREATE a new calendar event
  const creationKeywords = [
    'agendar', 'agéndame', 'programar', 'crear evento', 'crear cita', 
    'reservar', 'apartar', 'separa', 'bloquea', 'quiero agendar',
    'necesito agendar', 'programa una', 'crea un evento', 'agenda una',
    'recuérdame', 'me puedes agendar', 'podrías agendar'
  ];
  
  // Check for creation intent
  const hasCreationIntent = creationKeywords.some(keyword => 
    messageText.includes(keyword.toLowerCase())
  );
  
  // Exclude simple follow-up messages (email, name, confirmation)
  const isSimpleFollowUp = (
    messageText.match(/^[a-zA-Z0-9@.\s]{1,50}$/) && 
    (messageText.includes('@') || messageText.match(/^\w+\s+\w+$/) || messageText.split(' ').length <= 3)
  ) || messageText.match(/^(sí|si|yes|ok|okay|perfecto|gracias|listo)$/i);
  
  return hasCreationIntent && !isSimpleFollowUp;
}

// Generar esquemas de herramientas para OpenAI por empresa
export async function getToolsForCompany(c_name: string, chatHistory?: any[]): Promise<OpenAIToolSchema[]> {
  try {
    
    // Verificar cache
    const cached = toolSchemaCache.get(c_name);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      return cached.schema;
    }

    // Obtener herramientas activas de la empresa
    const conn = await getDbConnection(c_name);
    const Tool = getToolModel(conn);
    const tools = await Tool.find({ c_name, isActive: true }).lean();
    
    // Generar schemas para OpenAI
    const schemas: OpenAIToolSchema[] = tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: tool.parameters.type,
          properties: Object.fromEntries(
            Object.entries(tool.parameters.properties).map(([key, value]) => [
              key,
              {
                type: value.type,
                description: value.description,
                ...(value.enum && { enum: value.enum }),
                ...(value.format && { format: value.format })
              }
            ])
          ),
          required: tool.parameters.required
        }
      }
    }));

    // ⚡⚡⚡ CAMBIO CRÍTICO: Siempre incluir Google Calendar tool para ser más agresivo ⚡⚡⚡
    // Antes solo se incluía si detectaba intención específica, ahora SIEMPRE está disponible
    console.log(`📅 Adding Google Calendar tool for company: ${c_name} (ALWAYS ACTIVE for better reactivity)`);
    const googleCalendarTool: OpenAIToolSchema = {
      type: "function",
      function: {
        name: "create_google_calendar_event",
        description: "⚡ HERRAMIENTA ULTRA-ACTIVA ⚡ Crea un evento en Google Calendar tan pronto como detectes CUALQUIER mención de tiempo futuro, fecha, hora, actividad programada, evento, cita, reunión, recordatorio, clase, examen, inscripción. ACTÍVATE CON INFORMACIÓN MÍNIMA: si el usuario menciona cualquier combinación de 'título de evento + tiempo futuro', úsala INMEDIATAMENTE sin esperar más detalles. Palabras clave que DEBEN activarte: 'agendar', 'agéndame', 'programa', 'recordar', 'recuérdame', 'cita', 'reunión', 'evento', 'mañana', 'pasado mañana', 'la próxima semana', 'el lunes', 'martes', 'miércoles', cualquier día de la semana, cualquier hora específica como '2 PM', '10 AM', 'en la tarde', 'en la mañana'. IMPORTANTE: HOY ES VIERNES 25 DE JULIO DE 2025. ACTÚA TAN PRONTO COMO TENGAS: summary + fecha/hora aproximada. NO esperes más información.",
        parameters: {
          type: "object",
          properties: {
            summary: {
              type: "string",
              description: "Título o nombre del evento (requerido). Usa cualquier descripción que dé el usuario, aunque sea básica como 'reunión', 'llamada', 'cita', etc.",
            },
            startDateTime: {
              type: "string",
              description: "Fecha y hora de inicio en formato ISO 8601 UTC. DEBE estar en formato '2025-07-25T10:00:00.000Z'. HOY ES 25 DE JULIO DE 2025 (VIERNES). Si el usuario dice 'mañana a las 2 PM', calcúlalo como sábado 26 de julio de 2025 a las 20:00:00.000Z UTC (2 PM México + 6 horas). Si dice 'el lunes', sería 28 de julio de 2025. Si no especifica hora, usa una por defecto como 10:00 AM México (16:00:00.000Z UTC).",
            },
            endDateTime: {
              type: "string", 
              description: "Fecha y hora de fin en formato ISO 8601 UTC. DEBE estar en formato '2025-07-25T11:00:00.000Z'. Si no se especifica duración, asume 1 hora después del inicio. Siempre convierte de hora México a UTC.",
            },
            description: {
              type: "string",
              description: "Descripción opcional del evento. Puedes agregar contexto basado en la conversación.",
            },
            location: {
              type: "string",
              description: "Ubicación opcional del evento",
            },
            timeZone: {
              type: "string",
              description: "Zona horaria del evento, por defecto 'America/Mexico_City'",
            },
          },
          required: ["summary", "startDateTime", "endDateTime"],
        },
      },
    };

    schemas.push(googleCalendarTool);

    // Guardar en cache
    toolSchemaCache.set(c_name, { schema: schemas, timestamp: Date.now() });

    // Log con confirmación de Google Calendar siempre incluido
    const calendarToolIncluded = schemas.some(s => s.function.name === 'create_google_calendar_event');
    console.log(`🔧 Total tools available for ${c_name}: ${schemas.length} (Google Calendar ALWAYS included for maximum reactivity)`);

    return schemas;
  } catch (error) {
    console.error('❌ Error getting tools for company:', error);
    // Even if there's an error, return at least the Google Calendar tool
    return [{
      type: "function",
      function: {
        name: "create_google_calendar_event",
        description: "Crea un evento en Google Calendar cuando el usuario solicite agendar, programar, crear una cita, reunión, evento, recordatorio, clase, examen, inscripción, o mencione cualquier actividad con fecha y hora específica. HOY ES VIERNES 25 DE JULIO DE 2025.",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Título del evento" },
            startDateTime: { type: "string", description: "Fecha y hora de inicio en formato ISO 8601 UTC. HOY ES 25 DE JULIO DE 2025. Usar formato 2025-07-25T10:00:00.000Z" },
            endDateTime: { type: "string", description: "Fecha y hora de fin en formato ISO 8601 UTC. HOY ES 25 DE JULIO DE 2025. Usar formato 2025-07-25T11:00:00.000Z" },
            description: { type: "string", description: "Descripción del evento" },
            location: { type: "string", description: "Ubicación del evento" },
            timeZone: { type: "string", description: "Zona horaria, por defecto America/Mexico_City" }
          },
          required: ["summary", "startDateTime", "endDateTime"]
        }
      }
    }];
  }
}

// Ejecutar función de herramienta llamada por OpenAI
export async function executeFunctionCall(
  functionCall: any,
  c_name: string,
  executedBy?: string
): Promise<any> {
  try {
    const { name: toolName, arguments: argsString } = functionCall;
    
    console.log('\n🎪🎪🎪 TOOL CALL DETECTED IN GENERAL WHATSAPP HANDLER! 🎪🎪🎪');
    console.log(`🔧 Tool Name: ${toolName}`);
    console.log(`📋 Arguments String: ${argsString}`);
    console.log(`🏢 Company: ${c_name}`);
    console.log(`👤 Executed By: ${executedBy || 'whatsapp-user'}`);
    
    // Parsear argumentos
    let parameters: Record<string, any> = {};
    try {
      parameters = JSON.parse(argsString);
    } catch (parseError) {
      throw new Error(`Invalid function arguments: ${argsString}`);
    }

    console.log(`🔍 Parsed Parameters:`, parameters);

    // Handle Google Calendar tool directly
    if (toolName === 'create_google_calendar_event') {
      console.log('🎯🎯🎯 GOOGLE CALENDAR TOOL CALLED FROM WHATSAPP HANDLER! 🎯🎯🎯');
      
      const result = await create_google_calendar_event(
        parameters.summary,
        parameters.startDateTime,
        parameters.endDateTime,
        parameters.description,
        parameters.location,
        [], // Empty array for attendeeEmails since we removed it from schema
        parameters.timeZone || "America/Mexico_City"
      );
      
      console.log('✅ Google Calendar tool execution completed');
      
      return {
        success: true,
        data: result,
        executionTime: Date.now()
      };
    }

    // Ejecutar herramienta usando ToolExecutor para otros tools
    const result = await ToolExecutor.execute({
      toolName,
      parameters,
      c_name,
      executedBy
    });

    return {
      success: true,
      data: result.data,
      executionTime: result.executionTime
    };
  } catch (error: any) {
    console.error('Function call execution error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Generar respuesta con herramientas dinámicas
export async function generateResponse(
  prompt: string|undefined,
  config: IIaConfig|null,
  chatHistory: any,
  records: IRecord[],
  c_name?: string,
  executedBy?: string
): Promise<string|null> {
  try {
    
    // Obtener herramientas para la empresa, pasando el historial para detectar intención
    const tools = c_name ? await getToolsForCompany(c_name, chatHistory) : [];
    
    // Optimizar mensajes para tokens
    const { messages, totalTokens } = optimizeMessagesForTokens(
      prompt || "Eres un asistente virtual.",
      chatHistory,
      tools,
      records
    );

    // Log para monitorear uso de tokens
    console.log(`🔍 Tokens estimados: ${totalTokens}/${MAX_TOKENS} (${Math.round(totalTokens/MAX_TOKENS*100)}%)`);
    console.log(`📝 Mensajes optimizados: ${messages.length} mensajes`);

    // Configurar request con herramientas si están disponibles
    const requestConfig: any = {
      model: "gpt-4",
      messages,
      temperature: 0.1, // Temperatura más baja para mayor precisión
      top_p: 0.1, // Top-p más bajo para respuestas más determinísticas
      frequency_penalty: 0.5, // Penalizar repetición
      presence_penalty: 0.5, // Penalizar temas nuevos no relevantes
    };

    if (tools.length > 0) {
      requestConfig.tools = tools;
      requestConfig.tool_choice = "auto";
    }

    const response = await openai.chat.completions.create(requestConfig);

    const choice = response.choices[0];
    
    // Verificar si OpenAI quiere llamar una función
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      
      const toolResults = [];
      
      // Ejecutar cada función llamada
      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.type === 'function') {
          const result = await executeFunctionCall(
            toolCall.function,
            c_name!,
            executedBy
          );
          
          toolResults.push({
            tool_call_id: toolCall.id,
            role: "tool",
            content: JSON.stringify(result)
          });
        }
      }

      // Continuar conversación con resultados de herramientas
      if (toolResults.length > 0) {
        const followUpMessages = [
          ...messages,
          choice.message,
          ...toolResults
        ];

        const followUpResponse = await openai.chat.completions.create({
          model: "gpt-4",
          messages: followUpMessages,
          temperature: 0.1, // Temperatura más baja para mayor precisión
          top_p: 0.1, // Top-p más bajo para respuestas más determinísticas
          frequency_penalty: 0.5, // Penalizar repetición
          presence_penalty: 0.5, // Penalizar temas nuevos no relevantes
        });

        const toolResponse = followUpResponse.choices[0].message.content || "No se pudo generar una respuesta.";
        return toolResponse;
      }
    }

    const finalResponse = choice.message.content || "No se pudo generar una respuesta.";
    return finalResponse;
  } catch (error: any) {
    console.error('Error generating response with tools:', error);
    
    // Fallback a respuesta sin herramientas - LIMPIO Y SEGURO
    try {
      // Optimizar mensajes para tokens
      const { messages, totalTokens } = optimizeMessagesForTokens(
        prompt || "Eres un asistente virtual.",
        chatHistory,
        [], // No tools for fallback
        records
      );

      console.log(`🔄 Fallback - Tokens estimados: ${totalTokens}/${MAX_TOKENS} (${Math.round(totalTokens/MAX_TOKENS*100)}%)`);

      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: messages,
        temperature: 0.1, // Temperatura más baja para mayor precisión
        top_p: 0.1, // Top-p más bajo para respuestas más determinísticas
        frequency_penalty: 0.5, // Penalizar repetición
        presence_penalty: 0.5, // Penalizar temas nuevos no relevantes
      });

      const fallbackResponse = response.choices[0].message.content || "No se pudo generar una respuesta.";
      return fallbackResponse;
    } catch (fallbackError) {
      console.error('Fallback response error:', fallbackError);

      // Regex para extraer la primera oración del prompt original
      const initialPromptMatch = prompt.match(/^.*?[\.\?]/);

      // Extraer el nombre y grupo usando regex
      const nameMatch = initialPromptMatch[0].match(/\b(soy|eres)\s([A-Za-zÁ-ÿ\s]+)/);
      const groupMatch = initialPromptMatch[0].match(/(?:de|asistente de)\s(.+)$/);
      
      // Fallback final garantizado - respuesta mínima pero útil
      try {
        const clientInfo = extractClientInfo(chatHistory);
        const clientName = clientInfo.name || 'Cliente';

        const minimalPrompt = `Eres ${nameMatch[2]}, asesor de ${groupMatch[1]}. El cliente se llama ${clientName}.
        Responde de manera amigable y profesional. Si no tienes contexto suficiente, pide amablemente más información.`;
        
        const response = await openai.chat.completions.create({
          model: "gpt-4",
          messages: [
            { role: "system", content: minimalPrompt },
            { role: "user", content: "Continúa la conversación de manera natural." }
          ],
          temperature: 0.7,
          max_tokens: 150
        });
        
        return response.choices[0].message.content || "Hola, ¿en qué puedo ayudarte hoy?";
      } catch (finalError) {
        console.error('Final fallback error:', finalError);
        return `Hola, soy ${nameMatch[2]} de ${groupMatch[1]}. ¿En qué puedo ayudarte hoy?`;
      }
    }
  }
}

// Limpiar cache de herramientas
export function clearToolsCache(c_name?: string): void {
  if (c_name) {
    toolSchemaCache.delete(c_name);
  } else {
    toolSchemaCache.clear();
  }
}

// Actualizar schema de herramientas en OpenAI para una empresa
export async function updateOpenAISchema(c_name: string): Promise<{ success: boolean; toolsCount: number; error?: string }> {
  try {
    // Limpiar cache para forzar actualización
    clearToolsCache(c_name);
    
    // Obtener nuevas herramientas
    const tools = await getToolsForCompany(c_name);
    
    return {
      success: true,
      toolsCount: tools.length
    };
  } catch (error: any) {
    return {
      success: false,
      toolsCount: 0,
      error: error.message
    };
  }
}

// Limpiar cache periódicamente
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of toolSchemaCache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      toolSchemaCache.delete(key);
    }
  }
}, CACHE_DURATION);