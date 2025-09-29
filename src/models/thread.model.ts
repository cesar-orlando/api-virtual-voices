import mongoose, { Document, Schema, Connection } from 'mongoose';

export interface IThread extends Document {
  companySlug: string;
  userId: mongoose.Types.ObjectId;
  personaId?: mongoose.Types.ObjectId | null; // Opcional: para compatibilidad con sistemas legacy
  state: {
    objective?: string;
    tone?: string;
    channel?: string;
    toolsAllowed?: string[];
    summaryMode?: 'fast' | 'smart' | 'deep' | 'auto';
    llmProvider?: 'openai' | 'anthropic' | 'google' | 'meta';
    llmModel?: string;
    extra?: any;
  };
  summary: {
    facts: string;
    rolling: string;
    updatedAt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ThreadSchema = new Schema<IThread>({
  companySlug: { 
    type: String, 
    required: true,
    index: true 
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true 
  },
  personaId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: false  // Opcional: para chat interno simple
  },
  state: {
    objective: String,
    tone: String,
    channel: String,
    toolsAllowed: [String],
    summaryMode: {
      type: String,
      enum: ['fast', 'smart', 'deep', 'auto'],
      default: 'smart'
    },
    llmProvider: {
      type: String,
      enum: ['openai', 'anthropic', 'google', 'meta'],
      default: 'openai'
    },
    llmModel: {
      type: String,
      default: 'gpt-4o-mini'
    },
    extra: mongoose.Schema.Types.Mixed
  },
  summary: {
    facts: { type: String, default: '' },
    rolling: { type: String, default: '' },
    updatedAt: Date
  }
}, {
  timestamps: true
});

// Índices compuestos para performance
ThreadSchema.index({ companySlug: 1, updatedAt: -1 });
ThreadSchema.index({ userId: 1, updatedAt: -1 });

export default function getThreadModel(connection: Connection) {
  return connection.model<IThread>('Thread', ThreadSchema);
}
