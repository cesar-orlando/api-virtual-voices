import mongoose, { Connection } from "mongoose";
import { getEnvironmentConfig } from "./environments";

const connections: Record<string, Connection> = {};

export async function getDbConnection(dbName: string): Promise<Connection> {
  // Usar base de datos normal para otras empresas
  if (connections[dbName]) return connections[dbName];

  const config = getEnvironmentConfig();
  const uriBase = config.mongoUri.split("/")[0] + "//" + config.mongoUri.split("/")[2];

  const uri = `${uriBase}/${dbName}`;
  const conn = await mongoose.createConnection(uri).asPromise();

  connections[dbName] = conn;
  return conn;
}

// Nueva función específica para Quick Learning Enterprise
export async function getQuickLearningConnection(): Promise<Connection> {
  const connectionKey = 'quicklearning_enterprise';
  
  if (connections[connectionKey]) {
    return connections[connectionKey];
  }

  const quicklearningUri = process.env.MONGO_URI_QUICKLEARNING;
  if (!quicklearningUri) {
    throw new Error('MONGO_URI_QUICKLEARNING not configured');
  }

  const conn = await mongoose.createConnection(quicklearningUri).asPromise();
  connections[connectionKey] = conn;
  return conn;
}

// Función principal para obtener conexión por empresa
export async function getConnectionByCompanySlug(companySlug?: string): Promise<Connection> {
  // Si es Quick Learning, usar su base de datos enterprise externa
  if (companySlug === "quicklearning") {
    console.log("entra aqui --->", companySlug);
    return getQuickLearningConnection();
  }
  
  // Para otras empresas, usar base de datos local
  const dbName = companySlug || "test";
  return getDbConnection(dbName);
}

// Función para obtener la URI base del entorno actual
export function getBaseMongoUri(): string {
  const config = getEnvironmentConfig();
  return config.mongoUri;
}

// Función para limpiar todas las conexiones (útil para testing)
export function clearConnections(): void {
  Object.values(connections).forEach(conn => {
    if (conn.readyState === 1) { // Connected
      conn.close();
    }
  });
  Object.keys(connections).forEach(key => {
    delete connections[key];
  });
}

// Función para obtener información de conexiones activas
export function getActiveConnections(): string[] {
  return Object.keys(connections).filter(key => {
    const conn = connections[key];
    return conn.readyState === 1; // Connected
  });
}