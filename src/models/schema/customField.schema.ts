import mongoose, { Schema } from "mongoose";

// Define el subesquema para los campos personalizados
const CustomFieldSchema: Schema = new Schema(
  {
    key: { type: String, required: true }, // Clave única del campo
    label: { type: String, required: true }, // Nombre del campo
    value: { type: Schema.Types.Mixed, required: false }, // Valor del campo
    visible: { type: Boolean, default: true }, // Si el campo es visible o no
    type: { type: String, enum: ["text", "select", "number", "file"], default: "text", required: true }, // Tipo de dato
    options: { type: [String], default: [] }, // Opciones (solo para tipo "select")
    required: { type: Boolean, default: false }, // Si el campo es obligatorio
    format: { type: String, enum: ["default", "currency"], default: "default" }, // Formato (por ejemplo, regex o descripción)
    createdAt: {
        type: Date,
        default: Date.now,
      },
  },
  { _id: false } // No se generará un _id para cada campo
);

export default CustomFieldSchema;