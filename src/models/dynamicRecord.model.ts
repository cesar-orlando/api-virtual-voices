import mongoose, { Schema, Document } from "mongoose";
import CustomFieldSchema from "./schema/customField.schema"; // Importa el subesquema

// Define la interfaz para un registro dinámico
export interface IDynamicRecord extends Document {
  tableSlug: string; // Slug de la tabla dinámica asociada
  fields: {
    name: string;
    type: "text" | "number" | "file";
    value: string | number | Buffer;
  }[]; // Lista de campos personalizados
}

// Define el esquema para los registros dinámicos
const DynamicRecordSchema: Schema = new Schema(
  {
    tableSlug: { type: String, required: true }, // Relación con la tabla dinámica
    fields: { type: [CustomFieldSchema], required: true }, // Lista de campos personalizados
  },
  {
    timestamps: true, // Agrega createdAt y updatedAt automáticamente
  }
);

// Exporta el modelo
export default mongoose.model<IDynamicRecord>("DynamicRecord", DynamicRecordSchema);