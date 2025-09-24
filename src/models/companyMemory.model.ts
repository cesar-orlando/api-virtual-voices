import mongoose, { Document, Schema, Connection } from 'mongoose';

export interface ICompanyMemory extends Document {
  companySlug: string;
  facts: string;
  factsUpdatedAt?: Date;
}

const CompanyMemorySchema = new Schema<ICompanyMemory>({
  companySlug: { 
    type: String, 
    required: true,
    unique: true,
    index: true 
  },
  facts: { 
    type: String, 
    default: '' 
  },
  factsUpdatedAt: Date
}, {
  timestamps: true
});

export default function getCompanyMemoryModel(connection: Connection) {
  return connection.model<ICompanyMemory>('CompanyMemory', CompanyMemorySchema);
}
