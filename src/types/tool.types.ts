// Usando string para IDs por compatibilidad - se puede cambiar a Types.ObjectId después
type ObjectId = string;

// Interfaces para configuración de autenticación
export interface AuthConfig {
  apiKey?: string;
  bearerToken?: string;
  username?: string;
  password?: string;
}

// Interfaces para configuración de herramientas
export interface ToolConfig {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  authType?: 'none' | 'api_key' | 'bearer' | 'basic';
  authConfig?: AuthConfig;
  timeout?: number; // default: 10000ms
}

// Interface para propiedades de parámetros
export interface ToolParameterProperty {
  type: 'string' | 'number' | 'boolean' | 'array';
  description: string;
  required?: boolean;
  enum?: string[];
  format?: string; // "email", "phone", "date"
}

// Interface para parámetros de herramientas
export interface ToolParameters {
  type: 'object';
  properties: Record<string, ToolParameterProperty>;
  required: string[];
}

// Interface para mapeo de respuestas
export interface ResponseMapping {
  successPath?: string;
  errorPath?: string;
  transformFunction?: string; // Función JS para transformar respuesta
}

// Interface para configuración de seguridad
export interface ToolSecurity {
  rateLimit?: {
    requests: number;
    window: string; // "1h", "1d"
  };
  allowedDomains?: string[];
  maxTimeout?: number;
}

// Interface principal para herramientas
export interface ITool {
  _id: ObjectId;
  name: string;                    // "get_properties_1_2m", "register_customer"
  displayName: string;             // "Buscar Propiedades $1.2M", "Registrar Cliente"
  description: string;             // Descripción para OpenAI
  category: string;                // "real_estate", "promotions", "data_collection"
  isActive: boolean;
  c_name: string;                  // Empresa propietaria
  createdBy: ObjectId;
  updatedBy?: ObjectId;
  
  config: ToolConfig;
  parameters: ToolParameters;
  responseMapping?: ResponseMapping;
  security: ToolSecurity;
  
  createdAt: Date;
  updatedAt: Date;
}

// Interface para logging de ejecuciones
export interface IToolExecution {
  _id: ObjectId;
  toolId: ObjectId;
  toolName: string;
  c_name: string;
  parameters: Record<string, any>;
  response: {
    success: boolean;
    data?: any;
    error?: string;
    statusCode?: number;
    executionTime: number; // ms
  };
  executedBy?: string;
  createdAt: Date;
}

// Interface para categorías de herramientas
export interface IToolCategory {
  _id: ObjectId;
  name: string;
  displayName: string;
  description: string;
  c_name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Interface para estadísticas de uso
export interface ToolUsageStats {
  toolId: ObjectId;
  toolName: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  lastExecuted?: Date;
}

// Constantes de configuración
export const ALLOWED_DOMAINS = [
  'api.inmobiliaria.com',
  'api.promociones.com',
  'api.crm.com',
  'api.trusted-partners.com'
];

export const FORBIDDEN_PARAMETERS = [
  'script', 'eval', 'exec', 'system',
  'password', 'token', 'secret', 'key'
];

export const COMPANY_LIMITS: Record<string, { requests: number; window: string }> = {
  'empresa_a': { requests: 500, window: '1h' },
  'empresa_b': { requests: 1000, window: '1h' }
};

export const DEFAULT_CATEGORIES = [
  { name: 'real_estate', displayName: 'Bienes Raíces', description: 'Herramientas para inmobiliarias' },
  { name: 'promotions', displayName: 'Promociones', description: 'Herramientas para campañas y ofertas' },
  { name: 'data_collection', displayName: 'Recolección de Datos', description: 'Herramientas para capturar información' },
  { name: 'customer_service', displayName: 'Atención al Cliente', description: 'Herramientas para soporte' },
  { name: 'analytics', displayName: 'Análisis', description: 'Herramientas para reportes y métricas' }
];

// Tipos de utilidad
export type ToolExecutionRequest = {
  toolName: string;
  parameters: Record<string, any>;
  c_name: string;
  executedBy?: string;
};

export type ToolValidationResult = {
  isValid: boolean;
  errors: string[];
};

export type BatchExecutionRequest = {
  tools: Array<{
    toolName: string;
    parameters: Record<string, any>;
  }>;
  c_name: string;
  executedBy?: string;
};

export type OpenAIToolSchema = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: ToolParameters;
  };
};