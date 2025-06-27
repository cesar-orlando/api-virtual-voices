// Remove custom Request/Response interfaces. Use express types directly in your code.

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