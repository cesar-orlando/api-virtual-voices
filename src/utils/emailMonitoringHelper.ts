/**
 * 📧 EMAIL MONITORING HELPER UTILITIES
 * 
 * Funciones auxiliares para manejar el monitoreo de emails
 * basado en eventos de usuario (login/logout)
 */

import EmailAutoStartService from '../services/emailAutoStart.service';
import { EmailReaderManager } from '../services/emailReader.service';
import { getEmailConfigInternal } from '../core/users/user.controller';

export interface EmailMonitoringResult {
  success: boolean;
  enabled: boolean;
  message: string;
  error?: string;
}

/**
 * Inicializar monitoreo de email automáticamente para un usuario
 * Se llama típicamente en el login
 * INCLUYE: Sincronización automática de emails perdidos
 */
export async function startUserEmailMonitoring(
  userId: string, 
  companySlug: string,
  options: {
    syncMissedEmails?: boolean;
    syncDays?: number;
    autoSync?: boolean;
  } = {}
): Promise<EmailMonitoringResult> {
  try {
    console.log(`📧 Iniciando monitoreo de email para usuario: ${userId} en empresa: ${companySlug}`);
    
    const { 
      syncMissedEmails = true, 
      syncDays = 7,
      autoSync = true 
    } = options;
    
    // Verificar si el usuario tiene configuración de email
    const emailConfig = await getEmailConfigInternal(companySlug, userId);
    
    if (!emailConfig?.smtpConfig) {
      console.log(`ℹ️ Usuario ${userId} no tiene configuración de email`);
      return {
        success: true,
        enabled: false,
        message: 'No email configuration found'
      };
    }

    console.log(`✅ Configuración de email encontrada para usuario: ${userId}`);

    // PASO 1: Sincronizar emails perdidos si está habilitado
    if (syncMissedEmails && autoSync) {
      console.log(`🔄 Sincronizando emails perdidos (últimos ${syncDays} días)...`);
      
      try {
        await syncMissedEmailsForUser(companySlug, userId, syncDays);
        console.log(`✅ Sincronización de emails perdidos completada`);
      } catch (syncError) {
        console.warn(`⚠️ Error en sincronización automática:`, syncError);
        // No fallar el login por esto
      }
    }
    
    // PASO 2: Registrar usuario para auto-monitoreo
    const autoStartService = EmailAutoStartService.getInstance();
    await autoStartService.registerAutoMonitoring(companySlug, userId, {
      enableRealTimeNotifications: true,
      maxReconnectAttempts: 3,
      checkInterval: 60000 // 1 minuto
    });
    
    console.log(`🎯 Monitoreo de emails iniciado para usuario: ${userId}`);
    
    return {
      success: true,
      enabled: true,
      message: 'Email monitoring started successfully'
    };

  } catch (error) {
    console.error(`❌ Error iniciando monitoreo para usuario ${userId}:`, error);
    return {
      success: false,
      enabled: false,
      message: 'Failed to start email monitoring',
      error: error.message
    };
  }
}

/**
 * Detener monitoreo de email para un usuario
 * Se llama típicamente en el logout
 */
export async function stopUserEmailMonitoring(
  userId: string, 
  companySlug: string
): Promise<EmailMonitoringResult> {
  try {
    console.log(`🛑 Deteniendo monitoreo de email para usuario: ${userId} en empresa: ${companySlug}`);
    
    const manager = EmailReaderManager.getInstance();
    const autoStartService = EmailAutoStartService.getInstance();
    
    // Detener el monitoreo activo
    await manager.stopMonitoring(companySlug, userId);
    
    // Desregistrar del auto-monitoreo
    await autoStartService.unregisterAutoMonitoring(companySlug, userId);
    
    console.log(`✅ Monitoreo detenido para usuario: ${userId}`);
    
    return {
      success: true,
      enabled: false,
      message: 'Email monitoring stopped successfully'
    };

  } catch (error) {
    console.error(`❌ Error deteniendo monitoreo para usuario ${userId}:`, error);
    return {
      success: false,
      enabled: false,
      message: 'Failed to stop email monitoring',
      error: error.message
    };
  }
}

/**
 * Verificar si un usuario tiene monitoreo activo
 */
export async function getUserEmailMonitoringStatus(
  userId: string, 
  companySlug: string
): Promise<{
  isActive: boolean;
  hasConfig: boolean;
  readerStatus: any;
}> {
  try {
    const manager = EmailReaderManager.getInstance();
    const key = `${companySlug}_${userId}`;
    
    // Verificar si tiene configuración
    const emailConfig = await getEmailConfigInternal(companySlug, userId);
    const hasConfig = !!(emailConfig?.smtpConfig);
    
    // Verificar si el reader está activo
    const allReaders = manager.getAllReaders();
    const readerStatus = allReaders[key] || null;
    const isActive = !!readerStatus;
    
    return {
      isActive,
      hasConfig,
      readerStatus
    };

  } catch (error) {
    console.error(`❌ Error verificando estado de monitoreo para usuario ${userId}:`, error);
    return {
      isActive: false,
      hasConfig: false,
      readerStatus: null
    };
  }
}

