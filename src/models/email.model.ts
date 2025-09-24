import { Schema, Document, Connection, Model } from "mongoose";

export interface IEmail extends Document {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  userId?: string; // ID del usuario que envió el email
  attachments?: {
    filename: string;
    contentType?: string;
    hasContent: boolean;
    hasPath: boolean;
    tempPath?: string; // Path to temporary file
  }[]; // Metadatos de attachments
  smtpConfig?: {
    host: string;
    port: number;
    user: string;
    // No incluimos pass por seguridad
  };
  createdAt?: Date;
  updatedAt?: Date;
}

const EmailSchema: Schema = new Schema(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    subject: { type: String, required: true },
    text: { type: String, required: true },
    html: { type: String, required: false },
    userId: { type: String, required: false }, // ID del usuario que envió el email
    attachments: [{
      filename: { type: String, required: true },
      contentType: { type: String, required: false },
      hasContent: { type: Boolean, default: false },
      hasPath: { type: Boolean, default: false },
      tempPath: { type: String, required: false } // Path to temporary file
    }], // Metadatos de attachments
    smtpConfig: {
      host: { type: String },
      port: { type: Number },
      user: { type: String }
    }
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