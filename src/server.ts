import dotenv from "dotenv";
import app from "./app";
import http from 'http';
import { Server } from 'socket.io';
import { connectDB, getAllSessionsFromAllDatabases } from "./config/database";
import { startWhatsappBot } from "./services/whatsapp";
import { getEnvironmentConfig } from "./config/environments";
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
      console.log(`Iniciando sesión WhatsApp para ${session.company} - ${session.name}`);
      Promise.resolve(startWhatsappBot(session.name, session.company, session.user_id))
        .catch(err => {
          console.error(`Error iniciando sesión WhatsApp para ${session.company} - ${session.name}:`, err);
        });
    }
    
    // Log de memoria cada 30 segundos para monitoreo en producción
    setInterval(() => {
      const used = process.memoryUsage();
      console.log(`[MEMORY] RSS: ${(used.rss / 1024 / 1024).toFixed(2)} MB, Heap: ${(used.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    }, 30000);
    
  } catch (error) {
    console.error('❌ Error starting server:', error);
    process.exit(1);
  }
}

main();