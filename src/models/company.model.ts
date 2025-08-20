import { Schema, Document, Connection, Model, Types } from "mongoose";

export interface ICompany extends Document {
  name: string;
  address?: string;
  phone?: string;
  statuses: string[];
  internalPhones?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

const CompanySchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    address: { type: String },
    phone: { type: String },
    statuses: { type: [String], default: ['Activo','Inactivo'] },
    internalPhones: { type: [String], default: [] }
  },
  { timestamps: true }
);

export default function getCompanyModel(conn: Connection): Model<ICompany>{
  return conn.model<ICompany>("Company", CompanySchema);
}