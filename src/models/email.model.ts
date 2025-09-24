import { Schema, Document, Connection, Model } from "mongoose";

export interface IEmail extends Document {
  messageId?: string; // ID único del mensaje (para evitar duplicados)
  direction: 'incoming' | 'outgoing'; // Dirección del email
  from: string;
  to: string | string[]; // Puede ser string o array para múltiples destinatarios
  cc?: string | string[]; // Copia
  bcc?: string | string[]; // Copia oculta
  subject: string;
  textContent?: string; // Contenido en texto plano
  htmlContent?: string; // Contenido HTML
  text?: string; // Mantener compatibilidad hacia atrás
  html?: string; // Mantener compatibilidad hacia atrás
  userId?: string; // ID del usuario que envió el email
  receivedDate?: Date; // Fecha de recepción (para emails entrantes)
  sentDate?: Date; // Fecha de envío
  status?: 'pendiente' | 'enviado' | 'fallido' | 'recibido' | 'leído'; // Estado del email
  attachments?: {
    filename: string;
    contentType?: string;
    size?: number;
    hasContent: boolean;
    hasPath: boolean;
    tempPath?: string; // Path to temporary file
    path?: string; // Path completo del archivo
  }[]; // Metadatos de attachments
  smtpConfig?: {
    host: string;
    port: number;
    user: string;
    // No incluimos pass por seguridad
  };
  companySlug?: string; // Empresa asociada
  createdAt?: Date;
  updatedAt?: Date;
}

const EmailSchema: Schema = new Schema(
  {
    messageId: { type: String, unique: true, sparse: true }, // Único para emails entrantes
    direction: { type: String, enum: ['incoming', 'outgoing'], required: true, default: 'outgoing' },
    from: { type: String, required: true },
    to: { type: Schema.Types.Mixed, required: true }, // String o Array
    cc: { type: Schema.Types.Mixed, required: false }, // String o Array
    bcc: { type: Schema.Types.Mixed, required: false }, // String o Array
    subject: { type: String, required: true },
    textContent: { type: String, required: false }, // Nuevo campo
    htmlContent: { type: String, required: false }, // Nuevo campo
    text: { type: String, required: false }, // Compatibilidad hacia atrás
    html: { type: String, required: false }, // Compatibilidad hacia atrás
    userId: { type: String, required: false }, // ID del usuario que envió el email
    receivedDate: { type: Date, required: false }, // Para emails entrantes
    sentDate: { type: Date, required: false }, // Para emails salientes
    status: { 
      type: String, 
      enum: ['pendiente', 'enviado', 'fallido', 'recibido', 'leído'], 
      default: 'pendiente' 
    },
    attachments: [{
      filename: { type: String, required: true },
      contentType: { type: String, required: false },
      size: { type: Number, required: false },
      hasContent: { type: Boolean, default: false },
      hasPath: { type: Boolean, default: false },
      tempPath: { type: String, required: false }, // Path to temporary file
      path: { type: String, required: false } // Path completo
    }], // Metadatos de attachments
    smtpConfig: {
      host: { type: String },
      port: { type: Number },
      user: { type: String }
    },
    companySlug: { type: String, required: false }, // Empresa asociada
    // Campos para importación PST
    importSource: { 
      type: String, 
      enum: ['imap', 'pst', 'manual'], 
      default: 'manual' 
    },
    importFolder: { type: String, required: false },
    importedAt: { type: Date, required: false }
  },
  { timestamps: true }
);

export default function getEmailModel(conn: Connection): Model<IEmail>{
  // Verificar si el modelo ya existe en esta conexión
  if (conn.models.Email) {
    return conn.models.Email as Model<IEmail>;
  }
  return conn.model<IEmail>("Email", EmailSchema);
}