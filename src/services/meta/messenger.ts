import axios from 'axios';
import { getDbConnection } from '../../config/connectionManager'; // Ajusta la ruta según tu estructura
import { getFacebookChatModel } from '../../models/facebookChat.model';
import getCompanyModel from '../../models/company.model'; // Ajusta la ruta según tu estructura
import mongoose from 'mongoose';
import { chat } from 'googleapis/build/src/apis/chat';

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
          access_token: config.facebook.pageAccessToken,
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

        if (body.object === 'page') {
        for (const entry of body.entry) {
            const pageId = entry.id;
            const result = await findCompanyByPageId(pageId);
            if (result) {
            console.log('Compañía encontrada:', result.company.name, 'en base de datos:', result.dbName);
            } else {
            console.log('No se encontró ninguna compañía con ese pageId');
            }
            const webhookEvent = entry.messaging[0];

            if (webhookEvent.message) {
            const senderId = webhookEvent.sender.id;
            const messageText = webhookEvent.message.text;

            let userInfo;

            if (webhookEvent.message.is_echo) {
                // Mensaje enviado por la página (outbound)
                console.log(`Mensaje ENVIADO por la página (${pageId}): ${messageText}`);
            } else {
                // Obtener información del usuario desde la Graph API
                userInfo = await getUserInfoFromFacebook(result.company, senderId);
                if (userInfo) {
                console.log('Usuario:', userInfo);
                }
            }

            const conn = await getDbConnection(result.dbName);
            const FacebookChat = getFacebookChatModel(conn);

            const filter = {
                userId: webhookEvent.sender.id,
            };

            const update = {
                $setOnInsert: {
                    userId: webhookEvent.sender.id,
                    name: userInfo
                        ? `${userInfo.first_name || ''} ${userInfo.last_name || ''}`.trim()
                        : 'Desconocido',
                },
                $push: {
                    messages: {
                        direction: webhookEvent.message.is_echo ? 'outbound-api' : 'inbound',
                        body: webhookEvent.message.text || '',
                        createdAt: webhookEvent.message.created_time
                            ? new Date(webhookEvent.message.created_time)
                            : new Date(),
                        respondedBy: webhookEvent.message.is_echo ? 'bot' : 'user',
                        msgId: webhookEvent.message.mid || '',
                    },
                },
            };

            await FacebookChat.findOneAndUpdate(
                filter,
                update,
                { upsert: true, new: true }
            );
            }
        }
        res.status(200).send('EVENT_RECEIVED');
        } else {
        res.sendStatus(404);
        }
    } catch (err) {
        console.error('Error procesando evento de Messenger:', err);
        res.sendStatus(500);
    }
}

export async function loadRecentFacebookMessages(config, limit: number = 10) {
    try {
        const conn = await getDbConnection(config.companyDb);
        const FacebookChat = getFacebookChatModel(conn);

        const conversations = await getFacebookConversations(config);

        for (const conv of conversations) {
            const participants = conv.participants?.data || [];
            const userParticipant = participants.find(
                p => p.id !== config.facebook.pageId
            );
            const userId = userParticipant ? userParticipant.id : null;
            let chatRecord = await FacebookChat.findOne({ userId });

            if (!chatRecord) {
                chatRecord = new FacebookChat({
                    userId,
                    name: userParticipant ? `${userParticipant.name}` : 'Desconocido',
                    messages: []
                });
            }

            const messages = await getMessagesFromConversation(config, conv.id);
            // Solo los últimos X mensajes, ordenados por createdAt
            const recentMessages = messages
                .map(msg => ({
                    direction: msg.from && msg.from.id === config.facebook.pageId ? 'outbound-api' : 'inbound',
                    body: msg.message || '',
                    createdAt: msg.created_time ? new Date(msg.created_time) : new Date(),
                    respondedBy: msg.from && msg.from.id === config.facebook.pageId ? 'bot' : 'user',
                    msgId: msg.id || '',
                }))
                .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

            for (const msg of recentMessages) {
                const alreadyExists = chatRecord.messages.some((m: any) => m.msgId === msg.msgId);
                if (alreadyExists) continue;

                // Si no existe, agrégalo al registro de chat
                chatRecord.messages.push(msg);
            }
            await chatRecord.save();
        }
    } catch (err) {
        console.error('Error cargando mensajes recientes:', err);
    }
}

export async function findCompanyByPageId(pageId: string) {
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
    const Company = getCompanyModel(conn);
    const company = await Company.findOne({ 'facebook.pageId': pageId });
    if (company) {
      return { company, dbName: dbInfo.name };
    }
    return null;
  });

  // Espera a que todas las búsquedas terminen y retorna el primer resultado encontrado
  const results = await Promise.all(searchPromises);
  return results.find(result => result !== null) || null;
}