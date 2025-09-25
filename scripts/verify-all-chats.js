#!/usr/bin/env node

/**
 * Script para verificar todos los chats y asegurar que no se pierdan datos
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Configuración de conexión
const MONGO_URI = process.env.MONGO_URI_QUICKLEARNING || 
                  process.env.MONGO_URI || 
                  process.env.MONGODB_URI ||
                  'mongodb://localhost:27017/quicklearning';

async function verifyAllChats() {
  try {
    console.log("🔍 Conectando a la base de datos...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Conectado a MongoDB");
    
    const db = mongoose.connection.db;
    const chatsCollection = db.collection('chats');
    
    // 1. Total de chats en la base de datos
    const totalChats = await chatsCollection.countDocuments();
    console.log(`📊 Total de chats en la base de datos: ${totalChats}`);
    
    // 2. Chats con asesores asignados (sin importar si han respondido)
    const chatsWithAdvisors = await chatsCollection.countDocuments({
      "advisor.id": { $exists: true, $ne: null }
    });
    console.log(`👨‍💼 Chats con asesores asignados: ${chatsWithAdvisors}`);
    
    // 3. Chats con asesores que han respondido al menos una vez
    const chatsWithAdvisorResponses = await chatsCollection.countDocuments({
      "advisor.id": { $exists: true, $ne: null },
      "messages.respondedBy": "asesor"
    });
    console.log(`💬 Chats con respuestas de asesores: ${chatsWithAdvisorResponses}`);
    
    // 4. Chats sin asesores asignados
    const chatsWithoutAdvisors = totalChats - chatsWithAdvisors;
    console.log(`❌ Chats sin asesores asignados: ${chatsWithoutAdvisors}`);
    
    // 5. Chats con asesores pero sin respuestas
    const chatsWithAdvisorsButNoResponses = chatsWithAdvisors - chatsWithAdvisorResponses;
    console.log(`⚠️  Chats con asesores pero sin respuestas: ${chatsWithAdvisorsButNoResponses}`);
    
    // 6. Verificar algunos ejemplos de chats sin asesores
    console.log("\n📋 Ejemplos de chats sin asesores:");
    const sampleChatsWithoutAdvisors = await chatsCollection.find({
      "advisor.id": { $exists: false }
    }).limit(5).toArray();
    
    sampleChatsWithoutAdvisors.forEach((chat, index) => {
      console.log(`  ${index + 1}. ${chat.phone} - ${chat.messages?.length || 0} mensajes`);
    });
    
    // 7. Verificar algunos ejemplos de chats con asesores pero sin respuestas
    console.log("\n📋 Ejemplos de chats con asesores pero sin respuestas:");
    const sampleChatsWithAdvisorsButNoResponses = await chatsCollection.find({
      "advisor.id": { $exists: true, $ne: null },
      "messages.respondedBy": { $ne: "asesor" }
    }).limit(5).toArray();
    
    sampleChatsWithAdvisorsButNoResponses.forEach((chat, index) => {
      console.log(`  ${index + 1}. ${chat.phone} - Asesor: ${chat.advisor?.name} - ${chat.messages?.length || 0} mensajes`);
    });
    
    // 8. Estadísticas de mensajes
    const totalMessages = await chatsCollection.aggregate([
      { $unwind: "$messages" },
      { $count: "total" }
    ]).toArray();
    
    console.log(`\n📈 Estadísticas de mensajes:`);
    console.log(`Total de mensajes en todos los chats: ${totalMessages[0]?.total || 0}`);
    
    // 9. Mensajes por tipo de respondedBy
    const messagesByType = await chatsCollection.aggregate([
      { $unwind: "$messages" },
      { $group: { _id: "$messages.respondedBy", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();
    
    console.log(`\n📊 Mensajes por tipo de respondedBy:`);
    messagesByType.forEach(msg => {
      console.log(`  ${msg._id || 'null'}: ${msg.count} mensajes`);
    });
    
    console.log("\n✅ Verificación completada");
    
  } catch (error) {
    console.error("❌ Error verificando chats:", error);
  } finally {
    await mongoose.connection.close();
    console.log("🔌 Conexión cerrada");
  }
}

// Ejecutar el script
verifyAllChats()
  .then(() => {
    console.log("🎉 Script ejecutado exitosamente");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Error ejecutando script:", error);
    process.exit(1);
  });
