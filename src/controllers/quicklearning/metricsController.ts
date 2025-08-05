import { Request, Response } from "express";
import mongoose from "mongoose";

// Importar el modelo de QuickLearning chat
interface IQuickLearningChat {
  phone: string;
  profileName?: string;
  messages: Array<{
    direction: "inbound" | "outbound-api";
    body: string;
    dateCreated: Date;
    respondedBy: "bot" | "human" | "asesor";
    responseTime?: number;
    twilioSid?: string;
    mediaUrl?: string[];
    messageType?: string;
    metadata?: any;
  }>;
  conversationStart: Date;
  lastMessage: {
    body: string;
    date: Date;
    respondedBy: string;
  };
  aiEnabled: boolean;
  status: "active" | "inactive" | "blocked";
  customerInfo: {
    name?: string;
    email?: string;
    city?: string;
    interests?: string[];
    stage?: "prospecto" | "interesado" | "inscrito" | "no_prospecto";
  };
  createdAt: Date;
  updatedAt: Date;
}

// Interfaz para las métricas de respuesta
interface QuickLearningMetrics {
  totalChats: number;
  totalMessages: number;
  totalInboundMessages: number;
  totalOutboundMessages: number;
  averageMessagesPerChat: number;
  medianMessagesPerChat: number;
  activeChats: number;
  inactiveChats: number;
  blockedChats: number;
  aiEnabledChats: number;
  botResponses: number;
  humanResponses: number;
  asesorResponses: number;
  averageResponseTime: number;
  dailyBreakdown: Array<{
    date: string;
    totalChats: number;
    newChats: number;
    totalMessages: number;
    inboundMessages: number;
    outboundMessages: number;
    averageMessagesPerChat: number;
    botResponses: number;
    humanResponses: number;
  }>;
  hourlyDistribution: Array<{
    hour: number;
    messageCount: number;
    chatCount: number;
  }>;
  stageDistribution: {
    prospecto: number;
    interesado: number;
    inscrito: number;
    no_prospecto: number;
  };
  topActiveChatsByMessages: Array<{
    phone: string;
    name?: string;
    messageCount: number;
    lastMessage: Date;
    stage?: string;
  }>;
  responseTimeStats: {
    fastest: number;
    slowest: number;
    under5Seconds: number;
    under30Seconds: number;
    over1Minute: number;
  };
}

/**
 * Obtener métricas completas de QuickLearning
 */
