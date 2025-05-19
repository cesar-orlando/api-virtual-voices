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
  },
  { _id: true } // Se generará un _id para cada campo
);

export default whatsappMessage;