import { Schema, Document, Connection, Model } from "mongoose";

// Define the interface for a User document
export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: string;
  companySlug?: string;
  status: number; // 1: Active, 2: Inactive, 3: Suspended
  permissions?: string[];
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// Define the schema for the User model
const UserSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, required: true },
    companySlug: { type: String, required: false },
    status: {
      type: Number,
      enum: [1, 2, 3], // 1: Active, 2: Inactive, 3: Suspended
      default: 1
    },
    permissions: [{ type: String }],
    metadata: { type: Schema.Types.Mixed }
  },
  {
    timestamps: true,
  }
);

// Índices para mejorar performance
UserSchema.index({ email: 1, companySlug: 1 });
UserSchema.index({ companySlug: 1, role: 1 });
UserSchema.index({ status: 1 });

// Método para verificar permisos
UserSchema.methods.hasPermission = function(permission: string): boolean {
  if (this.role === 'Admin') return true;
  return this.permissions?.includes(permission) || false;
};

// Método para verificar si el usuario está activo
UserSchema.methods.isActive = function(): boolean {
  return this.status === 1;
};

// Create and export the User model
export default function getUserModel(connection: Connection): Model<IUser> {
  return connection.model<IUser>("User", UserSchema);
} 