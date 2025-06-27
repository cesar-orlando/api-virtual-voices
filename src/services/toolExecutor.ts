import { getDbConnection } from "../config/connectionManager";
import getToolModel, { getToolExecutionModel } from "../models/tool.model";
import { IToolDocument } from "../models/tool.model";
import { ToolExecutionRequest } from "../types/tool.types";

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
        executionResult = await this.executeHttpRequest(tool, parameters || {});
        
        // Guardar log de ejecución exitosa
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
      // Detectar si es una función dinámica (endpoint interno)
      if (this.isDynamicFunction(config.endpoint)) {
        return await this.executeDynamicFunction(tool, parameters);
      }

      // Ejecutar endpoint externo (lógica original)
      return await this.executeExternalEndpoint(tool, parameters);
    } catch (error: any) {
      throw error;
    }
  }

  // Detectar si es función dinámica
  private static isDynamicFunction(endpoint: string): boolean {
    return endpoint.includes('/api/records/table/');
  }

  // Ejecutar función dinámica
  private static async executeDynamicFunction(tool: IToolDocument, parameters: Record<string, any>): Promise<any> {
    const { config } = tool;
    const { c_name } = tool;
    
    console.log("🔧 [ToolExecutor] Ejecutando función dinámica:", tool.name);
    console.log("📋 [ToolExecutor] Método:", config.method);
    console.log("📊 [ToolExecutor] Parámetros:", parameters);
    
    // Extraer tableSlug del endpoint
    const endpointParts = config.endpoint.split('/');
    const tableSlugIndex = endpointParts.indexOf('table') + 2; // +2 porque después de 'table' viene c_name y luego tableSlug
    const tableSlug = endpointParts[tableSlugIndex];
    
    console.log("🗂️ [ToolExecutor] TableSlug extraído:", tableSlug);
    
    // Construir URL base
    const baseUrl = `http://localhost:${process.env.PORT}/api/records/table/${c_name}/${tableSlug}?page=1&limit=100&sortBy=createdAt&sortOrder=desc&filters=%7B%7D`;
    console.log("🌐 [ToolExecutor] URL base:", baseUrl);
    
    try {
      let response;
      
      switch (config.method) {
        case 'GET':
          // Siempre obtener todas las propiedades (sin filtros en la URL)
          console.log("🔍 [ToolExecutor] Ejecutando búsqueda (sin filtros en URL)...");
          response = await fetch(baseUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          });
          break;
          
        case 'POST':
          // Función de creación
          console.log("➕ [ToolExecutor] Ejecutando creación...");
          const postData = parameters.data || parameters;
          console.log("📝 [ToolExecutor] Datos a crear:", postData);
          
          response = await fetch(baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(postData)
          });
          break;
          
        case 'PUT':
          // Función de actualización
          console.log("✏️ [ToolExecutor] Ejecutando actualización...");
          const { id, data } = parameters;
          if (!id) throw new Error('ID is required for update operations');
          
          const putData = data || parameters;
          console.log("🆔 [ToolExecutor] ID a actualizar:", id);
          console.log("📝 [ToolExecutor] Datos a actualizar:", putData);
          
          response = await fetch(`${baseUrl}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(putData)
          });
          break;
          
        case 'DELETE':
          // Función de eliminación
          console.log("🗑️ [ToolExecutor] Ejecutando eliminación...");
          const deleteId = parameters.id;
          if (!deleteId) throw new Error('ID is required for delete operations');
          
          console.log("🆔 [ToolExecutor] ID a eliminar:", deleteId);
          
          response = await fetch(`${baseUrl}/${deleteId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
          });
          break;
          
        default:
          throw new Error(`Unsupported method: ${config.method}`);
      }
      
      // Procesar respuesta
      let responseData;
      const contentType = response.headers.get('content-type');
      
      if (contentType?.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }
      
      console.log("📥 [ToolExecutor] Respuesta recibida:", responseData);
      console.log("📊 [ToolExecutor] Status code:", response.status);
      
      if (!response.ok) {
        throw {
          message: responseData.message || `HTTP ${response.status}`,
          statusCode: response.status
        };
      }
      
      // Filtrar y limitar datos para evitar exceder tokens
      let filteredRecords = responseData.records;
      let essentialRecords: any[] = [];
      let filtered: number = 0;

      console.log("filteredRecords", filteredRecords);

      // Filtrar SOLO del lado del backend, no sugerencias ni límite
      if (parameters.zona || parameters.query) {
        const searchTerm = this.normalize(parameters.zona || parameters.query || "");
        filteredRecords = responseData.records.filter((record: any) => {
          const data = record.data || {};
          const allValues = Object.values(data).map(v => this.normalize(String(v || "")));
          return allValues.some(value => value.includes(searchTerm));
        });
        filtered = filteredRecords.length;
        console.log("📊 [ToolExecutor] Propiedades filtradas por búsqueda backend:", filtered);
      }

      // Solo devolver los matches, sin sugerencias ni límite
      essentialRecords = filteredRecords.map((record: any) => {
        const data = record.data || {};
        return {
          id: record._id,
          nombre: data.nombre || data.titulo || data.name || 'Sin nombre',
          precio: data.precio || data.price || data.costo || 'No especificado',
          zona: data.zona || data.ubicacion || data.location || 'No especificada',
          tipo: data.tipo || data.categoria || 'No especificado',
          recamaras: data.recamaras || data.habitaciones || data.bedrooms || 'No especificado',
          baños: data.baños || data.bathrooms || 'No especificado'
        };
      });

      const filteredResponse = {
        success: true,
        count: essentialRecords.length,
        total: responseData.records.length,
        filtered: filtered,
        records: essentialRecords,
        message: essentialRecords.length > 0
          ? `Encontradas ${essentialRecords.length} coincidencias para "${parameters.zona || parameters.query}"`
          : `No se encontraron coincidencias para "${parameters.zona || parameters.query}"`
      };
      
      
      responseData = filteredResponse;

      console.log("✅ [ToolExecutor] Función dinámica ejecutada exitosamente");
    
      return {
        data: responseData || [],
        statusCode: response.status || 200
      };
    } catch (error: any) {
      console.error("❌ [ToolExecutor] Error en función dinámica:", error);
      throw {
        message: error.message || 'Dynamic function execution failed',
        statusCode: error.statusCode || 500
      };
    }
  }

  // Ejecutar endpoint externo (lógica original)
  private static async executeExternalEndpoint(tool: IToolDocument, parameters: Record<string, any>): Promise<any> {
    const { config } = tool;
    const startTime = Date.now();

    // Construir URL
    let url = config.endpoint;
    if (config.method === 'GET' && Object.keys(parameters).length > 0) {
      const searchParams = new URLSearchParams();
      Object.entries(parameters).forEach(([key, value]) => {
        searchParams.append(key, String(value));
      });
      url += (url.includes('?') ? '&' : '?') + searchParams.toString();
    }

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

    // Verificar si fue exitoso
    if (!response.ok) {
      throw {
        message: responseData.message || `HTTP ${response.status}`,
        statusCode: response.status
      };
    }

    return {
      data: responseData,
      statusCode: response.status
    };
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

  private static normalize(str: string) {
    return (str || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quita tildes
      .replace(/[,\\.]/g, "") // quita comas y puntos
      .replace(/\s+/g, " ") // espacios simples
      .trim();
  }
}

// Limpiar cache cada 5 minutos
setInterval(() => {
  ToolExecutor.cleanupRateLimit();
}, 5 * 60 * 1000);