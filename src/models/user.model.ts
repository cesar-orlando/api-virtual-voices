import { Schema, Document, Connection, Model } from "mongoose";

// Define the interface for a Client document
export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: string;
  status?: string; // Estatus flexible, validado contra company.statuses
  createdAt: Date;
}

// Define the schema for the User model
const UserSchema: Schema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum:['Admin','Usuario'], default: 'Usuario'},
    status: { type: String }, // Flexible, validado en el controlador
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
  }
);

// Create and export the User model
export default function getUserModel(connection: Connection): Model<IUser> {
  return connection.model<IUser>("User", UserSchema);
}