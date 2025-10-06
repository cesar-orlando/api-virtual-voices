import { Request, Response } from "express";
import mongoose from "mongoose";
import { buildMongoConnectionOptions, getConnectionByCompanySlug } from "../../config/connectionManager";
import getRecordModel from "../../models/record.model";

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
  totalRecordsCreated: number;
  recordsBySlug: Record<string, number>;
  dailyBreakdown: Array<{
    date: string;
    totalChats: number; // chats con actividad por mensajes ese día
    newChats: number; // chats creados ese día (por createdAt)
    prospectosCreated: number; // records 'prospectos' creados ese día
    recordsCreated: number; // total records creados (slugs seleccionados)
    recordsBySlug: Record<string, number>;
    campaignsProspectos?: Array<{ name: string; count: number }>;
    campaignsProspectosSummary?: { withCampaign: number; withoutCampaign: number; numCampaigns: number };
    totalMessages: number;
    inboundMessages: number;
    outboundMessages: number;
    averageMessagesPerChat: number;
    botResponses: number;
    humanResponses: number;
    uniqueInboundConversations: number;
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
      includeInactive = 'false',
      tableSlugs
    } = req.query;

    console.log(`📊 Obteniendo métricas de QuickLearning...`);
    console.log(`📅 Período: ${startDate || 'último ' + period} - ${endDate || 'ahora'}`);

    // Calcular rango de fechas
    let dateFilter: any = {};
    const now = new Date();
    let periodStart: Date;
    let periodEnd: Date;
    
    if (startDate && endDate) {
      periodStart = new Date(startDate as string);
      periodEnd = new Date(endDate as string);
      dateFilter = {
        createdAt: {
          $gte: periodStart,
          $lte: periodEnd
        }
      };
    } else {
      // Períodos predefinidos
      const periodHours = period === '24hours' ? 24 : 
                         period === '7days' ? 24 * 7 : 
                         period === '30days' ? 24 * 30 : 24 * 7;
      
      periodStart = new Date(now.getTime() - (periodHours * 60 * 60 * 1000));
      periodEnd = now;
      dateFilter = {
        createdAt: { $gte: periodStart, $lte: periodEnd }
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
    
    const quickLearningConnection = mongoose.createConnection(QUICKLEARNING_URI, buildMongoConnectionOptions());
    
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
    const chatsRaw = await QuickLearningChat.find({
      ...dateFilter,
      ...statusFilter
    }).lean();

    console.log(`📊 Chats encontrados (antes de match DynamicRecords): ${chatsRaw.length}`);

    // Obtener teléfonos válidos desde DynamicRecords para asegurar 1:1 con registros
    const defaultSlugs = ["alumnos", "prospectos", "clientes", "sin_contestar", "nuevo_ingreso"];
    const slugs = (typeof tableSlugs === 'string' && tableSlugs.trim().length > 0)
      ? (tableSlugs as string).split(',').map(s => s.trim()).filter(Boolean)
      : defaultSlugs;

    // Conexión a BD de empresa (dynamicrecords)
    const companySlug = 'quicklearning';
    const companyConn = await getConnectionByCompanySlug(companySlug);
    const Record = getRecordModel(companyConn);

    const recordQuery: any = {
      c_name: companySlug,
      tableSlug: { $in: slugs }
    };

    const dynamicRecords = await Record.find(recordQuery)
      .select('data.telefono data.phone data.number tableSlug createdAt')
      .lean();

    const normalizePhoneVariants = (val: any): string[] => {
      if (val === undefined || val === null) return [];
      const s = String(val).trim();
      if (!s) return [];
      const digitsOnly = s.replace(/\D+/g, '');
      const withoutPlus = s.startsWith('+') ? s.slice(1) : s;
      return Array.from(new Set([s, withoutPlus, digitsOnly].filter(Boolean)));
    };

    const recordPhones = new Set<string>();
    for (const r of dynamicRecords) {
      const candidates = [r?.data?.telefono, r?.data?.phone, r?.data?.number];
      for (const c of candidates) {
        const variants = normalizePhoneVariants(c);
        variants.forEach(v => recordPhones.add(v));
      }
    }

    // Backfill: asegurar que por cada chat creado en el período exista un Record en 'prospectos' creado el mismo día
    try {
      const toCanonical = (val: any): string | null => {
        if (val === undefined || val === null) return null;
        const s = String(val).trim();
        if (!s) return null;
        return s.replace(/\D+/g, '');
      };

      // Mapear chats creados por día (por createdAt)
      const chatsCreatedByDay = new Map<string, Array<any>>();
      for (const c of chatsRaw) {
        const created = (c as any).createdAt ? new Date((c as any).createdAt) : null;
        if (!created || isNaN(created.getTime())) continue;
        if (created < periodStart || created > periodEnd) continue;
        const key = created.toISOString().split('T')[0];
        if (!chatsCreatedByDay.has(key)) chatsCreatedByDay.set(key, []);
        chatsCreatedByDay.get(key)!.push(c);
      }

      // Records 'prospectos' creados en el período
      const prospectosRecords = await Record.find({
        c_name: companySlug,
        tableSlug: 'prospectos',
        createdAt: { $gte: periodStart, $lte: periodEnd }
      }).select('createdAt data.telefono data.phone data.number').lean();

      const recordsByDay = new Map<string, Set<string>>();
      for (const r of prospectosRecords) {
        const created = (r as any).createdAt ? new Date((r as any).createdAt) : null;
        if (!created || isNaN(created.getTime())) continue;
        const key = created.toISOString().split('T')[0];
        const canon = toCanonical((r as any).data?.telefono ?? (r as any).data?.phone ?? (r as any).data?.number);
        if (!canon) continue;
        if (!recordsByDay.has(key)) recordsByDay.set(key, new Set<string>());
        recordsByDay.get(key)!.add(canon);
      }

      // Encontrar faltantes y preparar inserciones
      const inserts: any[] = [];
      for (const [dayKey, dayChats] of chatsCreatedByDay.entries()) {
        const recordSet = recordsByDay.get(dayKey) || new Set<string>();
        for (const chat of dayChats) {
          const canon = toCanonical(chat?.phone);
          if (!canon) continue;
          if (!recordSet.has(canon)) {
            inserts.push({
              tableSlug: 'prospectos',
              c_name: companySlug,
              data: {
                telefono: chat.phone,
                phone: chat.phone,
                number: canon,
                name: (chat as any).customerInfo?.name || (chat as any).profileName || '',
                lastMessageDate: (chat as any).lastMessage?.date || (chat as any).conversationStart,
                source: 'auto-metrics-backfill'
              },
              createdBy: 'metrics-sync',
              createdAt: (chat as any).createdAt || (chat as any).conversationStart,
              updatedBy: 'metrics-sync',
              updatedAt: (chat as any).createdAt || (chat as any).conversationStart
            });
            recordSet.add(canon);
          }
        }
        recordsByDay.set(dayKey, recordSet);
      }

      if (inserts.length > 0) {
        try {
          await Record.insertMany(inserts, { ordered: false });
          // Añadir a recordPhones para que los chats se incluyan
          for (const ins of inserts) {
            const variants = normalizePhoneVariants(ins.data?.phone || ins.data?.telefono || ins.data?.number);
            variants.forEach((v: string) => recordPhones.add(v));
          }
          console.log(`🧩 Backfill: creados ${inserts.length} records faltantes en 'prospectos'`);
        } catch (bulkErr) {
          console.warn('⚠️ Error en insertMany de backfill:', bulkErr);
        }
      }
    } catch (backfillError) {
      console.warn('⚠️ Backfill de records faltantes falló:', backfillError);
    }

    const chats = chatsRaw.filter(c => {
      if (!c?.phone) return false;
      const variants = normalizePhoneVariants(c.phone);
      return variants.some(v => recordPhones.has(v));
    });

    console.log(`📊 Chats después de match DynamicRecords (${slugs.join(', ')}): ${chats.length}`);

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
      totalRecordsCreated: 0,
      recordsBySlug: {},
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
            totalChatsSet: new Set<string>(),
            newChatsSet: new Set<string>(),
            prospectosCreated: 0,
            recordsCreated: 0,
            recordsBySlug: {},
            campaignsMapProspectos: new Map<string, number>(),
            withCampaignProspectos: 0,
            withoutCampaignProspectos: 0,
            totalMessages: 0,
            inboundMessages: 0,
            outboundMessages: 0,
            botResponses: 0,
            humanResponses: 0,
            uniqueInboundConversations: new Set<string>(),
          };
        }
        
        dailyData[dateKey].totalChatsSet.add(chat.phone);
        dailyData[dateKey].totalMessages++;
        
        if (message.direction === 'inbound') {
          dailyData[dateKey].inboundMessages++;
          dailyData[dateKey].uniqueInboundConversations.add(chat.phone);
        } else {
          dailyData[dateKey].outboundMessages++;
        }
        
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

      // Registrar chat creado por día (usar createdAt)
      const chatCreatedDate = new Date((chat as any).createdAt || chat.conversationStart);
      const chatCreatedKey = chatCreatedDate.toISOString().split('T')[0];
      if (!dailyData[chatCreatedKey]) {
        dailyData[chatCreatedKey] = {
          date: chatCreatedKey,
          totalChatsSet: new Set<string>(),
          newChatsSet: new Set<string>(),
          prospectosCreated: 0,
          recordsCreated: 0,
          recordsBySlug: {},
          campaignsMapProspectos: new Map<string, number>(),
          withCampaignProspectos: 0,
          withoutCampaignProspectos: 0,
          totalMessages: 0,
          inboundMessages: 0,
          outboundMessages: 0,
          botResponses: 0,
          humanResponses: 0,
          uniqueInboundConversations: new Set<string>(),
        };
      }
      dailyData[chatCreatedKey].newChatsSet.add(chat.phone);
    });

    // Contar records creados por día (para slugs seleccionados) y breakdown por slug
    try {
      const recordsCreated = await Record.find({
        c_name: companySlug,
        tableSlug: { $in: slugs },
        createdAt: { $gte: periodStart, $lte: periodEnd }
      }).select({ createdAt: 1, tableSlug: 1, 'data.campana': 1 }).lean();

      const normalizeCampaign = (val: any): string => {
        if (val === undefined || val === null) return 'SIN_CAMPANA';
        const s = String(val).trim();
        return s === '' ? 'SIN_CAMPANA' : s.toUpperCase();
      };

      for (const rec of recordsCreated as any[]) {
        const created = rec?.createdAt ? new Date(rec.createdAt) : null;
        if (!created || isNaN(created.getTime())) continue;
        const key = created.toISOString().split('T')[0];
        if (!dailyData[key]) {
          dailyData[key] = {
            date: key,
            totalChatsSet: new Set<string>(),
            newChatsSet: new Set<string>(),
            prospectosCreated: 0,
            recordsCreated: 0,
            recordsBySlug: {},
            campaignsMapProspectos: new Map<string, number>(),
            withCampaignProspectos: 0,
            withoutCampaignProspectos: 0,
            totalMessages: 0,
            inboundMessages: 0,
            outboundMessages: 0,
            botResponses: 0,
            humanResponses: 0,
            uniqueInboundConversations: new Set<string>(),
          };
        }
        dailyData[key].recordsCreated = (dailyData[key].recordsCreated || 0) + 1;
        const slug = rec.tableSlug || 'unknown';
        dailyData[key].recordsBySlug[slug] = (dailyData[key].recordsBySlug[slug] || 0) + 1;
        if (slug === 'prospectos') {
          dailyData[key].prospectosCreated = (dailyData[key].prospectosCreated || 0) + 1;
          const camp = normalizeCampaign(rec?.data?.campana);
          const curr = dailyData[key].campaignsMapProspectos.get(camp) || 0;
          dailyData[key].campaignsMapProspectos.set(camp, curr + 1);
          if (camp === 'SIN_CAMPANA') dailyData[key].withoutCampaignProspectos += 1;
          else dailyData[key].withCampaignProspectos += 1;
        }
        metrics.totalRecordsCreated += 1;
        metrics.recordsBySlug[slug] = (metrics.recordsBySlug[slug] || 0) + 1;
      }
    } catch (e) {
      console.warn('⚠️ No se pudieron contar records creados por día:', e);
    }

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
      // A solicitud: usar PROSPECTOS creados como "Total Chats" del día (total campañas)
      totalChats: day.prospectosCreated || 0,
      newChats: day.newChatsSet.size,
      prospectosCreated: day.prospectosCreated || 0,
      recordsCreated: day.recordsCreated || 0,
      recordsBySlug: day.recordsBySlug || {},
      campaignsProspectos: Array.from((day.campaignsMapProspectos || new Map()).entries())
        .map(([name, count]: [string, number]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      campaignsProspectosSummary: {
        withCampaign: day.withCampaignProspectos || 0,
        withoutCampaign: day.withoutCampaignProspectos || 0,
        numCampaigns: (day.campaignsMapProspectos ? day.campaignsMapProspectos.size : 0)
      },
      totalMessages: day.totalMessages,
      inboundMessages: day.inboundMessages,
      outboundMessages: day.outboundMessages,
      averageMessagesPerChat: day.totalChatsSet.size > 0 ? day.totalMessages / day.totalChatsSet.size : 0,
      botResponses: day.botResponses,
      humanResponses: day.humanResponses,
      uniqueInboundConversations: day.uniqueInboundConversations ? day.uniqueInboundConversations.size : 0
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

    // A solicitud: usar total de PROSPECTOS creados como "Total Chats" del período (total campañas)
    metrics.totalChats = metrics.recordsBySlug['prospectos'] || 0;

    console.log(`✅ Métricas calculadas exitosamente`);
    console.log(`📊 Total (registros como chats): ${metrics.totalChats}, Total mensajes: ${metrics.totalMessages}`);

    return res.status(200).json({
      success: true,
      data: metrics,
      period: {
        startDate: startDate || `últimos ${period}`,
        endDate: endDate || 'ahora',
        includeInactive: includeInactive === 'true'
      },
      constraints: {
        matchedByDynamicRecords: true,
        tableSlugs: slugs,
        company: companySlug
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
    
    const quickLearningConnection = mongoose.createConnection(QUICKLEARNING_URI, buildMongoConnectionOptions());
    
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

/**
 * Verificar consistencia entre Chats y DynamicRecords por tableSlug
 * - Compara teléfonos presentes en 'chats' vs 'dynamicrecords'
 * - Reporta faltantes en cada lado y posibles duplicados
 */
export const checkQuickLearningChatsRecordsConsistency = async (req: Request, res: Response): Promise<any> => {
  try {
    const {
      startDate,
      endDate,
      period = '7days',
      includeInactive = 'false',
      tableSlugs
    } = req.query;

    const defaultSlugs = ["alumnos", "prospectos", "clientes", "sin_contestar", "nuevo_ingreso"];
    const slugs = (typeof tableSlugs === 'string' && tableSlugs.trim().length > 0)
      ? (tableSlugs as string).split(',').map(s => s.trim()).filter(Boolean)
      : defaultSlugs;

    // 1) Rango de fechas (usaremos mensajes.dateCreated y data.lastMessageDate)
    const now = new Date();
    let startTime: Date;
    let endTime: Date;
    if (startDate && endDate) {
      startTime = new Date(startDate as string);
      endTime = new Date(endDate as string);
    } else {
      const periodHours = period === '24hours' ? 24 : period === '7days' ? 24 * 7 : period === '30days' ? 24 * 30 : 24 * 7;
      endTime = now;
      startTime = new Date(now.getTime() - (periodHours * 60 * 60 * 1000));
    }

    let statusFilter: any = {};
    if (includeInactive === 'false') {
      statusFilter = { status: { $ne: 'inactive' } };
    }

    // 2) Cargar chats
    const QUICKLEARNING_URI = process.env.MONGO_URI_QUICKLEARNING ||
      "mongodb+srv://quicklearning:VV235.@quicklearning.ikdoszo.mongodb.net/prod?retryWrites=true&w=majority&appName=quicklearning";
    const quickLearningConnection = mongoose.createConnection(QUICKLEARNING_URI, buildMongoConnectionOptions());

    const quickLearningChatSchema = new mongoose.Schema({
      phone: String,
      messages: [{
        direction: String,
        dateCreated: { type: Date, default: Date.now },
      }],
      status: String,
    }, { timestamps: true, collection: 'chats' });

    const QuickLearningChat = quickLearningConnection.model('Chat', quickLearningChatSchema);
    // Chats con al menos un mensaje en el rango
    const chatsRaw = await QuickLearningChat.find({
      ...statusFilter,
      'messages.dateCreated': { $gte: startTime, $lte: endTime }
    }).select('phone messages').lean();

    // 3) Cargar dynamicrecords de quicklearning para slugs
    const companySlug = 'quicklearning';
    const companyConn = await getConnectionByCompanySlug(companySlug);
    const Record = getRecordModel(companyConn);
    // Records activos en el rango por lastMessageDate (si existe) o creados en rango como fallback
    const records = await Record.find({ 
      c_name: companySlug, 
      tableSlug: { $in: slugs },
      $or: [
        { 'data.lastMessageDate': { $gte: startTime, $lte: endTime } },
        { 'data.lastMessageDate': { $exists: false } },
      ]
    })
      .select('data.telefono data.phone data.number data.lastMessageDate tableSlug createdAt')
      .lean();

    const toCanonical = (val: any): string | null => {
      if (val === undefined || val === null) return null;
      const s = String(val).trim();
      if (!s) return null;
      const digitsOnly = s.replace(/\D+/g, '');
      return digitsOnly || null;
    };

    // 4) Construir sets y mapas
    const chatPhonesSet = new Set<string>();
    const chatPhoneCounts = new Map<string, number>();
    for (const c of chatsRaw) {
      const canon = toCanonical(c?.phone);
      if (!canon) continue;
      chatPhonesSet.add(canon);
      chatPhoneCounts.set(canon, (chatPhoneCounts.get(canon) || 0) + 1);
    }

    const recordPhonesSet = new Set<string>();
    const recordPhoneCounts = new Map<string, number>();
    const recordCanonToMeta = new Map<string, { slugs: Set<string>, fields: Set<string> }>();
    for (const r of records) {
      const priorityVal = r?.data?.telefono ?? r?.data?.phone ?? r?.data?.number;
      const canon = toCanonical(priorityVal);
      if (!canon) continue;
      recordPhonesSet.add(canon);
      recordPhoneCounts.set(canon, (recordPhoneCounts.get(canon) || 0) + 1);
      if (!recordCanonToMeta.has(canon)) recordCanonToMeta.set(canon, { slugs: new Set<string>(), fields: new Set<string>() });
      const meta = recordCanonToMeta.get(canon)!;
      if (r.tableSlug) meta.slugs.add(r.tableSlug as any);
      if (priorityVal === r?.data?.telefono) meta.fields.add('telefono');
      if (priorityVal === r?.data?.phone) meta.fields.add('phone');
      if (priorityVal === r?.data?.number) meta.fields.add('number');
    }

    // 5) Intersección y diferencias
    const matchedCanonPhones: string[] = [];
    const chatsWithoutRecord: Array<{ phone: string }> = [];
    const recordsWithoutChat: Array<{ phone: string; slugs: string[]; fields: string[] }> = [];

    // Chats -> Records (por canonical)
    for (const v of chatPhonesSet) {
      if (recordPhonesSet.has(v)) matchedCanonPhones.push(v);
    }
    for (const c of chatsRaw) {
      const canon = toCanonical(c?.phone);
      if (!canon) continue;
      if (!recordPhonesSet.has(canon)) chatsWithoutRecord.push({ phone: c.phone });
    }

    // Records -> Chats (por canonical)
    for (const v of recordPhonesSet) {
      if (!chatPhonesSet.has(v)) {
        const meta = recordCanonToMeta.get(v);
        recordsWithoutChat.push({ 
          phone: v,
          slugs: meta ? Array.from(meta.slugs) : [],
          fields: meta ? Array.from(meta.fields) : []
        });
      }
    }

    // 6) Duplicados potenciales
    const duplicateChats = Array.from(chatPhoneCounts.entries()).filter(([, count]) => count > 1)
      .map(([phone, count]) => ({ phone, count }));

    // Duplicados por canonical en records
    const recordDuplicates = Array.from(recordPhoneCounts.entries()).filter(([, count]) => count > 1)
      .map(([phone, count]) => ({ phone, count }));

    // 7) Cerrar conexión independiente a chats
    await quickLearningConnection.close();

    const result = {
      success: true,
      params: {
        startDate: startDate || `últimos ${period}`,
        endDate: endDate || 'ahora',
        includeInactive: includeInactive === 'true',
        tableSlugs: slugs,
        company: 'quicklearning'
      },
      counts: {
        chatsRaw: chatsRaw.length,
        chatsUnique: chatPhonesSet.size,
        records: records.length,
        recordsUnique: recordPhonesSet.size,
        matchedUniquePhones: matchedCanonPhones.length,
        chatsWithoutRecord: chatsWithoutRecord.length,
        recordsWithoutChat: recordsWithoutChat.length,
        duplicateChats: duplicateChats.length,
        duplicateRecords: recordDuplicates.length
      },
      samples: {
        chatsWithoutRecord: chatsWithoutRecord.slice(0, 100),
        recordsWithoutChat: recordsWithoutChat.slice(0, 100),
        duplicateChats: duplicateChats.slice(0, 100),
        duplicateRecords: recordDuplicates.slice(0, 100),
      },
      note: 'Las comparaciones usan variantes de teléfono (original, sin +, solo dígitos) para robustez.'
    };

    return res.status(200).json(result);

  } catch (error) {
    console.error('❌ Error verificando consistencia chats vs dynamicrecords:', error);
    return res.status(500).json({ success: false, message: 'Error interno', error: process.env.NODE_ENV === 'development' ? error : undefined });
  }
};
