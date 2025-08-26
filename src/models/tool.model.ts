import { Schema, Document, Connection, Model } from "mongoose";
import { 
  ITool, 
  IToolExecution,
  IToolCategory,
  ToolConfig, 
  ToolParameters, 
  ResponseMapping, 
  ToolSecurity,
  ALLOWED_DOMAINS,
  FORBIDDEN_PARAMETERS 
} from "../types/tool.types";
import auditTrailPlugin from "../plugins/auditTrail";

// Extender ITool para incluir métodos de Document
export interface IToolDocument extends Omit<ITool, '_id'>, Document {
  validateSecurity(): Promise<{ isValid: boolean; errors: string[] }>;
  generateOpenAISchema(): object;
}

// Extender el modelo con métodos estáticos
export interface IToolModel extends Model<IToolDocument> {
  validateToolData(toolData: Partial<ITool>): Promise<{ isValid: boolean; errors: string[] }>;
  getActiveToolsByCompany(c_name: string): Promise<IToolDocument[]>;
  getToolsByCategory(c_name: string, category: string): Promise<IToolDocument[]>;
  generateOpenAISchemaForCompany(c_name: string): Promise<object[]>;
}

// Schema para configuración de autenticación
const AuthConfigSchema = new Schema({
  apiKey: { type: String, select: false }, // No incluir en queries por defecto por seguridad
  bearerToken: { type: String, select: false },
  username: { type: String },
  password: { type: String, select: false }
}, { _id: false });

// Schema para configuración de herramientas
const ToolConfigSchema = new Schema({
  endpoint: { type: String, required: true, trim: true },
  method: { 
    type: String, 
    required: true, 
    enum: ['GET', 'POST', 'PUT', 'DELETE'],
    uppercase: true 
  },
  headers: { type: Schema.Types.Mixed, default: {} },
  authType: { 
    type: String, 
    enum: ['none', 'api_key', 'bearer', 'basic'],
    default: 'none' 
  },
  authConfig: { type: AuthConfigSchema, default: null },
  timeout: { type: Number, default: 10000, min: 1000, max: 30000 }
}, { _id: false });

// Schema para propiedades de parámetros
const ParameterPropertySchema = new Schema({
  type: { 
    type: String, 
    required: true, 
    enum: ['string', 'number', 'boolean', 'array'] 
  },
  description: { type: String, required: true, trim: true },
  required: { type: Boolean, default: false },
  enum: [{ type: String }],
  format: { 
    type: String, 
    enum: ['email', 'phone', 'date', 'url', 'uuid'] 
  }
}, { _id: false });

// Schema para parámetros de herramientas
const ToolParametersSchema = new Schema({
  type: { type: String, required: true, enum: ['object'], default: 'object' },
  properties: { 
    type: Map, 
    of: ParameterPropertySchema, 
    required: true 
  },
  required: [{ type: String }]
}, { _id: false });

// Schema para mapeo de respuestas
const ResponseMappingSchema = new Schema({
  successPath: { type: String, trim: true },
  errorPath: { type: String, trim: true },
  transformFunction: { type: String } // Función JS como string
}, { _id: false });

// Schema para configuración de seguridad
const ToolSecuritySchema = new Schema({
  rateLimit: {
    requests: { type: Number, min: 1, max: 10000 },
    window: { type: String, enum: ['1m', '5m', '15m', '1h', '1d'] }
  },
  allowedDomains: [{ type: String, trim: true }],
  maxTimeout: { type: Number, min: 1000, max: 60000 }
}, { _id: false });

// Schema principal de Tool
const ToolSchema: Schema = new Schema(
  {
    name: { 
      type: String, 
      required: true, 
      trim: true,
      lowercase: true,
      match: /^[a-z0-9_]+$/, // Solo letras minúsculas, números y guiones bajos
      maxlength: 50
    },
    displayName: { 
      type: String, 
      required: true, 
      trim: true,
      maxlength: 100
    },
    description: { 
      type: String, 
      required: true, 
      trim: true,
      maxlength: 500
    },
    category: { 
      type: String, 
      required: true, 
      trim: true,
      lowercase: true,
      maxlength: 50
    },
    isActive: { type: Boolean, default: true },
    c_name: { type: String, required: true, trim: true },
    createdBy: { type: String, required: true, trim: true },
    updatedBy: { type: String, trim: true },
    
    config: { type: ToolConfigSchema, required: true },
    parameters: { type: ToolParametersSchema, required: true },
    responseMapping: { type: ResponseMappingSchema },
    security: { type: ToolSecuritySchema, required: true }
  },
  {
    timestamps: true,
  }
);

