import { 
  ITool, 
  ToolParameters, 
  ToolValidationResult,
  ALLOWED_DOMAINS,
  FORBIDDEN_PARAMETERS 
} from "../../types/tool.types";

export class ToolValidator {
  
  // Validar herramienta completa
  static async validate(toolData: Partial<ITool>): Promise<ToolValidationResult> {
    const errors: string[] = [];
    
    try {
      // Validaciones básicas
      errors.push(...this.validateBasicFields(toolData));
      
      // Validaciones de configuración
      if (toolData.config) {
        errors.push(...this.validateConfiguration(toolData.config));
      }
      
      // Validaciones de parámetros
      if (toolData.parameters) {
        errors.push(...this.validateParameters(toolData.parameters));
      }
      
      // Validaciones de seguridad
      if (toolData.security) {
        errors.push(...this.validateSecurity(toolData.security));
      }
      
      return {
        isValid: errors.length === 0,
        errors
      };
    } catch (error: any) {
      errors.push(`Validation error: ${error.message}`);
      return {
        isValid: false,
        errors
      };
    }
  }
  
  // Validar campos básicos
  private static validateBasicFields(toolData: Partial<ITool>): string[] {
    const errors: string[] = [];
    
    // Campos requeridos
    const requiredFields = ['name', 'displayName', 'description', 'category', 'c_name'];
    for (const field of requiredFields) {
      if (!toolData[field as keyof ITool]) {
        errors.push(`Field '${field}' is required`);
      }
    }
    
    // Formato del nombre
    if (toolData.name) {
      if (!/^[a-z0-9_]+$/.test(toolData.name)) {
        errors.push('Tool name must contain only lowercase letters, numbers, and underscores');
      }
      
      if (toolData.name.length > 50) {
        errors.push('Tool name must be 50 characters or less');
      }
    }
    
    // Longitud de campos
    if (toolData.displayName && toolData.displayName.length > 100) {
      errors.push('Display name must be 100 characters or less');
    }
    
    if (toolData.description && toolData.description.length > 500) {
      errors.push('Description must be 500 characters or less');
    }
    
    if (toolData.category && toolData.category.length > 50) {
      errors.push('Category must be 50 characters or less');
    }
    
    return errors;
  }
  
  // Validar configuración
  private static validateConfiguration(config: any): string[] {
    const errors: string[] = [];
    
    // Endpoint requerido
    if (!config.endpoint) {
      errors.push('Endpoint is required');
    } else {
      errors.push(...this.validateEndpoint(config.endpoint));
    }
    
    // Método HTTP válido
    if (!config.method || !['GET', 'POST', 'PUT', 'DELETE'].includes(config.method)) {
      errors.push('Method must be one of: GET, POST, PUT, DELETE');
    }
    
    // Timeout válido
    if (config.timeout !== undefined) {
      if (typeof config.timeout !== 'number' || config.timeout < 1000 || config.timeout > 30000) {
        errors.push('Timeout must be a number between 1000 and 30000 milliseconds');
      }
    }
    
    // Validar autenticación
    if (config.authType && config.authType !== 'none') {
      if (!config.authConfig) {
        errors.push('Auth config is required when auth type is not none');
      } else {
        errors.push(...this.validateAuthConfig(config.authType, config.authConfig));
      }
    }
    
    return errors;
  }
  
