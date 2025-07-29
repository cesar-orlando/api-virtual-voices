import { Request, Response } from "express";
import { getConnectionByCompanySlug } from "../config/connectionManager";
import { getWhatsappChatModel } from "../models/whatsappChat.model";

interface ChatMessage {
  timestamp: Date;
  sender: 'user' | 'bot' | 'human';
  message: string;
  phoneNumber?: string;
  direction: string;
  respondedBy: string;
}

interface ChatMetrics {
  totalChats: number;
  totalMessages: number;
  totalActiveChats: number;
  averageResponseTime: number;
  medianResponseTime: number;
  fastestResponse: number;
  slowestResponse: number;
  responsesUnder5Seconds: number;
  responsesUnder10Seconds: number;
  responsesOver30Seconds: number;
  averageMessagesPerChat: number;
  botActiveChats: number;
  humanActiveChats: number;
  peakHours: { hour: number; messageCount: number }[];
  dailyStats: { date: string; chats: number; messages: number; avgResponseTime: number }[];
  responseTimeDistribution: { range: string; count: number }[];
  topActiveChats: { phone: string; name?: string; messageCount: number; lastMessage: Date }[];
}

// Get WhatsApp chat metrics
export const getChatMetrics = async (req: Request, res: Response): Promise<any> => {
  const { c_name } = req.params;
  const { 
    startDate, 
    endDate, 
    phoneNumber,
    period = '7days'
  } = req.query;

  try {
    console.log(`🔍 Getting WhatsApp chat metrics for company: ${c_name}`);
    
    const conn = await getConnectionByCompanySlug(c_name);
    
    // Calculate date range
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
      const daysBack = period === '30days' ? 30 : period === '90days' ? 90 : 7;
      const periodStart = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));
      dateFilter = { 
        $or: [
          { createdAt: { $gte: periodStart } }, // This will work because mongoose adds it with timestamps: true
          { 'messages.createdAt': { $gte: periodStart } }
        ]
      };
    }

    // Build query filters
    const queryFilter: any = { ...dateFilter };
    
    if (phoneNumber) {
      queryFilter['phone'] = new RegExp(phoneNumber.toString().replace(/\D/g, ''), 'i');
    }

    // Get WhatsApp chats
    const WhatsappChat = getWhatsappChatModel(conn);
    const whatsappChats = await WhatsappChat.find(queryFilter).lean();
    console.log(`📱 Found ${whatsappChats.length} WhatsApp chats`);

    if (whatsappChats.length === 0) {
      return res.json({
        success: true,
        metrics: getEmptyMetrics(),
        period,
        dateRange: { 
          start: dateFilter.createdAt?.$gte || dateFilter.$or?.[0]?.createdAt?.$gte, 
          end: dateFilter.createdAt?.$lte || dateFilter.$or?.[0]?.createdAt?.$lte 
        },
        info: { message: "No WhatsApp chat data found for the specified period" }
      });
    }

    // Calculate metrics
    const metrics = await calculateWhatsAppChatMetrics(whatsappChats);

    console.log('✅ WhatsApp chat metrics calculated successfully');

    res.json({
      success: true,
      metrics,
      period,
      dateRange: { 
        start: dateFilter.createdAt?.$gte || dateFilter.$or?.[0]?.createdAt?.$gte, 
        end: dateFilter.createdAt?.$lte || dateFilter.$or?.[0]?.createdAt?.$lte 
      },
      chatCount: whatsappChats.length,
      info: {
        whatsappChats: whatsappChats.length,
        source: 'WhatsApp chat system'
      }
    });

  } catch (error) {
    console.error('❌ Error calculating WhatsApp chat metrics:', error);
    res.status(500).json({ 
      message: "Error calculating chat metrics", 
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
};

// Calculate metrics from WhatsApp chat data
async function calculateWhatsAppChatMetrics(chats: any[]): Promise<ChatMetrics> {
  console.log('🧮 Calculating metrics from WhatsApp chats...');

  const responseTimes: number[] = [];
  const hourlyDistribution = new Array(24).fill(0);
  const dailyStats = new Map<string, { chats: Set<string>; messages: number; responseTimes: number[] }>();
  const chatMessageCounts: { phone: string; name?: string; messageCount: number; lastMessage: Date }[] = [];

  let totalMessages = 0;
  let botActiveChats = 0;
  let totalActiveChats = 0;

  // Process each chat
  chats.forEach(chat => {
    const messages = chat.messages || [];
    const phone = chat.phone;
    const chatName = chat.name || chat.profileName;
    
    if (messages.length === 0) return;

    totalMessages += messages.length;
    
    // Count active chats (chats with messages in the period)
    if (messages.length > 0) {
      totalActiveChats++;
    }

    // Count bot-active chats
    if (chat.botActive || chat.aiEnabled) {
      botActiveChats++;
    }

    // Sort messages by timestamp - use only createdAt since that's what exists
    const sortedMessages = [...messages].sort((a, b) => {
      const aTime = new Date(a.createdAt || new Date()).getTime();
      const bTime = new Date(b.createdAt || new Date()).getTime();
      return aTime - bTime;
    });

    // Track message counts per chat
    const lastMessageTime = sortedMessages.length > 0 ? 
      new Date(sortedMessages[sortedMessages.length - 1].createdAt || new Date()) : new Date();

    chatMessageCounts.push({
      phone,
      name: chatName,
      messageCount: messages.length,
      lastMessage: lastMessageTime
    });

    // Calculate response times
    for (let i = 1; i < sortedMessages.length; i++) {
      const prevMessage = sortedMessages[i - 1];
      const currentMessage = sortedMessages[i];

      // Use only createdAt since that's the available property
      const prevTime = new Date(prevMessage.createdAt || new Date());
      const currTime = new Date(currentMessage.createdAt || new Date());

      // Skip if dates are invalid
      if (isNaN(prevTime.getTime()) || isNaN(currTime.getTime())) {
        continue;
      }

      // Track hourly distribution
      const hour = currTime.getHours();
      hourlyDistribution[hour]++;

      // Track daily stats
      const dateKey = currTime.toISOString().split('T')[0];
      if (!dailyStats.has(dateKey)) {
        dailyStats.set(dateKey, { chats: new Set(), messages: 0, responseTimes: [] });
      }
      const dayStats = dailyStats.get(dateKey)!;
      dayStats.chats.add(phone);
      dayStats.messages++;

      // Calculate response time: user -> bot/human response
      // Check direction and respondedBy to determine if it's a response
      const isUserMessage = prevMessage.direction === 'inbound';
      const isBotResponse = currentMessage.direction === 'outbound' || 
                           currentMessage.direction === 'outbound-api' || 
                           currentMessage.respondedBy === 'bot' ||
                           currentMessage.respondedBy === 'asesor';

      if (isUserMessage && isBotResponse) {
        const responseTime = (currTime.getTime() - prevTime.getTime()) / 1000;
        
        // Filter realistic response times (0 to 1 hour)
        if (responseTime > 0 && responseTime <= 3600) {
          responseTimes.push(responseTime);
          dayStats.responseTimes.push(responseTime);
        }
      }
    }
  });

  console.log(`⏱️ Calculated ${responseTimes.length} response times from ${totalMessages} total messages`);

  // Calculate statistics
  responseTimes.sort((a, b) => a - b);
  
  const averageResponseTime = responseTimes.length > 0 
    ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
    : 0;

  const medianResponseTime = responseTimes.length > 0
    ? responseTimes[Math.floor(responseTimes.length / 2)]
    : 0;

  const fastestResponse = responseTimes.length > 0 ? responseTimes[0] : 0;
  const slowestResponse = responseTimes.length > 0 ? responseTimes[responseTimes.length - 1] : 0;

  // Response time buckets
  const responsesUnder5Seconds = responseTimes.filter(time => time <= 5).length;
  const responsesUnder10Seconds = responseTimes.filter(time => time <= 10).length;
  const responsesOver30Seconds = responseTimes.filter(time => time > 30).length;

  // Peak hours analysis
  const peakHours = hourlyDistribution
    .map((count, hour) => ({ hour, messageCount: count }))
    .sort((a, b) => b.messageCount - a.messageCount)
    .slice(0, 5);

  // Daily statistics
  const dailyStatsArray = Array.from(dailyStats.entries()).map(([date, stats]) => ({
    date,
    chats: stats.chats.size,
    messages: stats.messages,
    avgResponseTime: stats.responseTimes.length > 0 
      ? stats.responseTimes.reduce((sum, time) => sum + time, 0) / stats.responseTimes.length 
      : 0
  })).sort((a, b) => a.date.localeCompare(b.date));

  // Response time distribution
  const responseTimeDistribution = [
    { range: '0-5s', count: responseTimes.filter(t => t <= 5).length },
    { range: '5-10s', count: responseTimes.filter(t => t > 5 && t <= 10).length },
    { range: '10-30s', count: responseTimes.filter(t => t > 10 && t <= 30).length },
    { range: '30s-1m', count: responseTimes.filter(t => t > 30 && t <= 60).length },
    { range: '1m-5m', count: responseTimes.filter(t => t > 60 && t <= 300).length },
    { range: '5m+', count: responseTimes.filter(t => t > 300).length }
  ];

  // Top active chats
  const topActiveChats = chatMessageCounts
    .sort((a, b) => b.messageCount - a.messageCount)
    .slice(0, 10);

  const metrics: ChatMetrics = {
    totalChats: chats.length,
    totalMessages,
    totalActiveChats,
    averageResponseTime: Math.round(averageResponseTime * 100) / 100,
    medianResponseTime: Math.round(medianResponseTime * 100) / 100,
    fastestResponse: Math.round(fastestResponse * 100) / 100,
    slowestResponse: Math.round(slowestResponse * 100) / 100,
    responsesUnder5Seconds,
    responsesUnder10Seconds,
    responsesOver30Seconds,
    averageMessagesPerChat: totalActiveChats > 0 ? Math.round((totalMessages / totalActiveChats) * 100) / 100 : 0,
    botActiveChats,
    humanActiveChats: totalActiveChats - botActiveChats,
    peakHours,
    dailyStats: dailyStatsArray,
    responseTimeDistribution,
    topActiveChats
  };

  console.log('📊 WhatsApp metrics calculation complete:', {
    totalChats: metrics.totalChats,
    totalMessages: metrics.totalMessages,
    avgResponseTime: metrics.averageResponseTime,
    botActiveChats: metrics.botActiveChats
  });

  return metrics;
}

// Get real-time WhatsApp chat metrics
export const getRealTimeChatMetrics = async (req: Request, res: Response) => {
  const { c_name } = req.params;

  try {
    const conn = await getConnectionByCompanySlug(c_name);

    // Get metrics for last 24 hours and last hour
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const lastHour = new Date(Date.now() - 60 * 60 * 1000);

    const WhatsappChat = getWhatsappChatModel(conn);

    const [last24HourChats, lastHourChats] = await Promise.all([
      WhatsappChat.find({ createdAt: { $gte: last24Hours } }).lean(),
      WhatsappChat.find({ createdAt: { $gte: lastHour } }).lean()
    ]);

    console.log(`📈 Real-time metrics: ${last24HourChats.length} chats (24h), ${lastHourChats.length} chats (1h)`);

    const metrics24h = await calculateWhatsAppChatMetrics(last24HourChats);
    const metrics1h = await calculateWhatsAppChatMetrics(lastHourChats);

    res.json({
      success: true,
      realTimeMetrics: {
        last24Hours: {
          totalChats: metrics24h.totalChats,
          totalMessages: metrics24h.totalMessages,
          averageResponseTime: metrics24h.averageResponseTime,
          responsesUnder5Seconds: metrics24h.responsesUnder5Seconds,
          botActiveChats: metrics24h.botActiveChats
        },
        lastHour: {
          totalChats: metrics1h.totalChats,
          totalMessages: metrics1h.totalMessages,
          averageResponseTime: metrics1h.averageResponseTime,
          responsesUnder5Seconds: metrics1h.responsesUnder5Seconds,
          botActiveChats: metrics1h.botActiveChats
        }
      },
      timestamp: new Date()
    });

  } catch (error) {
    console.error('❌ Error getting real-time WhatsApp metrics:', error);
    res.status(500).json({ 
      message: "Error getting real-time metrics", 
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
};

// Get empty metrics template
function getEmptyMetrics(): ChatMetrics {
  return {
    totalChats: 0,
    totalMessages: 0,
    totalActiveChats: 0,
    averageResponseTime: 0,
    medianResponseTime: 0,
    fastestResponse: 0,
    slowestResponse: 0,
    responsesUnder5Seconds: 0,
    responsesUnder10Seconds: 0,
    responsesOver30Seconds: 0,
    averageMessagesPerChat: 0,
    botActiveChats: 0,
    humanActiveChats: 0,
    peakHours: [],
    dailyStats: [],
    responseTimeDistribution: [],
    topActiveChats: []
  };
}

// Debug endpoints to explore WhatsApp chat data
export const getAvailableChatSources = async (req: Request, res: Response) => {
  const { c_name } = req.params;

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    
    // Check WhatsApp chats
    const WhatsappChat = getWhatsappChatModel(conn);
    const whatsappCount = await WhatsappChat.countDocuments();
    
    res.json({
      success: true,
      company: c_name,
      chatSources: {
        whatsapp: {
          available: true,
          count: whatsappCount,
          model: 'WhatsappChat'
        }
      }
    });

  } catch (error) {
    console.error('❌ Error checking chat sources:', error);
    res.status(500).json({ 
      message: "Error checking chat sources", 
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
};

// Get sample chat data for debugging
export const getSampleChatData = async (req: Request, res: Response) => {
  const { c_name } = req.params;
  const { limit = 3 } = req.query;

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const WhatsappChat = getWhatsappChatModel(conn);
    
    const sampleChats = await WhatsappChat.find()
      .limit(parseInt(limit as string))
      .sort({ createdAt: -1 }) // This will work because mongoose adds createdAt with timestamps: true
      .lean();

    res.json({
      success: true,
      source: 'whatsapp',
      sampleCount: sampleChats.length,
      sampleChats: sampleChats.map(chat => ({
        id: chat._id,
        phone: chat.phone,
        name: chat.name,
        messageCount: chat.messages?.length || 0,
        botActive: chat.botActive,
        session: chat.session,
        advisor: chat.advisor,
        lastMessage: chat.messages?.length > 0 ? {
          body: chat.messages[chat.messages.length - 1].body,
          direction: chat.messages[chat.messages.length - 1].direction,
          createdAt: chat.messages[chat.messages.length - 1].createdAt,
          respondedBy: chat.messages[chat.messages.length - 1].respondedBy,
          status: chat.messages[chat.messages.length - 1].status,
          msgId: chat.messages[chat.messages.length - 1].msgId
        } : null,
        totalMessages: chat.messages?.length || 0,
        // Access timestamps through the document properties (added by mongoose timestamps: true)
        createdAt: (chat as any).createdAt,
        updatedAt: (chat as any).updatedAt
      }))
    });

  } catch (error) {
    console.error('❌ Error getting sample chat data:', error);
    res.status(500).json({ 
      message: "Error getting sample chat data", 
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
};

// Debug function to see the exact structure of WhatsApp chat documents
export const debugChatStructure = async (req: Request, res: Response): Promise<void> => {
  const { c_name } = req.params;

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const WhatsappChat = getWhatsappChatModel(conn);
    
    const sampleChat = await WhatsappChat.findOne().lean();

    if (!sampleChat) {
      res.json({
        success: false,
        message: "No WhatsApp chats found to analyze structure"
      });
      return;
    }

    // Get all top-level properties
    const properties = Object.keys(sampleChat);
    
    // Get message structure if messages exist
    const messageStructure = sampleChat.messages && sampleChat.messages.length > 0 
      ? Object.keys(sampleChat.messages[0]) 
      : [];

    res.json({
      success: true,
      chatStructure: {
        topLevelProperties: properties,
        messageProperties: messageStructure,
        sampleMessage: sampleChat.messages?.[0] || null,
        totalMessages: sampleChat.messages?.length || 0
      },
      availableProperties: properties,
      messageExample: sampleChat.messages?.[0] || null,
      rawSample: sampleChat // Include the raw document for complete inspection
    });

  } catch (error) {
    console.error('❌ Error debugging chat structure:', error);
    res.status(500).json({ 
      message: "Error debugging chat structure", 
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
};