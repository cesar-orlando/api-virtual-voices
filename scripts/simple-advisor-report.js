#!/usr/bin/env node

/**
 * Script simple para generar reporte de tiempos de respuesta de asesores
 * Formato: Nombre | Tiempo de respuesta
 * 
 * Uso: node scripts/simple-advisor-report.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Configuración de conexión - usar variables de entorno
const MONGO_URI = process.env.MONGO_URI_DEV || 
                  process.env.MONGO_URI_QA || 
                  process.env.MONGO_URI_PROD || 
                  process.env.MONGODB_URI ||
                  'mongodb://localhost:27017/quicklearning';

async function generateSimpleReport() {
  try {
    console.log("🔍 Conectando a la base de datos...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Conectado a MongoDB");
    
    const db = mongoose.connection.db;
    const chatsCollection = db.collection('chats');
    
    // Obtener todos los chats que tienen asesores asignados
    const chatsWithAdvisors = await chatsCollection.find({
      "advisor.id": { $exists: true, $ne: null },
      "messages.respondedBy": "asesor"
    }).toArray();
    
    console.log(`📊 Analizando ${chatsWithAdvisors.length} chats con asesores...`);
    
    // Mapa para almacenar estadísticas por asesor
    const advisorStats = new Map();
    
    // Procesar cada chat
    for (const chat of chatsWithAdvisors) {
      const advisorId = chat.advisor?.id?.toString();
      const advisorName = chat.advisor?.name || "Sin nombre";
      
      if (!advisorId) continue;
      
      // Inicializar estadísticas del asesor si no existen
      if (!advisorStats.has(advisorId)) {
        advisorStats.set(advisorId, {
          advisorName,
          totalResponses: 0,
          totalResponseTime: 0,
          responseTimes: []
        });
      }
      
      const stats = advisorStats.get(advisorId);
      
      // Analizar mensajes del chat
      const messages = chat.messages || [];
      let lastCustomerMessageTime = null;
      
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        
        if (message.direction === "inbound" && message.respondedBy === "human") {
          // Mensaje del cliente
          lastCustomerMessageTime = new Date(message.dateCreated);
        } else if (message.direction === "outbound-api" && message.respondedBy === "asesor") {
          // Respuesta del asesor
          if (lastCustomerMessageTime) {
            const advisorResponseTime = new Date(message.dateCreated);
            const responseTimeSeconds = (advisorResponseTime.getTime() - lastCustomerMessageTime.getTime()) / 1000;
            
            // Solo considerar tiempos de respuesta positivos y razonables (menos de 24 horas)
            if (responseTimeSeconds > 0 && responseTimeSeconds < 86400) {
              stats.totalResponses++;
              stats.totalResponseTime += responseTimeSeconds;
              stats.responseTimes.push(responseTimeSeconds);
            }
          }
        }
      }
    }
    
    // Calcular promedios
    for (const [advisorId, stats] of advisorStats) {
      if (stats.totalResponses > 0) {
        stats.averageResponseTime = stats.totalResponseTime / stats.totalResponses;
      }
    }
    
    // Filtrar asesores con respuestas y ordenar por tiempo promedio
    const advisorsWithResponses = Array.from(advisorStats.values())
      .filter(advisor => advisor.totalResponses > 0)
      .sort((a, b) => a.averageResponseTime - b.averageResponseTime);
    
    // Generar reporte simple
    console.log("\n" + "=".repeat(60));
    console.log("📈 TIEMPOS DE RESPUESTA DE ASESORES - QUICKLEARNING");
    console.log("=".repeat(60));
    
    if (advisorsWithResponses.length === 0) {
      console.log("❌ No se encontraron asesores con respuestas registradas");
      return;
    }
    
    console.log("\n👥 REPORTE DE ASESORES:");
    console.log("-".repeat(60));
    
    for (const advisor of advisorsWithResponses) {
      const responseTime = formatSimpleTime(advisor.averageResponseTime);
      console.log(`${advisor.advisorName} | Tiempo de respuesta: ${responseTime}`);
    }
    
    // Estadísticas adicionales
    const totalResponses = advisorsWithResponses.reduce((sum, advisor) => sum + advisor.totalResponses, 0);
    const overallAverage = advisorsWithResponses.reduce((sum, advisor) => sum + advisor.averageResponseTime, 0) / advisorsWithResponses.length;
    
    console.log("\n📊 RESUMEN:");
    console.log(`Total asesores: ${advisorsWithResponses.length}`);
    console.log(`Total respuestas: ${totalResponses}`);
    console.log(`Tiempo promedio general: ${formatSimpleTime(overallAverage)}`);
    
    console.log("\n✅ Reporte generado exitosamente");
    
  } catch (error) {
    console.error("❌ Error generando reporte:", error);
  } finally {
    // Cerrar conexión
    await mongoose.connection.close();
    console.log("🔌 Conexión cerrada");
  }
}

/**
 * Formatear tiempo en formato simple y legible
 */
function formatSimpleTime(seconds) {
  if (seconds < 60) {
    return `${Math.round(seconds)} segundos`;
  } else if (seconds < 3600) {
    const minutes = Math.round(seconds / 60);
    return `${minutes} minuto${minutes !== 1 ? 's' : ''}`;
  } else {
    const hours = Math.round(seconds / 3600);
    return `${hours} hora${hours !== 1 ? 's' : ''}`;
  }
}

// Ejecutar el script
generateSimpleReport()
  .then(() => {
    console.log("🎉 Script ejecutado exitosamente");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Error ejecutando script:", error);
    process.exit(1);
  });
