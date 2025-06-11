import dotenv from "dotenv";
import app from "./app";
import http, { get } from 'http';
import { Server } from 'socket.io';
import { connectDB, getAllSessionsFromAllDatabases } from "./config/database";
import { startWhatsappBot } from "./services/whatsapp";

dotenv.config();

const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/clientesdb";

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } }); // Permite CORS para pruebas

export { io };

async function main() {
  await connectDB(MONGO_URI);
  server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  });
  const sessions = await getAllSessionsFromAllDatabases();
  for (const session of sessions) {
    await startWhatsappBot(session.name, session.company);
    await new Promise(res => setTimeout(res, 2000)); // Espera 2 segundos entre sesiones
  }
}

main();