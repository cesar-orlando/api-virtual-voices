import { Schema, Document, Connection, Model } from "mongoose";
import { ElevenLabsCall } from '../../shared/types';

// Define the interface for ElevenLabsCall document
export interface IElevenLabsCall extends Document {
  companySlug: string;
  userId: string;
  phoneNumber: string;
  duration: number;
  status: 'completed' | 'failed' | 'in-progress';
  recordingUrl?: string;
  metadata?: {
    voiceId?: string;
    model?: string;
    quality?: string;
    cost?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

// Define the schema for ElevenLabsCall model
const ElevenLabsCallSchema: Schema = new Schema(
  {
    companySlug: { 
      type: String, 
      required: true 
    },
    userId: { 
      type: Schema.Types.ObjectId, 
      ref: 'User', 
      required: true 
    },
    phoneNumber: { 
      type: String, 
      required: true 
    },
    duration: { 
      type: Number, 
      default: 0 
    },
    status: { 
      type: String, 
      enum: ['completed', 'failed', 'in-progress'], 
      default: 'in-progress' 
    },
    recordingUrl: { 
      type: String 
    },
    metadata: {
      voiceId: String,
      model: String,
      quality: String,
      cost: Number
    }
  },
  {
    timestamps: true
  }
);

// Índices para mejorar performance
ElevenLabsCallSchema.index({ companySlug: 1, userId: 1 });
ElevenLabsCallSchema.index({ companySlug: 1, status: 1 });
ElevenLabsCallSchema.index({ createdAt: 1 });
ElevenLabsCallSchema.index({ phoneNumber: 1 });

// Método para marcar como completada
ElevenLabsCallSchema.methods.complete = function(duration: number, recordingUrl?: string): void {
  this.status = 'completed';
  this.duration = duration;
  if (recordingUrl) {
    this.recordingUrl = recordingUrl;
  }
};

// Método para marcar como fallida
ElevenLabsCallSchema.methods.fail = function(): void {
  this.status = 'failed';
};

// Método estático para obtener estadísticas de una empresa
ElevenLabsCallSchema.statics.getCompanyStats = async function(companySlug: string, startDate?: Date, endDate?: Date): Promise<any> {
  const matchStage: any = { companySlug };
  
  if (startDate || endDate) {
    matchStage.createdAt = {};
    if (startDate) matchStage.createdAt.$gte = startDate;
    if (endDate) matchStage.createdAt.$lte = endDate;
  }

  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalDuration: { $sum: '$duration' },
        totalCost: { $sum: '$metadata.cost' }
      }
    }
  ]);

  return {
    total: stats.reduce((acc, stat) => acc + stat.count, 0),
    completed: stats.find(s => s._id === 'completed')?.count || 0,
    failed: stats.find(s => s._id === 'failed')?.count || 0,
    inProgress: stats.find(s => s._id === 'in-progress')?.count || 0,
    totalDuration: stats.reduce((acc, stat) => acc + stat.totalDuration, 0),
    totalCost: stats.reduce((acc, stat) => acc + (stat.totalCost || 0), 0)
  };
};

// Método estático para obtener llamadas de un usuario
ElevenLabsCallSchema.statics.getUserCalls = async function(userId: string, companySlug: string, limit: number = 50): Promise<IElevenLabsCall[]> {
  return await this.find({ userId, companySlug })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'name email');
};

// Create and export the ElevenLabsCall model
export default function getElevenLabsCallModel(connection: Connection): Model<IElevenLabsCall> {
  // Verificar si el modelo ya existe en esta conexión
  if (connection.models.ElevenLabsCall) {
    return connection.models.ElevenLabsCall as Model<IElevenLabsCall>;
  }
  return connection.model<IElevenLabsCall>("ElevenLabsCall", ElevenLabsCallSchema);
} 