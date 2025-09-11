import { Schema, Document, Connection, Model, Types } from "mongoose";

export interface IBranch extends Document {
  _id: Types.ObjectId;           // ID único de la sucursal (MongoDB lo crea automáticamente)
  companyId: Types.ObjectId;     // Referencia al _id de Company
  name: string;                  // Nombre de la sucursal "Gonzalez Gallo", "Country Club"
  code: string;                  // Código corto "GG", "CC"
  address?: string;              // Dirección física
  phone?: string;                // Teléfono de contacto
  email?: string;                // Email de la sucursal
  isActive: boolean;             // Estado activo/inactivo
  manager?: {                    // Gerente/responsable
    id: Types.ObjectId;          // Referencia al usuario gerente
    name: string;                // Nombre del gerente
  };
  metadata?: Record<string, any>; // Datos adicionales
  createdAt: Date;
  updatedAt: Date;
}

const BranchSchema: Schema = new Schema(
  {
    companyId: {                   // Cambio de 'company' a 'companyId' para claridad
      type: Types.ObjectId, 
      ref: "Company", 
      required: true,
      index: true                  // Índice para búsquedas por compañía
    },
    name: { 
      type: String, 
      required: true,
      trim: true,
      maxlength: 100
    },
    code: { 
      type: String, 
      required: true, 
      uppercase: true,
      trim: true,
      maxlength: 10
      // Removemos unique global - será único por empresa
    },
    address: { 
      type: String,
      trim: true,
      maxlength: 250
    },
    phone: { 
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    },
    isActive: { 
      type: Boolean, 
      default: true,
      index: true
    },
    manager: {
      id: { type: Types.ObjectId, ref: "User" },
      name: { 
        type: String,
        trim: true
      }
    },
    metadata: { 
      type: Schema.Types.Mixed,
      default: {}
    }
  },
  { 
    timestamps: true 
  }
);

// Índices compuestos para búsquedas eficientes
BranchSchema.index({ companyId: 1, code: 1 }, { unique: true }); // Código único por empresa
BranchSchema.index({ companyId: 1, name: 1 });                   // Nombre dentro de empresa
BranchSchema.index({ companyId: 1, isActive: 1 });               // Sucursales activas por empresa

export default function getBranchModel(conn: Connection): Model<IBranch> {
  // Verificar si el modelo ya existe en esta conexión
  if (conn.models.Branch) {
    return conn.models.Branch as Model<IBranch>;
  }
  return conn.model<IBranch>("Branch", BranchSchema);
}
