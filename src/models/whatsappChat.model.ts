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
  conversationSummary?: {
    lastSummarizedIndex: number; // Last message index that was summarized
    summary: string; // AI-generated summary of the conversation
    extractedFacts: {
      userName?: string;
      email?: string;
      phone?: string;
      decisions: string[];
      preferences: string[];
    };
    conversationStage: string; // Current stage of conversation
    tokensSaved: number; // Total tokens saved through summarization
    lastUpdated: Date; // When summary was last updated
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
    conversationSummary: {
      lastSummarizedIndex: { type: Number, default: 0 },
      summary: { type: String, maxlength: 2000 },
      extractedFacts: {
        userName: { type: String, maxlength: 100 },
        email: { type: String, maxlength: 200 },
        phone: { type: String, maxlength: 50 },
        decisions: [{ type: String, maxlength: 200 }],
        preferences: [{ type: String, maxlength: 200 }]
      },
      conversationStage: { type: String, maxlength: 100, default: 'Inicio' },
      tokensSaved: { type: Number, default: 0, min: 0 },
      lastUpdated: { type: Date, default: Date.now }
    }
  },
  {
    timestamps: true,
  }
);

// Enforce uniqueness per phone and session.name (partial to ignore legacy nulls)
WhatsappChatSchema.index(
  { phone: 1, 'session.name': 1 },
  { unique: true, partialFilterExpression: { phone: { $exists: true }, 'session.name': { $exists: true } } }
);

// Performance indexes for high-volume lookups
// - Many queries filter by phone only or by phone + session.id
WhatsappChatSchema.index({ phone: 1 });
WhatsappChatSchema.index({ 'session.id': 1 });
WhatsappChatSchema.index({ phone: 1, 'session.id': 1 });
// Sorting recent chats by updatedAt (and with session)
WhatsappChatSchema.index({ updatedAt: -1 });
WhatsappChatSchema.index({ 'session.id': 1, updatedAt: -1 });

export function getWhatsappChatModel(conn: Connection): Model<IWhatsappChat> {
  return conn.model<IWhatsappChat>("Chat", WhatsappChatSchema);
}
