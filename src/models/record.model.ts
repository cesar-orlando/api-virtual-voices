import { Schema, Document, Connection, Model } from "mongoose";
import auditTrailPlugin from "../plugins/auditTrail";

// Define la interfaz para un registro
export interface IRecord extends Document {
  tableSlug: string;
  c_name: string;
  data: Record<string, any>;
  createdBy: string;
  updatedBy?: string;
  getFormattedData(): Record<string, any>; // Método de instancia
}

// Define la interfaz para los métodos estáticos del modelo
export interface IRecordModel extends Model<IRecord> {
  validateDataAgainstTable(
    tableSlug: string, 
    c_name: string, 
    data: Record<string, any>,
    TableModel: any
  ): Promise<{ isValid: boolean; errors: string[] }>;
}

// Define el esquema para los registros
const RecordSchema: Schema = new Schema(
  {
    tableSlug: { type: String, required: true },
    c_name: { type: String, required: true },
    data: { type: Schema.Types.Mixed, required: true },
    createdBy: { type: String, required: true },
    updatedBy: { type: String, required: false },
  },
  {
    timestamps: true,
  }
);

// Índices para optimizar consultas
RecordSchema.index({ tableSlug: 1, c_name: 1 }); // Índice compuesto para búsquedas por tabla y empresa
RecordSchema.index({ c_name: 1, createdAt: -1 }); // Índice para listar registros por empresa ordenados por fecha
RecordSchema.index({ createdBy: 1, c_name: 1 }); // Índice para búsquedas por usuario creador

// Plugin de auditoría: genera diffs por campo (data.*) y guarda en AuditLog (sin historial embebido)
RecordSchema.plugin(auditTrailPlugin as any, {
  includePaths: ["data"],
  modelName: "Record",
});

// Middleware para actualizar updatedBy automáticamente
RecordSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    // Si el documento se está actualizando (no es nuevo), actualizar updatedBy
    // Nota: esto requeriría que el usuario actual esté disponible en el contexto
    // Se puede implementar con un middleware personalizado que pase el usuario
  }
  next();
});

// Método estático para validar datos contra la estructura de la tabla
RecordSchema.statics.validateDataAgainstTable = async function(
  tableSlug: string, 
  c_name: string, 
  data: Record<string, any>,
  TableModel: any
): Promise<{ isValid: boolean; errors: string[] }> {
  const errors: string[] = [];
  
  try {
    // Obtener la estructura de la tabla
    const table = await TableModel.findOne({ slug: tableSlug, c_name, isActive: true });
    
    if (!table) {
      errors.push('Table not found or inactive');
      return { isValid: false, errors };
    }

    // Validar campos requeridos
    for (const field of table.fields) {
      if (field.required && (data[field.name] === undefined || data[field.name] === null || data[field.name] === '')) {
        errors.push(`Field '${field.label}' is required`);
      }
    }

    // Validar tipos de datos
    for (const field of table.fields) {
      const value = data[field.name];
      if (value !== undefined && value !== null) {
        switch (field.type) {
          case 'number':
            if (typeof value !== 'number' || isNaN(value)) {
              errors.push(`Field '${field.label}' must be a number`);
            }
            break;
          case 'email':
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (typeof value !== 'string' || !emailRegex.test(value)) {
              errors.push(`Field '${field.label}' must be a valid email`);
            }
            break;
          case 'date':
            if (isNaN(Date.parse(value))) {
              errors.push(`Field '${field.label}' must be a valid date`);
            }
            break;
          case 'boolean':
            if (typeof value !== 'boolean') {
              errors.push(`Field '${field.label}' must be a boolean`);
            }
            break;
          case 'select':
            if (field.options && !field.options.includes(value)) {
              errors.push(`Field '${field.label}' must be one of: ${field.options.join(', ')}`);
            }
            break;
        }
      }
    }

    return { isValid: errors.length === 0, errors };
  } catch (error) {
    errors.push('Error validating data against table structure');
    return { isValid: false, errors };
  }
};

// Método de instancia para obtener datos formateados
RecordSchema.methods.getFormattedData = function(): Record<string, any> {
  const formattedData: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(this.data)) {
    // Aquí se pueden aplicar formatos específicos según el tipo de campo
    // Por ejemplo, formatear fechas, monedas, etc.
    formattedData[key] = value;
  }
  
  return formattedData;
};

// Exporta el modelo
export default function getRecordModel(conn: Connection): IRecordModel {
  return conn.model<IRecord, IRecordModel>("Record", RecordSchema, "dynamicrecords");
}