ToolSchema.plugin(auditTrailPlugin as any, {
  rootPaths: [""], // watch whole doc
  includePaths: [
    'name',
    'displayName',
    'description',
    'category',
    'isActive',
    'config',
    'parameters'
  ],
  excludePaths: [ 
    '__v', 
    'createdAt', 
    'updatedAt', 
    'parameters.required'
  ],
  modelName: "Tool",
});

// Índices para optimizar consultas
ToolSchema.index({ c_name: 1, isActive: 1 }); // Herramientas activas por empresa
ToolSchema.index({ c_name: 1, category: 1, isActive: 1 }); // Por categoría
ToolSchema.index({ name: 1, c_name: 1 }, { unique: true }); // Nombre único por empresa
ToolSchema.index({ createdAt: -1 }); // Para ordenamiento por fecha

// Middleware de validación antes de guardar
ToolSchema.pre('save', async function(next) {
  const tool = this as any;
  
  // Validar nombre único por empresa
  if (tool.isModified('name') || tool.isNew) {
    const existingTool = await tool.constructor.findOne({
      name: tool.name,
      c_name: tool.c_name,
      _id: { $ne: tool._id }
    });
    
    if (existingTool) {
      const error = new Error(`Tool name '${tool.name}' already exists for company '${tool.c_name}'`);
      return next(error);
    }
  }

  // Validar endpoint de dominio permitido
  if (tool.isModified('config.endpoint') || tool.isNew) {
    const endpoint = tool.config.endpoint;
    if (endpoint.startsWith('http')) {
      const url = new URL(endpoint);
      const isAllowed = ALLOWED_DOMAINS.some((domain: string) => 
        url.hostname === domain || url.hostname.endsWith('.' + domain)
      );
      
      if (!isAllowed) {
        const error = new Error(`Endpoint domain not allowed: ${url.hostname}`);
        return next(error);
      }
    }
  }

  // Validar parámetros prohibidos
  if (tool.isModified('parameters') || tool.isNew) {
    const paramNames = Object.keys(tool.parameters.properties || {});
    const forbiddenFound = paramNames.find((name: string) => 
      FORBIDDEN_PARAMETERS.some((forbidden: string) => name.toLowerCase().includes(forbidden.toLowerCase()))
    );
    
    if (forbiddenFound) {
      const error = new Error(`Forbidden parameter name: ${forbiddenFound}`);
      return next(error);
    }
  }

  next();
});

// Método de instancia para validar seguridad
ToolSchema.methods.validateSecurity = async function(): Promise<{ isValid: boolean; errors: string[] }> {
  const errors: string[] = [];
  const tool = this as any;
  
  try {
    // Validar timeout
    if (tool.config.timeout > (tool.security.maxTimeout || 30000)) {
      errors.push(`Timeout exceeds maximum allowed: ${tool.security.maxTimeout || 30000}ms`);
    }

    // Validar dominio del endpoint
    if (tool.config.endpoint.startsWith('http')) {
      const url = new URL(tool.config.endpoint);
      if (tool.security.allowedDomains && tool.security.allowedDomains.length > 0) {
        const isAllowed = tool.security.allowedDomains.some((domain: string) => 
          url.hostname === domain || url.hostname.endsWith('.' + domain)
        );
        
        if (!isAllowed) {
          errors.push(`Endpoint domain not in allowed list: ${url.hostname}`);
        }
      }
    }

    return { isValid: errors.length === 0, errors };
  } catch (error) {
    errors.push('Error validating tool security');
    return { isValid: false, errors };
  }
};

