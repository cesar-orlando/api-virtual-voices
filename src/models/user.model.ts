import { Schema, Document, Connection, Model } from "mongoose";

// Define the interface for a Client document
export interface IUser extends Document {
  name: string;
  email: string;
  role: string; // Indicates if the user is an admin
  status: 1 | 2 | 3; // 1: Active, 2: Inactive, 3: Suspended
  createdAt: Date;
}

// Define the schema for the User model
const UserSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    role: { type: String, enum: ["Usuario", "Admin"], default: "Usuario" }, // Indicates if the user is an admin
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

// Create and export the User model
export default function getUserModel(connection: Connection): Model<IUser> {
  return connection.model<IUser>("User", UserSchema);
}