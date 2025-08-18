import { Model } from 'mongoose';
import { Message } from 'whatsapp-web.js';
import { ISession } from '../../models/session.model';
import { io } from '../../server';

// Create a new WhatsApp chat record
export async function createNewChatRecord(
  WhatsappChat: Model<any>,
  tableSlug: string,
  phone: string,
  message: Message,
  session: ISession | null
) {
  const newChat = new WhatsappChat({
    tableSlug: tableSlug,
    phone: phone,
    session: {
      id: session?.id,
      name: session?.name
    },
    advisor: {
      id: session?.user.id,
      name: session?.user.name
    },
    messages: [
      {
        msgId: message.id?.id || '',
        direction: message.fromMe ? "outbound" : "inbound",
        body: message.body,
        respondedBy: "human",
      },
    ],
  });
  await newChat.save();
  return newChat;
}

// Update WhatsApp chat record
export async function updateChatRecord(
  company: string,
  chatRecord: any,
  direction: string,
  message: Message,
  respondedBy: string,
) {
  const WhatsappChat = chatRecord.constructor; // Get the model from the document instance

  try {
    let updatedChat = null;
    // Step 1: Mark inbound messages as read if outbound
    if (direction === "outbound" || direction === "outbound-api") {
      await WhatsappChat.updateOne(
        { _id: chatRecord._id },
        {
          $set: { "messages.$[inboundMsg].status": "leído" }
        },
        {
          arrayFilters: [
            { "inboundMsg.direction": "inbound", "inboundMsg.status": { $ne: "leído" } }
          ]
        }
      );
    }

    // Step 2: Push the new message if not duplicate
    const newMessage = {
      msgId: message.id?.id,
      direction: direction,
      body: message.body,
      respondedBy: respondedBy,
      status: direction === 'inbound' ? 'recibido' : 'enviado'
    } as any;

    // Only push if not duplicate
    updatedChat = await WhatsappChat.findOneAndUpdate(
      { _id: chatRecord._id, ...(message.id?.id ? { "messages.msgId": { $ne: message.id?.id } } : {}) },
      { $push: { messages: newMessage } },
      { new: true }
    );

    if (!updatedChat) {
      return;
    }
    io.emit(`whatsapp-message-${company}`, updatedChat);
  } catch (saveError) {
    console.error("❌ Error guardando mensaje:", saveError);
  }
}