// Método de instancia para generar schema de OpenAI
ToolSchema.methods.generateOpenAISchema = function(): object {
  const tool = this as any;
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: tool.parameters.type,
        properties: Object.fromEntries(
          Object.entries(tool.parameters.properties).map(([key, value]: [string, any]) => [
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
  };
};

// Método estático para validar datos de herramienta
ToolSchema.statics.validateToolData = async function(
  toolData: Partial<ITool>
): Promise<{ isValid: boolean; errors: string[] }> {
  const errors: string[] = [];
  
  try {
    // Validar campos requeridos
    const requiredFields = ['name', 'displayName', 'description', 'category', 'c_name', 'config', 'parameters'];
    for (const field of requiredFields) {
      if (!toolData[field as keyof ITool]) {
        errors.push(`Field '${field}' is required`);
      }
    }

    // Validar formato del nombre
    if (toolData.name && !/^[a-z0-9_]+$/.test(toolData.name)) {
      errors.push('Tool name must contain only lowercase letters, numbers, and underscores');
    }

    // Validar endpoint si está presente
    if (toolData.config?.endpoint) {
      try {
        new URL(toolData.config.endpoint);
      } catch {
        // Si no es URL completa, validar que sea path relativo válido
        if (!toolData.config.endpoint.startsWith('/')) {
          errors.push('Endpoint must be a valid URL or start with /');
        }
      }
    }

    return { isValid: errors.length === 0, errors };
  } catch (error) {
    errors.push('Error validating tool data');
    return { isValid: false, errors };
  }
};

// Método estático para obtener herramientas activas por empresa
ToolSchema.statics.getActiveToolsByCompany = async function(c_name: string): Promise<IToolDocument[]> {
  return this.find({ c_name, isActive: true }).sort({ createdAt: -1 });
};

// Método estático para obtener herramientas por categoría
ToolSchema.statics.getToolsByCategory = async function(
  c_name: string, 
  category: string
): Promise<IToolDocument[]> {
  return this.find({ c_name, category, isActive: true }).sort({ displayName: 1 });
};

// Método estático para generar schema de OpenAI para una empresa
ToolSchema.statics.generateOpenAISchemaForCompany = async function(c_name: string): Promise<object[]> {
  const tools = await this.find({ c_name, isActive: true }).sort({ createdAt: -1 });
  return tools.map((tool: IToolDocument) => tool.generateOpenAISchema());
};

// Schema para ejecuciones de herramientas (logging)
const ToolExecutionSchema = new Schema(
  {
    toolId: { type: Schema.Types.ObjectId, ref: 'Tool', required: true },
    toolName: { type: String, required: true, trim: true },
    c_name: { type: String, required: true, trim: true },
    parameters: { type: Schema.Types.Mixed, required: true },
    response: {
      success: { type: Boolean, required: true },
      data: { type: Schema.Types.Mixed },
      error: { type: String },
      statusCode: { type: Number },
      executionTime: { type: Number, required: true } // ms
    },
    executedBy: { type: String, trim: true }
  },
  {
    timestamps: true,
  }
);

// Índices para logging
ToolExecutionSchema.index({ toolId: 1, createdAt: -1 });
ToolExecutionSchema.index({ c_name: 1, createdAt: -1 });
ToolExecutionSchema.index({ 'response.success': 1, createdAt: -1 });

// Schema para categorías de herramientas
const ToolCategorySchema = new Schema(
  {
    name: { 
      type: String, 
      required: true, 
      trim: true,
      lowercase: true,
      maxlength: 50
    },
    displayName: { 
      type: String, 
      required: true, 
      trim: true,
      maxlength: 100
    },
    description: { 
      type: String, 
      trim: true,
      maxlength: 200
    },
    c_name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true }
  },
  {
    timestamps: true,
  }
);

// Índice único para categorías por empresa
ToolCategorySchema.index({ name: 1, c_name: 1 }, { unique: true });
ToolCategorySchema.index({ c_name: 1, isActive: 1 });

// Exportar modelos
export default function getToolModel(conn: Connection): IToolModel {
  return conn.model<IToolDocument, IToolModel>("Tool", ToolSchema);
}

export function getToolExecutionModel(conn: Connection) {
  return conn.model("ToolExecution", ToolExecutionSchema);
}

export function getToolCategoryModel(conn: Connection) {
  return conn.model("ToolCategory", ToolCategorySchema);
}