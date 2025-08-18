import { Schema, Document, Connection, Model, Types } from "mongoose";

// Define the interface for a User document
export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: 'SuperAdmin' | 'Administrador' | 'Gerente' | 'Marketing' | 'Asesor' | 'Asistente';
  companySlug?: string;
  status: 'active' | 'inactive' | 'eliminado';
  permissions?: string[];
  metadata?: Record<string, any>;
  // ACTUALIZADO: Referencia a sucursal usando el nuevo modelo independiente
  branch?: {
    branchId: Types.ObjectId; // ID de la sucursal independiente
    name: string;             // Nombre de la sucursal (desnormalizado para performance)
    code: string;             // Código de la sucursal (desnormalizado para performance)
  };
  createdAt: Date;
  updatedAt: Date;
}

// Define the schema for the User model
const UserSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { 
      type: String, 
      required: true, 
      enum: ['SuperAdmin', 'Administrador', 'Gerente', 'Marketing', 'Asesor', 'Asistente']
    },
    companySlug: { type: String, required: false },
    status: {
      type: String,
      enum: ['active', 'inactive', 'eliminado'],
      default: 'active'
    },
    permissions: [{ type: String }],
    metadata: { type: Schema.Types.Mixed },
    // ACTUALIZADO: Campo para sucursal con referencia al modelo independiente
    branch: {
      branchId: { 
        type: Schema.Types.ObjectId,
        ref: 'Branch'  // Referencia al modelo Branch independiente
      },
      name: { type: String },
      code: { type: String }
    }
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
  if (this.role === 'SuperAdmin') return true; // SuperAdmin tiene todos los permisos
  if (this.role === 'Administrador') return true;
  return this.permissions?.includes(permission) || false;
};

// Método para verificar si es admin supremo
UserSchema.methods.isSuperAdmin = function(): boolean {
  return this.role === 'SuperAdmin';
};

// Método para verificar si puede ver otras empresas
UserSchema.methods.canViewAllCompanies = function(): boolean {
  return this.role === 'SuperAdmin' || 
         (this.companySlug && this.companySlug.toLowerCase() === 'virtualvoices');
};

// Método para verificar si el usuario está activo
UserSchema.methods.isActive = function(): boolean {
  return this.status === 'active';
};

// Create and export the User model
export default function getUserModel(connection: Connection): Model<IUser> {
  return connection.model<IUser>("User", UserSchema);
} 