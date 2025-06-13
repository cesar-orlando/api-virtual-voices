import { Request, Response } from "express";
import getIaConfigModel from "../models/iaConfig.model";
import { getDbConnection } from "../config/connectionManager";
import { generateResponse, openai, preparePrompt } from "../services/openai";
import getUserModel from "../models/user.model";

// 🔥 Crear configuración inicial si no existe
export const createIAConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { c_name } = req.params;

    const {
      name,
      tone,
      objective,
      welcomeMessage,
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
    const { c_name, AI_id } = req.params;

    const dbName = `${c_name}`;
    const uriBase = process.env.MONGO_URI?.split("/")[0] + "//" + process.env.MONGO_URI?.split("/")[2];
    const conn = await getDbConnection(dbName, uriBase || "mongodb://localhost:27017");

    const IaConfig = getIaConfigModel(conn);
    const config = await IaConfig.findOne({_id: AI_id });

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
    const { c_name, user_id } = req.params;
    const updates = req.body;

    const dbName = `${c_name}`;
    const uriBase = process.env.MONGO_URI?.split("/")[0] + "//" + process.env.MONGO_URI?.split("/")[2];
    const conn = await getDbConnection(dbName, uriBase || "mongodb://localhost:27017");

    const IaConfig = getIaConfigModel(conn);
    const UserConfig = getUserModel(conn);

    const user = await UserConfig.findById(user_id);

    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado." });
      return;
    }

    // Encuentra el primer documento creado
    const firstConfig = await IaConfig.findOne({}, {}, { sort: { createdAt: 1 } });
    if (!firstConfig) {
      res.status(404).json({ message: "Configuración no encontrada." });
      return;
    }

    // Si el documento a modificar es el primero creado, cancela la modificación
    const docToUpdate = await IaConfig.findOne({ _id: updates._id }, {}, { sort: { createdAt: 1 } });
    if (docToUpdate && String(docToUpdate._id) === String(firstConfig._id) && user.role !== "Admin") {
      console.log("Intento de modificación del primer documento creado por un usuario no admin.",user);
      res.status(403).json({ message: "No se puede modificar el primer documento creado." });
      return;
    }

    // Si no es el primero o el usuario es admin, realiza la actualización normalmente
    const updatedConfig = await IaConfig.findOneAndUpdate(
      { _id: updates._id }, 
      updates, 
      { new: true, sort: { createdAt: 1 } }
    );

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
    const { messages, aiConfig } = req.body;

    let IAPrompt;
    
    if (aiConfig) {
      IAPrompt = await preparePrompt(aiConfig);
    }

    const defaultResponse = "Una disculpa, podrias repetir tu mensaje, no pude entenderlo.";
    let aiResponse = defaultResponse;

    // Mapea historial para OpenAI
    const history = (messages || []).map((msg: any) => {
      if (msg.from === "user") return { role: "user", content: msg.text };
      if (msg.from === "ai") return { role: "assistant", content: msg.text };
      return null;
    }).filter(Boolean);
    
    try {
      const response = await generateResponse(
            IAPrompt,
            aiConfig,
            history)
          aiResponse = response || defaultResponse;
    } catch (error) {
      console.error("Error al obtener respuesta de OpenAI:", error);
    }

    res.status(201).json({ message: aiResponse});

  } catch (error) {
    console.error("Error al probar IA:", error);
    res.status(500).json({ message: "Error al probar IA" });
  }
};