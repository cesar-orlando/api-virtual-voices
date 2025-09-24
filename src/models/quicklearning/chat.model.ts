import mongoose, { Schema, Document, Connection, Model } from "mongoose";

// Definimos la interfaz para TypeScript
interface IMessage {
  direction: "inbound" | "outbound-api";
  body: string;
  dateCreated?: Date;
  respondedBy: "bot" | "human" | "asesor";
  responseTime?: number; // Tiempo en segundos que tardó en responder un humano
  twilioSid?: string; // ID del mensaje en Twilio
  mediaUrl?: string[]; // URLs de media si las hay
  messageType?: "text" | "image" | "audio" | "video" | "location" | "document" | "sticker";
  metadata?: {
    lat?: number;
    lng?: number;
    [key: string]: any;
  };
  msgId?: string;
}

export interface IQuickLearningChat extends Document {
  phone: string;
  profileName?: string;
  messages: IMessage[];
  linkedTable: {
    refModel: string;
    refId: mongoose.Types.ObjectId;
  };
  advisor?: {
    id: mongoose.Types.ObjectId;
    name: string;
  };
  conversationStart: Date;
  lastMessage?: {
    body: string;
    date: Date;
    respondedBy: string;
  };
  aiEnabled: boolean;
  status: "active" | "inactive" | "blocked";
  tags?: string[];
  notes?: string;
  customerInfo?: {
    name?: string;
    email?: string;
    city?: string;
    interests?: string[];
    stage?: "prospecto" | "interesado" | "inscrito" | "no_prospecto";
  };
  tableSlug?: string; // Para enlazar con tablas específicas
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
  
  // Métodos del esquema
  addMessage(messageData: Partial<IMessage>): Promise<IQuickLearningChat>;
  updateCustomerInfo(info: Partial<IQuickLearningChat['customerInfo']>): Promise<IQuickLearningChat>;
  assignAdvisor(advisorId: string, advisorName: string): Promise<IQuickLearningChat>;
  enableAI(): Promise<IQuickLearningChat>;
}

// Definimos el esquema de Mongoose
const QuickLearningChatSchema: Schema = new mongoose.Schema({
  phone: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
  },
  profileName: { type: String },
  messages: [
    {
      direction: { 
        type: String, 
        enum: ["inbound", "outbound-api"], 
        required: true 
      },
      body: { type: String, required: true },
      dateCreated: { type: Date, default: Date.now },
      respondedBy: { 
        type: String, 
        enum: ["bot", "human", "asesor"], 
        required: true 
      },
      responseTime: { type: Number },
      twilioSid: { type: String },
      mediaUrl: [{ type: String }],
      messageType: { 
        type: String, 
        enum: ["text", "image", "audio", "video", "location", "document", "sticker"], 
        default: "text" 
      },
      metadata: {
        lat: { type: Number },
        lng: { type: Number },
        type: mongoose.Schema.Types.Mixed
      },
      msgId: { type: String }
    },
  ],
  linkedTable: {
    refModel: { type: String, required: true },
    refId: { 
      type: mongoose.Schema.Types.ObjectId, 
      required: true, 
      refPath: "linkedTable.refModel" 
    },
  },
  advisor: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    name: { type: String },
  },
  conversationStart: { type: Date, default: Date.now },
  lastMessage: {
    body: { type: String },
    date: { type: Date },
    respondedBy: { type: String }
  },
  aiEnabled: { type: Boolean, default: true },
  status: { 
    type: String, 
    enum: ["active", "inactive", "blocked"], 
    default: "active" 
  },
  tags: [{ type: String }],
  notes: { type: String },
  customerInfo: {
    name: { type: String },
    email: { type: String },
    city: { type: String },
    interests: [{ type: String }],
    stage: { 
      type: String, 
      enum: ["prospecto", "interesado", "inscrito", "no_prospecto"], 
      default: "prospecto" 
    }
  },
  tableSlug: { type: String },
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
}, { 
  timestamps: true,
  collection: 'chats'
});

// Índices para optimizar consultas
QuickLearningChatSchema.index({ phone: 1 });
QuickLearningChatSchema.index({ "advisor.id": 1 });
QuickLearningChatSchema.index({ conversationStart: -1 });
QuickLearningChatSchema.index({ "lastMessage.date": -1 });
QuickLearningChatSchema.index({ "customerInfo.stage": 1 });

// Métodos del esquema
QuickLearningChatSchema.methods.addMessage = function(messageData: Partial<IMessage>) {
  this.messages.push({
    ...messageData,
    dateCreated: new Date()
  });
  
  // Actualizar último mensaje
  this.lastMessage = {
    body: messageData.body || '',
    date: new Date(),
    respondedBy: messageData.respondedBy || 'bot'
  };
  
  return this.save();
};

QuickLearningChatSchema.methods.updateCustomerInfo = function(info: Partial<IQuickLearningChat['customerInfo']>) {
  this.customerInfo = {
    ...this.customerInfo,
    ...info
  };
  return this.save();
};

QuickLearningChatSchema.methods.assignAdvisor = function(advisorId: string, advisorName: string) {
  this.advisor = {
    id: new mongoose.Types.ObjectId(advisorId),
    name: advisorName
  };
  this.aiEnabled = false; // Desactivar AI cuando se asigna un asesor
  return this.save();
};

QuickLearningChatSchema.methods.enableAI = function() {
  this.aiEnabled = true;
  this.advisor = undefined;
  return this.save();
};

// Crear el modelo con conexión específica
export default function getQuickLearningChatModel(conn: Connection): Model<IQuickLearningChat> {
  return conn.model<IQuickLearningChat>("QuickLearningChat", QuickLearningChatSchema);
}