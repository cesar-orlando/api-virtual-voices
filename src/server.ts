import dotenv from "dotenv";
import app from "./app";
import http from 'http';
import { Server } from 'socket.io';
import { connectDB, getAllFacebookConfigsFromAllDatabases, getAllSessionsFromAllDatabases, getAllDbNames } from "./config/database";
import { startWhatsappBot } from "./services/whatsapp";
import { getEnvironmentConfig } from "./config/environments";
import { cleanupInactiveConnections, getConnectionByCompanySlug } from "./config/connectionManager";
import { startAttachmentCleanupScheduler } from "./controllers/email.controller";
import { CompanySummaryService } from "./services/internal/companySummaryService";
import { MessageSchedulerService } from "./services/internal/messageSchedulerService";
import { startBotReactivationScheduler } from './services/internal/botReactivation.scheduler';
import EmailAutoStartService from "./services/emailAutoStart.service";
import fs from 'fs';
import path from 'path';
import { loadRecentFacebookMessages } from './services/meta/messenger';

process.setMaxListeners(20);

dotenv.config();

// Obtener configuración del entorno
const config = getEnvironmentConfig();

const server = http.createServer(app);
export const io = new Server(server, {
  cors: {
    origin: "*",
    // origin: config.corsOrigin,
    methods: ["GET", "POST"]
  }
});

// Hacer io disponible globalmente para las notificaciones
(global as any).io = io;

// Manejar eventos de Socket.IO
io.on('connection', (socket) => {
  
  // Enviar información de estado al cliente
  socket.emit('server_status', {
    status: 'connected',
    timestamp: new Date().toISOString(),
    features: {
      realTimeNotifications: true,
      typingIndicators: true,
      messageReadReceipts: true
    }
  });
  
  // Manejar desconexión
  socket.on('disconnect', (reason) => {
    // console.log(`🔌 Cliente desconectado: ${socket.id} - Razón: ${reason}`);
  });
  
  // Manejar errores de socket
  socket.on('error', (error) => {
    console.error(`❌ Error en socket ${socket.id}:`, error);
  });
});

// Manejar errores del servidor Socket.IO
io.engine.on('connection_error', (err) => {
  console.error('❌ Error de conexión Socket.IO:', err);
});

// Crear directorio .wwebjs_auth si no existe
const getAuthDir = () => {
  if (process.env.RENDER === 'true') {
    return '/var/data/.wwebjs_auth';
  }
  return path.join(process.cwd(), '.wwebjs_auth');
};

const authDir = getAuthDir();
if (!fs.existsSync(authDir)) {
  fs.mkdirSync(authDir, { recursive: true });
  console.log(`✅ Directorio de autenticación creado en: ${authDir}`);
}

/**
 * Initialize message schedulers for all companies
 */
async function initializeMessageSchedulers(): Promise<void> {
  try {
    const companies = await getAllDbNames();
    console.log(`📅 Starting message schedulers for ${companies.length} companies...`);
    
    for (const companyName of companies) {
      try {
        const scheduler = new MessageSchedulerService(companyName);
        scheduler.start();
      } catch (error) {
        console.error(`❌ Error starting message scheduler for ${companyName}:`, error);
      }
    }
    
    console.log(`✅ Message schedulers initialization completed`);
  } catch (error) {
    console.error('❌ Error initializing message schedulers:', error);
  }
}