  // Validar endpoint
  private static validateEndpoint(endpoint: string): string[] {
    const errors: string[] = [];
    
    try {
      if (endpoint.startsWith('http')) {
        // URL completa
        const url = new URL(endpoint);
        
        // Verificar dominio permitido
        const isAllowed = ALLOWED_DOMAINS.some(domain => 
          url.hostname === domain || url.hostname.endsWith('.' + domain)
        );
        
        if (!isAllowed) {
          errors.push(`Endpoint domain not allowed: ${url.hostname}`);
        }
        
        // Verificar protocolo
        if (!['http:', 'https:'].includes(url.protocol)) {
          errors.push('Endpoint must use HTTP or HTTPS protocol');
        }
      } else if (endpoint.startsWith('/')) {
        // Path relativo válido
        if (!/^\/[a-zA-Z0-9\-._~!$&'()*+,;=:@/]*$/.test(endpoint)) {
          errors.push('Invalid endpoint path format');
        }
      } else {
        errors.push('Endpoint must be a valid URL or start with /');
      }
    } catch (urlError) {
      errors.push('Invalid endpoint format');
    }
    
    return errors;
  }
  
  // Validar configuración de autenticación
  private static validateAuthConfig(authType: string, authConfig: any): string[] {
    const errors: string[] = [];
    
    switch (authType) {
      case 'api_key':
        if (!authConfig.apiKey) {
          errors.push('API key is required for api_key auth type');
        }
        break;
      case 'bearer':
        if (!authConfig.bearerToken) {
          errors.push('Bearer token is required for bearer auth type');
        }
        break;
      case 'basic':
        if (!authConfig.username || !authConfig.password) {
          errors.push('Username and password are required for basic auth type');
        }
        break;
      default:
        errors.push(`Unknown auth type: ${authType}`);
    }
    
    return errors;
  }
  
  // Validar parámetros
  private static validateParameters(parameters: ToolParameters): string[] {
    const errors: string[] = [];
    
    // Tipo debe ser object
    if (parameters.type !== 'object') {
      errors.push('Parameters type must be "object"');
    }
    
    // Properties requerido
    if (!parameters.properties || typeof parameters.properties !== 'object') {
      errors.push('Parameters properties is required and must be an object');
    }
    
    // Required debe ser array
    if (!Array.isArray(parameters.required)) {
      errors.push('Parameters required must be an array');
    }
    
    // Validar cada propiedad
    if (parameters.properties) {
      for (const [propName, propDef] of Object.entries(parameters.properties)) {
        errors.push(...this.validateParameter(propName, propDef));
      }
    }
    
    // Verificar que campos required existan en properties
    if (Array.isArray(parameters.required) && parameters.properties) {
      for (const requiredField of parameters.required) {
        if (!parameters.properties[requiredField]) {
          errors.push(`Required field '${requiredField}' not found in properties`);
        }
      }
    }
    
    return errors;
  }
  
  // Validar parámetro individual
  private static validateParameter(name: string, parameter: any): string[] {
    const errors: string[] = [];
    
    // Verificar nombres prohibidos
    const forbiddenFound = FORBIDDEN_PARAMETERS.some(forbidden => 
      name.toLowerCase().includes(forbidden.toLowerCase())
    );
    
    if (forbiddenFound) {
      errors.push(`Parameter name '${name}' contains forbidden words`);
    }
    
    // Tipo requerido
    if (!parameter.type || !['string', 'number', 'boolean', 'array'].includes(parameter.type)) {
      errors.push(`Parameter '${name}' must have a valid type (string, number, boolean, array)`);
    }
    
    // Descripción requerida
    if (!parameter.description || typeof parameter.description !== 'string') {
      errors.push(`Parameter '${name}' must have a description`);
    }
    
    // Validar enum si está presente
    if (parameter.enum && !Array.isArray(parameter.enum)) {
      errors.push(`Parameter '${name}' enum must be an array`);
    }
    
    // Validar format si está presente
    if (parameter.format) {
      const validFormats = ['email', 'phone', 'date', 'url', 'uuid'];
      if (!validFormats.includes(parameter.format)) {
        errors.push(`Parameter '${name}' has invalid format. Valid formats: ${validFormats.join(', ')}`);
      }
    }
    
    return errors;
  }
  
  // Validar configuración de seguridad
  private static validateSecurity(security: any): string[] {
    const errors: string[] = [];
    
    // Validar rate limiting
    if (security.rateLimit) {
      if (typeof security.rateLimit.requests !== 'number' || security.rateLimit.requests < 1) {
        errors.push('Rate limit requests must be a positive number');
      }
      
      if (!security.rateLimit.window || typeof security.rateLimit.window !== 'string') {
        errors.push('Rate limit window is required');
      } else {
        const validWindows = ['1m', '5m', '15m', '1h', '1d'];
        if (!validWindows.includes(security.rateLimit.window)) {
          errors.push(`Rate limit window must be one of: ${validWindows.join(', ')}`);
        }
      }
    }
    
    // Validar dominios permitidos
    if (security.allowedDomains) {
      if (!Array.isArray(security.allowedDomains)) {
        errors.push('Allowed domains must be an array');
      } else {
        for (const domain of security.allowedDomains) {
          if (typeof domain !== 'string' || !/^[a-zA-Z0-9.-]+$/.test(domain)) {
            errors.push(`Invalid domain format: ${domain}`);
          }
        }
      }
    }
    
    // Validar timeout máximo
    if (security.maxTimeout !== undefined) {
      if (typeof security.maxTimeout !== 'number' || security.maxTimeout < 1000 || security.maxTimeout > 60000) {
        errors.push('Max timeout must be between 1000 and 60000 milliseconds');
      }
    }
    
    return errors;
  }
  
  // Validar schema de parámetros específico
  static validateParameterSchema(schema: any): ToolValidationResult {
    const errors: string[] = [];
    
    try {
      if (!schema || typeof schema !== 'object') {
        errors.push('Schema must be an object');
        return { isValid: false, errors };
      }
      
      // Validar estructura básica
      if (schema.type !== 'object') {
        errors.push('Schema type must be "object"');
      }
      
      if (!schema.properties || typeof schema.properties !== 'object') {
        errors.push('Schema must have properties object');
      }
      
      if (!Array.isArray(schema.required)) {
        errors.push('Schema must have required array');
      }
      
      // Validar propiedades
      if (schema.properties) {
        for (const [name, prop] of Object.entries(schema.properties)) {
          if (!prop || typeof prop !== 'object') {
            errors.push(`Property '${name}' must be an object`);
            continue;
          }
          
          const property = prop as any;
          if (!property.type || !['string', 'number', 'boolean', 'array'].includes(property.type)) {
            errors.push(`Property '${name}' must have valid type`);
          }
          
          if (!property.description) {
            errors.push(`Property '${name}' must have description`);
          }
        }
      }
      
      return {
        isValid: errors.length === 0,
        errors
      };
    } catch (error: any) {
      return {
        isValid: false,
        errors: [`Schema validation error: ${error.message}`]
      };
    }
  }
  
  // Validar endpoint con request real
  static async validateEndpointConnection(endpoint: string, method: string = 'GET', timeout: number = 5000): Promise<ToolValidationResult> {
    const errors: string[] = [];
    
    try {
      // Validación básica de formato
      const formatValidation = this.validateEndpoint(endpoint);
      if (formatValidation.length > 0) {
        return {
          isValid: false,
          errors: formatValidation
        };
      }
      
      // Para endpoints externos, probar conexión
      if (endpoint.startsWith('http')) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);
          
          const response = await fetch(endpoint, {
            method: method,
            signal: controller.signal,
            headers: { 'User-Agent': 'CRM-Tool-Validator/1.0' }
          });
          
          clearTimeout(timeoutId);
          
          // Aceptar cualquier respuesta (incluso errores) como válida para conectividad
          return {
            isValid: true,
            errors: []
          };
        } catch (fetchError: any) {
          if (fetchError.name === 'AbortError') {
            errors.push('Connection timeout');
          } else {
            errors.push(`Connection failed: ${fetchError.message}`);
          }
        }
      } else {
        // Para paths relativos, solo validar formato
        return {
          isValid: true,
          errors: []
        };
      }
      
