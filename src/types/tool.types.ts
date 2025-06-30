// Usando string para IDs por compatibilidad - se puede cambiar a Types.ObjectId después
type ObjectId = string;

// Tipos para el sistema de herramientas dinámicas

// Configuración de autenticación
export interface AuthConfig {
  apiKey?: string;
  bearerToken?: string;
  username?: string;
  password?: string;
}

// Configuración de herramienta
export interface ToolConfig {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  authType: 'none' | 'api_key' | 'bearer' | 'basic';
  authConfig?: AuthConfig;
  timeout?: number;
}

// Propiedades de parámetros
export interface ParameterProperty {
  type: 'string' | 'number' | 'boolean' | 'array';
  description: string;
  required?: boolean;
  enum?: string[];
  format?: 'email' | 'phone' | 'date' | 'url' | 'uuid';
}

// Parámetros de herramienta
export interface ToolParameters {
  type: 'object';
  properties: Record<string, ParameterProperty>;
  required: string[];
}

// Mapeo de respuestas
export interface ResponseMapping {
  successPath?: string;
  errorPath?: string;
  transformFunction?: string;
}

// Configuración de seguridad
export interface ToolSecurity {
  rateLimit?: {
    requests: number;
    window: '1m' | '5m' | '15m' | '1h' | '1d';
  };
  allowedDomains?: string[];
  maxTimeout?: number;
}

// Interfaz principal de herramienta
export interface ITool {
  _id?: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  isActive: boolean;
  c_name: string;
  createdBy: string;
  updatedBy?: string;
  config: ToolConfig;
  parameters: ToolParameters;
  responseMapping?: ResponseMapping;
  security: ToolSecurity;
  createdAt?: Date;
  updatedAt?: Date;
}

// Ejecución de herramienta
export interface IToolExecution {
  _id?: string;
  toolId: string;
  toolName: string;
  c_name: string;
  parameters: Record<string, any>;
  response: {
    success: boolean;
    data?: any;
    error?: string;
    statusCode?: number;
    executionTime: number;
  };
  executedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Categoría de herramienta
export interface IToolCategory {
  _id?: string;
  name: string;
  displayName: string;
  description?: string;
  c_name: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// Request para ejecución de herramienta
export interface ToolExecutionRequest {
  toolName: string;
  parameters?: Record<string, any>;
  c_name: string;
  executedBy?: string;
}

// Request para ejecución en lote
export interface BatchExecutionRequest {
  tools: ToolExecutionRequest[];
  c_name: string;
  executedBy?: string;
}

// Dominios permitidos por defecto
export const ALLOWED_DOMAINS = [
  'api.openai.com',
  'api.anthropic.com',
  'api.google.com',
  'api.github.com',
  'api.stripe.com',
  'api.twilio.com',
  'api.sendgrid.com',
  'api.mailchimp.com',
  'api.salesforce.com',
  'api.hubspot.com',
  'api.zapier.com',
  'api.ifttt.com',
  'api.integromat.com',
  'api.n8n.io',
  'api.automate.io',
  'api.pipedream.com',
  'api.webhook.site',
  'api.postman.com',
  'api.insomnia.rest',
  'api.httpbin.org',
  "api-virtual-voices.onrender.com",
  'jsonplaceholder.typicode.com',
  'reqres.in',
  'httpbin.org',
  'mockapi.io',
  'mocky.io',
  'httpstat.us',
  'httpbin.org',
  'localhost',
  '127.0.0.1'
];

// Parámetros prohibidos por seguridad
export const FORBIDDEN_PARAMETERS = [
  'password',
  'secret',
  'key',
  'token',
  'auth',
  'credential',
  'private',
  'sensitive',
  'confidential',
  'internal',
  'admin',
  'root',
  'system',
  'debug',
  'test',
  'temp',
  'tmp'
];

// Categorías por defecto
export const DEFAULT_CATEGORIES = [
  {
    name: 'sales',
    displayName: 'Sales',
    description: 'Tools for sales automation and lead management'
  },
  {
    name: 'customer_service',
    displayName: 'Customer Service',
    description: 'Tools for customer support and service automation'
  },
  {
    name: 'marketing',
    displayName: 'Marketing',
    description: 'Tools for marketing campaigns and analytics'
  },
  {
    name: 'communication',
    displayName: 'Communication',
    description: 'Tools for messaging, email, and notifications'
  },
  {
    name: 'data_analysis',
    displayName: 'Data Analysis',
    description: 'Tools for data processing and analytics'
  },
  {
    name: 'integration',
    displayName: 'Integration',
    description: 'Tools for third-party service integrations'
  },
  {
    name: 'automation',
    displayName: 'Automation',
    description: 'General automation and workflow tools'
  },
  {
    name: 'utilities',
    displayName: 'Utilities',
    description: 'Utility and helper tools'
  }
];

// Límites por empresa
export const COMPANY_LIMITS = {
  BASIC: {
    maxTools: 10,
    maxExecutionsPerDay: 1000,
    maxConcurrentExecutions: 5
  },
  PRO: {
    maxTools: 50,
    maxExecutionsPerDay: 10000,
    maxConcurrentExecutions: 20
  },
  ENTERPRISE: {
    maxTools: 200,
    maxExecutionsPerDay: 100000,
    maxConcurrentExecutions: 100
  }
};

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

export type ToolValidationResult = {
  isValid: boolean;
  errors: string[];
};

export type OpenAIToolSchema = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: ToolParameters;
  };
};