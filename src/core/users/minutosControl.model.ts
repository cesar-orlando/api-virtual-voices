import { Schema, Document, Connection, Model } from "mongoose";
import { MinutosControl } from '../../shared/types';

// Define the interface for MinutosControl document
export interface IMinutosControl extends Document, MinutosControl {
  createdAt: Date;
  updatedAt: Date;
}

// Define the schema for MinutosControl model
const MinutosControlSchema: Schema = new Schema(
  {
    userId: { 
      type: Schema.Types.ObjectId, 
      ref: 'User', 
      required: true 
    },
    companySlug: { 
      type: String, 
      required: true 
    },
    estado: { 
      type: String, 
      enum: ['activo', 'ocupado', 'desactivado'], 
      default: 'activo' 
    },
    minutosAcumulados: { 
      type: Number, 
      default: 0 
    },
    ultimaActividad: { 
      type: Date, 
      default: Date.now 
    },
    jerarquiaVisibilidad: [{ 
      type: String 
    }]
  },
  {
    timestamps: true
  }
);

// Índices para mejorar performance
MinutosControlSchema.index({ userId: 1, companySlug: 1 }, { unique: true });
MinutosControlSchema.index({ companySlug: 1, estado: 1 });
MinutosControlSchema.index({ ultimaActividad: 1 });

// Método para actualizar minutos
MinutosControlSchema.methods.actualizarMinutos = function(minutos: number): void {
  if (this.estado !== 'desactivado') {
    this.minutosAcumulados += minutos;
  }
  this.ultimaActividad = new Date();
};

// Método para cambiar estado
MinutosControlSchema.methods.cambiarEstado = function(nuevoEstado: 'activo' | 'ocupado' | 'desactivado'): void {
  this.estado = nuevoEstado;
  this.ultimaActividad = new Date();
};

// Método estático para obtener minutos de un usuario
MinutosControlSchema.statics.getUserMinutos = async function(userId: string, companySlug: string): Promise<number> {
  const control = await this.findOne({ userId, companySlug });
  return control?.minutosAcumulados || 0;
};

// Método estático para obtener todos los controles de una empresa
MinutosControlSchema.statics.getCompanyControls = async function(companySlug: string, userRole?: string): Promise<IMinutosControl[]> {
  let query: any = { companySlug };
  
  // Filtrar por jerarquía si se especifica
  if (userRole) {
    query.jerarquiaVisibilidad = { $in: [userRole, 'todos'] };
  }
  
  return await this.find(query).populate('userId', 'name email role');
};

// Create and export the MinutosControl model
export default function getMinutosControlModel(connection: Connection): Model<IMinutosControl> {
  // Verificar si el modelo ya existe en esta conexión
  if (connection.models.MinutosControl) {
    return connection.models.MinutosControl as Model<IMinutosControl>;
  }
  return connection.model<IMinutosControl>("MinutosControl", MinutosControlSchema);
} 