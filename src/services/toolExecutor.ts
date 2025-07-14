import { getDbConnection } from "../config/connectionManager";
import getToolModel, { getToolExecutionModel } from "../models/tool.model";
import { IToolDocument } from "../models/tool.model";
import { ToolExecutionRequest } from "../types/tool.types";
import { applyFuzzySearchToToolResult } from "../utils/fuzzyPropertySearch";
import advancedRecordFilter from "../utils/advancedRecordFilter";

// NOTA IMPORTANTE:
// El fuzzy search aquí SOLO se aplica como un filtro básico sobre los resultados de la herramienta (por ejemplo, una API externa),
// usando el parámetro 'query' si está presente. 
// NO maneja lógica de negocio, contexto conversacional, ni extracción de links o keywords avanzados.
//
// TODA la lógica avanzada de filtrado, extracción de links, keywords, contexto de conversación, y selección de records relevantes
// DEBE implementarse en el endpoint principal del chatbot (por ejemplo, 'testIA'), donde se tiene acceso al historial de mensajes,
// contexto del usuario y lógica específica del negocio.
//
// En resumen:
// - toolExecutor.ts: Filtro básico (fuzzy) sobre resultados de herramientas individuales.
// - Endpoint de chat (testIA): Lógica avanzada de filtrado, contexto, extracción de links, keywords, y manejo de conversación.
//
// Así se evita duplicar lógica y se mantiene el código claro y mantenible.

// Rate limiting cache (en producción usar Redis)
const rateLimitCache: Map<string, { count: number; resetTime: number }> = new Map();

export class ToolExecutor {
  
  // Ejecutar herramienta individual
  static async execute(request: ToolExecutionRequest): Promise<any> {
    const { toolName, parameters, c_name, executedBy } = request;
    
    try {
      const conn = await getDbConnection(c_name);
      const Tool = getToolModel(conn);
      const ToolExecution = getToolExecutionModel(conn);

      // Buscar herramienta
      const tool = await Tool.findOne({ name: toolName, c_name, isActive: true });
      if (!tool) {
        throw new Error(`Tool '${toolName}' not found or inactive`);
      }

      // Validar rate limiting
      await this.checkRateLimit(c_name, tool);

      // Validar seguridad
      const securityValidation = await tool.validateSecurity();
      if (!securityValidation.isValid) {
        throw new Error(`Security validation failed: ${securityValidation.errors.join(', ')}`);
      }

      // Ejecutar la herramienta
      const startTime = Date.now();
      let executionResult;

      try {
        // LOG 1: Parámetros recibidos
        console.log('[TOOL EXECUTOR] Parámetros recibidos:', parameters);

        // 1. Ejecutar request HTTP a la URL base (sin filtros)
        executionResult = await this.executeHttpRequest(tool, {}); // No pasar parámetros para evitar filtros en la URL

        // LOG 2: Cantidad de registros obtenidos
        if (Array.isArray(executionResult.data)) {
          console.log(`[TOOL EXECUTOR] Registros obtenidos de la tool: ${executionResult.data.length}`);
        } else {
          console.log('[TOOL EXECUTOR] Tipo de datos obtenidos:', typeof executionResult.data);
        }

        // 2. Guardar log de ejecución exitosa
        const execution = new ToolExecution({
          toolId: tool._id,
          toolName: tool.name,
          c_name,
          parameters: parameters || {},
          response: {
            success: true,
            data: executionResult.data,
            statusCode: executionResult.statusCode,
            executionTime: Date.now() - startTime
          },
          executedBy
        });
        await execution.save();

        // 3. Si hay parámetros, combinarlos en un string para fuzzy search
        let fuzzyQuery = '';
        if (parameters && typeof parameters === 'object' && Object.keys(parameters).length > 0) {
          fuzzyQuery = Object.values(parameters).filter(Boolean).join(' ');
        }
        // LOG 3: String de fuzzyQuery generado
        console.log('[TOOL EXECUTOR] fuzzyQuery generado:', fuzzyQuery);

        // 4. Aplicar fuzzy search si hay query
        if (fuzzyQuery) {
          let recordsArray = executionResult.data;
          let wrapperKey = null;
          // Si data es un objeto, intenta extraer el array de los campos comunes
          if (executionResult.data && typeof executionResult.data === 'object' && !Array.isArray(executionResult.data)) {
            const possibleKeys = ['data', 'records', 'result', 'items', 'list'];
            for (const key of possibleKeys) {
              if (Array.isArray(executionResult.data[key])) {
                recordsArray = executionResult.data[key];
                wrapperKey = key;
                break;
              }
            }
          }
          const beforeCount = Array.isArray(recordsArray) ? recordsArray.length : 0;
          const filtered = advancedRecordFilter(recordsArray, fuzzyQuery, parameters);
          // LOG 4: Resultados después del fuzzy search
          if (Array.isArray(filtered)) {
            console.log(`[TOOL EXECUTOR] Resultados después del fuzzy: ${filtered.length} (de ${beforeCount})`);
          } else if (filtered && filtered.sugerencias) {
            console.log(`[TOOL EXECUTOR] No hubo match, sugerencias: ${filtered.sugerencias.length} (de ${beforeCount})`);
          } else {
            console.log('[TOOL EXECUTOR] Resultado después del fuzzy:', typeof filtered);
          }
          // Si había un wrapper, vuelve a poner el resultado en el mismo campo
          if (wrapperKey) {
            executionResult.data[wrapperKey] = filtered;
          } else {
            executionResult.data = filtered;
          }
        }

        return {
          success: true,
          data: executionResult.data,
          statusCode: executionResult.statusCode,
          executionTime: Date.now() - startTime
        };
      } catch (execError: any) {
        // Guardar log de error
        const errorResult = {
          success: false,
          error: execError.message,
          statusCode: execError.statusCode || 500,
          executionTime: Date.now() - startTime
        };

        const execution = new ToolExecution({
          toolId: tool._id,
          toolName: tool.name,
          c_name,
          parameters: parameters || {},
          response: errorResult,
          executedBy
        });
        await execution.save();

        throw new Error(`Tool execution failed: ${execError.message}`);
      }
    } catch (error: any) {
      throw new Error(`Error executing tool: ${error.message}`);
    }
  }

