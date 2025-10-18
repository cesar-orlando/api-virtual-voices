import axios from 'axios';
import { getDbConnection } from '../../config/connectionManager'; // Ajusta la ruta según tu estructura
import { getFacebookChatModel } from '../../models/facebookChat.model';
import getCompanyModel from '../../models/company.model'; // Ajusta la ruta según tu estructura
import mongoose from 'mongoose';
import { MessagingAgentService } from '../agents/MessagingAgentService'; // Ajusta la ruta según tu estructura
import { getSessionModel } from '../../models/session.model';
import getIaConfigModel from '../../models/iaConfig.model';
import { io } from '../../server';

const messagingAgentService = new MessagingAgentService();

export async function sendFacebookMessage(pageAccessToken: string, recipientId: string, text: string) {
  try {
    const res = await axios.post(
      `https://graph.facebook.com/v19.0/me/messages`,
      {
        recipient: { id: recipientId },
        message: { text }
      },
      {
        params: { access_token: pageAccessToken }
      }
    );
    return res.data;
    console.log(`✅ Mensaje enviado a usuario Facebook: ${recipientId}`);
  } catch (err: any) {
    console.error('❌ Error enviando mensaje a Facebook Messenger:', err.response?.data || err.message);
  }
}

export async function getFacebookConversations(config) {
  const url = `https://graph.facebook.com/v19.0/${config.facebook.pageId}/conversations`;
  const res = await axios.get(url, {
    params: {
      access_token: config.facebook.pageAccessToken,
      fields: 'participants'
    }
  });
  return res.data.data; // Array de conversaciones
}

export async function getMessagesFromConversation(config, conversationId: string) {
  const url = `https://graph.facebook.com/v19.0/${conversationId}/messages`;
  const res = await axios.get(url, {
    params: {
      access_token: config.facebook.pageAccessToken,
      fields: 'message,from,created_time,id'
    }
  });
  return res.data.data;
}

export async function getUserInfoFromFacebook(config, senderId: string) {
  try {
    const userInfoRes = await axios.get(
      `https://graph.facebook.com/${senderId}`,
      {
        params: {
          access_token: config.sessionData.facebook.pageAccessToken,
          fields: 'first_name,last_name,profile_pic'
        }
      }
    );
    return userInfoRes.data;
  } catch (userErr: any) {
    console.error('No se pudo obtener información del usuario:', userErr.response?.data || userErr.message);
    return null;
  }
}


export async function handleMessengerWebhook(req: any, res: any) {
  try {
    const body = req.body;
    if (body.object !== 'page') {
      res.sendStatus(404);
      return;
    }
    for (const entry of body.entry) {
      await processMessengerEntry(entry, res);
    }
    res.status(200).send('EVENT_RECEIVED');
  } catch (err) {
    console.error('Error procesando evento de Messenger:', err);
    res.sendStatus(500);
  }
}

async function processMessengerEntry(entry: any, res: any) {
  const pageId = entry.id;
  const session = await findSessionByPageId(pageId);
  if (!session) {
    console.log('No se encontró ninguna sesión con ese pageId');
    return;
  }
  console.log('Compañía encontrada en base de datos:', session.companyDb);
  const webhookEvent = entry.messaging[0];
  if (!webhookEvent.message) return;

  const senderId = webhookEvent.sender.id;
  const messageText = webhookEvent.message.text;

  if (webhookEvent.message.is_echo) {
    // Mensaje enviado por la página (outbound)
    res.status(200).send('EVENT_RECEIVED');
    return;
  }

  // Obtener información del usuario desde la Graph API
  const userInfo = await getUserInfoFromFacebook(session.session, senderId);
  const conn = await getDbConnection(session.companyDb);
  const FacebookChat = getFacebookChatModel(conn);
  const filter = { userId: senderId, 'session.id': session.session._id.toString() };
  const existingChat = await FacebookChat.findOne(filter);
  const newMsgId = webhookEvent.message.mid || '';
  const alreadyExists = existingChat && existingChat.messages.some((m: any) => m.msgId === newMsgId);
  
  if (!alreadyExists) {
    await saveIncomingFacebookMessage({
      FacebookChat,
      filter,
      webhookEvent,
      userInfo,
      session: session.session,
      newMsgId,
      dbName: session.companyDb,
      existingChat
    });
  }

  if (webhookEvent.message.is_echo || !session || session.session.status !== 'connected') return;

  await processAndRespondFacebookMessage({
    FacebookChat,
    filter,
    webhookEvent,
    session,
    conn,
  });
}

