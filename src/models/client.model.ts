import mongoose, { Schema, Document } from "mongoose";

// Define the interface for a Client document
export interface IClient extends Document {
  name: string;
  email: string;
  createdAt: Date;
}

// Define the schema for the Client model
const ClientSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    status: { 
      type: String, 
      enum: [1, 2, 3], // 1: Active, 2: Inactive, 3: Suspended
      default: 1 
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
  }
);

// Create and export the Client model
export default mongoose.model<IClient>("Client", ClientSchema);