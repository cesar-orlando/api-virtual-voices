import { Schema, Document, Connection, Model } from "mongoose";

export interface IEmail extends Document {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
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
  },
  { timestamps: true }
);

export default function getEmailModel(conn: Connection): Model<IEmail>{
  return conn.model<IEmail>("Email", EmailSchema);
}