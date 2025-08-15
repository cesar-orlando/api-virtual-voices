import { Schema, Document, Connection, Model, Types } from "mongoose";

// Interfaz para Branch dentro de Company
export interface IBranch {
  _id?: Types.ObjectId;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  isActive: boolean;
}

export interface ICompany extends Document {
  name: string;
  address?: string;
  phone?: string;
  branches: Types.DocumentArray<IBranch>; // Usar DocumentArray para métodos de Mongoose
  createdAt?: Date;
  updatedAt?: Date;
}

// Schema para Branch (subdocumento)
const BranchSchema = new Schema({
  name: { type: String, required: true },
  code: { 
    type: String, 
    required: true,
    uppercase: true
  },
  address: { type: String },
  phone: { type: String },
  isActive: { type: Boolean, default: true }
}, { _id: true }); // Permitir que MongoDB genere IDs

const CompanySchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    address: { type: String },
    phone: { type: String },
    branches: [BranchSchema] // Array de subdocumentos
  },
  { timestamps: true }
);

export default function getCompanyModel(conn: Connection): Model<ICompany>{
  return conn.model<ICompany>("Company", CompanySchema);
}