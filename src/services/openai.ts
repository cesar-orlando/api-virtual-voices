import OpenAI from "openai";
import dotenv from "dotenv";
import { IIaConfig } from "../models/iaConfig.model";
import { IRecord } from "../models/record.model";
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

export async function generateResponse(
  prompt: string|undefined,
  config: IIaConfig|null,
  chatHistory: any,
  records: IRecord[]
): Promise<string|null> {
  console.log(records);
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      { role: "system", content: prompt || "Eres un asistente virtual." },
      { role: "system", content: `Estos son los productos disponibles ${records}`},
        ...chatHistory
    ],
    temperature: 0.3,
  });

  return response.choices[0].message.content;
}