const mongoose = require('mongoose');
const axios = require('axios');

const MONGO_URI_QUICKLEARNING = 'mongodb+srv://quicklearning:VV235.@quicklearning.ikdoszo.mongodb.net/production?retryWrites=true&w=majority&appName=quicklearning/prod';
const WHATSAPP_API_BASE = 'https://api.quick-learning.virtualvoices.com.mx/api/whatsapp/chat/';

async function syncWhatsappChatsToLocal() {
  try {
    console.log('🔄 Sincronizando chats de WhatsApp a la base de datos local (estructura igual a alumnos)...');
    console.log('='.repeat(60));

    await mongoose.connect(MONGO_URI_QUICKLEARNING, { dbName: 'production' });
    const db = mongoose.connection.db;

    // Obtener usuarios de sin_contestar
    const dynamicRecordsCollection = db.collection('dynamicrecords');
    const chatsCollection = db.collection('chats');

    const sinContestarUsers = await dynamicRecordsCollection.find({
      tableSlug: 'sin_contestar'
    }).toArray();

    console.log(`📋 Encontrados ${sinContestarUsers.length} usuarios en sin_contestar`);

    let totalProcessed = 0;
    let totalSynced = 0;
    let totalErrors = 0;

    for (const user of sinContestarUsers) {
      const phone = user.data?.telefono || user.data?.phone;
      const name = user.data?.nombre || user.data?.name || 'Sin nombre';

      if (!phone) {
        console.log(`⚠️ Usuario sin teléfono: ${name}`);
        continue;
      }

      totalProcessed++;
      console.log(`\n👤 Procesando: ${name} (${phone})`);

      try {
        // Obtener chat desde la API externa
        const apiUrl = WHATSAPP_API_BASE + phone;
        console.log(`   🔗 Consultando: ${apiUrl}`);

        const response = await axios.get(apiUrl, { timeout: 10000 });
        const messages = response.data;

        if (!Array.isArray(messages) || messages.length === 0) {
          console.log(`   ⚠️ No hay mensajes en la API externa`);
          continue;
        }

        console.log(`   📥 Encontrados ${messages.length} mensajes`);

        // Formatear mensajes igual que en alumnos
        const formattedMessages = messages.map(msg => ({
          direction: msg.direction,
          body: msg.body,
          dateCreated: new Date(msg.dateCreated),
          respondedBy: msg.respondedBy,
          _id: msg._id
        }));

        // lastMessage debe ser string (igual que en alumnos)
        const lastMsg = formattedMessages[formattedMessages.length - 1];
        const lastMessageString = lastMsg ? lastMsg.body : '';
        const lastMessageDate = lastMsg ? lastMsg.dateCreated : null;

        // Determinar el linkedTable correcto
        let linkedTable = 'alumnos';
        if (user.tableSlug === 'sin_contestar') {
          linkedTable = 'sin_contestar';
        }

        // Estructura igualita a alumnos
        const chatData = {
          phone: phone,
          profileName: name,
          messages: formattedMessages,
          linkedTable,
          conversationStart: formattedMessages.length > 0 ? formattedMessages[0].dateCreated : new Date(),
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
          lastMessage: lastMessageString,
          lastMessageDate: lastMessageDate,
          // Solo los campos que tiene alumnos, nada extra
        };

        // Actualizar o crear el chat con la estructura correcta
        await chatsCollection.updateOne(
          { phone },
          { $set: chatData, $unset: { aiEnabled: '', linkedTableObj: '', refModel: '', refId: '', botActive: '', totalMessages: '', lastMessageObj: '' } },
          { upsert: true }
        );
        totalSynced++;
        console.log(`   ✅ Chat actualizado/creado con estructura igual a alumnos`);

        // Actualizar el registro en dynamicrecords con la fecha del último mensaje
        if (lastMsg) {
          await dynamicRecordsCollection.updateOne(
            { _id: user._id },
            {
              $set: {
                'data.lastMessageDate': lastMessageDate,
                'data.ultimo_mensaje': lastMessageString
              }
            }
          );
          console.log(`   📝 Registro actualizado con último mensaje`);
        }

      } catch (error) {
        totalErrors++;
        if (error.response?.status === 404) {
          console.log(`   ❌ Chat no encontrado en API externa`);
        } else {
          console.log(`   ❌ Error: ${error.message}`);
        }
      }

      // Pausa para no sobrecargar la API
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n📊 RESUMEN DE SINCRONIZACIÓN:');
    console.log('=============================');
    console.log(`   • Total procesados: ${totalProcessed}`);
    console.log(`   • Chats sincronizados: ${totalSynced}`);
    console.log(`   • Errores: ${totalErrors}`);
    console.log(`   • Exitosos: ${totalSynced}/${totalProcessed} (${((totalSynced/totalProcessed)*100).toFixed(1)}%)`);

  } catch (error) {
    console.error('❌ Error general:', error);
  } finally {
    await mongoose.disconnect();
  }
}

syncWhatsappChatsToLocal(); 