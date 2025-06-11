import { Request, Response } from "express";
import { startWhatsappBot } from "../services/whatsapp/index";
import { getSessionModel } from "../models/whatsappSession.model";
import { getDbConnection } from "../config/connectionManager";
import { getWhatsappChatModel } from "../models/whatsappChat.model";

// Obtiene todos los mensajes de todos los chats
export const getAllWhatsappMessages = async (req: Request, res: Response) => {
  try {
    const { c_name } = req.params;
    const dbName = `${c_name}`;
    const uriBase = process.env.MONGO_URI?.split("/")[0] + "//" + process.env.MONGO_URI?.split("/")[2];
    const conn = await getDbConnection(dbName, uriBase || "mongodb://localhost:27017");
    const WhatsappChat = getWhatsappChatModel(conn);

    const chats = await WhatsappChat.find({});
    res.status(200).json(chats);
  } catch (error) {
    res.status(500).json({ message: "Error fetching messages", error });
  }
};

export const createWhatsappSession = async (req: Request, res: Response) => {
  const { sessionName, c_name } = req.body;
  if (!sessionName) {
    res.status(400).json({ message: "sessionName is required" });
    return;
  }

  const dbName = `${c_name}`;
  const uriBase = process.env.MONGO_URI?.split("/")[0] + "//" + process.env.MONGO_URI?.split("/")[2];
  const conn = await getDbConnection(dbName, uriBase || "mongodb://localhost:27017");

  const WhatsappSession = getSessionModel(conn);

  const existingSession = await WhatsappSession.findOne({ name: sessionName });

  if (existingSession) {
    res.status(400).json({ message: "A session with this name already exists" });
    return;
  } else {
    try {
      // Espera a que la sesión esté lista antes de guardar en la base de datos
      await startWhatsappBot(sessionName , c_name);
      const newSession = new WhatsappSession({ name: sessionName, c_name });
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

        const dbName = `${c_name}`;
        const uriBase = process.env.MONGO_URI?.split("/")[0] + "//" + process.env.MONGO_URI?.split("/")[2];
        const conn = await getDbConnection(dbName, uriBase || "mongodb://localhost:27017");

        const WhatsappSession = getSessionModel(conn);
        const sessions = await WhatsappSession.find({});
        res.status(200).json(sessions);
    } catch (error) {
        res.status(500).json({ message: "Error fetching sessions", error });
    }
}