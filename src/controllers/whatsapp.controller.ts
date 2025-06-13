import { Request, Response } from "express";
import { startWhatsappBot } from "../services/whatsapp/index";
import { getSessionModel } from "../models/whatsappSession.model";
import { getDbConnection } from "../config/connectionManager";
import { getWhatsappChatModel } from "../models/whatsappChat.model";
import { getIAConfig } from "./iaConfig.controller";
import getIaConfigModel from "../models/iaConfig.model";

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

  const defaultIAConfig = await IAConfig.findOne().sort({ _id: 1}); // Obtiene la primera configuración de IA por defecto
  const existingSession = await WhatsappSession.findOne({ name: sessionName });

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
        IA: { id: defaultIAConfig?._id, name: defaultIAConfig?.name }
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
        const { c_name } = req.params;

        const conn = await getDbConnection(c_name);

        const WhatsappSession = getSessionModel(conn);
        const sessions = await WhatsappSession.find({});
        res.status(200).json(sessions);
    } catch (error) {
        res.status(500).json({ message: "Error fetching sessions", error });
    }
}