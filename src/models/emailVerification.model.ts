import mongoose, { Schema, Document } from 'mongoose';

export interface IEmailVerification extends Document {
  userId: string;
  email: string;
  verificationCode: string;
  isVerified: boolean;
  attempts: number;
  expiresAt: Date;
  createdAt: Date;
  verifiedAt?: Date;
  companySlug: string;
  ipAddress?: string;
  userAgent?: string;
}

const EmailVerificationSchema = new Schema<IEmailVerification>({
  userId: {
    type: String,
    required: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },
  verificationCode: {
    type: String,
    required: true,
    length: 6
  },
  isVerified: {
    type: Boolean,
    default: false,
    index: true
  },
  attempts: {
    type: Number,
    default: 0,
    max: 5
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 } // TTL index
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  verifiedAt: {
    type: Date
  },
  companySlug: {
    type: String,
    required: true,
    index: true
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  }
}, {
  timestamps: true
});

// Índices compuestos para mejor performance
EmailVerificationSchema.index({ userId: 1, companySlug: 1 });
EmailVerificationSchema.index({ email: 1, companySlug: 1 });
EmailVerificationSchema.index({ verificationCode: 1, isVerified: 1 });

// Función para generar código de verificación
EmailVerificationSchema.statics.generateVerificationCode = function(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Función para verificar código
EmailVerificationSchema.methods.verifyCode = function(code: string): boolean {
  if (this.isVerified) {
    return false; // Ya está verificado
  }
  
  if (this.attempts >= 5) {
    return false; // Demasiados intentos
  }
  
  if (new Date() > this.expiresAt) {
    return false; // Código expirado
  }
  
  this.attempts += 1;
  
  if (this.verificationCode === code) {
    this.isVerified = true;
    this.verifiedAt = new Date();
    return true;
  }
  
  return false;
};

// Función para verificar si el email está verificado
EmailVerificationSchema.statics.isEmailVerified = async function(
  userId: string, 
  email: string, 
  companySlug: string
): Promise<boolean> {
  const verification = await this.findOne({
    userId,
    email: email.toLowerCase(),
    companySlug,
    isVerified: true
  });
  
  return !!verification;
};

// Función para obtener el estado de verificación
EmailVerificationSchema.statics.getVerificationStatus = async function(
  userId: string,
  companySlug: string
): Promise<{
  isVerified: boolean;
  email?: string;
  attempts: number;
  expiresAt?: Date;
  canResend: boolean;
}> {
  const verification = await this.findOne({
    userId,
    companySlug,
    isVerified: false
  }).sort({ createdAt: -1 });
  
  if (!verification) {
    return {
      isVerified: false,
      attempts: 0,
      canResend: true
    };
  }
  
  const now = new Date();
  const canResend = verification.attempts < 5 && now > verification.expiresAt;
  
  return {
    isVerified: false,
    email: verification.email,
    attempts: verification.attempts,
    expiresAt: verification.expiresAt,
    canResend
  };
};

export default function getEmailVerificationModel(connection: mongoose.Connection) {
  return connection.model<IEmailVerification>('EmailVerification', EmailVerificationSchema);
}

