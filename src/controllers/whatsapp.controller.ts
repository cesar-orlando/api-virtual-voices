import { Request, Response } from "express";
import { startWhatsappBot, clients } from "../services/whatsapp/index";
import { getSessionModel } from "../models/whatsappSession.model";
import { getConnectionByCompanySlug } from "../config/connectionManager";
import { getWhatsappChatModel } from "../models/whatsappChat.model";
import getIaConfigModel from "../models/iaConfig.model";
import getUserModel from "../core/users/user.model";
import fs from "fs";
import path from "path";

// Obtiene todos los mensajes de todos los chats
export const getAllWhatsappMessages = async (req: Request, res: Response) => {
  try {
    const { c_name } = req.params;
    const conn = await getConnectionByCompanySlug(c_name);
    const WhatsappChat = getWhatsappChatModel(conn);

    const chats = await WhatsappChat.find({});
    res.status(200).json(chats);
  } catch (error) {
    res.status(500).json({ message: "Error fetching messages", error });
  }
};

export const createWhatsappSession = async (req: Request, res: Response) => {
  console.log("Body recibido en createWhatsappSession:", req.body);
  const { sessionName, c_name, user_id, user_name } = req.body;
  if (!sessionName) {
    res.status(400).json({ message: "sessionName is required" });
    return;
  }
  console.log("Body recibido en createWhatsappSession:", req.body);
  const conn = await getConnectionByCompanySlug(c_name);
  console.log("Conexión obtenida");
  const WhatsappSession = getSessionModel(conn);
  console.log("Modelo de sesión obtenido");
  const IAConfig = getIaConfigModel(conn);
  console.log("Modelo de IAConfig obtenido");
  const existingSession = await WhatsappSession.findOne({ name: sessionName });
  console.log("Búsqueda de sesión existente terminada");

  if (existingSession) {
    await startWhatsappBot(sessionName, c_name, user_id);
    res
      .status(200)
      .json({
        message: "A session with this name already exists, only sending new QR",
      });
  } else {
    try {
      // Espera a que la sesión esté lista antes de guardar en la base de datos
      await startWhatsappBot(sessionName, c_name, user_id);

      const defaultIAConfig = await IAConfig.findOne({ type: "general" }); // Obtiene el prompt general por defecto

      const newSession = new WhatsappSession({
        name: sessionName,
        user: { id: user_id, name: user_name },
        IA: { id: defaultIAConfig?._id, name: defaultIAConfig?.name },
      });

      await newSession.save();
      res.status(201).json({ message: `Session '${sessionName}' started` });
    } catch (error) {
      console.error("Error creando sesión:", error);
      res.status(500).json({ message: "Error creating session", error: error });
    }
  }
};

export const getAllWhatsappSessions = async (req: Request, res: Response) => {
  try {
    const { c_name, user_id } = req.params;

    const conn = await getConnectionByCompanySlug(c_name);

    const UserConfig = getUserModel(conn);

    const user = await UserConfig.findById(user_id);
    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado." });
      return;
    }

    const WhatsappSession = getSessionModel(conn);

    let sessions;

    if (user.role !== "Administrador") {
      sessions = await WhatsappSession.find({ "user.id": user_id });
    } else {
      sessions = await WhatsappSession.find({});
    }

    res.status(200).json(sessions);
  } catch (error) {
    res.status(500).json({ message: "Error fetching sessions", error });
  }
};

export const updateWhatsappSession = async (req: Request, res: Response) => {
  const { c_name } = req.params;
  const updates = req.body;

  const conn = await getConnectionByCompanySlug(c_name);

  const WhatsappSession = getSessionModel(conn);
  const session = await WhatsappSession.findOneAndUpdate(
    { _id: updates._id },
    updates,
    { new: true }
  );

  if (!session) {
    res.status(404).json({ message: "Session not found" });
    return;
  }

  res.status(200).json({ message: "Session updated", session });
};

export const deleteWhatsappSession = async (req: Request, res: Response) => {
  const { c_name, sessionId } = req.params;

  const conn = await getConnectionByCompanySlug(c_name);

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
      `session-${c_name}-${session.name}`
    );
    if (fs.existsSync(sessionFolder)) {
      fs.rmSync(sessionFolder, { recursive: true, force: true });
    }
  } catch (err) {
    console.error("Error deleting session folder:", err);
  }

  res.status(200).json({ message: "Session deleted" });
};

export const MessageToAll = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { messageAll } = req.body;
  const { c_name, sessionId } = req.params;

  const conn = await getConnectionByCompanySlug(c_name);

  const WhatsappSession = getSessionModel(conn);
  const session = await WhatsappSession.findById(sessionId);
  if (!session) {
    res.status(404).json({ message: "Session not found" });
    return;
  }
  const whatsappClient = clients[`${c_name}:${session.name}`];

  try {
    const chats = await whatsappClient.getChats();
    const nonGroups = chats.filter((chat) => !chat.isGroup);
    console.log(`Number of chats: ${chats.length}`);
    nonGroups.forEach((chat) => {
      console.log(`Chat ID: ${chat.id._serialized}`);
      console.log("Se envio el siguiente mensaje: ", messageAll);
      whatsappClient.sendMessage(chat.id._serialized, messageAll);
    });
  } catch (error) {
    console.error("Error getting chats:", error);
  }
};

export const sendWhatsappMessage = async (req: Request, res: Response) => {
  try {
    const { c_name, sessionId } = req.params;
    const { phone, message } = req.body;

    const conn = await getConnectionByCompanySlug(c_name);

    const WhatsappSession = getSessionModel(conn);
    const WhatsappChat = getWhatsappChatModel(conn);

    const session = await WhatsappSession.findById(sessionId);
    let chatRecord = await WhatsappChat.findOne({ phone });

    if (!session) {
      res.status(404).json({ message: "Session not found" });
      return;
    }

    if (!chatRecord) {
      chatRecord = new WhatsappChat({
        tableSlug: "clientes",
        phone: phone,
        session: {
          id: session?.id,
          name: session?.name,
        },
        //Se le asigna por default al usuario dueño de la sesion
        advisor: {
          id: session?.user.id,
          name: session?.user.name,
        },
      });
    }

    clients[`${c_name}:${session.name}`].sendMessage(phone, message);

    chatRecord.messages.push({
      direction: "outbound",
      body: message,
      respondedBy: "human",
    });

    await chatRecord.save();

    res.status(200).json({ message: "Message sent" });
  } catch (error) {
    res.status(500).json({ message: "Error fetching messages", error });
  }
};
