import { Schema, Document, Connection, Model, Types } from "mongoose";
import auditTrailPlugin from "../plugins/auditTrail";

export interface IIaConfig extends Document {
  name: string;
  type: string;
  objective: string;
  tone: string;
  welcomeMessage: string;
  intents: [];
  dataTemplate: string;
  customPrompt: string;
  timezone: string;
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
    type: { type: String, enum: ["general","personal","interno"], default: "personal"},
    objective: { type: String, enum: ["agendar", "responder", "recomendar", "ventas", "soporte"], default: "ventas" },
    tone: { type: String, enum: ["formal", "amigable", "persuasivo"], default: "amigable" },
    welcomeMessage: { type: String, default: "¡Hola! ¿En qué puedo ayudarte hoy?" },
    intents: { type: [IAIntentSchema], default: [] },
    dataTemplate: { type: String, default: "{{label}}: {{value}}" },
    customPrompt: { type: String, default: "" },
    timezone: { type: String, default: "America/Mexico_City" },
    user: {
      id: { type: Types.ObjectId, ref: "User" }, // Referencia al usuario
      name: { type: String }, // Nombre del usuario asociado
    }
  },
  { timestamps: true }
);

// Performance indexes for high-volume queries
IaConfigSchema.index({ type: 1 }); // Frequently queried by type ('general', 'personal', 'interno')
IaConfigSchema.index({ name: 1 }); // Unique name lookups
IaConfigSchema.index({ "user.id": 1 }); // User-specific configs lookup
IaConfigSchema.index({ type: 1, "user.id": 1 }); // Compound for user+type queries
IaConfigSchema.index({ createdAt: -1 }); // Date-based sorting

IaConfigSchema.plugin(auditTrailPlugin as any, {
  rootPaths: [""], // watch whole doc
  includePaths: [
    'name',
    'type',
    'objective',
    'customPrompt',
    'welcomeMessage',
    'tone',
    'timezone'
  ],
  excludePaths: [ '__v', 'createdAt', 'updatedAt' ],
  modelName: "IAConfig",
});


export default function getIaConfigModel(conn: Connection): Model<IIaConfig>{
  return conn.model<IIaConfig>("IaConfig", IaConfigSchema);
}