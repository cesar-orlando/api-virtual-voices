// Simplified ElevenLabsAgent Schema - Solo referencias, datos vienen de ElevenLabs
import { Schema, model, Document, Types } from 'mongoose';

interface IElevenLabsAgent extends Document {
  agentId: string;
  companySlug: string;
  createdAt: Date;
}

const elevenLabsAgentSchema = new Schema<IElevenLabsAgent>({
  agentId: { type: String, required: true, unique: true },
  companySlug: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: false });

export default model<IElevenLabsAgent>('ElevenLabsAgent', elevenLabsAgentSchema);
