import { ITool } from "../types/tool.types";

export interface FunctionType {
  type: 'search' | 'create' | 'update' | 'delete';
  displayName: string;
  description: string;
  category: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
  endpointTemplate: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
}

export const FUNCTION_TYPES: Record<string, FunctionType> = {
  search: {
    type: 'search',
    displayName: 'Buscar',
    description: 'Busca registros en una tabla específica',
    category: 'data_retrieval',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Término de búsqueda o filtro'
        },
        limit: {
          type: 'number',
          description: 'Número máximo de resultados',
          default: 10
        },
        filters: {
          type: 'object',
          description: 'Filtros adicionales específicos'
        }
      },
      required: []
    },
    endpointTemplate: '/api/records/table/{c_name}/{tableSlug}',
    method: 'GET'
  },
  create: {
    type: 'create',
    displayName: 'Crear',
    description: 'Crea un nuevo registro en una tabla específica',
    category: 'data_creation',
    parameters: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          description: 'Datos del registro a crear'
        }
      },
      required: ['data']
    },
    endpointTemplate: '/api/records/table/{c_name}/{tableSlug}',
    method: 'POST'
  },
  update: {
    type: 'update',
    displayName: 'Actualizar',
    description: 'Actualiza un registro existente',
    category: 'data_modification',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'ID del registro a actualizar'
        },
        data: {
          type: 'object',
          description: 'Datos a actualizar'
        }
      },
      required: ['id', 'data']
    },
    endpointTemplate: '/api/records/table/{c_name}/{tableSlug}/{id}',
    method: 'PUT'
  },
  delete: {
    type: 'delete',
    displayName: 'Eliminar',
    description: 'Elimina un registro existente',
    category: 'data_deletion',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'ID del registro a eliminar'
        }
      },
      required: ['id']
    },
    endpointTemplate: '/api/records/table/{c_name}/{tableSlug}/{id}',
    method: 'DELETE'
  }
};

export function getFunctionType(type: string): FunctionType | undefined {
  return FUNCTION_TYPES[type];
}

export function getAllFunctionTypes(): FunctionType[] {
  return Object.values(FUNCTION_TYPES);
}

// Función para generar tool personalizada
export function generateCustomTool(
  name: string,
  functionType: string,
  tableSlug: string,
  customDescription?: string
) {
  const baseFunction = FUNCTION_TYPES[functionType];
  if (!baseFunction) {
    throw new Error(`Tipo de función no válido: ${functionType}`);
  }

  return {
    name: name,
    displayName: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    description: customDescription || `Función para ${baseFunction.displayName.toLowerCase()} en ${tableSlug}`,
    category: baseFunction.category,
    isActive: true,
    config: {
      endpoint: baseFunction.endpointTemplate.replace('{tableSlug}', tableSlug),
      method: baseFunction.method,
      authType: 'none',
      timeout: 15000
    },
    parameters: baseFunction.parameters,
    security: {
      rateLimit: {
        requests: 100,
        window: '1h'
      },
      allowedDomains: []
    }
  };
} 