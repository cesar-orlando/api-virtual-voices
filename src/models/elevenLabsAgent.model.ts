// Simplified ElevenLabsAgent Schema
import { Schema, model, Document, Types } from 'mongoose';

interface IElevenLabsAgent extends Document {
  name: string;
  agentId: string;
  companySlug: string;
  prompt: string;
  isActive: boolean;
  createdAt: Date;
}

const elevenLabsAgentSchema = new Schema<IElevenLabsAgent>({
  name: { type: String, required: true },
  agentId: { type: String, required: true, unique: true },
  companySlug: { type: String, required: true },
  prompt: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: false });

export default model<IElevenLabsAgent>('ElevenLabsAgent', elevenLabsAgentSchema);
