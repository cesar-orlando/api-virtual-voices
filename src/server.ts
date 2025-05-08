import dotenv from "dotenv";
import app from "./app";
import { connectDB } from "./config/database";

dotenv.config();

const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/clientesdb";

console.log(MONGO_URI)

async function main() {
  await connectDB(MONGO_URI);
  // 🚀 Iniciar WhatsApp Web Bot
  // startWhatsappBot();
  app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  });
}

main();