async function main() {
  try {
    // Importar cluster para verificar si es el primer worker
    const cluster = require('cluster');
    
    // ✅ FIX: Ejecutar servicios pesados si:
    // 1. No hay cluster mode (cluster.isPrimary === true) - mod into normal
    // 2. O estamos en cluster mode PERO es el worker #1
    // Esto asegura que siempre haya servicios corriendo, con o sin cluster
    const shouldInitServices = cluster.isPrimary || cluster.worker?.id === 1;
    
    // Conectar a la base de datos usando la configuración del entorno
    await connectDB();
    
    // Iniciar servidor (todos los workers necesitan el servidor HTTP)
    server.listen(config.port, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${config.port}`);
      console.log(`🌍 Entorno: ${config.name.toUpperCase()}`);
      if (cluster.worker) {
        console.log(`👷 Worker ${cluster.worker.id} listo para recibir peticiones`);
      }
    });

    // ✅ SOLO el worker #1 ejecuta servicios pesados para evitar duplicación
    if (shouldInitServices) {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🎯 INICIANDO SERVICIOS PESADOS EN WORKER ${cluster.worker?.id}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      // Iniciar scheduler de limpieza de attachments
      startAttachmentCleanupScheduler();
      
      // 🏢 Iniciar actualizaciones automáticas de resúmenes empresariales cada 6 horas
      CompanySummaryService.scheduleAutomaticUpdates();
      console.log('📊 Company summary automatic updates enabled (every 6 hours)');
      
      // 📧 Inicializar servicio de auto-monitoreo de emails
      console.log('📧 Inicializando servicio de auto-monitoreo de emails...');
      try {
        //const emailAutoStartService = EmailAutoStartService.getInstance();
        //await emailAutoStartService.initialize();
        console.log('✅ Servicio de auto-monitoreo de emails inicializado (activación por login)');
      } catch (emailError) {
        console.error('⚠️ Error inicializando auto-monitoreo de emails (continuando sin él):', emailError);
      }

      // ✅ Start bot auto-reactivation scheduler
      if (process.env.BOT_REACTIVATION_ENABLED !== 'false') {
        try {
          startBotReactivationScheduler();
          console.log('✅ Bot auto-reactivation scheduler started');
        } catch (error) {
          console.error('❌ Error starting bot reactivation scheduler:', error);
        }
      }

      const fbConfigs = await getAllFacebookConfigsFromAllDatabases();

      for (const config of fbConfigs) {
        loadRecentFacebookMessages(config, 10);
      }
      
      // Iniciar sesiones de WhatsApp
      const sessions = await getAllSessionsFromAllDatabases();
      console.log(`📱 Iniciando ${sessions.length} sesiones de WhatsApp...`);
      
      const whatsappPromises = [];
      for (const session of sessions) {
        const promise = startWhatsappBot(session.name, session.company, session.user_id)
          .catch(err => {
            console.error(`Error iniciando sesión WhatsApp para ${session.company} - ${session.name}:`, err);
            return { success: false, company: session.company, session: session.name };
          });
        whatsappPromises.push(promise);
      }
      
      // Wait for all WhatsApp sessions to finish initialization (success or failure)
      await Promise.allSettled(whatsappPromises);
      
      // 📅 Now initialize message schedulers after WhatsApp clients are ready
      //await initializeMessageSchedulers();
      
      // Monitoreo periódico de conexiones (cada 5 minutos)
      setInterval(() => {
        cleanupInactiveConnections();
      }, 5 * 60 * 1000);
      
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎉 SERVER FULLY INITIALIZED AND READY');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    } else {
      console.log('✅ Worker listo - Solo maneja peticiones HTTP');
    }
    
  } catch (error) {
    console.error('❌ Error starting server:', error);
    process.exit(1);
  }
}

main();

// Manejo de cierre limpio del servidor
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM recibido, cerrando servidor de forma limpia...');
  await shutdown();
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT recibido, cerrando servidor de forma limpia...');
  await shutdown();
});

async function shutdown() {
  try {
    console.log('🔄 Iniciando proceso de cierre...');
    
    // Cerrar auto-monitoreo de emails
    try {
      const emailAutoStartService = EmailAutoStartService.getInstance();
      await emailAutoStartService.shutdown();
      console.log('✅ Auto-monitoreo de emails cerrado');
    } catch (error) {
      console.error('❌ Error cerrando auto-monitoreo de emails:', error);
    }
    
    // Cerrar servidor HTTP
    server.close(() => {
      console.log('✅ Servidor HTTP cerrado');
      process.exit(0);
    });
    
    // Forzar cierre después de 10 segundos
    setTimeout(() => {
      console.log('⏰ Forzando cierre después de timeout');
      process.exit(1);
    }, 10000);
    
  } catch (error) {
    console.error('❌ Error durante el cierre:', error);
    process.exit(1);
  }
}