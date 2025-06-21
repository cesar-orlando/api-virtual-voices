import dotenv from "dotenv";
import app from "./app";
import http, { get } from 'http';
import { Server } from 'socket.io';
import { connectDB, getAllSessionsFromAllDatabases } from "./config/database";
import { startWhatsappBot } from "./services/whatsapp";
import fs from 'fs';
import path from 'path';

dotenv.config();

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || '';

const server = http.createServer(app);
export const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Crear directorio .wwebjs_auth si no existe
const getAuthDir = () => {
  if (process.env.RENDER) {
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
  await connectDB(MONGO_URI);
  server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  });
  const sessions = await getAllSessionsFromAllDatabases();
  for (const session of sessions) {
    console.log(`Iniciando sesion WhatsApp para ${session.company} - ${session.name}`)
    Promise.resolve(startWhatsappBot(session.name, session.company, session.user_id))
    .catch(err => {
      console.error(`Error iniciando sesión WhatsApp para ${session.company} - ${session.name}`);
    });
  }
}

main();