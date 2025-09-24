import { EmailReaderManager } from './emailReader.service';
import { getConnectionByCompanySlug, getActiveConnections } from '../config/connectionManager';
import getEmailMonitoringModel from '../models/emailMonitoring.model';

/**
 * 🚀 AUTO-START EMAIL MONITORING SERVICE
 * 
 * Este servicio automáticamente:
 * - Inicia monitoreo al arrancar el servidor
 * - Persiste configuraciones en BD
 * - Se reconecta automáticamente
 * - Mantiene estado de todas las empresas
 */

export class EmailAutoStartService {
  private static instance: EmailAutoStartService;
  private isInitialized: boolean = false;
  private monitoringConfigs: Map<string, any> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  static getInstance(): EmailAutoStartService {
    if (!EmailAutoStartService.instance) {
      EmailAutoStartService.instance = new EmailAutoStartService();
    }
    return EmailAutoStartService.instance;
  }

  /**
   * Inicializar el servicio automático al arrancar el servidor
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('📧 EmailAutoStartService ya está inicializado');
      return;
    }

    console.log('🚀 Iniciando EmailAutoStartService...');

    try {
      // Cargar todas las configuraciones de monitoreo activas
      await this.loadActiveMonitoringConfigs();
      
      // Iniciar monitoreos automáticos
      await this.startAllAutoMonitoring();
      
      // Configurar health check periódico
      this.setupHealthCheck();
      
      this.isInitialized = true;
      console.log('✅ EmailAutoStartService inicializado correctamente');
      
    } catch (error) {
      console.error('❌ Error inicializando EmailAutoStartService:', error);
      throw error;
    }
  }

  /**
   * Cargar configuraciones de monitoreo desde todas las bases de datos
   */
  private async loadActiveMonitoringConfigs(): Promise<void> {
    console.log('📋 Cargando configuraciones de monitoreo...');
    
    try {
      // Obtener lista de empresas (esto depende de tu implementación)
      // Por ahora, vamos a usar una estrategia de discovery
      const companies = await this.discoverCompanies();
      
      for (const companySlug of companies) {
        try {
          const connection = await getConnectionByCompanySlug(companySlug);
          const EmailMonitoringModel = getEmailMonitoringModel(connection);
          
          const activeConfigs = await EmailMonitoringModel.find({
            isActive: true,
            autoStart: true
          });

          for (const config of activeConfigs) {
            const key = `${config.companySlug}_${config.userId}`;
            this.monitoringConfigs.set(key, {
              companySlug: config.companySlug,
              userId: config.userId,
              settings: config.settings,
              lastConnected: config.lastConnected,
              reconnectAttempts: config.reconnectAttempts || 0
            });

            console.log(`📧 Configuración cargada: ${key}`);
          }
          
        } catch (error) {
          console.error(`❌ Error cargando configuraciones para ${companySlug}:`, error);
        }
      }
      
      console.log(`📊 Total configuraciones cargadas: ${this.monitoringConfigs.size}`);
      
    } catch (error) {
      console.error('❌ Error cargando configuraciones de monitoreo:', error);
    }
  }

  /**
   * Descubrir empresas disponibles
   */
  private async discoverCompanies(): Promise<string[]> {
    try {
      // Opción 1: Usar conexiones activas del connection manager
      const activeConnections = getActiveConnections();
      
      // Filtrar solo conexiones que parecen ser de empresas (no quicklearning, etc.)
      const companyConnections = activeConnections.filter(conn => 
        !conn.includes('quicklearning') && 
        !conn.includes('admin') && 
        !conn.includes('system')
      );

      console.log(`🔍 Empresas descubiertas: ${companyConnections.join(', ')}`);
      
      return companyConnections;
      
    } catch (error) {
      console.error('❌ Error descubriendo empresas:', error);
      
      // Fallback: lista manual que puedes configurar
      const manualCompanies = process.env.EMAIL_MONITORING_COMPANIES?.split(',') || [];
      
      if (manualCompanies.length > 0) {
        console.log(`📋 Usando lista manual de empresas: ${manualCompanies.join(', ')}`);
        return manualCompanies.map(c => c.trim());
      }
      
      return [];
    }
  }

