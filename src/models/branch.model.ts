import { Schema, Document, Connection, Model, Types } from "mongoose";

export interface IBranch extends Document {
  name: string; // "Sucursal Norte", "Matriz"
  code: string; // "SUC001", "MATRIZ"
  address?: string;
  phone?: string;
  company: Types.ObjectId; // Referencia a Company
  isActive: boolean;
  manager?: {
    id: Types.ObjectId; // Referencia al gerente
    name: string;
  };
  metadata?: Record<string, any>; // Para futuros campos específicos
  createdAt: Date;
  updatedAt: Date;
}

const BranchSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    code: { 
      type: String, 
      required: true, 
      uppercase: true,
      unique: true // Códigos únicos globalmente
    },
    address: { type: String },
    phone: { type: String },
    company: { 
      type: Types.ObjectId, 
      ref: "Company", 
      required: true 
    },
    isActive: { 
      type: Boolean, 
      default: true 
    },
    manager: {
      id: { type: Types.ObjectId, ref: "User" },
      name: { type: String }
    },
    metadata: { type: Schema.Types.Mixed }
  },
  { 
    timestamps: true 
  }
);

// Índices para performance
BranchSchema.index({ company: 1, isActive: 1 });
BranchSchema.index({ code: 1 });
BranchSchema.index({ company: 1, name: 1 });

export default function getBranchModel(conn: Connection): Model<IBranch> {
  return conn.model<IBranch>("Branch", BranchSchema);
}
