import { Schema, Document, Connection, Model, Types } from "mongoose";

export interface IIaConfig extends Document {
  name: string;
  type: string;
  objective: string;
  tone: string;
  welcomeMessage: string;
  intents: [];
  dataTemplate: string;
  customPrompt: string;
  activeTools: string[]; // Array de nombres de tools activas
  createdAt?: Date;
  updatedAt?: Date;
  user: {
    id: Types.ObjectId; // Referencia al usuario
    name: string; // Nombre del usuario asociado
  };
}

const IAIntentSchema = new Schema({
  type: { type: String, enum: ["read", "write"], required: true },
  intent: { type: String, required: true },
  tableSlug: { type: String, required: true },
}, { _id: false });

const IaConfigSchema: Schema = new Schema(
  {
    name: { type: String, default: "Asistente" },
    type: { type: String, enum: ["general","personal"], default: "personal"},
    objective: { type: String, enum: ["agendar", "responder", "recomendar", "ventas", "soporte"], default: "ventas" },
    tone: { type: String, enum: ["formal", "amigable", "persuasivo"], default: "amigable" },
    welcomeMessage: { type: String, default: "¡Hola! ¿En qué puedo ayudarte hoy?" },
    intents: { type: [IAIntentSchema], default: [] },
    dataTemplate: { type: String, default: "{{label}}: {{value}}" },
    customPrompt: { type: String, default: "" },
    activeTools: { type: [String], default: [] },
    user: {
      id: { type: Types.ObjectId, ref: "User" }, // Referencia al usuario
      name: { type: String }, // Nombre del usuario asociado
    }
  },
  { timestamps: true }
);

export default function getIaConfigModel(conn: Connection): Model<IIaConfig>{
  return conn.model<IIaConfig>("IaConfig", IaConfigSchema);
}