  /**
   * Iniciar todos los monitoreos automáticos
   */
  private async startAllAutoMonitoring(): Promise<void> {
    console.log('🎯 Iniciando monitoreos automáticos...');
    
    const manager = EmailReaderManager.getInstance();
    let started = 0;
    let errors = 0;

    for (const [key, config] of this.monitoringConfigs) {
      try {
        console.log(`🚀 Iniciando monitoreo: ${key}`);
        
        const reader = await manager.startMonitoring(config.companySlug, config.userId);
        
        // Configurar eventos para este reader
        this.setupReaderEvents(reader, config);
        
        // Actualizar estado en BD
        await this.updateMonitoringStatus(config.companySlug, config.userId, {
          lastConnected: new Date(),
          lastError: null,
          reconnectAttempts: 0
        });
        
        started++;
        console.log(`✅ Monitoreo iniciado: ${key}`);
        
      } catch (error) {
        console.error(`❌ Error iniciando monitoreo ${key}:`, error);
        
        // Actualizar error en BD
        await this.updateMonitoringStatus(config.companySlug, config.userId, {
          lastError: error.message,
          reconnectAttempts: (config.reconnectAttempts || 0) + 1
        });
        
        errors++;
      }
    }
    
    console.log(`📊 Monitoreos iniciados: ${started} exitosos, ${errors} errores`);
  }

  /**
   * Configurar eventos para un reader específico
   */
  private setupReaderEvents(reader: any, config: any): void {
    const key = `${config.companySlug}_${config.userId}`;
    
    reader.on('newEmail', async (email: any) => {
      console.log(`📬 [${key}] Nuevo email: "${email.subject}" de ${email.from}`);
      
      // Aquí puedes agregar lógica adicional:
      // - Notificaciones WebSocket
      // - Logging especial
      // - Procesamiento automático
    });

    reader.on('monitoringStarted', () => {
      console.log(`✅ [${key}] Monitoreo iniciado correctamente`);
    });

    reader.on('maxReconnectAttemptsReached', async () => {
      console.error(`❌ [${key}] Máximos intentos de reconexión alcanzados`);
      
      // Marcar como inactivo temporalmente
      await this.updateMonitoringStatus(config.companySlug, config.userId, {
        isActive: false,
        lastError: 'Max reconnect attempts reached'
      });
    });
  }

  /**
   * Configurar health check periódico
   */
  private setupHealthCheck(): void {
    // Health check cada 5 minutos
    this.healthCheckInterval = setInterval(async () => {
      console.log('🏥 Ejecutando health check de email monitoring...');
      await this.performHealthCheck();
    }, 5 * 60 * 1000);

    console.log('🏥 Health check configurado (cada 5 minutos)');
  }

  /**
   * Realizar verificación de salud de todos los monitoreos
   */
  private async performHealthCheck(): Promise<void> {
    const manager = EmailReaderManager.getInstance();
    const allReaders = manager.getAllReaders();
    
    let healthy = 0;
    let unhealthy = 0;

    for (const [key, config] of this.monitoringConfigs) {
      const readerStatus = allReaders[key];
      
      if (readerStatus && readerStatus.isConnected && readerStatus.isMonitoring) {
        healthy++;
      } else {
        unhealthy++;
        console.warn(`⚠️ Monitoreo no saludable: ${key}`);
        
        // Intentar reiniciar automáticamente
        try {
          console.log(`🔄 Intentando reiniciar monitoreo: ${key}`);
          await manager.startMonitoring(config.companySlug, config.userId);
          console.log(`✅ Monitoreo reiniciado: ${key}`);
        } catch (error) {
          console.error(`❌ Error reiniciando monitoreo ${key}:`, error);
        }
      }
    }

    console.log(`🏥 Health check completado: ${healthy} saludables, ${unhealthy} problemáticos`);
  }

  /**
   * Actualizar estado de monitoreo en BD
   */
  private async updateMonitoringStatus(companySlug: string, userId: string, updates: any): Promise<void> {
    try {
      const connection = await getConnectionByCompanySlug(companySlug);
      const EmailMonitoringModel = getEmailMonitoringModel(connection);
      
      await EmailMonitoringModel.updateOne(
        { companySlug, userId },
        { $set: updates }
      );
    } catch (error) {
      console.error(`❌ Error actualizando estado de monitoreo:`, error);
    }
  }

