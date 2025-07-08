export interface Request extends Express.Request {
    // Add any custom properties to the request object here
}

export interface Response extends Express.Response {
    // Add any custom properties to the response object here
}

// Exportar interfaces de tabla
export { TableField, ITable } from '../models/table.model';

// Exportar interfaces de registro
export { IRecord } from '../models/record.model';

// Exportar interfaces de herramientas
export { IToolDocument } from '../models/tool.model';
export { 
  ITool, 
  ToolExecutionRequest, 
  BatchExecutionRequest,
  ToolValidationResult,
  OpenAIToolSchema 
} from './tool.types';