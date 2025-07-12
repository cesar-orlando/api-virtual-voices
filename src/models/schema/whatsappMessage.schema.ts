import mongoose, { Schema } from "mongoose";

// Define el subesquema para los campos personalizados
const whatsappMessage: Schema = new Schema(
  {
    direction: { type: String, required: true }, // Inbound o Outbound
    body: { type: Schema.Types.Mixed, required: true }, // Mensaje
    createdAt: {
        type: Date,
        default: Date.now,
      },
    respondedBy: { type: String, required: true },
    msgId: { type: String, required: true }, // ID del mensaje
  },
  { _id: true } // Se generará un _id para cada campo
);

export default whatsappMessage;