      return {
        isValid: errors.length === 0,
        errors
      };
    } catch (error: any) {
      return {
        isValid: false,
        errors: [`Endpoint validation error: ${error.message}`]
      };
    }
  }
  
  // Validar compatibilidad con OpenAI Function Calling
  static validateOpenAICompatibility(tool: Partial<ITool>): ToolValidationResult {
    const errors: string[] = [];
    
    try {
      // Verificar que tenga los campos necesarios para OpenAI
      if (!tool.name) {
        errors.push('Tool name is required for OpenAI compatibility');
      } else {
        // Nombre debe seguir convenciones de OpenAI
        if (tool.name.length > 64) {
          errors.push('Tool name must be 64 characters or less for OpenAI');
        }
      }
      
      if (!tool.description) {
        errors.push('Tool description is required for OpenAI compatibility');
      } else if (tool.description.length > 1024) {
        errors.push('Tool description must be 1024 characters or less for OpenAI');
      }
      
      // Validar parámetros para OpenAI
      if (tool.parameters) {
        // OpenAI requiere estructura específica
        if (tool.parameters.type !== 'object') {
          errors.push('OpenAI requires parameters type to be "object"');
        }
        
        if (!tool.parameters.properties) {
          errors.push('OpenAI requires parameters to have properties');
        }
        
        // Verificar límites de OpenAI
        const propCount = Object.keys(tool.parameters.properties || {}).length;
        if (propCount > 100) {
          errors.push('OpenAI supports maximum 100 parameters');
        }
      }
      
      return {
        isValid: errors.length === 0,
        errors
      };
    } catch (error: any) {
      return {
        isValid: false,
        errors: [`OpenAI compatibility validation error: ${error.message}`]
      };
    }
  }
}