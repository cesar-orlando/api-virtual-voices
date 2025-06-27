import { Message, Client } from 'whatsapp-web.js';
import { generateResponse, openai, preparePrompt } from '../openai';
import { getDbConnection } from "../../config/connectionManager";
import { getWhatsappChatModel, IWhatsappChat } from '../../models/whatsappChat.model';
import getIaConfigModel from '../../models/iaConfig.model';
import { getSessionModel, IWhatsappSession } from '../../models/whatsappSession.model';
import { io } from '../../server';
import { Connection, Model, Types } from 'mongoose';
import getTableModel from '../../models/table.model';
import getRecordModel from '../../models/record.model';

export async function handleIncomingMessage(message: Message, client: Client, company: string, sessionName: string) {

  // Agrega listeners de log solo una vez por cliente
  if (!(client as any)._loggingListenersAdded) {
    client.on('message', (msg: Message) => {
      console.log(`[WHATSAPP] Mensaje recibido de ${msg.from}: ${msg.body?.slice(0, 100)}`);
      if ((msg as any).hasMedia) {
        console.log(`[WHATSAPP] Archivo recibido de ${msg.from}, tipo: ${(msg as any).type}, tamaño: ${(msg as any).mediaKey?.length || 'desconocido'}`);
      }
    });
    client.on('authenticated', () => {
      console.log('[WHATSAPP] Sesión autenticada');
    });
    client.on('disconnected', (reason: any) => {
      console.log(`[WHATSAPP] Sesión desconectada: ${reason}`);
    });
    client.on('auth_failure', (msg: any) => {
      console.log(`[WHATSAPP] Fallo de autenticación: ${msg}`);
    });
    (client as any)._loggingListenersAdded = true;
  }

  if (message.isStatus) return;

  const userPhone = message.fromMe ? message.to : message.from;

  // FILTRO: Ignorar mensajes vacíos o sin texto relevante
  if (!message.body || !message.body.trim()) {
    console.log(`[WHATSAPP] Mensaje vacío recibido de ${userPhone}, ignorando.`);
    return;
  }

  // if (userPhone !== '5216441500358@c.us') return;

  try {

    const conn = await getDbConnection(company);

    const Table = getTableModel(conn);
    const Session = getSessionModel(conn);
    const session = await Session.findOne({ name: sessionName });

    if (!session) {
      console.error(`[WHATSAPP] No se encontró la sesión: ${sessionName}`);
      return;
    }

    // Verifica si la tabla existe
    const table = await Table.findOne({ slug: "clientes", c_name: company });

    if (!table) {
      const newTable = new Table({ 
        name: "Clientes", 
        slug: "clientes", 
        icon: "👤",
        c_name: company,
        createdBy: session.user.id.toString(),
        fields: [
          {
            name: "nombre",
            label: "Nombre",
            type: "text",
            required: true,
            order: 1,
            width: 200
          },
          {
            name: "telefono",
            label: "Teléfono",
            type: "text",
            required: true,
            order: 2,
            width: 150
          },
          {
            name: "email",
            label: "Email",
            type: "email",
            required: false,
            order: 3,
            width: 200
          }
        ]
      });
      await newTable.save();
      console.log(`[WHATSAPP] Tabla "clientes" creada para ${company}`);
    }

    const WhatsappChat = getWhatsappChatModel(conn);

    // Verifica si el registro ya existe
    let existingRecord = await WhatsappChat.findOne({ tableSlug: "clientes", phone: userPhone });

    // Crea un nuevo chat si no existe
    if (!existingRecord) {
      existingRecord = await createNewChatRecord(WhatsappChat, "clientes", userPhone, message, session);
    } else {
      await updateChatRecord(company, existingRecord, "inbound", message.body, "human")
    }

    if (!existingRecord || !existingRecord.botActive) return;

    await sendAndRecordBotResponse(company, sessionName, client, message, existingRecord, conn);

  } catch (error) {
    console.error('Error al manejar el mensaje entrante:', error);
  }
}

async function createNewChatRecord(
  WhatsappChat: Model<any>,
  tableSlug: string,
  phone: string,
  message: Message,
  session: IWhatsappSession | null
) {
  const newChat = new WhatsappChat({
    tableSlug: tableSlug,
    phone: phone,
    session: {
      id: session?.id,
      name: session?.name
    },
    //Se le asigna por default al usuario dueño de la sesion
    advisor: {
      id: session?.user.id,
      name: session?.user.name
    },
    messages: [
      {
        direction: message.fromMe ? "outbound" : "inbound",
        body: message.body || '',
        respondedBy: "human",
      },
    ],
  });
  await newChat.save();
  return newChat;
}

async function updateChatRecord(
  company: string,
  chatRecord: any,
  direction: string,
  body: string | undefined,
  respondedBy: string
) {
  if (!body) {
    console.warn(`[WHATSAPP][updateChatRecord] body está undefined, no se guardará el mensaje.`);
    return;
  }
  chatRecord.messages.push({
    direction: direction,
    body: body,
    respondedBy: respondedBy,
  });
  await chatRecord.save();
  io.emit(`whatsapp-message-${company}`, chatRecord);
  console.log(`[WHATSAPP][updateChatRecord] Mensaje guardado y emitido al frontend. body:`, body);
}

async function sendAndRecordBotResponse(
  company: string,
  sessionName: string,
  client: Client,
  message: Message,
  existingRecord: IWhatsappChat,
  conn: Connection,
  activeBot: boolean = true,
) {
  const defaultResponse = "Una disculpa, podrias repetir tu mensaje, no pude entenderlo.";
  let aiResponse = defaultResponse;
  const IaConfig = getIaConfigModel(conn);
  const sessionModel = getSessionModel(conn);
  const Record = getRecordModel(conn);
  const records = await Record.find();
  const session = await sessionModel.findOne({ name: sessionName });
  const config = await IaConfig.findOne({ _id: session?.IA?.id });

  let IAPrompt;

  if (config) {
    IAPrompt = await preparePrompt(config);
  }

  // Mapea historial para OpenAI
  const history = (existingRecord.messages || []).map((msg: any) => {
    if (msg.direction === "inbound") return { role: "user", content: msg.body };
    if (msg.direction === "outbound-api") return { role: "assistant", content: msg.body };
    return null;
  }).filter(Boolean);

  // Agrega el mensaje actual
  history.push({ role: "user", content: message.body || '' });

  try {
    const response = await generateResponse(
      IAPrompt,
      config,
      history,
      records,
      company,
      session?.user?.id?.toString()
    )
    aiResponse = response || defaultResponse;
  } catch (error) {
    console.error("Error al obtener respuesta de OpenAI:", error);
  }

  // Enviar mensaje solo si hay respuesta
  if (!aiResponse) {
    console.warn('[WHATSAPP][sendAndRecordBotResponse] aiResponse está vacío, no se enviará mensaje.');
    return;
  }

  const msg = await client.sendMessage(message.from, aiResponse);
  console.log("msg ---->", msg);
  existingRecord.botActive = activeBot;
  // Siempre guardar el texto generado por la IA
  await updateChatRecord(company, existingRecord, "outbound-api", aiResponse, "bot");
  console.log(`[WHATSAPP][sendAndRecordBotResponse] Mensaje de IA enviado y guardado. body:`, aiResponse);
}