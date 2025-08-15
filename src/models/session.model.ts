import { Schema, Document, Connection, Model, Types } from "mongoose";

// Define la interfaz para la tabla
export interface ISession extends Document {
  name: string; // Nombre de la tabla
  icon: string; // Ícono asociado a la tabla
  phone?: { type: String, unique: true },
  status: string;
  platform?: 'whatsapp' | 'facebook'; // Plataforma de la sesión
  sessionData?: any; // Datos de la sesión de WhatsApp
  IA: {
    id: Types.ObjectId; // Referencia al IA asociado
    name: string; // Nombre del IA asociado
  };
  user: {
    id: Types.ObjectId; // Referencia al usuario
    name: string; // Nombre del usuario asociado
  };
  // NUEVO: Referencia a sucursal (desde Company)
  branch?: {
    companyId: string; // Slug de la empresa (ej: "mitsubishi")
    branchId: string; // ID o código de la sucursal (ej: "GG")
    name: string; // Nombre de la sucursal
    code: string; // Código de la sucursal
  };
}

// Define el esquema para la tabla
const SessionSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    icon: { type: String, default: "" }, // Campo opcional para el ícono
    phone: { type: String },
    platform: { type: String, enum: ['whatsapp', 'facebook'] }, // Plataforma de la sesión
    status: { type: String, enum:['connected','disconnected','pending','error']},
    sessionData: { type: Schema.Types.Mixed }, // Campo para almacenar datos de sesión de WhatsApp
    IA: {
      id: { type: Types.ObjectId, ref: "IaConfig", required: true }, // Referencia a IaConfig
      name: { type: String, required: true }, // Nombre del IA asociado
    },
    user: {
      id: { type: Types.ObjectId, ref: "User", required: true }, // Referencia al usuario
      name: { type: String, required: true }, // Nombre del usuario asociado
    },
    // NUEVO: Campo opcional para sucursal
    branch: {
      companyId: { type: String }, // Slug de la empresa
      branchId: { type: String }, // ID o código de la sucursal
      name: { type: String },
      code: { type: String }
    }
  },
  {
    timestamps: true, // Agrega createdAt y updatedAt automáticamente
  }
);

// Exporta el modelo
export function getSessionModel(conn: Connection): Model<ISession>{
  return conn.model<ISession>("Session", SessionSchema);
}