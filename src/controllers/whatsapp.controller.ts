import { Request, Response } from "express";
import { startWhatsappBot, clients } from "../services/whatsapp/index";
import { getSessionModel } from "../models/session.model";
import { getConnectionByCompanySlug } from "../config/connectionManager";
import { getWhatsappChatModel } from "../models/whatsappChat.model";
import getUserModel from "../core/users/user.model";
import getRecordModel from "../models/record.model";

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

// Obtiene usuarios de múltiples tablas con su último mensaje de WhatsApp
export const getWhatsappUsers = async (req: Request, res: Response) => {
  try {
    const { c_name, user_id } = req.params;
    const { tableSlugs } = req.query;
    
    if (!tableSlugs) {
      res.status(400).json({ error: "tableSlugs query param is required" });
      return;
    }
    
    const slugs = (tableSlugs as string).split(",").map(s => s.trim()).filter(Boolean);
    const conn = await getConnectionByCompanySlug(c_name);
    const WhatsappChat = getWhatsappChatModel(conn);

    const UserConfig = getUserModel(conn);
    const user = await UserConfig.findById(user_id);

    let chats

    if (user.role == "Administrador") {
      chats = await WhatsappChat.find({ tableSlug: { $in: slugs } }).lean();
    } else {
      const WhatsappSession = getSessionModel(conn);
      const userSessions = await WhatsappSession.find({ "user.id": user_id });
      // Buscar directamente en WhatsappChat por tableSlug
      chats = await WhatsappChat.find({ tableSlug: { $in: slugs }, "session.id": { $in: userSessions.map(session => session.id) } }).lean();
    }

    // Mapear los chats a usuarios con su último mensaje
    const usuarios = chats.map((chat: any) => {
      let lastMessage = null;
      let totalMessages = 0;
      let unreadMessages = 0;
      
      if (chat.messages && chat.messages.length > 0) {
        totalMessages = chat.messages.length;
        // Obtener el último mensaje del array
        const lastMsg = chat.messages[chat.messages.length - 1] as any;
        lastMessage = {
          body: lastMsg.body,
          direction: lastMsg.direction,
          respondedBy: lastMsg.respondedBy,
          date: lastMsg.createdAt || new Date(),
          _id: lastMsg._id
        };
        unreadMessages = chat.messages.filter((msg: any) => msg.status !== 'leído' && msg.direction === 'inbound').length;
      }
      
      // Limpiar el número de teléfono (remover @c.us si existe)
      const cleanPhone = (chat.phone || '').replace('@c.us', '');
      
      return {
        _id: chat._id,
        name: chat.name || '',
        phone: cleanPhone, // Número limpio sin @c.us
        phoneWithSuffix: chat.phone || '', // Número completo con @c.us para compatibilidad
        lastMessage,
        tableSlug: chat.tableSlug,
        botActive: chat.botActive || false,
        totalMessages,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        session: {
          id: chat.session?.id,
          name: chat.session?.name
        },
        unreadMessages
      };
    });
    
    res.status(200).json({
      success: true,
      usuarios,
      total: usuarios.length,
      tables: slugs
    });
  } catch (error) {
    console.error("❌ Error obteniendo usuarios de WhatsApp:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Obtiene un usuario específico por número de teléfono
export const getWhatsappUserByPhone = async (req: Request, res: Response) => {
  try {
    const { c_name, sessionId, phone } = req.params;
    const conn = await getConnectionByCompanySlug(c_name);
    const WhatsappChat = getWhatsappChatModel(conn);
    
    // Limpiar el número de teléfono (remover @c.us si existe)
    const cleanPhone = phone.replace('@c.us', '');
    
    // Buscar por número limpio o con sufijo
    const chat = await WhatsappChat.findOne({
      $or: [
        { phone: cleanPhone },
        { phone: `${cleanPhone}@c.us` }
      ],
      "session.id": sessionId
    }).lean();
    
    if (!chat) {
      res.status(404).json({ 
        success: false,
        error: "Usuario no encontrado",
        phone: cleanPhone,
        suggestion: "Verifica que el número sea correcto"
      });
      return;
    }
    
    let lastMessage = null;
    let totalMessages = 0;
    
    if (chat.messages && chat.messages.length > 0) {
      totalMessages = chat.messages.length;
      // Obtener el último mensaje del array
      const lastMsg = chat.messages[chat.messages.length - 1] as any;
      lastMessage = {
        body: lastMsg.body,
        direction: lastMsg.direction,
        respondedBy: lastMsg.respondedBy,
        date: lastMsg.createdAt || new Date(),
        _id: lastMsg._id
      };
    }
    
    // Limpiar el número de teléfono para la respuesta
    const cleanPhoneResponse = (chat.phone || '').replace('@c.us', '');
    
    const usuario = {
      _id: chat._id,
      name: chat.name || '',
      phone: cleanPhoneResponse, // Número limpio sin @c.us
      phoneWithSuffix: chat.phone || '', // Número completo con @c.us para compatibilidad
      lastMessage,
      tableSlug: chat.tableSlug,
      botActive: chat.botActive || false,
      totalMessages,
      createdAt: (chat as any).createdAt,
      updatedAt: (chat as any).updatedAt
    };
    
    res.status(200).json({
      success: true,
      usuario
    });
  } catch (error) {
    console.error("❌ Error obteniendo usuario por teléfono:", error);
    res.status(500).json({ error: "Internal server error" });
  }
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

    const session = await WhatsappSession.findById(sessionId);

    if (!session) {
      res.status(404).json({ message: "Session not found" });
      return;
    }

    clients[`${c_name}:${session.name}`].sendMessage(phone, message);

    res.status(200).json({ message: "Message sent" });
  } catch (error) {
    res.status(500).json({ message: "Error fetching messages", error });
  }
};

// Obtiene el historial de mensajes de un usuario específico (por número limpio o con @c.us)
export const getChatMessages = async (req: Request, res: Response) : Promise<void> => {
  try {
    const { c_name, sessionId, phone } = req.params;
    const conn = await getConnectionByCompanySlug(c_name);
    const WhatsappChat = getWhatsappChatModel(conn);

    // Buscar por número limpio o con sufijo
    const cleanPhone = phone.replace('@c.us', '');
    const chat = await WhatsappChat.findOne({
      $or: [
        { phone: cleanPhone },
        { phone: `${cleanPhone}@c.us` }
      ],
      "session.id": sessionId
    }).lean();

    if (!chat) {
       res.status(404).json({ message: "Chat no encontrado", phone });
       return
    }

    res.status(200).json({
      success: true,
      chat: {
        _id: chat._id,
        phone: chat.phone,
        name: chat.name,
        botActive: chat.botActive,
        messages: chat.messages || [],
        totalMessages: chat.messages?.length || 0,
        createdAt: (chat as any).createdAt,
        updatedAt: (chat as any).updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching chat messages", error });
  }
};

export async function enviarFichaTecnica(req: Request, res: Response): Promise<any> {
  try {
    const { propertyId, phoneNumber, company, sessionName } = req.body;

    if (company !== 'grupokg') {
      return res.status(403).json({ success: false, message: 'Solo disponible para grupokg' });
    }
    if (!propertyId || !phoneNumber) {
      return res.status(400).json({ success: false, message: 'propertyId y phoneNumber son requeridos' });
    }

    // Obtener la propiedad
    const conn = await getConnectionByCompanySlug(company);
    const Record = getRecordModel(conn);
    const propiedad = await Record.findById(propertyId);
    if (!propiedad || !propiedad.data.link_ficha_tecnica) {
      return res.status(404).json({ success: false, message: 'No se encontró el link de la ficha técnica' });
    }
    const link = propiedad.data.link_ficha_tecnica;
    const mensaje = `¡Gracias por tu interés! Aquí tienes la ficha técnica de la propiedad: ${link}`;

    // Enviar mensaje por WhatsApp Web
    const { clients } = require('./index');
    const clientKey = `${company}:${sessionName}`;
    const client = clients[clientKey];
    if (!client) {
      return res.status(500).json({ success: false, message: 'No se encontró la sesión de WhatsApp activa' });
    }

    await client.sendMessage(`${phoneNumber}@c.us`, mensaje);
    return res.json({ success: true, message: 'Ficha técnica enviada exitosamente', link });
  } catch (error) {
    console.error('===> [enviarFichaTecnica] Error enviando ficha técnica:', error);
    return res.status(500).json({ success: false, message: 'Error interno al enviar ficha técnica' });
  }
}