import { Schema, Document, Connection, Model } from "mongoose";

export interface IEmail extends Document {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  userId?: string; // ID del usuario que envió el email
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