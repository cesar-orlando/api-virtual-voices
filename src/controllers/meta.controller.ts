import { Request, Response } from 'express';
import { getDbConnection } from '../config/connectionManager';
import { getFacebookChatModel } from '../models/facebookChat.model';
import { sendFacebookMessage } from '../services/meta/messenger';
import { getSessionModel } from '../models/session.model';

// Enviar mensaje a usuario de Facebook Messenger
export const sendFacebookMessageController = async (req: Request, res: Response) => {
  try {
    const { c_name, userId, text, sessionId } = req.body;
    const conn = await getDbConnection(c_name);
    const Session = getSessionModel(conn);
    const session = await Session.findOne({ _id: sessionId });
    if (!userId || !text || !session?.sessionData?.facebook?.pageAccessToken) {
      return res.status(400).json({ message: 'userId, text y pageAccessToken son requeridos' });
    }
    const result = await sendFacebookMessage(session.sessionData.facebook.pageAccessToken, userId, text);
    if (!result) {
      return res.status(500).json({ message: 'Error enviando mensaje a Facebook Messenger' });
    }
    const FacebookChat = getFacebookChatModel(conn);
    await FacebookChat.findOneAndUpdate(
        { userId },
        {
            $push: {
                messages: {
                    direction: 'outbound',
                    body: text,
                    respondedBy: 'bot',
                    msgId: result.message_id,
                },
            }
        },
        { upsert: true, new: true }
    );
    
    console.log(`Mensaje enviado a Facebook Messenger: ${text}`);
    res.status(200).json({ message: 'Mensaje enviado correctamente' });
  } catch (error) {
    res.status(500).json({ message: 'Error enviando mensaje', error });
  }
};

// Obtener todos los Facebook chats de una compañía
export const getAllFacebookChatsController = async (req: Request, res: Response) => {
  try {
    const { c_name } = req.params;
    const conn = await getDbConnection(c_name);
    const FacebookChat = getFacebookChatModel(conn);
    const chats = await FacebookChat.find();
    res.status(200).json(chats);
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo chats', error });
  }
};

// Obtener usuarios de Facebook con su último mensaje
export const getFacebookUsers = async (req: Request, res: Response) => {
  try {
    const { c_name, user_id } = req.params;
    const conn = await getDbConnection(c_name);
    const FacebookChat = getFacebookChatModel(conn);
    const chats = await FacebookChat.find({}).lean();

    const usuarios = chats.map((chat: any) => {
      let lastMessage = null;
      let totalMessages = 0;
      if (chat.messages && chat.messages.length > 0) {
        totalMessages = chat.messages.length;
        const lastMsg = chat.messages[chat.messages.length - 1];
        lastMessage = {
          body: lastMsg.body,
          direction: lastMsg.direction,
          respondedBy: lastMsg.respondedBy,
          date: lastMsg.createdAt || new Date(),
          msgId: lastMsg.msgId
        };
      }
      return {
        _id: chat._id,
        name: chat.name || '',
        userId: chat.userId,
        lastMessage,
        totalMessages,
        session: {
          id: chat.session?.id,
          name: chat.session?.name
        },
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      };
    });
    res.status(200).json({ success: true, usuarios, total: usuarios.length });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo usuarios de Facebook', details: error });
  }
};

// Obtener historial de mensajes de un usuario de Facebook por userId
export const getFacebookChatMessages = async (req: Request, res: Response) => {
  try {
    const { c_name, sessionId, userId } = req.params;
    const conn = await getDbConnection(c_name);
    const FacebookChat = getFacebookChatModel(conn);
    const chat = await FacebookChat.findOne({ userId }).lean();
    if (!chat) {
      res.status(404).json({ success: false, error: 'Usuario no encontrado', userId });
      return;
    }
    res.status(200).json({
      success: true,
      chat: {
        _id: chat._id,
        userId: chat.userId,
        name: chat.name,
        messages: chat.messages || [],
        totalMessages: chat.messages?.length || 0,
        createdAt: (chat as any).createdAt,
        updatedAt: (chat as any).updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo mensajes del chat', details: error });
  }
};
