import mongoose from "mongoose";
import { getDbConnection } from "../config/connectionManager";
import {getSessionModel} from "../models/whatsappSession.model";

export async function connectDB(uri: string) {
  try {
    await mongoose.connect(uri);
    console.log("✅ Connected to MongoDB");
    
  } catch (error) {
    console.error("❌ Error connecting to MongoDB:", error);
    process.exit(1);
  }
}

export async function getAllSessionsFromAllDatabases() {
  // Usa el driver nativo para listar las bases de datos
  if (!mongoose.connection.db) {
    throw new Error("MongoDB connection is not established.");
  }
  const admin = mongoose.connection.db.admin();
  const dbs = await admin.listDatabases();
  const uriBase = process.env.MONGO_URI?.split("/")[0] + "//" + process.env.MONGO_URI?.split("/")[2];

  const allSessions = [];

  for (const dbInfo of dbs.databases) {
    const dbName = dbInfo.name;
    // Filtra solo las bases de datos de empresas (para no incluir admin o local)
    if (dbName === "admin" || dbName === "local") continue;

    const conn = await getDbConnection(dbName, uriBase || "mongodb://localhost:27017");
    const Session = getSessionModel(conn);
    const sessions = await Session.find();
    allSessions.push(...sessions.map(session => ({
      name: session.name,
      company: dbName,
    })));
  }

  return allSessions;
}