import mongoose, { Schema, Connection, Model, Document } from "mongoose";
import whatsappMessage from "./schema/whatsappMessage.schema"; // Importa el subesquema

// Define la interfaz para un registro
export interface IWhatsappChat extends Document {
  tableSlug: string;
  phone: string;
  name?: string;
  botActive: boolean;
  messages: {
    direction: string; // Inbound o Outbound
    body: any; // Mensaje
    status: string; // Estado del mensaje
    createdAt?: Date;
    respondedBy: string;
    msgId: string; // ID del mensaje
  }[];
  session?: {
    id: mongoose.Types.ObjectId;
    name?: string;
  };
  advisor?: {
    id: mongoose.Types.ObjectId;
    name?: string;
  };
}

// Define el esquema para los registros
const WhatsappChatSchema: Schema = new Schema(
  {
    tableSlug: { type: String, required: true },
    phone: { type: String, required: true },
    name: { type: String, required: false },
    botActive: { type: Boolean, default: true },
    messages: { type: [whatsappMessage], required: true },
    session: {
      id: { type: Schema.Types.ObjectId, required: false },
      name: { type: String, required: false }
    },
    advisor: {
      id: { type: Schema.Types.ObjectId, required: false },
      name: { type: String, required: false }
    },
  },
  {
    timestamps: true,
  }
);

export function getWhatsappChatModel(conn: Connection): Model<IWhatsappChat> {
  return conn.model<IWhatsappChat>("Chat", WhatsappChatSchema);
}