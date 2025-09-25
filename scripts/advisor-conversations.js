#!/usr/bin/env node

/**
 * Script para analizar conversaciones específicas de un asesor en QuickLearning
 * 
 * Uso: node scripts/advisor-conversations.js [advisorId]
 * Ejemplo: node scripts/advisor-conversations.js 507f1f77bcf86cd799439011
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Configuración de conexión
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/quicklearning';

async function analyzeAdvisorConversations(advisorId) {
  try {
    console.log("🔍 Conectando a la base de datos...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Conectado a MongoDB");
    
    const db = mongoose.connection.db;
    const chatsCollection = db.collection('chats');
    
    // Buscar chats del asesor específico
    const advisorObjectId = new mongoose.Types.ObjectId(advisorId);
    const chats = await chatsCollection.find({
      "advisor.id": advisorObjectId,
      "messages.respondedBy": "asesor"
    }).toArray();
    
    console.log(`📊 Encontrados ${chats.length} chats del asesor`);
    
    if (chats.length === 0) {
      console.log("❌ No se encontraron chats para este asesor");
      return;
    }
    
    const conversations = [];
    
    for (const chat of chats) {
      const messages = chat.messages || [];
      const advisorMessages = messages.filter(m => m.respondedBy === "asesor").length;
      const responseTimes = [];
      
      let lastCustomerMessageTime = null;
      
      for (const message of messages) {
        if (message.direction === "inbound" && message.respondedBy === "human") {
          lastCustomerMessageTime = new Date(message.dateCreated);
        } else if (message.direction === "outbound-api" && message.respondedBy === "asesor" && lastCustomerMessageTime) {
          const advisorResponseTime = new Date(message.dateCreated);
          const responseTimeSeconds = (advisorResponseTime.getTime() - lastCustomerMessageTime.getTime()) / 1000;
          
          if (responseTimeSeconds > 0 && responseTimeSeconds < 86400) {
            responseTimes.push({
              customerMessageTime: lastCustomerMessageTime,
              advisorResponseTime,
              responseTimeSeconds
            });
          }
        }
      }
      
      const averageResponseTime = responseTimes.length > 0
        ? responseTimes.reduce((sum, rt) => sum + rt.responseTimeSeconds, 0) / responseTimes.length
        : 0;
      
      conversations.push({
        phone: chat.phone,
        advisorName: chat.advisor?.name,
        totalMessages: messages.length,
        advisorMessages,
        averageResponseTime,
        conversationStart: chat.conversationStart,
        lastMessage: chat.lastMessage?.date || chat.conversationStart,
        responseTimes
      });
    }
    
    // Ordenar por tiempo promedio de respuesta
    conversations.sort((a, b) => a.averageResponseTime - b.averageResponseTime);
    
    console.log(`\n📱 CONVERSACIONES DEL ASESOR ${chats[0].advisor?.name || 'Desconocido'} (${conversations.length} chats):`);
    console.log("=".repeat(80));
    
    conversations.forEach((conv, index) => {
      console.log(`\n${index + 1}. 📞 ${conv.phone}`);
      console.log(`   📊 Total mensajes: ${conv.totalMessages} (${conv.advisorMessages} del asesor)`);
      console.log(`   ⏱️  Tiempo promedio: ${formatTime(conv.averageResponseTime)}`);
      console.log(`   📅 Inicio: ${conv.conversationStart.toLocaleString()}`);
      console.log(`   📅 Último mensaje: ${conv.lastMessage.toLocaleString()}`);
      
      if (conv.responseTimes.length > 0) {
        console.log(`   📈 Respuestas analizadas: ${conv.responseTimes.length}`);
        const fastest = Math.min(...conv.responseTimes.map(rt => rt.responseTimeSeconds));
        const slowest = Math.max(...conv.responseTimes.map(rt => rt.responseTimeSeconds));
        console.log(`   ⚡ Más rápida: ${formatTime(fastest)}`);
        console.log(`   🐌 Más lenta: ${formatTime(slowest)}`);
      }
      console.log("-".repeat(60));
    });
    
    // Estadísticas del asesor
    const totalAdvisorMessages = conversations.reduce((sum, conv) => sum + conv.advisorMessages, 0);
    const totalResponseTimes = conversations.reduce((sum, conv) => sum + conv.responseTimes.length, 0);
    const overallAverage = conversations.length > 0 
      ? conversations.reduce((sum, conv) => sum + conv.averageResponseTime, 0) / conversations.length 
      : 0;
    
    console.log(`\n📊 ESTADÍSTICAS DEL ASESOR:`);
    console.log(`👨‍💼 Nombre: ${chats[0].advisor?.name || 'Desconocido'}`);
    console.log(`💬 Total conversaciones: ${conversations.length}`);
    console.log(`📝 Total mensajes del asesor: ${totalAdvisorMessages}`);
    console.log(`⏱️  Tiempo promedio general: ${formatTime(overallAverage)}`);
    console.log(`📈 Respuestas analizadas: ${totalResponseTimes}`);
    
    console.log("\n✅ Análisis completado exitosamente");
    
  } catch (error) {
    console.error("❌ Error en el análisis:", error);
  } finally {
    // Cerrar conexión
    await mongoose.connection.close();
    console.log("🔌 Conexión a la base de datos cerrada");
  }
}

/**
 * Formatear tiempo en segundos a formato legible
 */
function formatTime(seconds) {
  if (seconds === Infinity || seconds === 0) return "N/A";
  if (seconds < 60) {
    return `${seconds.toFixed(1)} segundos`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
}

// Obtener advisorId de los argumentos de línea de comandos
const advisorId = process.argv[2];

if (!advisorId) {
  console.log("❌ Error: Debes proporcionar un ID de asesor");
  console.log("Uso: node scripts/advisor-conversations.js [advisorId]");
  console.log("Ejemplo: node scripts/advisor-conversations.js 507f1f77bcf86cd799439011");
  process.exit(1);
}

// Ejecutar el script
analyzeAdvisorConversations(advisorId)
  .then(() => {
    console.log("🎉 Script ejecutado exitosamente");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Error ejecutando script:", error);
    process.exit(1);
  });
