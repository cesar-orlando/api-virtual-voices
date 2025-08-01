import { Request, Response } from "express";
import { startWhatsappBot, clients } from "../services/whatsapp/index";
import { getSessionModel } from "../models/session.model";
import { getConnectionByCompanySlug } from "../config/connectionManager";
import { getFacebookChatModel } from "../models/facebookChat.model";
import getIaConfigModel from "../models/iaConfig.model";
import getUserModel from "../core/users/user.model";
import fs from "fs";
import path from "path";
import { loadRecentFacebookMessages } from "../services/meta/messenger";

export const createFacebookSession = async (req: Request, res: Response) => {
    try {
        const { sessionName, sessionData, c_name, user_id, user_name } = req.body;
        if (!sessionName) {
            res.status(400).json({ message: "sessionName is required" });
            return;
        }
        console.log("Body recibido en createFacebookSession:", req.body);
        const conn = await getConnectionByCompanySlug(c_name);
        console.log("Conexión obtenida");
        const FacebookSession = getSessionModel(conn);
        console.log("Modelo de sesión obtenido");
        const IAConfig = getIaConfigModel(conn);
        console.log("Modelo de IAConfig obtenido");
        const existingSession = await FacebookSession.findOne({ name: sessionName, platform: 'facebook' });
        console.log("Búsqueda de sesión existente terminada");

        if (existingSession) {
            res.status(200).json({
                message: "A session with this name already exists",
            });
        } else {
            try {
                const defaultIAConfig = await IAConfig.findOne({ type: "general" });

                const newSession = new FacebookSession({
                    name: sessionName,
                    user: { id: user_id, name: user_name },
                    platform: 'facebook',
                    sessionData,
                    IA: { id: defaultIAConfig?._id, name: defaultIAConfig?.name },
                });

                await newSession.save();

                const config = {
                    companyDb: c_name,
                    session: newSession,
                };

                await loadRecentFacebookMessages(config);

                res.status(201).json({ message: `Facebook session '${sessionName}' created` });
            } catch (error) {
                console.error("Error creando sesión de Facebook:", error);
                res.status(500).json({ message: "Error creating Facebook session", error });
            }
        }
    } catch (error) {
        console.error("Error general en createFacebookSession:", error);
        res.status(500).json({ message: "Error creating Facebook session", error });
    }
};

export const updateFacebookSession = async (req: Request, res: Response) => {
    try {
        const { c_name } = req.params;
        const updates = req.body;
        const conn = await getConnectionByCompanySlug(c_name);
        const FacebookSession = getSessionModel(conn);
        const session = await FacebookSession.findOneAndUpdate(
            { _id: updates._id, platform: 'facebook' },
            updates,
            { new: true }
        );

        if (!session) {
            res.status(404).json({ message: "Session not found" });
            return;
        }

        // Si el update incluye cambio de nombre, actualiza todos los FacebookChat con ese session.id
        if (typeof updates.name === 'string') {
            try {
                const FacebookChat = getFacebookChatModel(conn);
                await FacebookChat.updateMany(
                    { 'session.id': updates._id },
                    { $set: { 'session.name': updates.name } }
                );
            } catch (err) {
                console.error('Error actualizando session.name en FacebookChat:', err);
            }
        }

        res.status(200).json({ message: "Session updated successfully", session });
    } catch (error) {
        res.status(500).json({ message: "Error updating Facebook session", error });
    }
};

export const getAllFacebookSessions = async (req: Request, res: Response) => {
  try {
    const { c_name, user_id } = req.params;

    const conn = await getConnectionByCompanySlug(c_name);

    const UserConfig = getUserModel(conn);

    const user = await UserConfig.findById(user_id);
    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado." });
      return;
    }

    const FacebookSession = getSessionModel(conn);

    let sessions;

    if (user.role !== "Administrador") {
      sessions = await FacebookSession.find({ "user.id": user_id, platform: 'facebook' });
    } else {
      sessions = await FacebookSession.find({ platform: 'facebook' });
    }

    res.status(200).json(sessions);
  } catch (error) {
    res.status(500).json({ message: "Error getting all Facebook sessions", error });
  }
};

export const deleteFacebookSession = async (req: Request, res: Response) => {
  try {
    const { c_name, sessionId } = req.params;

    const conn = await getConnectionByCompanySlug(c_name);

    const FacebookSession = getSessionModel(conn);
    const session = await FacebookSession.findByIdAndDelete(sessionId);

    if (!session) {
      res.status(404).json({ message: "Session not found" });
      return;
    }

    const FacebookChat = getFacebookChatModel(conn);
    await FacebookChat.deleteMany({ 'session.id': sessionId });

    res.status(200).json({ message: "Session and related Facebook chats deleted successfully" });
  } catch (error) {
    console.error("Error deleting Facebook session:", error);
    res.status(500).json({ message: "Error deleting Facebook session", error });
  }
};

export const createWhatsappSession = async (req: Request, res: Response) => {
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
      const client = await startWhatsappBot(sessionName, c_name, user_id);

      const defaultIAConfig = await IAConfig.findOne({ type: "general" }); // Obtiene el prompt general por defecto

      const newSession = new WhatsappSession({
        name: sessionName,
        user: { id: user_id, name: user_name },
        phone: client.info.wid._serialized || '',
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
      sessions = await WhatsappSession.find({ "user.id": user_id, platform: { $ne: 'facebook' } });
    } else {
      sessions = await WhatsappSession.find({ platform: { $ne: 'facebook' } });
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
    // Usar la misma lógica de rutas que en el servicio de WhatsApp
    const getAuthDir = () => {
      if (process.env.RENDER === 'true') {
        return '/var/data/.wwebjs_auth';
      }
      return path.join(process.cwd(), '.wwebjs_auth');
    };
    
    const authDir = getAuthDir();
    const sessionFolder = path.join(authDir, `session-${c_name}-${session.name}`);
    
    console.log(`🗑️ Intentando eliminar sesión de: ${sessionFolder}`);
    
    if (fs.existsSync(sessionFolder)) {
      fs.rmSync(sessionFolder, { recursive: true, force: true });
      console.log(`✅ Sesión eliminada de: ${sessionFolder}`);
    } else {
      console.log(`⚠️ No se encontró carpeta de sesión en: ${sessionFolder}`);
    }
  } catch (err) {
    console.error("Error deleting session folder:", err);
  }

  res.status(200).json({ message: "Session deleted" });
};