  // Ejecutar múltiples herramientas
  static async batchExecute(requests: Array<{ toolName: string; parameters: Record<string, any> }>, c_name: string, executedBy?: string): Promise<any[]> {
    const results = [];
    
    for (const request of requests) {
      try {
        const result = await this.execute({
          toolName: request.toolName,
          parameters: request.parameters,
          c_name,
          executedBy
        });
        results.push({
          toolName: request.toolName,
          ...result
        });
      } catch (error: any) {
        results.push({
          toolName: request.toolName,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

  // Ejecutar request HTTP real
  private static async executeHttpRequest(tool: IToolDocument, parameters: Record<string, any>): Promise<any> {
    const { config } = tool;
    const startTime = Date.now();

    try {
      // Construir URL
      let url = config.endpoint;
      if (config.method === 'GET' && Object.keys(parameters).length > 0) {
        const searchParams = new URLSearchParams();
        Object.entries(parameters).forEach(([key, value]) => {
          searchParams.append(key, String(value));
        });
        url += (url.includes('?') ? '&' : '?') + searchParams.toString();
      }

      console.log(`Executing tool: ${tool.name} (${config.method}) - URL: ${url}`);

      // Construir headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'CRM-Tools/1.0',
        ...config.headers
      };

      // Agregar autenticación
      if (config.authType && config.authConfig) {
        switch (config.authType) {
          case 'api_key':
            if (config.authConfig.apiKey) {
              headers['X-API-Key'] = config.authConfig.apiKey;
            }
            break;
          case 'bearer':
            if (config.authConfig.bearerToken) {
              headers['Authorization'] = `Bearer ${config.authConfig.bearerToken}`;
            }
            break;
          case 'basic':
            if (config.authConfig.username && config.authConfig.password) {
              const credentials = btoa(`${config.authConfig.username}:${config.authConfig.password}`);
              headers['Authorization'] = `Basic ${credentials}`;
            }
            break;
        }
      }

      // Configurar timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout || 10000);

      // Preparar body para POST/PUT
      let body: string | undefined;
      if (['POST', 'PUT'].includes(config.method) && Object.keys(parameters).length > 0) {
        body = JSON.stringify(parameters);
      }

      // Ejecutar request
      const response = await fetch(url, {
        method: config.method,
        headers,
        body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Procesar respuesta
      let responseData;
      const contentType = response.headers.get('content-type');
      
      if (contentType?.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      // Aplicar mapeo de respuesta si está configurado
      if (tool.responseMapping) {
        responseData = this.applyResponseMapping(responseData, tool.responseMapping, response.ok);
      }

      // Aplicar fuzzy search si hay un query en los parámetros y los datos son candidatos
      if (parameters.query && typeof parameters.query === 'string') {
        responseData = applyFuzzySearchToToolResult(responseData, parameters.query);
      }

      // Verificar si fue exitoso
      if (!response.ok) {
        throw {
          message: `HTTP ${response.status}: ${response.statusText}`,
          statusCode: response.status,
          data: responseData
        };
      }

      return {
        data: responseData,
        statusCode: response.status,
        executionTime: Date.now() - startTime
      };

    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw {
          message: 'Request timeout',
          statusCode: 408
        };
      }
      
      throw {
        message: error.message || 'Request failed',
        statusCode: error.statusCode || 500,
        data: error.data
      };
    }
  }

  // Aplicar mapeo de respuesta
  private static applyResponseMapping(data: any, mapping: any, isSuccess: boolean): any {
    try {
      // Aplicar transformación de función si está configurada
      if (mapping.transformFunction) {
        try {
          // Ejecutar función de transformación de forma segura
          const transformFn = new Function('data', 'isSuccess', mapping.transformFunction);
          return transformFn(data, isSuccess);
        } catch (transformError) {
          console.warn('Transform function failed:', transformError);
          // Continuar con mapeo de paths
        }
      }

      // Aplicar mapeo de paths
      if (isSuccess && mapping.successPath) {
        return this.getValueByPath(data, mapping.successPath);
      } else if (!isSuccess && mapping.errorPath) {
        return this.getValueByPath(data, mapping.errorPath);
      }

      return data;
    } catch (error) {
      console.warn('Response mapping failed:', error);
      return data;
    }
  }

  // Obtener valor por path (e.g., "data.properties.0.name")
  private static getValueByPath(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      if (current === null || current === undefined) return undefined;
      
      // Manejar índices de array
      if (!isNaN(Number(key))) {
        return Array.isArray(current) ? current[Number(key)] : undefined;
      }
      
      return current[key];
    }, obj);
  }

  // Verificar rate limiting
  private static async checkRateLimit(c_name: string, tool: IToolDocument): Promise<void> {
    if (!tool.security.rateLimit) return;

    const { requests, window } = tool.security.rateLimit;
    const windowMs = this.parseWindow(window);
    const key = `${c_name}:${tool.name}`;
    const now = Date.now();

    const entry = rateLimitCache.get(key);
    
    if (!entry) {
      // Primera request
      rateLimitCache.set(key, { count: 1, resetTime: now + windowMs });
      return;
    }

    if (now > entry.resetTime) {
      // Ventana expirada, resetear
      rateLimitCache.set(key, { count: 1, resetTime: now + windowMs });
      return;
    }

    if (entry.count >= requests) {
      const waitTime = Math.ceil((entry.resetTime - now) / 1000);
      throw new Error(`Rate limit exceeded. Try again in ${waitTime} seconds.`);
    }

    // Incrementar contador
    entry.count++;
    rateLimitCache.set(key, entry);
  }

  // Parsear ventana de tiempo a millisegundos
  private static parseWindow(window: string): number {
    const unit = window.slice(-1);
    const value = parseInt(window.slice(0, -1));
    
    switch (unit) {
      case 'm': return value * 60 * 1000;      // minutos
      case 'h': return value * 60 * 60 * 1000; // horas
      case 'd': return value * 24 * 60 * 60 * 1000; // días
      default: return 60 * 60 * 1000; // default: 1 hora
    }
  }

  // Limpiar cache de rate limiting (llamar periódicamente)
  static cleanupRateLimit(): void {
    const now = Date.now();
    for (const [key, entry] of rateLimitCache.entries()) {
      if (now > entry.resetTime) {
        rateLimitCache.delete(key);
      }
    }
  }
}

// Limpiar cache cada 5 minutos
setInterval(() => {
  ToolExecutor.cleanupRateLimit();
}, 5 * 60 * 1000);