async function saveIncomingFacebookMessage({ FacebookChat, filter, webhookEvent, userInfo, session, newMsgId, dbName, existingChat }: any) {
  const update: any = {
    $setOnInsert: {
      userId: webhookEvent.sender.id,
      name: userInfo
        ? `${userInfo.first_name || ''} ${userInfo.last_name || ''}`.trim()
        : 'Desconocido',
      session: session ? { id: session._id, name: session.name } : undefined,
    },
    $push: {
      messages: {
        direction: webhookEvent.message.is_echo ? 'waaaa' : 'inbound',
        body: webhookEvent.message.text || '',
        createdAt: webhookEvent.message.created_time
          ? new Date(webhookEvent.message.created_time)
          : new Date(),
        respondedBy: webhookEvent.message.is_echo ? 'bot' : 'user',
        msgId: newMsgId,
      },
    },
  };

  if (!existingChat || !existingChat.session || existingChat.session.id !== session?._id.toString()) {
    if (!update.$set) update.$set = {};
    update.$set.session = {
      id: session?._id.toString(),
      name: session?.name,
    };
    // Elimina session de $setOnInsert para evitar conflicto
    if (update.$setOnInsert && update.$setOnInsert.session) {
      delete update.$setOnInsert.session;
    }
  }

  const sentMessage = await FacebookChat.findOneAndUpdate(
    filter,
    update,
    { upsert: true, new: true }
  );

  if (!sentMessage) {
    return;
  }
  io.emit(`messenger-message-${dbName}`, sentMessage);
}

async function processAndRespondFacebookMessage({ FacebookChat, filter, webhookEvent, session, conn }: any) {
  const IaConfig = getIaConfigModel(conn);
  const config = await IaConfig.findOne({ _id: session.session?.IA?.id });
  const response = await messagingAgentService.processFacebookMessage(
    session.companyDb,
    webhookEvent.message.text,
    webhookEvent.sender.id,
    conn,
    config?._id.toString(),
    session.session._id.toString(),
  );
  if (response && !webhookEvent.message.is_echo) {
    const res = await sendFacebookMessage(session.session.sessionData.facebook.pageAccessToken, webhookEvent.sender.id, response);
    const sentMessage = await FacebookChat.findOneAndUpdate(
      filter,
      {
        $push: {
          messages: {
            direction: 'outbound-api',
            body: response,
            respondedBy: 'bot',
            msgId: res.message_id,
          },
        },
      },
      { upsert: true, new: true }
    );
    if (!sentMessage) {
      return;
    }
    io.emit(`messenger-message-${session.companyDb}`, sentMessage);
  }
}

export async function loadRecentFacebookMessages(config, limit: number = 10) {
    try {
        const conn = await getDbConnection(config.companyDb);
        const FacebookChat = getFacebookChatModel(conn);

        const conversations = await getFacebookConversations(config.session.sessionData);

        for (const conv of conversations) {
            const participants = conv.participants?.data || [];
            const userParticipant = participants.find(
                p => p.id !== config.session.sessionData.facebook.pageId
            );
            const userId = userParticipant ? userParticipant.id : null;
            let chatRecord = await FacebookChat.findOne({ userId });

            if (!chatRecord) {
                chatRecord = new FacebookChat({
                    userId,
                    name: userParticipant ? `${userParticipant.name}` : 'Desconocido',
                    messages: [],
                    session: {
                        id: config.session._id,
                        name: config.session.name,
                    }
                });
            }

            const messages = await getMessagesFromConversation(config.session.sessionData, conv.id);
            // Solo los últimos X mensajes, ordenados por createdAt
            const recentMessages = messages
                .map(msg => ({
                    direction: msg.from && msg.from.id === config.session.sessionData.facebook.pageId ? 'outbound-api' : 'inbound',
                    body: msg.message || '',
                    createdAt: msg.created_time ? new Date(msg.created_time) : new Date(),
                    respondedBy: msg.from && msg.from.id === config.session.sessionData.facebook.pageId ? 'bot' : 'user',
                    msgId: msg.id || '',
                }))
                .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

            const originalLength = chatRecord.messages.length;

            for (const msg of recentMessages) {
                const alreadyExists = chatRecord.messages.some((m: any) => m.msgId === msg.msgId);
                if (alreadyExists) continue;

                // Si no existe, agrégalo al registro de chat
                chatRecord.messages.push(msg);
            }

            if (chatRecord.messages.length !== originalLength) {
                await chatRecord.save();
            }
        }
    } catch (err) {
        console.error('Error cargando mensajes recientes:', err);
    }
}

export async function findSessionByPageId(pageId: string) {
  // Obtén dinámicamente los nombres de todas las bases de datos
  const admin = mongoose.connection.db.admin();
  const dbs = await admin.listDatabases();

  // Filtra solo las bases de datos de empresas (para no incluir admin o local)
  const companyDbs = dbs.databases.filter(
    dbInfo => dbInfo.name !== "admin" && dbInfo.name !== "local"
  );

  // Ejecuta las búsquedas en paralelo para mayor velocidad
  const searchPromises = companyDbs.map(async (dbInfo) => {
    const conn = await getDbConnection(dbInfo.name);
    const Session = getSessionModel(conn);
    // Busca todas las compañías que tengan datos de facebook configurados
    const session = await Session.findOne({ platform: 'facebook', "sessionData.facebook.pageId": pageId });
    return session ? {
      companyDb: dbInfo.name,
      session
    } : null;
  });

  // Espera a que todas las búsquedas terminen y retorna el primer sessionado encontrado
  const sessions = await Promise.all(searchPromises);
  return sessions.find(session => session !== null) || null;
};