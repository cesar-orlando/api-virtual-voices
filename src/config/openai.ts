import OpenAI from "openai";
import dotenv from "dotenv";
import { getEnvironmentConfig } from "./environments";
dotenv.config();

// Obtener la configuración del entorno actual
const config = getEnvironmentConfig();

export const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});