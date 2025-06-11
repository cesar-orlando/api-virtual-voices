import { Schema, Document, Connection, Model, Types } from "mongoose";

// Define la interfaz para la tabla
export interface IWhatsappSession extends Document {
  name: string; // Nombre de la tabla
  icon: string; // Ícono asociado a la tabla
}

// Define el esquema para la tabla
const SessionSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    icon: { type: String, default: "" }, // Campo opcional para el ícono
  },
  {
    timestamps: true, // Agrega createdAt y updatedAt automáticamente
  }
);

// Exporta el modelo
export function getSessionModel(conn: Connection): Model<IWhatsappSession>{
  return conn.model<IWhatsappSession>("Session", SessionSchema);
}