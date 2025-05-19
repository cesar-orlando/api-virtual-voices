import { Message, Client } from 'whatsapp-web.js';
import Table from '../../models/table.model';
import WhatsappChat from '../../models/whatsappChat.model';

export async function handleIncomingMessage(message: Message, client: Client) {

  if (message.isStatus) return;
  //if (message.from.split('@')[0] !== '5216441453572') return;

  const userPhone = message.fromMe ? message.to.split('@')[0] : message.from.split('@')[0];

  try {
    // Verifica si la tabla existe
    const table = await Table.findOne({ slug: "clientes" });

    if (!table) {
      const newTable = new Table({ name: "Clientes", slug: "clientes", icon: "👤" });
      await newTable.save();
    }

    // Verifica si el registro ya existe
    let existingRecord = await WhatsappChat.findOne({ tableSlug: "clientes", phone: userPhone });

    // Crea un nuevo chat si no existe
    if (!existingRecord) {
      existingRecord = await createNewChatRecord("clientes", userPhone, message);
    } else {
      // Si el mensaje es del bot no lo guarda
      if (message.fromMe && existingRecord.botActive) return;
      await updateChatRecord(existingRecord, message.fromMe ? "outbound" : "inbound", message.body, "human")
    }

    if (!existingRecord.botActive) return;

    switch (message.body.toLowerCase()) {
      case "hola":
          await sendAndRecordBotResponse(client, message, existingRecord, "Hola, ¿cómo estás?");
          break;
      case "quiero hablar con un asesor":
          await sendAndRecordBotResponse(client, message, existingRecord, "Claro, un asesor se pondrá en contacto contigo pronto.", false);
          break;
    }
  } catch (error) {
    console.error('Error al manejar el mensaje entrante:', error);
  }
}

async function createNewChatRecord(
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
}

async function sendAndRecordBotResponse(
  client: Client,
  message: Message,
  existingRecord: any,
  responseBody: string,
  activateBot: boolean = true // Default es true
) {
  const msg = await client.sendMessage(message.from, responseBody);
  existingRecord.botActive = activateBot;
  await updateChatRecord(existingRecord, "outbound-api", msg.body, "bot");
}