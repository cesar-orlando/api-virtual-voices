import { Request, Response } from 'express';
import { MessageSchedulerService } from '../services/internal/messageSchedulerService';
import { getConnectionByCompanySlug } from '../config/connectionManager';
import { getWhatsappChatModel } from '../models/whatsappChat.model';
import { getScheduledMessageModel } from '../models/scheduledMessage.model';

/**
 * Schedule a follow-up message manually
 * POST /api/scheduler/:company/schedule
 */
export const scheduleFollowUp = async (req: Request, res: Response) => {
  try {
    const { company } = req.params;
    const {
      phone,
      messageType,
      delayHours,
      delayDays,
      triggerEvent,
      messageContent,
      customData,
      priority = 'medium',
      scheduledBy,
      prospects
    } = req.body;

    // Validate required parameters
    if (!company || !messageType) {
      res.status(400).json({
        success: false,
        error: 'Company and messageType are required'
      });
      return;
    }

    if (!delayHours && !delayDays) {
      res.status(400).json({
        success: false,
        error: 'Either delayHours or delayDays must be specified'
      });
      return;
    }

    const connection = await getConnectionByCompanySlug(company);
    const schedulerService = new MessageSchedulerService(connection);

    if (prospects && Array.isArray(prospects)) {
      for (const prospect of prospects) {
        await schedulerService.scheduleFollowUp({
          chatId: prospect.chatId,
          phone: prospect.phone,
          company,
          messageType,
          delayHours,
          delayDays,
          triggerEvent: triggerEvent || `manual_${messageType}_${Date.now()}`,
          messageContent,
          customData: {
            scheduledByAPI: true,
            scheduledBy,
            priority,
            ...customData
          }
        });
      }
      res.json({
        success: true,
        message: `Follow-ups scheduled successfully for ${prospects.length} prospects`
      });
      return;
    }

    const WhatsappChat = getWhatsappChatModel(connection);
    
    const chat = await WhatsappChat.findOne({ phone, company });
    if (!chat) {
      res.status(404).json({
        success: false,
        error: 'Chat not found for the specified phone number'
      });
      return;
    }

    // Schedule the follow-up
    const scheduledMessage = await schedulerService.scheduleFollowUp({
      chatId: chat._id.toString(),
      phone,
      company,
      messageType,
      delayHours,
      delayDays,
      triggerEvent: triggerEvent || `manual_${messageType}_${Date.now()}`,
      messageContent,
      customData: {
        scheduledByAPI: true,
        scheduledBy,
        priority,
        ...customData
      }
    });

    const timeUnit = delayHours ? `${delayHours} hours` : `${delayDays} days`;
    const scheduledTime = new Date(scheduledMessage.scheduledFor).toLocaleString();

    console.log(`📅 Manual follow-up scheduled for ${phone} in ${timeUnit} (${scheduledTime})`);

    res.json({
      success: true,
      message: `Follow-up scheduled successfully for ${timeUnit}`,
      data: {
        id: scheduledMessage._id,
        phone,
        messageType,
        scheduledFor: scheduledMessage.scheduledFor,
        timeUnit,
        scheduledTime,
        status: scheduledMessage.status
      }
    });

  } catch (error: any) {
    console.error('Error scheduling follow-up:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
};

/**
 * Schedule using a predefined template
 * POST /api/scheduler/:company/schedule-template
 */
export const scheduleWithTemplate = async (req: Request, res: Response) => {
  try {
    const { company } = req.params;
    const {
      phone,
      templateName,
      delayHours,
      delayDays,
      variables = {},
      priority = 'medium'
    } = req.body;

    // Validate required parameters
    if (!company || !phone || !templateName) {
      res.status(400).json({
        success: false,
        error: 'Company, phone, and templateName are required'
      });
      return;
    }

    if (!delayHours && !delayDays) {
      res.status(400).json({
        success: false,
        error: 'Either delayHours or delayDays must be specified'
      });
      return;
    }

    // Predefined templates
    const templates = {
      'follow_up_interested': {
        messageType: 'follow_up',
        template: 'Hola {userName}, ¿has tenido oportunidad de revisar la información que te compartí sobre {propertyType}?'
      },
      'reminder_appointment': {
        messageType: 'reminder',
        template: 'Hola {userName}, te recordamos tu cita programada para mañana a las {appointmentTime}. ¿Podrás confirmar tu asistencia?'
      },
      'nurture_general': {
        messageType: 'nurture',
        template: 'Hola {userName}, esperamos que estés bien. ¿Hay algo en lo que podamos ayudarte hoy?'
      },
      'offer_special': {
        messageType: 'offer',
        template: 'Hola {userName}, tenemos una oferta especial que podría interesarte. ¿Te gustaría conocer los detalles?'
      }
    };

    const template = templates[templateName as keyof typeof templates];
    if (!template) {
      res.status(400).json({
        success: false,
        error: `Template '${templateName}' not found`,
        availableTemplates: Object.keys(templates)
      });
      return;
    }

    // Replace variables in template
    let processedTemplate = template.template;
    Object.entries(variables).forEach(([key, value]) => {
      processedTemplate = processedTemplate.replace(new RegExp(`{${key}}`, 'g'), String(value));
    });

    // Get database connection and find the chat
    const connection = await getConnectionByCompanySlug(company);
    const WhatsappChat = getWhatsappChatModel(connection);
    
    const chat = await WhatsappChat.findOne({ phone, company });
    if (!chat) {
      res.status(404).json({
        success: false,
        error: 'Chat not found for the specified phone number'
      });
      return;
    }

    // Create scheduler service
    const schedulerService = new MessageSchedulerService(connection);

    // Schedule the follow-up
    const scheduledMessage = await schedulerService.scheduleFollowUp({
      chatId: chat._id.toString(),
      phone,
      company,
      messageType: template.messageType as any,
      delayHours,
      delayDays,
      triggerEvent: `template_${templateName}_${Date.now()}`,
      messageContent: processedTemplate,
      customData: {
        scheduledByAPI: true,
        scheduledBy: req.ip || 'unknown',
        templateName,
        variables,
        priority
      }
    });

    const timeUnit = delayHours ? `${delayHours} hours` : `${delayDays} days`;
    const scheduledTime = new Date(scheduledMessage.scheduledFor).toLocaleString();

    console.log(`📅 Template follow-up scheduled for ${phone} using ${templateName} in ${timeUnit}`);

    res.json({
      success: true,
      message: `Follow-up scheduled successfully using template '${templateName}' for ${timeUnit}`,
      data: {
        id: scheduledMessage._id,
        phone,
        templateName,
        messageType: template.messageType,
        processedTemplate,
        scheduledFor: scheduledMessage.scheduledFor,
        timeUnit,
        scheduledTime,
        status: scheduledMessage.status
      }
    });

  } catch (error: any) {
    console.error('Error scheduling template follow-up:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
};

/**
 * Get scheduled messages for a company or specific phone
 * GET /api/scheduler/:company/scheduled
 */
export const getScheduledMessages = async (req: Request, res: Response) => {
  try {
    const { company } = req.params;
    const { phone, status, messageType, limit = 50, page = 1 } = req.query;

    if (!company) {
      res.status(400).json({
        success: false,
        error: 'Company is required'
      });
      return;
    }

    const connection = await getConnectionByCompanySlug(company);
    const ScheduledMessage = getScheduledMessageModel(connection);

    // Build query filter
    const filter: any = { company };
    if (phone) filter.phone = phone;
    if (status) filter.status = status;
    if (messageType) filter.messageType = messageType;

    // Query with pagination
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const [messages, total] = await Promise.all([
      ScheduledMessage.find(filter)
        .sort({ scheduledFor: -1 })
        .skip(skip)
        .limit(parseInt(limit as string))
        .lean(),
      ScheduledMessage.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: messages,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        totalPages: Math.ceil(total / parseInt(limit as string))
      }
    });

  } catch (error: any) {
    console.error('Error getting scheduled messages:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
};

/**
 * Cancel scheduled messages
 * DELETE /api/scheduler/:company/cancel
 */
export const cancelScheduledMessages = async (req: Request, res: Response) => {
  try {
    const { company } = req.params;
    const { phone, messageType, messageId } = req.body;

    if (!company) {
      res.status(400).json({
        success: false,
        error: 'Company is required'
      });
      return;
    }

    if (!phone && !messageId) {
      res.status(400).json({
        success: false,
        error: 'Either phone or messageId must be provided'
      });
      return;
    }

    const connection = await getConnectionByCompanySlug(company);
    const schedulerService = new MessageSchedulerService(connection);
    const ScheduledMessage = getScheduledMessageModel(connection);

    let cancelledCount = 0;

    if (messageId) {
      // Cancel specific message by ID
      const result = await ScheduledMessage.updateOne(
        { _id: messageId, status: 'pending' },
        { status: 'cancelled' }
      );
      cancelledCount = result.modifiedCount;
    } else if (phone) {
      // Cancel messages by phone (and optionally messageType)
      const chat = await connection.model('WhatsappChat').findOne({ phone, company });
      if (!chat) {
        res.status(404).json({
          success: false,
          error: 'Chat not found for the specified phone number'
        });
        return;
      }

      cancelledCount = await schedulerService.cancelScheduledMessages(
        chat._id.toString(),
        messageType as any
      );
    }

    console.log(`🗑️ Cancelled ${cancelledCount} scheduled messages for ${company}`);

    res.json({
      success: true,
      message: `Cancelled ${cancelledCount} scheduled message(s)`,
      data: { cancelledCount }
    });

  } catch (error: any) {
    console.error('Error cancelling scheduled messages:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
};

/**
 * Get scheduler statistics
 * GET /api/scheduler/:company/stats
 */
export const getSchedulerStats = async (req: Request, res: Response) => {
  try {
    const { company } = req.params;

    if (!company) {
      res.status(400).json({
        success: false,
        error: 'Company is required'
      });
      return;
    }

    const connection = await getConnectionByCompanySlug(company);
    const ScheduledMessage = connection.model('ScheduledMessage');

    // Get statistics
    const [totalScheduled, pending, sent, failed, cancelled] = await Promise.all([
      ScheduledMessage.countDocuments({ company }),
      ScheduledMessage.countDocuments({ company, status: 'pending' }),
      ScheduledMessage.countDocuments({ company, status: 'sent' }),
      ScheduledMessage.countDocuments({ company, status: 'failed' }),
      ScheduledMessage.countDocuments({ company, status: 'cancelled' })
    ]);

    // Get stats by message type
    const messageTypeStats = await ScheduledMessage.aggregate([
      { $match: { company } },
      { $group: { _id: '$messageType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Get recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentActivity = await ScheduledMessage.aggregate([
      { 
        $match: { 
          company, 
          createdAt: { $gte: sevenDaysAgo }
        } 
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            status: '$status'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalScheduled,
          pending,
          sent,
          failed,
          cancelled,
          successRate: totalScheduled > 0 ? Math.round((sent / totalScheduled) * 100) : 0
        },
        messageTypes: messageTypeStats,
        recentActivity
      }
    });

  } catch (error: any) {
    console.error('Error getting scheduler stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
};
