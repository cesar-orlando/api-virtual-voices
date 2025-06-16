import { Schema, Document, Connection, Model, Types } from "mongoose";

// Define la interfaz para la tabla
export interface IWhatsappSession extends Document {
  name: string; // Nombre de la tabla
  icon: string; // Ícono asociado a la tabla
  IA: {
    id: Types.ObjectId; // Referencia al IA asociado
    name: string; // Nombre del IA asociado
  };
  user: {
    id: Types.ObjectId; // Referencia al usuario
    name: string; // Nombre del usuario asociado
  };
}

// Define el esquema para la tabla
const SessionSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    icon: { type: String, default: "" }, // Campo opcional para el ícono
    IA: {
      id: { type: Types.ObjectId, ref: "IaConfig", required: true }, // Referencia a IaConfig
      name: { type: String, required: true }, // Nombre del IA asociado
    },
    user: {
      id: { type: Types.ObjectId, ref: "User", required: true }, // Referencia al usuario
      name: { type: String, required: true }, // Nombre del usuario asociado
    }
  },
  {
    timestamps: true, // Agrega createdAt y updatedAt automáticamente
  }
);

// Exporta el modelo
export function getSessionModel(conn: Connection): Model<IWhatsappSession>{
  return conn.model<IWhatsappSession>("Session", SessionSchema);
}