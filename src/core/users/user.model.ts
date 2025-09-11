import { Schema, Document, Connection, Model, Types } from "mongoose";

// Define the interface for a User document
export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: 'SuperAdmin' | 'Administrador' | 'Gerente' | 'Marketing' | 'Asesor' | 'Asistente';
  companySlug?: string;
  status: string;
  permissions?: string[];
  metadata?: Record<string, any>;
  
  // 📧 NUEVA SECCIÓN: Configuración de email para envío de correos
  emailConfig?: {
    smtpEmail: string;        // Email para SMTP (puede ser diferente al email de login)
    smtpPassword: string;     // Contraseña/App Password para SMTP
    signature?: string;       // Firma del usuario (HTML/texto)
    footerImage?: string;     // URL/path de la imagen del footer
    isEnabled: boolean;       // Si está habilitado el envío de correos
    provider?: 'gmail' | 'outlook' | 'yahoo' | 'custom'; // Proveedor SMTP
    smtpHost?: string;        // Host personalizado (si es custom)
    smtpPort?: number;        // Puerto personalizado (si es custom)
    smtpSecure?: boolean;     // SSL/TLS (si es custom)
  };
  
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
      default: 'active'
    },
    permissions: [{ type: String }],
    metadata: { type: Schema.Types.Mixed },
    
    // 📧 NUEVA SECCIÓN: Configuración de email
    emailConfig: {
      smtpEmail: { type: String },
      smtpPassword: { type: String },
      signature: { type: String },
      footerImage: { type: String },
      isEnabled: { type: Boolean, default: false },
      provider: { 
        type: String, 
        enum: ['gmail', 'outlook', 'yahoo', 'custom', 'other'],
        default: 'gmail'
      },
      smtpHost: { type: String },
      smtpPort: { type: Number },
      smtpSecure: { type: Boolean }
    },
    
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

// 📧 NUEVOS MÉTODOS: Para configuración de email
UserSchema.methods.hasEmailConfig = function(): boolean {
  return this.emailConfig && this.emailConfig.isEnabled && 
         this.emailConfig.smtpEmail && this.emailConfig.smtpPassword;
};

UserSchema.methods.getSmtpConfig = function() {
  if (!this.hasEmailConfig()) return null;
  
  const config = this.emailConfig;
  const smtpConfigs = {
    gmail: { host: 'smtp.gmail.com', port: 587, secure: false },
    outlook: { host: 'smtp-mail.outlook.com', port: 587, secure: false },
    yahoo: { host: 'smtp.mail.yahoo.com', port: 587, secure: false },
    custom: { 
      host: config.smtpHost || 'smtp.gmail.com', 
      port: config.smtpPort || 587, 
      secure: config.smtpSecure || false 
    }
  };
  
  const providerConfig = smtpConfigs[config.provider || 'gmail'];
  
  return {
    host: providerConfig.host,
    port: providerConfig.port,
    secure: providerConfig.secure,
    user: config.smtpEmail,
    pass: config.smtpPassword
  };
};

UserSchema.methods.getEmailSignature = function(): string {
  if (!this.emailConfig?.signature) return '';
  
  let signature = this.emailConfig.signature;
  
  // Si hay imagen de footer, agregarla
  if (this.emailConfig.footerImage) {
    signature += `<br><br><img src="${this.emailConfig.footerImage}" alt="Footer" style="max-width: 400px;">`;
  }
  
  return signature;
};

// Create and export the User model
export default function getUserModel(connection: Connection): Model<IUser> {
  // Verificar si el modelo ya existe en esta conexión
  if (connection.models.User) {
    return connection.models.User as Model<IUser>;
  }
  return connection.model<IUser>("User", UserSchema);
} 