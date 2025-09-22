import mongoose, { Document, Schema, Connection } from 'mongoose';

export interface IPromptVersion extends Document {
  companySlug: string;
  personaId: mongoose.Types.ObjectId;
  prompt: string;
  score?: number;
  issues?: string[];
  draft: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PromptVersionSchema = new Schema<IPromptVersion>({
  companySlug: { 
    type: String, 
    required: true,
    index: true 
  },
  personaId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true 
  },
  prompt: { 
    type: String, 
    required: true 
  },
  score: Number,
  issues: [String],
  draft: { 
    type: Boolean, 
    default: true 
  },
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true 
  }
}, {
  timestamps: true
});

// Índices para versionado
PromptVersionSchema.index({ companySlug: 1, personaId: 1, createdAt: -1 });
PromptVersionSchema.index({ draft: 1, createdAt: -1 });

export default function getPromptVersionModel(connection: Connection) {
  return connection.model<IPromptVersion>('PromptVersion', PromptVersionSchema);
}
