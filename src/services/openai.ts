import OpenAI from "openai";
import dotenv from "dotenv";
import { IIaConfig } from "../models/iaConfig.model";
dotenv.config();

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function preparePrompt(
  config: IIaConfig
): Promise<string> {
  const prompt = `Al iniciar una conversacion siempre te presentas como: ${config?.name} e incluyes el saludo: ${config?.welcomeMessage}, tu objetivo es el de ${config?.objective}, informacion previa y contexto para despues del saludo inicial: ${config?.customPrompt}`;
  return prompt;
}