import dotenv from "dotenv";
import app from "./app";
import { connectDB } from "./config/database";
import { startWhatsappBot } from "./services/whatsapp";

dotenv.config();

const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/clientesdb";

async function main() {
  await connectDB(MONGO_URI);
  startWhatsappBot()
  app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  });
}

main();