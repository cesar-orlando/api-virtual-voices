import mongoose, { Schema, Connection, Model, Document } from "mongoose";

// Subesquema para mensajes de Facebook
const facebookMessageSchema = new Schema(
  {
    direction: { type: String, required: true }, // inbound | outbound
    body: { type: Schema.Types.Mixed, required: false }, // texto, adjunto, etc.
    createdAt: { type: Date, default: Date.now },
    respondedBy: { type: String, required: false }, // usuario, bot, etc.
    msgId: { type: String, required: true }, // ID del mensaje de Facebook
  },
  { _id: false }
);

// Interfaz para el chat de Facebook
export interface IFacebookChat extends Document {
  userId: string;
  name?: string;
  messages: {
    direction: string;
    body: any;
    createdAt?: Date;
    respondedBy: string;
    msgId: string;
  }[];
}

// Esquema principal
const FacebookChatSchema: Schema = new Schema(
  {
    userId: { type: String, required: true }, // ID del usuario de Facebook
    name: { type: String, required: false },
    messages: { type: [facebookMessageSchema], required: true }
  },
  {
    timestamps: true,
  }
);

export function getFacebookChatModel(conn: Connection): Model<IFacebookChat> {
  return conn.model<IFacebookChat>("FacebookChat", FacebookChatSchema);
}