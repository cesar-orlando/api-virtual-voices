import { Schema, Document, Connection, Model } from "mongoose";

export interface IEmailMonitoring extends Document {
  companySlug: string;
  userId: string;
  isActive: boolean;
  autoStart: boolean; // Si debe iniciar automáticamente al arrancar el servidor
  lastConnected?: Date;
  lastError?: string;
  reconnectAttempts?: number;
  settings?: {
    checkInterval?: number; // Intervalo de verificación en ms
    maxReconnectAttempts?: number;
    enableRealTimeNotifications?: boolean;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

const EmailMonitoringSchema: Schema = new Schema(
  {
    companySlug: { type: String, required: true },
    userId: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    autoStart: { type: Boolean, default: true }, // Por defecto, iniciar automáticamente
    lastConnected: { type: Date },
    lastError: { type: String },
    reconnectAttempts: { type: Number, default: 0 },
    settings: {
      checkInterval: { type: Number, default: 30000 }, // 30 segundos
      maxReconnectAttempts: { type: Number, default: 5 },
      enableRealTimeNotifications: { type: Boolean, default: true }
    }
  },
  { timestamps: true }
);

// Índice único para evitar duplicados
EmailMonitoringSchema.index({ companySlug: 1, userId: 1 }, { unique: true });

export default function getEmailMonitoringModel(conn: Connection): Model<IEmailMonitoring> {
  if (conn.models.EmailMonitoring) {
    return conn.models.EmailMonitoring as Model<IEmailMonitoring>;
  }
  return conn.model<IEmailMonitoring>("EmailMonitoring", EmailMonitoringSchema);
}