export const getQuickLearningMetrics = async (req: Request, res: Response): Promise<any> => {
  try {
    const { 
      startDate, 
      endDate, 
      period = '7days',
      includeInactive = 'false'
    } = req.query;

    console.log(`📊 Obteniendo métricas de QuickLearning...`);
    console.log(`📅 Período: ${startDate || 'último ' + period} - ${endDate || 'ahora'}`);

    // Calcular rango de fechas
    let dateFilter: any = {};
    const now = new Date();
    
    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          $gte: new Date(startDate as string),
          $lte: new Date(endDate as string)
        }
      };
    } else {
      // Períodos predefinidos
      const periodHours = period === '24hours' ? 24 : 
                         period === '7days' ? 24 * 7 : 
                         period === '30days' ? 24 * 30 : 24 * 7;
      
      const startTime = new Date(now.getTime() - (periodHours * 60 * 60 * 1000));
      dateFilter = {
        createdAt: { $gte: startTime }
      };
    }

    // Filtro de estado
    let statusFilter: any = {};
    if (includeInactive === 'false') {
      statusFilter = { status: { $ne: 'inactive' } };
    }

    // Conectar a la base de datos de QuickLearning
    const QUICKLEARNING_URI = process.env.MONGO_URI_QUICKLEARNING || 
      "mongodb+srv://quicklearning:VV235.@quicklearning.ikdoszo.mongodb.net/prod?retryWrites=true&w=majority&appName=quicklearning";
    
    const quickLearningConnection = mongoose.createConnection(QUICKLEARNING_URI);
    
    // Definir el esquema y modelo
    const quickLearningChatSchema = new mongoose.Schema({
      phone: String,
      profileName: String,
      messages: [{
        direction: String,
        body: String,
        dateCreated: { type: Date, default: Date.now },
        respondedBy: String,
        responseTime: Number,
        twilioSid: String,
        mediaUrl: [String],
        messageType: String,
        metadata: mongoose.Schema.Types.Mixed
      }],
      conversationStart: { type: Date, default: Date.now },
      lastMessage: {
        body: String,
        date: Date,
        respondedBy: String
      },
      aiEnabled: { type: Boolean, default: true },
      status: { type: String, enum: ["active", "inactive", "blocked"], default: "active" },
      customerInfo: {
        name: String,
        email: String,
        city: String,
        interests: [String],
        stage: { type: String, enum: ["prospecto", "interesado", "inscrito", "no_prospecto"], default: "prospecto" }
      }
    }, { 
      timestamps: true,
      collection: 'chats'
    });

    const QuickLearningChat = quickLearningConnection.model<IQuickLearningChat>('Chat', quickLearningChatSchema);

    // Consultar chats
    const chats = await QuickLearningChat.find({
      ...dateFilter,
      ...statusFilter
    }).lean();

    console.log(`📊 Chats encontrados: ${chats.length}`);

    // Calcular métricas
    const metrics: QuickLearningMetrics = {
      totalChats: chats.length,
      totalMessages: 0,
      totalInboundMessages: 0,
      totalOutboundMessages: 0,
      averageMessagesPerChat: 0,
      medianMessagesPerChat: 0,
      activeChats: 0,
      inactiveChats: 0,
      blockedChats: 0,
      aiEnabledChats: 0,
      botResponses: 0,
      humanResponses: 0,
      asesorResponses: 0,
      averageResponseTime: 0,
      dailyBreakdown: [],
      hourlyDistribution: [],
      stageDistribution: {
        prospecto: 0,
        interesado: 0,
        inscrito: 0,
        no_prospecto: 0
      },
      topActiveChatsByMessages: [],
      responseTimeStats: {
        fastest: Infinity,
        slowest: 0,
        under5Seconds: 0,
        under30Seconds: 0,
        over1Minute: 0
      }
    };

    const messagesPerChat: number[] = [];
    const responseTimes: number[] = [];
    const dailyData: { [key: string]: any } = {};
    const hourlyData: { [key: number]: { messages: number, chats: Set<string> } } = {};
    const chatActivity: Array<{ phone: string, name?: string, messageCount: number, lastMessage: Date, stage?: string }> = [];

    // Procesar cada chat
    chats.forEach(chat => {
      const messageCount = chat.messages?.length || 0;
      messagesPerChat.push(messageCount);
      
      // Contadores de estado
      if (chat.status === 'active') metrics.activeChats++;
      else if (chat.status === 'inactive') metrics.inactiveChats++;
      else if (chat.status === 'blocked') metrics.blockedChats++;
      
      if (chat.aiEnabled) metrics.aiEnabledChats++;
      
      // Contadores de stage
      const stage = chat.customerInfo?.stage || 'prospecto';
      if (stage in metrics.stageDistribution) {
        metrics.stageDistribution[stage as keyof typeof metrics.stageDistribution]++;
      }

      // Agregar a actividad para ranking
      chatActivity.push({
        phone: chat.phone,
        name: chat.customerInfo?.name || chat.profileName,
        messageCount,
        lastMessage: chat.lastMessage?.date || chat.conversationStart,
        stage: chat.customerInfo?.stage
      });

      // Procesar mensajes
      chat.messages?.forEach(message => {
        metrics.totalMessages++;
        
        if (message.direction === 'inbound') {
          metrics.totalInboundMessages++;
        } else {
          metrics.totalOutboundMessages++;
        }

        // Contadores de respuestas
        if (message.respondedBy === 'bot') metrics.botResponses++;
        else if (message.respondedBy === 'human') metrics.humanResponses++;
        else if (message.respondedBy === 'asesor') metrics.asesorResponses++;

        // Response time
        if (message.responseTime && message.responseTime > 0) {
          responseTimes.push(message.responseTime);
          
          if (message.responseTime < metrics.responseTimeStats.fastest) {
            metrics.responseTimeStats.fastest = message.responseTime;
          }
          if (message.responseTime > metrics.responseTimeStats.slowest) {
            metrics.responseTimeStats.slowest = message.responseTime;
          }
          
          if (message.responseTime <= 5) metrics.responseTimeStats.under5Seconds++;
          else if (message.responseTime <= 30) metrics.responseTimeStats.under30Seconds++;
          else if (message.responseTime > 60) metrics.responseTimeStats.over1Minute++;
        }

        // Análisis por fecha y hora
        const messageDate = new Date(message.dateCreated);
        const dateKey = messageDate.toISOString().split('T')[0];
        const hour = messageDate.getHours();

        // Daily data
        if (!dailyData[dateKey]) {
          dailyData[dateKey] = {
            date: dateKey,
            totalChats: new Set(),
            newChats: new Set(),
            totalMessages: 0,
            inboundMessages: 0,
            outboundMessages: 0,
            botResponses: 0,
            humanResponses: 0
          };
        }
        
        dailyData[dateKey].totalChats.add(chat.phone);
        dailyData[dateKey].totalMessages++;
        
        if (message.direction === 'inbound') dailyData[dateKey].inboundMessages++;
        else dailyData[dateKey].outboundMessages++;
        
        if (message.respondedBy === 'bot') dailyData[dateKey].botResponses++;
        else if (message.respondedBy === 'human' || message.respondedBy === 'asesor') {
          dailyData[dateKey].humanResponses++;
        }

        // Hourly data
        if (!hourlyData[hour]) {
          hourlyData[hour] = { messages: 0, chats: new Set() };
        }
        hourlyData[hour].messages++;
        hourlyData[hour].chats.add(chat.phone);
      });

      // Detectar nuevos chats por día
      const chatStartDate = new Date(chat.conversationStart).toISOString().split('T')[0];
      if (dailyData[chatStartDate]) {
        dailyData[chatStartDate].newChats.add(chat.phone);
      }
    });

    // Calcular promedios y medianas
    if (messagesPerChat.length > 0) {
      metrics.averageMessagesPerChat = messagesPerChat.reduce((a, b) => a + b, 0) / messagesPerChat.length;
      
      const sortedMessages = messagesPerChat.sort((a, b) => a - b);
      const mid = Math.floor(sortedMessages.length / 2);
      metrics.medianMessagesPerChat = sortedMessages.length % 2 !== 0 ? 
        sortedMessages[mid] : 
        (sortedMessages[mid - 1] + sortedMessages[mid]) / 2;
    }

    if (responseTimes.length > 0) {
      metrics.averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    }

    // Procesar datos diarios
    metrics.dailyBreakdown = Object.values(dailyData).map((day: any) => ({
      date: day.date,
      totalChats: day.totalChats.size,
      newChats: day.newChats.size,
      totalMessages: day.totalMessages,
      inboundMessages: day.inboundMessages,
      outboundMessages: day.outboundMessages,
      averageMessagesPerChat: day.totalChats.size > 0 ? day.totalMessages / day.totalChats.size : 0,
      botResponses: day.botResponses,
      humanResponses: day.humanResponses
    })).sort((a, b) => a.date.localeCompare(b.date));

    // Procesar datos por hora
    metrics.hourlyDistribution = Object.entries(hourlyData).map(([hour, data]) => ({
      hour: parseInt(hour),
      messageCount: data.messages,
      chatCount: data.chats.size
    })).sort((a, b) => a.hour - b.hour);

    // Top chats más activos
    metrics.topActiveChatsByMessages = chatActivity
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, 10);

    // Manejar casos sin datos
    if (metrics.responseTimeStats.fastest === Infinity) {
      metrics.responseTimeStats.fastest = 0;
    }

    // Cerrar conexión
    await quickLearningConnection.close();

    console.log(`✅ Métricas calculadas exitosamente`);
    console.log(`📊 Total chats: ${metrics.totalChats}, Total mensajes: ${metrics.totalMessages}`);

    return res.status(200).json({
      success: true,
      data: metrics,
      period: {
        startDate: startDate || `últimos ${period}`,
        endDate: endDate || 'ahora',
        includeInactive: includeInactive === 'true'
      },
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error obteniendo métricas de QuickLearning:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
};

/**
 * Obtener métricas resumidas para dashboard
 */
export const getQuickLearningDashboard = async (req: Request, res: Response): Promise<any> => {
  try {
    const { period = '24hours' } = req.query;

    console.log(`🎯 Obteniendo dashboard de QuickLearning (${period})...`);

    // Conectar a la base de datos
    const QUICKLEARNING_URI = process.env.MONGO_URI_QUICKLEARNING || 
      "mongodb+srv://quicklearning:VV235.@quicklearning.ikdoszo.mongodb.net/prod?retryWrites=true&w=majority&appName=quicklearning";
    
    const quickLearningConnection = mongoose.createConnection(QUICKLEARNING_URI);
    
    const quickLearningChatSchema = new mongoose.Schema({
      phone: String,
      messages: [{
        direction: String,
        dateCreated: { type: Date, default: Date.now },
        respondedBy: String
      }],
      status: String,
      aiEnabled: Boolean,
      customerInfo: {
        stage: String
      }
    }, { 
      timestamps: true,
      collection: 'chats'
    });

    const QuickLearningChat = quickLearningConnection.model('Chat', quickLearningChatSchema);

    // Calcular rango de fechas
    const now = new Date();
    const periodHours = period === '24hours' ? 24 : 
                       period === '7days' ? 24 * 7 : 
                       period === '30days' ? 24 * 30 : 24;
    
    const startTime = new Date(now.getTime() - (periodHours * 60 * 60 * 1000));

    // Consultas agregadas para dashboard
    const [totalChats, activeChats, totalMessagesResult] = await Promise.all([
      QuickLearningChat.countDocuments({
        createdAt: { $gte: startTime }
      }),
      QuickLearningChat.countDocuments({
        createdAt: { $gte: startTime },
        status: 'active'
      }),
      QuickLearningChat.aggregate([
        {
          $match: {
            createdAt: { $gte: startTime }
          }
        },
        {
          $project: {
            messageCount: { $size: { $ifNull: ["$messages", []] } },
            inboundCount: {
              $size: {
                $filter: {
                  input: { $ifNull: ["$messages", []] },
                  cond: { $eq: ["$$this.direction", "inbound"] }
                }
              }
            },
            outboundCount: {
              $size: {
                $filter: {
                  input: { $ifNull: ["$messages", []] },
                  cond: { $eq: ["$$this.direction", "outbound-api"] }
                }
              }
            }
          }
        },
        {
          $group: {
            _id: null,
            totalMessages: { $sum: "$messageCount" },
            totalInbound: { $sum: "$inboundCount" },
            totalOutbound: { $sum: "$outboundCount" },
            averageMessagesPerChat: { $avg: "$messageCount" }
          }
        }
      ])
    ]);

    const messageStats = totalMessagesResult[0] || {
      totalMessages: 0,
      totalInbound: 0,
      totalOutbound: 0,
      averageMessagesPerChat: 0
    };

    await quickLearningConnection.close();

    const dashboard = {
      period: period,
      periodLabel: period === '24hours' ? 'Últimas 24 horas' : 
                   period === '7days' ? 'Últimos 7 días' : 
                   period === '30days' ? 'Últimos 30 días' : 'Período personalizado',
      totalChats: totalChats,
      activeChats: activeChats,
      inactiveChats: totalChats - activeChats,
      totalMessages: messageStats.totalMessages,
      inboundMessages: messageStats.totalInbound,
      outboundMessages: messageStats.totalOutbound,
      averageMessagesPerChat: Math.round(messageStats.averageMessagesPerChat * 100) / 100,
      generatedAt: new Date().toISOString()
    };

    console.log(`✅ Dashboard generado: ${dashboard.totalChats} chats, ${dashboard.totalMessages} mensajes`);

    return res.status(200).json({
      success: true,
      data: dashboard
    });

  } catch (error) {
    console.error('❌ Error generando dashboard:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
};