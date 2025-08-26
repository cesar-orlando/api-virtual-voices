import { Model } from 'mongoose';
import { Message } from 'whatsapp-web.js';
import { io } from '../../server';
import { IWhatsappChat } from '../../models/whatsappChat.model';
import { NotificationService } from '../internal/notification.service';
import { IRecord } from '../../types';

// Update WhatsApp chat record
export async function updateChatRecord(
  company: string,
  chatRecord: any,
  direction: string,
  message: Message,
  respondedBy: string,
  prospecto: IRecord
) {
  const WhatsappChat: Model<IWhatsappChat> = chatRecord.constructor; // Get the model from the document instance

  try {
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
    const updatedChat = await WhatsappChat.findOneAndUpdate(
      { _id: chatRecord._id, ...(message.id?.id ? { "messages.msgId": { $ne: message.id?.id } } : {}) },
      { $push: { messages: newMessage } },
      { new: true }
    );

    if (direction === "inbound") {
      NotificationService.createChatNotification({
        company,
        userId: prospecto.data.asesor.id,
        phoneNumber: chatRecord.phone,
        senderName: prospecto.data.name,
        messagePreview: newMessage.body,
        chatId: chatRecord._id
      });
    }

    if (!updatedChat) {
      return;
    }
    io.emit(`whatsapp-message-${company}`, updatedChat);
    return updatedChat.messages[updatedChat.messages.length - 1];
  } catch (saveError) {
    console.error("❌ Error guardando mensaje:", saveError);
  }
}