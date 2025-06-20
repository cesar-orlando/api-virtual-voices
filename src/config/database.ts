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
  if (!mongoose.connection.db) {
    throw new Error("MongoDB connection is not established.");
  }
  const admin = mongoose.connection.db.admin();
  const dbs = await admin.listDatabases();

  // Filtra solo las bases de datos de empresas (para no incluir admin o local)
  const companyDbs = dbs.databases.filter(
    dbInfo => dbInfo.name !== "admin" && dbInfo.name !== "local"
  );

  // Ejecuta las consultas en paralelo
  const allSessionsArrays = await Promise.all(
    companyDbs.map(async (dbInfo) => {
      const dbName = dbInfo.name;
      try {
        const conn = await getDbConnection(dbName);
        const Session = getSessionModel(conn);
        const sessions = await Session.find();
        return sessions.map(session => ({
          name: session.name,
          company: dbName,
          user_id: session.user.id,
        }));
      } catch (err) {
        console.error(`Error fetching sessions from ${dbName}:`, err);
        return [];
      }
    })
  );

  // Aplana el array de arrays
  return allSessionsArrays.flat();
}