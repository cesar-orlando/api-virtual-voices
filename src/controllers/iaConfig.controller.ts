import { Request, Response } from "express";
import getIaConfigModel from "../models/iaConfig.model";
import { getDbConnection } from "../config/connectionManager";
import { openai, preparePrompt } from "../services/openai";

// 🔥 Crear configuración inicial si no existe
export const createIAConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { c_name } = req.params;

    const {
      name = "Asistente",
      tone = "amigable",
      objective = "agendar",
      welcomeMessage = "¡Hola! ¿En qué puedo ayudarte?",
    } = req.body;

    const dbName = `${c_name}`;
    const uriBase = process.env.MONGO_URI?.split("/")[0] + "//" + process.env.MONGO_URI?.split("/")[2];
    const conn = await getDbConnection(dbName, uriBase || "mongodb://localhost:27017");

    const IaConfig = getIaConfigModel(conn);

    const existing = await IaConfig.findOne({ name });
    if (existing) {
      res.status(400).json({ message: "Ya existe configuración con este nombre." });
      return;
    }

    const newConfig = new IaConfig({
      name,
      tone,
      objective,
      welcomeMessage,
      intents: [],
      customPrompt: "",
    });

    await newConfig.save();
    res.status(201).json({ message: "Configuración creada", config: newConfig });
  } catch (error) {
    console.error("Error al crear configuración IA:", error);
    res.status(500).json({ message: "Error al crear configuración IA" });
  }
};

export const getIAConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { c_name } = req.params;

    const dbName = `${c_name}`;
    const uriBase = process.env.MONGO_URI?.split("/")[0] + "//" + process.env.MONGO_URI?.split("/")[2];
    const conn = await getDbConnection(dbName, uriBase || "mongodb://localhost:27017");

    const IaConfig = getIaConfigModel(conn);
    const config = await IaConfig.findOne();

    if (!config) {
      res.status(404).json({ message: "Configuración no encontrada." });
      return;
    }

    res.json(config);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener la configuración." });
  }
};

export const updateIAConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { c_name } = req.params;
    const updates = req.body;

    const dbName = `${c_name}`;
    const uriBase = process.env.MONGO_URI?.split("/")[0] + "//" + process.env.MONGO_URI?.split("/")[2];
    const conn = await getDbConnection(dbName, uriBase || "mongodb://localhost:27017");

    const IaConfig = getIaConfigModel(conn);

    const updatedConfig = await IaConfig.findOneAndUpdate({}, updates, { new: true });

    if (!updatedConfig) {
      res.status(404).json({ message: "Configuración no encontrada." });
      return;
    }

    res.json({ message: "Configuración actualizada", config: updatedConfig });
  } catch (error) {
    console.error("Error al actualizar configuración IA:", error);
    res.status(500).json({ message: "Error al actualizar configuración IA" });
  }
};

export const testIA = async (req: Request, res: Response): Promise<void> => {
  try {
    const { c_name } = req.params;

    const dbName = `${c_name}`;
    const uriBase = process.env.MONGO_URI?.split("/")[0] + "//" + process.env.MONGO_URI?.split("/")[2];
    const conn = await getDbConnection(dbName, uriBase || "mongodb://localhost:27017");

    const IaConfig = getIaConfigModel(conn);

    const config = await IaConfig.findOne();

    let IAPrompt;
    
    if (config) {
      IAPrompt = await preparePrompt(config);
    }

    const defaultResponse = "Una disculpa, podrias repetir tu mensaje, no pude entenderlo.";
    let aiResponse = defaultResponse;

    // Mapea historial para OpenAI
    const history = (req.body || []).map((msg: any) => {
      if (msg.from === "user") return { role: "user", content: msg.text };
      if (msg.from === "ai") return { role: "assistant", content: msg.text };
      return null;
    }).filter(Boolean);
    
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        temperature: 0.3,
        messages: [
          { role: "system", content: IAPrompt || "Eres un asistente virtual." },
          ...history
        ]
      });
      aiResponse = completion.choices[0]?.message?.content || defaultResponse;
    } catch (error) {
      console.error("Error al obtener respuesta de OpenAI:", error);
    }

    res.status(201).json({ message: aiResponse});

  } catch (error) {
    console.error("Error al probar IA:", error);
    res.status(500).json({ message: "Error al probar IA" });
  }
};