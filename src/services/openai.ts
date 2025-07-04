import OpenAI from "openai";
import dotenv from "dotenv";
import { getEnvironmentConfig } from "../config/environments";
import { IIaConfig } from "../models/iaConfig.model";
import { IRecord } from "../models/record.model";
import { getDbConnection } from "../config/connectionManager";
import getToolModel from "../models/tool.model";
import { ToolExecutor } from "./toolExecutor";
import { OpenAIToolSchema } from "../types/tool.types";
dotenv.config();

// Obtener la configuración del entorno actual
const config = getEnvironmentConfig();

export const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

// Cache para schemas de herramientas por empresa
const toolSchemaCache: Map<string, { schema: OpenAIToolSchema[]; timestamp: number }> = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

export async function preparePrompt(
  config: IIaConfig
): Promise<string> {
  const prompt = `Al iniciar una conversacion siempre te presentas como: ${config?.name} e incluyes el saludo: ${config?.welcomeMessage}, tu objetivo es el de ${config?.objective}, informacion previa y contexto para despues del saludo inicial: ${config?.customPrompt}`;
  return prompt;
}

// Generar esquemas de herramientas para OpenAI por empresa
export async function getToolsForCompany(c_name: string): Promise<OpenAIToolSchema[]> {
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

    // Guardar en cache
    toolSchemaCache.set(c_name, { schema: schemas, timestamp: Date.now() });

    return schemas;
  } catch (error) {
    console.error('Error getting tools for company:', error);
    return [];
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
    
    // Parsear argumentos
    let parameters: Record<string, any> = {};
    try {
      parameters = JSON.parse(argsString);
    } catch (parseError) {
      throw new Error(`Invalid function arguments: ${argsString}`);
    }

    // Ejecutar herramienta
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
    // Obtener herramientas para la empresa
    const tools = c_name ? await getToolsForCompany(c_name) : [];

    // LIMPIA el historial para OpenAI - SOLO role y content
    const safeHistoryForOpenAI = chatHistory
      .filter((h: any): h is { role: string, content: string } => !!h && typeof h.content === 'string')
      .map((h: any) => ({ role: h.role, content: h.content }));

    console.log('OpenAI - Enviando:', JSON.stringify(safeHistoryForOpenAI), 'tokens aprox:', safeHistoryForOpenAI.reduce((acc: number, h: any) => acc + h.content.length, 0));

    const messages = [
      { role: "system", content: prompt || "Eres un asistente virtual." },
      // Solo enviar información básica del prospecto, no toda la BD
      { role: "system", content: `Información del prospecto: ${records.length > 0 ? 'Cliente registrado' : 'Nuevo prospecto'}`},
      ...safeHistoryForOpenAI
    ];

    // Configurar request con herramientas si están disponibles
    const requestConfig: any = {
      model: "gpt-4",
      messages,
      temperature: 0.3,
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
          temperature: 0.3,
        });

        const toolResponse = followUpResponse.choices[0].message.content || "No se pudo generar una respuesta.";
        console.log(`✅ Tool call respondió: "${toolResponse.substring(0, 100)}..."`);
        return toolResponse;
      }
    }

    const finalResponse = choice.message.content || "No se pudo generar una respuesta.";
    console.log(`✅ OpenAI respondió: "${finalResponse.substring(0, 100)}..."`);
    return finalResponse;
  } catch (error: any) {
    console.error('Error generating response with tools:', error);
    
    // Fallback a respuesta sin herramientas - LIMPIO Y SEGURO
    try {
      // LIMPIA el historial para el fallback también
      const safeHistoryForFallback = chatHistory
        .filter((h: any): h is { role: string, content: string } => !!h && typeof h.content === 'string')
        .map((h: any) => ({ role: h.role, content: h.content }));

      console.log('Fallback - Enviando a OpenAI:', JSON.stringify(safeHistoryForFallback), 'tokens aprox:', safeHistoryForFallback.reduce((acc: number, h: any) => acc + h.content.length, 0));

      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: prompt || "Eres un asistente virtual." },
          // Solo enviar información básica del prospecto, no toda la BD
          { role: "system", content: `Información del prospecto: ${records.length > 0 ? 'Cliente registrado' : 'Nuevo prospecto'}`},
          ...safeHistoryForFallback
        ],
        temperature: 0.3,
      });

      const fallbackResponse = response.choices[0].message.content || "No se pudo generar una respuesta.";
      console.log(`✅ Fallback respondió: "${fallbackResponse.substring(0, 100)}..."`);
      return fallbackResponse;
    } catch (fallbackError) {
      console.error('Fallback response error:', fallbackError);
      return "Lo siento, estoy experimentando dificultades técnicas. Por favor, intenta nuevamente.";
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