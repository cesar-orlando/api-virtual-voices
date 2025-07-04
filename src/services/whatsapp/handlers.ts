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
    const cleanUserPhone = userPhone.replace('@c.us', '');
    let existingRecord = await WhatsappChat.findOne({
      $or: [
        { phone: cleanUserPhone },
        { phone: `${cleanUserPhone}@c.us` }
      ]
    });

    // Crea un nuevo chat si no existe
    if (!existingRecord) {
      const Session = getSessionModel(conn);
      const session = await Session.findOne({ name: sessionName });
      existingRecord = await createNewChatRecord(WhatsappChat, "prospectos", `${cleanUserPhone}@c.us`, message, session);
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

    if (existingRecord && existingRecord.phone === '5214521311888@c.us') {
      console.log('Historial de mensajes para 4521311888:', (existingRecord.messages || []).length);
      console.log('Últimos mensajes:', (existingRecord.messages));
    }

    // Limita el historial a los últimos 15 mensajes para evitar errores de tokens
    const MAX_MSG_LENGTH = 1000;
    const history = (existingRecord.messages || [])
      .slice(-15)
      .map((msg: any) => {
        let content = typeof msg.body === 'string' ? msg.body : '';
        if (content.length > MAX_MSG_LENGTH) content = content.slice(0, MAX_MSG_LENGTH);
        if (msg.direction === "inbound") return { role: "user", content };
        if (msg.direction === "outbound-api" || msg.respondedBy === "bot") return { role: "assistant", content };
        return null;
      })
      .filter(Boolean);
    console.log('history length:', history.length);
    console.log('history sample:', history);
    const safeHistory = history.filter((h): h is { role: string, content: string } => !!h && typeof h.content === 'string');
    console.log('history total chars:', safeHistory.reduce((acc, h) => acc + (h.content.length), 0));

    // Agrega el mensaje actual
    history.push({ role: "user", content: message.body });

    // Justo antes de llamar a OpenAI para generar la respuesta:
    const safeHistoryForOpenAI = history
      .filter((h): h is { role: string, content: string } => !!h && typeof h.content === 'string')
      .map(h => ({ role: h.role, content: h.content }));
    console.log('Enviando a OpenAI:', JSON.stringify(safeHistoryForOpenAI), 'tokens aprox:', safeHistoryForOpenAI.reduce((acc, h) => acc + h.content.length, 0));

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
  // SOLO traer registros de prospectos para este usuario específico, no toda la BD
  const userPhone = message.from;
  const records = await Record.find({ 
    tableSlug: 'prospectos', 
    c_name: company,
    'data.number': userPhone 
  }).limit(1); // Solo necesitamos 1 registro
  const session = await sessionModel.findOne({ name: sessionName });
  const config = await IaConfig.findOne({ _id: session?.IA?.id });

  let IAPrompt;

  if (config) {
    IAPrompt = await preparePrompt(config);
  }

  // Mapea historial para OpenAI - LIMPIO Y SEGURO
  const MAX_MSG_LENGTH = 1000;
  const history = (existingRecord.messages || [])
    .slice(-15)
    .map((msg: any) => {
      let content = typeof msg.body === 'string' ? msg.body : '';
      if (content.length > MAX_MSG_LENGTH) content = content.slice(0, MAX_MSG_LENGTH);
      if (msg.direction === "inbound") return { role: "user", content };
      if (msg.direction === "outbound-api" || msg.respondedBy === "bot") return { role: "assistant", content };
      return null;
    })
    .filter(Boolean);

  // Agrega el mensaje actual
  history.push({ role: "user", content: message.body });

  // LIMPIA el historial para OpenAI - SOLO role y content
  const safeHistoryForOpenAI = history
    .filter((h): h is { role: string, content: string } => !!h && typeof h.content === 'string')
    .map(h => ({ role: h.role, content: h.content }));

  console.log("history ---->", safeHistoryForOpenAI);
  console.log("Total caracteres:", safeHistoryForOpenAI.reduce((acc, h) => acc + h.content.length, 0));

  try {
    console.log(`🤖 Generando respuesta para ${message.from}...`);
    const response = await generateResponse(
      IAPrompt,
      config,
      safeHistoryForOpenAI,
      records,
      company) // Agregar c_name para las herramientas
    aiResponse = response || defaultResponse;
    console.log(`🤖 Respuesta generada: "${aiResponse.substring(0, 100)}..."`);
  } catch (error) {
    console.error("Error al obtener respuesta de OpenAI:", error);
    aiResponse = defaultResponse;
    console.log(`🤖 Usando respuesta por defecto: "${aiResponse}"`);
  }

  // Enviar mensaje y obtener respuesta
  let msg;
  try {
    msg = await client.sendMessage(message.from, aiResponse);
    console.log(`✅ Mensaje enviado exitosamente a ${message.from}`);
  } catch (sendError) {
    console.error("Error enviando mensaje:", sendError);
    // Si falla el envío, crear un objeto mock para continuar
    msg = { body: aiResponse };
  }

  // Asegurar que msg.body existe
  const messageBody = msg?.body || aiResponse;
  
  // Actualizar el registro existente con la respuesta de la IA
  existingRecord.botActive = activeBot;
  await updateChatRecord(company, existingRecord, "outbound-api", messageBody, "bot");
  
  console.log(`[WhatsappChat] Respuesta de IA guardada: "${messageBody.substring(0, 50)}..."`);
}