/**
 * Sincronizar emails perdidos para un usuario específico
 * Se ejecuta automáticamente al hacer login
 */
async function syncMissedEmailsForUser(
  companySlug: string, 
  userId: string, 
  days: number = 7
): Promise<void> {
  try {
    console.log(`🔄 Sincronizando emails perdidos para ${companySlug}_${userId} (${days} días)`);
    
    // Importar dinámicamente para evitar dependencias circulares
    const { EmailReaderManager } = await import('../services/emailReader.service');
    const { getConnectionByCompanySlug } = await import('../config/connectionManager');
    const { default: getEmailModel } = await import('../models/email.model');
    
    const manager = EmailReaderManager.getInstance();
    const reader = await manager.getReader(companySlug, userId);
    
    if (!reader) {
      console.warn(`⚠️ No se pudo crear reader para sincronización`);
      return;
    }

    // Obtener emails históricos
    const emails = await reader.getHistoricalEmails(days);
    
    if (!emails || emails.length === 0) {
      console.log(`ℹ️ No se encontraron emails para sincronizar`);
      return;
    }

    console.log(`📬 Encontrados ${emails.length} emails para revisar`);

    const connection = await getConnectionByCompanySlug(companySlug);
    const EmailModel = getEmailModel(connection);

    let saved = 0;
    let skipped = 0;

    for (const email of emails) {
      try {
        // Verificar si ya existe
        const existing = await EmailModel.findOne({ 
          messageId: email.messageId,
          direction: 'incoming'
        });
        
        if (existing) {
          skipped++;
          continue;
        }

        // Crear nuevo email
        const newEmail = new EmailModel({
          messageId: email.messageId,
          direction: 'incoming',
          from: email.from,
          to: Array.isArray(email.to) ? email.to.join(', ') : email.to,
          cc: Array.isArray(email.cc) ? email.cc.join(', ') : email.cc || '',
          bcc: Array.isArray(email.bcc) ? email.bcc.join(', ') : email.bcc || '',
          subject: email.subject || 'Sin asunto',
          textContent: email.text || '',
          htmlContent: email.html || '',
          receivedDate: email.date || new Date(),
          sentDate: new Date(),
          attachments: email.attachments?.map(att => ({
            filename: att.filename,
            contentType: att.contentType,
            size: att.size || 0,
            hasContent: false,
            hasPath: !!att.path,
            path: att.path
          })),
          status: 'recibido',
          companySlug: companySlug,
          userId: userId,
          syncedHistorically: true,
          syncedAt: new Date()
        });

        await newEmail.save();
        saved++;

      } catch (emailError) {
        console.error(`❌ Error guardando email perdido:`, emailError);
      }
    }

    console.log(`✅ Sincronización completada: ${saved} guardados, ${skipped} omitidos`);

  } catch (error) {
    console.error(`❌ Error en sincronización de emails perdidos:`, error);
    throw error;
  }
}

/**
 * Sincronización completa automática para usuario
 * Se puede llamar manualmente o programar
 */
export async function performFullUserSync(
  companySlug: string, 
  userId: string, 
  options: {
    monthsBack?: number;
    background?: boolean;
    includeAttachments?: boolean;
  } = {}
): Promise<{
  success: boolean;
  results?: any;
  taskId?: string;
  message: string;
}> {
  try {
    const { 
      monthsBack = 6, 
      background = true, 
      includeAttachments = true 
    } = options;

    console.log(`🔄 Iniciando sincronización completa para ${companySlug}_${userId}`);

    // Importar dinámicamente la función de sincronización completa
    const { processFullEmailSync } = await import('../controllers/email.controller');

    if (background) {
      const taskId = `auto_full_sync_${companySlug}_${userId}_${Date.now()}`;
      
      // Procesar en background
      setImmediate(async () => {
        try {
          await processFullEmailSync(companySlug, userId, {
            monthsBack,
            mailboxes: ['INBOX', 'Sent'],
            includeAttachments,
            maxEmailsPerBatch: 500
          });
          console.log(`✅ Sincronización completa automática finalizada: ${taskId}`);
        } catch (error) {
          console.error(`❌ Error en sincronización completa automática:`, error);
        }
      });

      return {
        success: true,
        taskId,
        message: `Sincronización completa iniciada en background`
      };
    } else {
      // Procesamiento síncrono
      const results = await processFullEmailSync(companySlug, userId, {
        monthsBack,
        mailboxes: ['INBOX', 'Sent'],
        includeAttachments,
        maxEmailsPerBatch: 500
      });

      return {
        success: true,
        results,
        message: 'Sincronización completa finalizada'
      };
    }

  } catch (error) {
    console.error(`❌ Error en sincronización completa automática:`, error);
    return {
      success: false,
      message: `Error: ${error.message}`
    };
  }
}