import mongoose, { Document, Schema, Connection } from 'mongoose';

export interface IMessage extends Document {
  threadId: mongoose.Types.ObjectId;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tokens?: number;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>({
  threadId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true,
    index: true 
  },
  role: { 
    type: String, 
    enum: ['user', 'assistant', 'tool'],
    required: true 
  },
  content: { 
    type: String, 
    required: true 
  },
  tokens: Number
}, {
  timestamps: true
});

// Índices para performance y TTL
MessageSchema.index({ threadId: 1, createdAt: -1 });

// TTL opcional para mensajes viejos (180 días)
// MessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

export default function getMessageModel(connection: Connection) {
  return connection.model<IMessage>('Message', MessageSchema);
}
