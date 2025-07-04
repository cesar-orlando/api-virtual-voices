import mongoose from 'mongoose';
import { getWhatsappChatModel } from '../models/whatsappChat.model';
import { getConnectionByCompanySlug } from '../config/connectionManager';

async function unifyWhatsappChatsByPhone(companySlug: string) {
  const conn = await getConnectionByCompanySlug(companySlug);
  const WhatsappChat = getWhatsappChatModel(conn);

  // Traer todos los chats
  const allChats = await WhatsappChat.find({}).lean();

  // Agrupar por número limpio
  const chatsByPhone: Record<string, any[]> = {};
  for (const chat of allChats) {
    const cleanPhone = (chat.phone || '').replace('@c.us', '');
    if (!chatsByPhone[cleanPhone]) chatsByPhone[cleanPhone] = [];
    chatsByPhone[cleanPhone].push(chat);
  }

  let merged = 0;
  for (const phone in chatsByPhone) {
    const chats = chatsByPhone[phone];
    if (chats.length === 1) continue; // Solo uno, nada que hacer

    // Unir todos los mensajes de todos los documentos
    let allMessages: any[] = [];
    let mainChat = chats[0];
    for (const chat of chats) {
      allMessages = allMessages.concat(chat.messages || []);
    }
    // Ordenar por fecha
    allMessages.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

    // Actualizar el primer chat con todos los mensajes
    await WhatsappChat.updateOne({ _id: mainChat._id }, {
      $set: {
        messages: allMessages,
        tableSlug: mainChat.tableSlug, // puedes elegir la que prefieras
        phone: mainChat.phone,
        name: mainChat.name,
        botActive: mainChat.botActive,
        updatedAt: new Date(),
      }
    });

    // Eliminar los duplicados
    const idsToDelete = chats.slice(1).map(c => c._id);
    await WhatsappChat.deleteMany({ _id: { $in: idsToDelete } });
    merged++;
    console.log(`Unificado ${chats.length} chats para ${phone}`);
  }
  console.log(`Listo. Unificados: ${merged}`);
}

// USO: node -r ts-node/register src/scripts/fixWhatsappChatsByPhone.ts grupo-milkasa
const companySlug = process.argv[2];
if (!companySlug) {
  console.error('Debes pasar el companySlug como argumento');
  process.exit(1);
}
unifyWhatsappChatsByPhone(companySlug).then(() => process.exit(0)); 