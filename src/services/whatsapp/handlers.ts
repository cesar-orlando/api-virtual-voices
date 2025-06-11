import { Message, Client } from 'whatsapp-web.js';
import { openai, preparePrompt } from '../openai';
import Table from '../../models/table.model';
import { getDbConnection } from "../../config/connectionManager";
import { getWhatsappChatModel } from '../../models/whatsappChat.model';
import getIaConfigModel from '../../models/iaConfig.model';
import { io } from '../../server';
import { Connection, Model, Types } from 'mongoose';

export async function handleIncomingMessage(message: Message, client: Client, company: string) {

  if (message.isStatus) return;

  const userPhone = message.fromMe ? message.to.split('@')[0] : message.from.split('@')[0];

  if (userPhone !== '5216441500358') return;

  try {
    const dbName = `${company}`;
    const uriBase = process.env.MONGO_URI?.split("/")[0] + "//" + process.env.MONGO_URI?.split("/")[2];

    const conn = await getDbConnection(dbName, uriBase || "mongodb://localhost:27017");

    // Verifica si la tabla existe
    const table = await Table.findOne({ slug: "clientes" });

    if (!table) {
      const newTable = new Table({ name: "Clientes", slug: "clientes", icon: "👤" });
      await newTable.save();
    }

    const WhatsappChat = getWhatsappChatModel(conn);

    // Verifica si el registro ya existe
    let existingRecord = await WhatsappChat.findOne({ tableSlug: "clientes", phone: userPhone });

    // Crea un nuevo chat si no existe
    if (!existingRecord) {
      existingRecord = await createNewChatRecord(WhatsappChat, "clientes", userPhone, message);
    } else {
      // Si el mensaje es del bot no lo guarda
      if (message.fromMe && existingRecord.botActive) return;
      await updateChatRecord(company, existingRecord, message.fromMe ? "outbound" : "inbound", message.body, "human")
    }

    if (!existingRecord || !existingRecord.botActive) return;

    await sendAndRecordBotResponse(company, client, message, existingRecord, conn);

  } catch (error) {
    console.error('Error al manejar el mensaje entrante:', error);
  }
}

async function createNewChatRecord(
  WhatsappChat: Model<any>,
  tableSlug: string,
  phone: string,
  message: Message
) {
  const newChat = new WhatsappChat({
    tableSlug: tableSlug,
    phone: phone,
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
  client: Client,
  message: Message,
  existingRecord: any,
  conn: Connection,
  activeBot: boolean = true,
) {
  const defaultResponse = "Una disculpa, podrias repetir tu mensaje, no pude entenderlo.";
  let aiResponse = defaultResponse;
  const IaConfig = getIaConfigModel(conn);
  const config = await IaConfig.findOne();

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
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      temperature: 0.3,
      messages: [
        { role: "system", content: IAPrompt || "Eres un asistente virtual." },
        ...history
      ]
    });
    aiResponse = completion.choices[0]?.message?.content || defaultResponse;
  } catch (error) {
    console.error("Error al obtener respuesta de OpenAI:", error);
  }

  const msg = await client.sendMessage(message.from, aiResponse);
  existingRecord.botActive = activeBot;
  await updateChatRecord(company, existingRecord, "outbound-api", msg.body, "bot");
}