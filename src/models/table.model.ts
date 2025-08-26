import { Schema, Document, Connection, Model } from "mongoose";
import auditTrailPlugin from "../plugins/auditTrail";

// Define la interfaz para un campo de tabla
export interface TableField {
  name: string;        // "nombre", "email", "telefono"
  label: string;       // "Nombre", "Email", "Teléfono"
  type: 'text' | 'email' | 'number' | 'date' | 'boolean' | 'select' | 'file' | 'currency' | 'object';
  required?: boolean;
  defaultValue?: any;
  options?: string[];  // Para campos tipo select
  order: number;       // Orden de la columna
  width?: number;      // Ancho de la columna
}

// Define la interfaz para la tabla
export interface ITable extends Document {
  name: string;        // Nombre de la tabla
  slug: string;        // Identificador único
  icon: string;        // Ícono asociado a la tabla
  c_name: string;      // Nombre de la empresa
  createdBy: string;   // ID del usuario que creó la tabla
  isActive: boolean;   // Estado activo/inactivo de la tabla
  fields: TableField[]; // Campos dinámicos de la tabla
  deletedBy?: string;
  deletedAt?: Date;
}

// Define el esquema para un campo de tabla
const TableFieldSchema: Schema = new Schema({
  name: { type: String, required: true },
  label: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['text', 'email', 'number', 'date', 'boolean', 'select', 'file', 'currency', 'object'],
    required: true 
  },
  required: { type: Boolean, default: false },
  defaultValue: Schema.Types.Mixed,
  options: [String], // Para campos tipo select
  order: { type: Number, required: true },
  width: { type: Number, default: 150 }
});

// Define el esquema para la tabla
const TableSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true },
    icon: { type: String, default: "" },
    c_name: { type: String, required: true },
    createdBy: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    fields: [TableFieldSchema],
    deletedBy: { type: String, default: null },
    deletedAt: { type: Date, default: null }
  },
  {
    timestamps: true, // Agrega createdAt y updatedAt automáticamente
  }
);

// Índices compuestos para validaciones
TableSchema.index({ slug: 1, c_name: 1 }, { unique: true }); // Slug único por empresa

// Validaciones personalizadas
TableSchema.pre('save', function(next) {
  const table = this as any;
  
  // Validar que la tabla tenga al menos un campo
  if (!table.fields || table.fields.length === 0) {
    return next(new Error('La tabla debe tener al menos un campo'));
  }
  
  // Validar que los campos tengan nombres únicos dentro de la tabla
  const fieldNames = table.fields.map((field: TableField) => field.name);
  const uniqueFieldNames = new Set(fieldNames);
  
  if (fieldNames.length !== uniqueFieldNames.size) {
    return next(new Error('Los campos deben tener nombres únicos dentro de la tabla'));
  }
  
  // Validar que los campos tengan órdenes únicos
  const fieldOrders = table.fields.map((field: TableField) => field.order);
  const uniqueFieldOrders = new Set(fieldOrders);
  
  if (fieldOrders.length !== uniqueFieldOrders.size) {
    return next(new Error('Los campos deben tener órdenes únicos'));
  }
  
  next();
});

TableSchema.plugin(auditTrailPlugin as any, {
  rootPaths: [""], // watch whole doc
  includePaths: [
    'name',
    'slug',
    'icon',
    'isActive',
    'fields'
  ],
  excludePaths: [ 
    '__v', 
    'createdAt', 
    'updatedAt'
  ],
  excludePatterns: [
    /^fields\.\d+\.width$/  // Exclude width for any field in the array
  ],
  modelName: "Table",
});

// Exporta el modelo
export default function getTableModel(conn: Connection): Model<ITable>{
  return conn.model<ITable>("Table", TableSchema);
}