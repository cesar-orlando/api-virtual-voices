import mongoose, { Document, Schema, Connection } from 'mongoose';

export interface IKbDoc extends Document {
  companySlug: string;
  docCollection: 'kb' | 'faq' | 'prompts';
  title?: string;
  text: string;
  embedding: number[];
}

const KbDocSchema = new Schema<IKbDoc>({
  companySlug: { 
    type: String, 
    required: true,
    index: true 
  },
  docCollection: { 
    type: String, 
    enum: ['kb', 'faq', 'prompts'],
    required: true,
    index: true
  },
  title: String,
  text: { 
    type: String, 
    required: true 
  },
  embedding: { 
    type: [Number], 
    required: true 
  }
}, {
  timestamps: true
});

// Índices compuestos para RAG
KbDocSchema.index({ companySlug: 1, docCollection: 1 });

export default function getKbDocModel(connection: Connection) {
  return connection.model<IKbDoc>('KbDoc', KbDocSchema);
}
