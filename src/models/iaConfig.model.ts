import { Schema, Document, Connection, Model } from "mongoose";

export interface IIaConfig extends Document {
  name: string;
  objective: string;
  tone: string;
  welcomeMessage: string;
  intents: [];
  dataTemplate: string;
  customPrompt: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const IAIntentSchema = new Schema({
  type: { type: String, enum: ["read", "write"], required: true },
  intent: { type: String, required: true },
  tableSlug: { type: String, required: true },
}, { _id: false });

const IaConfigSchema: Schema = new Schema(
  {
    name: { type: String, default: "Asistente" },
    objective: { type: String, enum: ["agendar", "responder", "recomendar", "ventas", "soporte"], default: "agendar" },
    tone: { type: String, enum: ["formal", "amigable", "persuasivo"], default: "amigable" },
    welcomeMessage: { type: String, default: "¡Hola! ¿En qué puedo ayudarte hoy?" },
    intents: { type: [IAIntentSchema], default: [] },
    dataTemplate: { type: String, default: "{{label}}: {{value}}" },
    customPrompt: { type: String, default: "" },
  },
  { timestamps: true }
);

export default function getIaConfigModel(conn: Connection): Model<IIaConfig>{
  return conn.model<IIaConfig>("IaConfig", IaConfigSchema);
}