  /**
   * Registrar nueva configuración de monitoreo automático
   */
  async registerAutoMonitoring(companySlug: string, userId: string, settings?: any): Promise<void> {
    try {
      const connection = await getConnectionByCompanySlug(companySlug);
      const EmailMonitoringModel = getEmailMonitoringModel(connection);
      
      // Crear o actualizar configuración
      await EmailMonitoringModel.updateOne(
        { companySlug, userId },
        {
          $set: {
            isActive: true,
            autoStart: true,
            settings: settings || {},
            lastConnected: new Date()
          }
        },
        { upsert: true }
      );

      // Agregar a cache local
      const key = `${companySlug}_${userId}`;
      this.monitoringConfigs.set(key, {
        companySlug,
        userId,
        settings: settings || {},
        lastConnected: new Date(),
        reconnectAttempts: 0
      });

      // Si el servicio ya está inicializado, iniciar monitoreo inmediatamente
      if (this.isInitialized) {
        const manager = EmailReaderManager.getInstance();
        await manager.startMonitoring(companySlug, userId);
        console.log(`✅ Monitoreo automático registrado e iniciado: ${key}`);
      }

    } catch (error) {
      console.error('❌ Error registrando monitoreo automático:', error);
      throw error;
    }
  }

  /**
   * Desregistrar monitoreo automático
   */
  async unregisterAutoMonitoring(companySlug: string, userId: string): Promise<void> {
    try {
      const connection = await getConnectionByCompanySlug(companySlug);
      const EmailMonitoringModel = getEmailMonitoringModel(connection);
      
      // Marcar como inactivo en BD
      await EmailMonitoringModel.updateOne(
        { companySlug, userId },
        {
          $set: {
            isActive: false,
            autoStart: false
          }
        }
      );

      // Remover de cache local
      const key = `${companySlug}_${userId}`;
      this.monitoringConfigs.delete(key);

      // Detener monitoreo activo
      if (this.isInitialized) {
        const manager = EmailReaderManager.getInstance();
        await manager.stopMonitoring(companySlug, userId);
        console.log(`🛑 Monitoreo automático desregistrado: ${key}`);
      }

    } catch (error) {
      console.error('❌ Error desregistrando monitoreo automático:', error);
      throw error;
    }
  }

  /**
   * Obtener estado de todos los monitoreos
   */
  getStatus(): any {
    const manager = EmailReaderManager.getInstance();
    const allReaders = manager.getAllReaders();
    
    return {
      isInitialized: this.isInitialized,
      totalConfigs: this.monitoringConfigs.size,
      activeReaders: Object.keys(allReaders).length,
      configs: Array.from(this.monitoringConfigs.entries()).map(([key, config]) => ({
        key,
        ...config,
        readerStatus: allReaders[key] || null
      }))
    };
  }

  /**
   * Auto-descubrir y registrar usuarios con configuración de email
   */
  async autoDiscoverEmailUsers(): Promise<void> {
    console.log('🔍 Auto-descubriendo usuarios con configuración de email...');
    
    try {
      const companies = await this.discoverCompanies();
      let registered = 0;
      
      for (const companySlug of companies) {
        try {
          // Importar aquí para evitar dependencias circulares
          const { getEmailConfigInternal } = await import('../core/users/user.controller');
          
          // Por simplicidad, usar un userId genérico para pruebas
          // En producción, necesitarías iterar sobre usuarios reales
          const testUserIds = [
            'user1', 'admin', 'administrator', 'email-user',
            // Agregar IDs de usuarios conocidos que tengan configuración de email
          ];
          
          for (const userId of testUserIds) {
            try {
              const emailConfig = await getEmailConfigInternal(companySlug, userId);
              
              if (emailConfig?.smtpConfig) {
                console.log(`✅ Configuración de email encontrada: ${companySlug} / ${userId}`);
                
                await this.registerAutoMonitoring(companySlug, userId, {
                  enableRealTimeNotifications: true,
                  maxReconnectAttempts: 3,
                  checkInterval: 60000 // 1 minuto
                });
                
                registered++;
                console.log(`📧 Auto-registrado para monitoreo: ${companySlug}_${userId}`);
              }
            } catch (error) {
              // Usuario no tiene configuración, continuar silenciosamente
            }
          }
        } catch (error) {
          console.error(`❌ Error auto-descubriendo en ${companySlug}:`, error);
        }
      }
      
      if (registered > 0) {
        console.log(`✅ Auto-registro completado: ${registered} usuarios registrados`);
      } else {
        console.log('ℹ️ No se encontraron usuarios con configuración de email para auto-registro');
      }
      
    } catch (error) {
      console.error('❌ Error en auto-descubrimiento de usuarios:', error);
    }
  }

  /**
   * Cleanup al cerrar la aplicación
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Cerrando EmailAutoStartService...');
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    const manager = EmailReaderManager.getInstance();
    await manager.stopAllMonitoring();
    
    this.isInitialized = false;
    console.log('✅ EmailAutoStartService cerrado correctamente');
  }
}

export default EmailAutoStartService;