import mongoose from "mongoose";
import { getConnectionByCompanySlug } from "../config/connectionManager";
import getQuickLearningChatModel from "../models/quicklearning/chat.model";
import getUserModel from "../core/users/user.model";

interface AdvisorResponseStats {
  advisorId: string;
  advisorName: string;
  advisorEmail: string;
  totalResponses: number;
  averageResponseTime: number; // en segundos
  medianResponseTime: number; // en segundos
  fastestResponse: number; // en segundos
  slowestResponse: number; // en segundos
  responsesUnder5Seconds: number;
  responsesUnder30Seconds: number;
  responsesOver1Minute: number;
  totalResponseTime: number; // suma total en segundos
  responseTimes: number[]; // array de todos los tiempos de respuesta
}

interface ConversationAnalysis {
  phone: string;
  advisorName?: string;
  totalMessages: number;
  advisorMessages: number;
  averageResponseTime: number;
  conversationStart: Date;
  lastMessage: Date;
  responseTimes: Array<{
    customerMessageTime: Date;
    advisorResponseTime: Date;
    responseTimeSeconds: number;
  }>;
}

/**
 * Script para analizar los tiempos de respuesta de los asesores en QuickLearning
 */
async function analyzeAdvisorResponseTimes() {
  try {
    console.log("🔍 Iniciando análisis de tiempos de respuesta de asesores...");
    
    // Conectar a la base de datos de QuickLearning
    const conn = await getConnectionByCompanySlug("quicklearning");
    const ChatModel = getQuickLearningChatModel(conn);
    // Obtener todos los chats que tienen asesores asignados
    const chatsWithAdvisors = await ChatModel.find({
      "advisor.id": { $exists: true, $ne: null },
      "messages.respondedBy": "asesor"
    }).populate("advisor.id", "name email");
    
    console.log(`📊 Encontrados ${chatsWithAdvisors.length} chats con asesores asignados`);
    
    // Mapa para almacenar estadísticas por asesor
    const advisorStats = new Map<string, AdvisorResponseStats>();
    
    // Procesar cada chat
    for (const chat of chatsWithAdvisors) {
      const advisorId = chat.advisor?.id?._id?.toString() || chat.advisor?.id?.toString();
      const advisorName = chat.advisor?.name || "Sin nombre";
      const advisorEmail = (chat.advisor?.id as any)?.email || "Sin email";
      
      if (!advisorId) continue;
      
      // Inicializar estadísticas del asesor si no existen
      if (!advisorStats.has(advisorId)) {
        advisorStats.set(advisorId, {
          advisorId,
          advisorName,
          advisorEmail,
          totalResponses: 0,
          averageResponseTime: 0,
          medianResponseTime: 0,
          fastestResponse: Infinity,
          slowestResponse: 0,
          responsesUnder5Seconds: 0,
          responsesUnder30Seconds: 0,
          responsesOver1Minute: 0,
          totalResponseTime: 0,
          responseTimes: []
        });
      }
      
      const stats = advisorStats.get(advisorId)!;
      
      // Analizar mensajes del chat
      const messages = chat.messages || [];
      let lastCustomerMessageTime: Date | null = null;
      
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
              
              // Actualizar estadísticas
              if (responseTimeSeconds < stats.fastestResponse) {
                stats.fastestResponse = responseTimeSeconds;
              }
              if (responseTimeSeconds > stats.slowestResponse) {
                stats.slowestResponse = responseTimeSeconds;
              }
              
              // Categorizar tiempos de respuesta
              if (responseTimeSeconds <= 5) {
                stats.responsesUnder5Seconds++;
              } else if (responseTimeSeconds <= 30) {
                stats.responsesUnder30Seconds++;
              } else if (responseTimeSeconds > 60) {
                stats.responsesOver1Minute++;
              }
            }
          }
        }
      }
    }
    
    // Calcular promedios y medianas
    for (const [advisorId, stats] of advisorStats) {
      if (stats.totalResponses > 0) {
        stats.averageResponseTime = stats.totalResponseTime / stats.totalResponses;
        
        // Calcular mediana
        const sortedTimes = [...stats.responseTimes].sort((a, b) => a - b);
        const middle = Math.floor(sortedTimes.length / 2);
        stats.medianResponseTime = sortedTimes.length % 2 === 0
          ? (sortedTimes[middle - 1] + sortedTimes[middle]) / 2
          : sortedTimes[middle];
      }
    }
    
    // Generar reporte
    console.log("\n" + "=".repeat(80));
    console.log("📈 REPORTE DE TIEMPOS DE RESPUESTA DE ASESORES - QUICKLEARNING");
    console.log("=".repeat(80));
    
    // Ordenar asesores por número de respuestas (descendente)
    const sortedAdvisors = Array.from(advisorStats.values())
      .sort((a, b) => b.totalResponses - a.totalResponses);
    
    for (const advisor of sortedAdvisors) {
      if (advisor.totalResponses === 0) continue;
      
      console.log(`\n👨‍💼 ASESOR: ${advisor.advisorName}`);
      console.log(`📧 Email: ${advisor.advisorEmail}`);
      console.log(`📊 Total de respuestas: ${advisor.totalResponses}`);
      console.log(`⏱️  Tiempo promedio: ${formatTime(advisor.averageResponseTime)}`);
      console.log(`📊 Tiempo mediano: ${formatTime(advisor.medianResponseTime)}`);
      console.log(`⚡ Respuesta más rápida: ${formatTime(advisor.fastestResponse)}`);
      console.log(`🐌 Respuesta más lenta: ${formatTime(advisor.slowestResponse)}`);
      console.log(`🚀 Respuestas ≤ 5 segundos: ${advisor.responsesUnder5Seconds} (${((advisor.responsesUnder5Seconds / advisor.totalResponses) * 100).toFixed(1)}%)`);
      console.log(`⚡ Respuestas ≤ 30 segundos: ${advisor.responsesUnder30Seconds} (${((advisor.responsesUnder30Seconds / advisor.totalResponses) * 100).toFixed(1)}%)`);
      console.log(`⏰ Respuestas > 1 minuto: ${advisor.responsesOver1Minute} (${((advisor.responsesOver1Minute / advisor.totalResponses) * 100).toFixed(1)}%)`);
      console.log("-".repeat(60));
    }
    
    // Estadísticas generales
    const totalResponses = Array.from(advisorStats.values())
      .reduce((sum, advisor) => sum + advisor.totalResponses, 0);
    
    const totalResponseTime = Array.from(advisorStats.values())
      .reduce((sum, advisor) => sum + advisor.totalResponseTime, 0);
    
    const overallAverage = totalResponses > 0 ? totalResponseTime / totalResponses : 0;
    
    console.log("\n📊 ESTADÍSTICAS GENERALES:");
    console.log(`👥 Total de asesores analizados: ${sortedAdvisors.length}`);
    console.log(`💬 Total de respuestas: ${totalResponses}`);
    console.log(`⏱️  Tiempo promedio general: ${formatTime(overallAverage)}`);
    
    // Top 3 asesores más rápidos
    const fastestAdvisors = sortedAdvisors
      .filter(a => a.totalResponses >= 5) // Mínimo 5 respuestas para ser considerado
      .sort((a, b) => a.averageResponseTime - b.averageResponseTime)
      .slice(0, 3);
    
    console.log("\n🏆 TOP 3 ASESORES MÁS RÁPIDOS (mínimo 5 respuestas):");
    fastestAdvisors.forEach((advisor, index) => {
      console.log(`${index + 1}. ${advisor.advisorName} - ${formatTime(advisor.averageResponseTime)} promedio`);
    });
    
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
function formatTime(seconds: number): string {
  if (seconds === Infinity) return "N/A";
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

/**
 * Función para analizar conversaciones específicas de un asesor
 */
async function analyzeAdvisorConversations(advisorId: string) {
  try {
    console.log(`🔍 Analizando conversaciones del asesor: ${advisorId}`);
    
    const conn = await getConnectionByCompanySlug("quicklearning");
    const ChatModel = getQuickLearningChatModel(conn);
    
    const chats = await ChatModel.find({
      "advisor.id": advisorId,
      "messages.respondedBy": "asesor"
    });
    
    const conversations: ConversationAnalysis[] = [];
    
    for (const chat of chats) {
      const messages = chat.messages || [];
      const advisorMessages = messages.filter(m => m.respondedBy === "asesor").length;
      const responseTimes: Array<{
        customerMessageTime: Date;
        advisorResponseTime: Date;
        responseTimeSeconds: number;
      }> = [];
      
      let lastCustomerMessageTime: Date | null = null;
      
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
    
    console.log(`\n📱 CONVERSACIONES DEL ASESOR (${conversations.length} chats):`);
    conversations.forEach((conv, index) => {
      console.log(`${index + 1}. ${conv.phone} - ${conv.advisorMessages} mensajes - ${formatTime(conv.averageResponseTime)} promedio`);
    });
    
    return conversations;
    
  } catch (error) {
    console.error("❌ Error analizando conversaciones:", error);
    return [];
  }
}

// Ejecutar el script si se llama directamente
if (require.main === module) {
  analyzeAdvisorResponseTimes()
    .then(() => {
      console.log("🎉 Script ejecutado exitosamente");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Error ejecutando script:", error);
      process.exit(1);
    });
}

export { analyzeAdvisorResponseTimes, analyzeAdvisorConversations, formatTime };
