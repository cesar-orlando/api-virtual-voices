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

  if (message.isStatus) return;

  const userPhone = message.fromMe ? message.to : message.from;

  // Permitir que la IA conteste a todos los números, incluyendo 4521311888

  try {
    const conn = await getDbConnection(company);

    const Table = getTableModel(conn);

    // Verifica si la tabla existe
    const table = await Table.findOne({ slug: "prospectos", c_name: company });

    if (!table) {
      const newTable = new Table({
        name: "Prospectos",
        slug: "prospectos",
        icon: "👤",
        c_name: company,
        createdBy: 'whatsapp-bot',
        fields: [
          { name: "name", label: "Nombre", type: "text", order: 1 },
          { name: "number", label: "Número", type: "number", order: 2 },
          { name: "ia", label: "IA", type: "boolean", order: 3 }
        ]
      });
      await newTable.save();
    }

    const WhatsappChat = getWhatsappChatModel(conn);

    // Verifica si el registro ya existe
    let existingRecord = await WhatsappChat.findOne({ tableSlug: "prospectos", phone: userPhone });

    // Crea un nuevo chat si no existe
    if (!existingRecord) {
      const Session = getSessionModel(conn);
      const session = await Session.findOne({ name: sessionName });
      existingRecord = await createNewChatRecord(WhatsappChat, "prospectos", userPhone, message, session);
    } else {
      await updateChatRecord(company, existingRecord, "inbound", message.body, "human")
    }

    if (!existingRecord || !existingRecord.botActive) return;

    // --- VALIDACIÓN DE IA EN PROSPECTOS ---
    const Record = getRecordModel(conn);
    const prospecto = await Record.findOne({ tableSlug: 'prospectos', c_name: company, 'data.number': userPhone });
    if (prospecto && prospecto.data && prospecto.data.IA === false) {
      console.log(`🤖 IA desactivada para ${userPhone}, debe responder un agente.`);
      // Aquí podrías emitir un evento para el agente humano si lo deseas
      return;
    }
    // --- FIN VALIDACIÓN DE IA ---

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
        body: message.body,
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
  body: string,
  respondedBy: string
) {
  chatRecord.messages.push({
    direction: direction,
    body: body,
    respondedBy: respondedBy,
  });
  await chatRecord.save();
  io.emit(`whatsapp-message-${company}`, chatRecord);
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
  history.push({ role: "user", content: message.body });

  try {
    const response = await generateResponse(
      IAPrompt,
      config,
      history,
      records)
    aiResponse = response || defaultResponse;
  } catch (error) {
    console.error("Error al obtener respuesta de OpenAI:", error);
  }

  const msg = await client.sendMessage(message.from, aiResponse);
  existingRecord.botActive = activeBot;
  await updateChatRecord(company, existingRecord, "outbound-api", msg.body, "bot");
}