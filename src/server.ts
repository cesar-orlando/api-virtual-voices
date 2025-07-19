import dotenv from "dotenv";
import app from "./app";
import http from 'http';
import { Server } from 'socket.io';
import { connectDB, getAllSessionsFromAllDatabases } from "./config/database";
import { startWhatsappBot } from "./services/whatsapp";
import { getEnvironmentConfig } from "./config/environments";
import { cleanupInactiveConnections } from "./config/connectionManager";
import fs from 'fs';
import path from 'path';

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

// Crear directorio .wwebjs_auth si no existe
const getAuthDir = () => {
  if (process.env.RENDER === 'true') {
    return '/opt/render/project/src/.wwebjs_auth';
  }
  return path.join(process.cwd(), '.wwebjs_auth');
};

const authDir = getAuthDir();
if (!fs.existsSync(authDir)) {
  fs.mkdirSync(authDir, { recursive: true });
  console.log(`✅ Directorio de autenticación creado en: ${authDir}`);
}

console.log('MONGO_URI_QUICKLEARNING:', process.env.MONGO_URI_QUICKLEARNING);

async function main() {
  try {
    // Conectar a la base de datos usando la configuración del entorno
    await connectDB();
    
    // Iniciar servidor
    server.listen(config.port, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${config.port}`);
      console.log(`🌍 Entorno: ${config.name.toUpperCase()}`);
    });
    
    // Iniciar sesiones de WhatsApp
    const sessions = await getAllSessionsFromAllDatabases();
    console.log(`📱 Iniciando ${sessions.length} sesiones de WhatsApp...`);
    
    for (const session of sessions) {
      startWhatsappBot(session.name, session.company, session.user_id)
        .catch(err => {
          console.error(`Error iniciando sesión WhatsApp para ${session.company} - ${session.name}:`, err);
        });
    }
    
    // Monitoreo periódico de conexiones (cada 5 minutos)
    setInterval(() => {
      cleanupInactiveConnections();
    }, 5 * 60 * 1000);
    
    
  } catch (error) {
    console.error('❌ Error starting server:', error);
    process.exit(1);
  }
}

main();