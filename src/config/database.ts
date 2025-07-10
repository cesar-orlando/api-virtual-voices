import mongoose from "mongoose";
import { getDbConnection, getBaseMongoUri } from "../config/connectionManager";
import { getSessionModel } from "../models/whatsappSession.model";
import { getEnvironmentConfig, logEnvironmentInfo, validateEnvironmentConfig } from "./environments";

export async function connectDB() {
  try {
    const config = getEnvironmentConfig();
    
    // Mostrar información del entorno
    logEnvironmentInfo(config);
    
    // Validar configuración
    validateEnvironmentConfig(config);
    
    // Opciones de conexión mejoradas para MongoDB Atlas
    const connectionOptions = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: false,
      ssl: true,
      tls: true,
      tlsAllowInvalidCertificates: false,
      tlsAllowInvalidHostnames: false,
      retryWrites: true,
      w: 'majority' as const,
      heartbeatFrequencyMS: 10000,
      maxIdleTimeMS: 30000,
    };
    
    // Conectar a la base de datos principal
    await mongoose.connect(config.mongoUri, connectionOptions);
    console.log("✅ Connected to MongoDB");
    console.log(`🗄️  Database: ${config.mongoUri}`);
    console.log(`🌍 Environment: ${config.name.toUpperCase()}`);
    
    // Manejar eventos de conexión
    mongoose.connection.on('error', (error) => {
      console.error('❌ MongoDB connection error:', error);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected');
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });
    
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

// Función para obtener información de la base de datos actual
export function getDatabaseInfo() {
  const config = getEnvironmentConfig();
  return {
    environment: config.name,
    mongoUri: config.mongoUri.replace(/\/\/.*@/, '//***:***@'),
    nodeEnv: config.nodeEnv,
    port: config.port
  };
}