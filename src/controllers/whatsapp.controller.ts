import { Request, Response } from "express";
import { startWhatsappBot, clients } from "../services/whatsapp/index";
import { getSessionModel } from "../models/whatsappSession.model";
import { getDbConnection } from "../config/connectionManager";
import { getWhatsappChatModel } from "../models/whatsappChat.model";
import getIaConfigModel from "../models/iaConfig.model";
import getUserModel from "../models/user.model";
import fs from "fs";
import path from "path";

// Obtiene todos los mensajes de todos los chats
export const getAllWhatsappMessages = async (req: Request, res: Response) => {
  try {
    const { c_name } = req.params;
    const conn = await getDbConnection(c_name);
    const WhatsappChat = getWhatsappChatModel(conn);

    const chats = await WhatsappChat.find({});
    res.status(200).json(chats);
  } catch (error) {
    res.status(500).json({ message: "Error fetching messages", error });
  }
};

export const createWhatsappSession = async (req: Request, res: Response) => {
  const { sessionName, c_name, user_id, user_name } = req.body;
  if (!sessionName) {
    res.status(400).json({ message: "sessionName is required" });
    return;
  }

  const conn = await getDbConnection(c_name);

  const WhatsappSession = getSessionModel(conn);
  const IAConfig = getIaConfigModel(conn);

  const defaultIAConfig = await IAConfig.findOne().sort({ _id: 1 }); // Obtiene la primera configuración de IA por defecto
  const existingSession = await WhatsappSession.findOne({ name: sessionName });

  // Copia los campos relevantes del defaultIAConfig, excluyendo _id y timestamps
  const aiConfigData = defaultIAConfig ? {
    name: defaultIAConfig.name,
    tone: defaultIAConfig.tone,
    objective: defaultIAConfig.objective,
    welcomeMessage: defaultIAConfig.welcomeMessage,
    intents: defaultIAConfig.intents,
    dataTemplate: defaultIAConfig.dataTemplate,
    customPrompt: defaultIAConfig.customPrompt,
    user: {
      id: user_id,
      name: user_name
    }
  } : {};

  const newSessionAiConfig = new IAConfig(aiConfigData);
  await newSessionAiConfig.save();

  if (existingSession) {
    res.status(400).json({ message: "A session with this name already exists" });
    return;
  } else {
    try {
      // Espera a que la sesión esté lista antes de guardar en la base de datos
      await startWhatsappBot(sessionName , c_name, user_id);
      const newSession = new WhatsappSession({ 
        name: sessionName,  
        user: { id: user_id, name: user_name }, 
        IA: { id: newSessionAiConfig?._id, name: newSessionAiConfig?.name }
      });
      await newSession.save();
      res.status(201).json({ message: `Session '${sessionName}' started` });
    } catch (error) {
      res.status(500).json({ message: "Error creating session" });
    }
  }
};

export const getAllWhatsappSessions = async (req: Request, res: Response) => {
    try {
        const { c_name, user_id } = req.params;

        const conn = await getDbConnection(c_name);
        
        const UserConfig = getUserModel(conn);
    
        const user = await UserConfig.findById(user_id);
        if (!user) {
          res.status(404).json({ message: "Usuario no encontrado." });
          return;
        }

        const WhatsappSession = getSessionModel(conn);

        let sessions;

        if (user.role !== "Admin") {
          sessions = await WhatsappSession.find({ "user.id": user_id });
        } else {
          sessions = await WhatsappSession.find({});
        }

        res.status(200).json(sessions);
    } catch (error) {
        res.status(500).json({ message: "Error fetching sessions", error });
    }
}

export const updateWhatsappSession = async (req: Request, res: Response) => {
    const { c_name } = req.params;
    const updates = req.body;

    const conn = await getDbConnection(c_name);

    const WhatsappSession = getSessionModel(conn);
    const session = await WhatsappSession.findOneAndUpdate({ _id: updates._id }, updates, { new: true });

    if (!session) {
        res.status(404).json({ message: "Session not found" });
        return;
    }

    res.status(200).json({ message: "Session updated", session });
};

export const deleteWhatsappSession = async (req: Request, res: Response) => {
    const { c_name, sessionId } = req.params;

    const conn = await getDbConnection(c_name);

    const WhatsappSession = getSessionModel(conn);
    const session = await WhatsappSession.findByIdAndDelete(sessionId);

    if (!session) {
        res.status(404).json({ message: "Session not found" });
        return;
    }

    // Cierra el cliente si existe
    if (clients[`${c_name}:${session.name}`]) {
        try {
            await clients[`${c_name}:${session.name}`].destroy();
            delete clients[`${c_name}:${session.name}`];
        } catch (err) {
            console.error("Error closing WhatsApp client:", err);
        }
    }

    // Ahora intenta borrar la carpeta
    try {
        const sessionFolder = path.join(
            process.cwd(),
            ".wwebjs_auth",
            `session-${session.name}`
        );
        if (fs.existsSync(sessionFolder)) {
            fs.rmSync(sessionFolder, { recursive: true, force: true });
        }
    } catch (err) {
        console.error("Error deleting session folder:", err);
    }

    res.status(200).json({ message: "Session deleted" });
};