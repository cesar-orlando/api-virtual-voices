import { Schema, Document, Connection, Model } from "mongoose";

export interface ICompany extends Document {
  name: string;
  address?: string;
  phone?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const CompanySchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    address: { type: String },
    phone: { type: String },
  },
  { timestamps: true }
);

export default function getCompanyModel(conn: Connection): Model<ICompany>{
  return conn.model<ICompany>("Company", CompanySchema);
}