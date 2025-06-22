import mongoose, { Connection } from "mongoose";
import { getEnvironmentConfig } from "./environments";

const connections: Record<string, Connection> = {};

export async function getDbConnection(dbName: string): Promise<Connection> {
  if (connections[dbName]) return connections[dbName];

  const config = getEnvironmentConfig();
  const uriBase = config.mongoUri.split("/")[0] + "//" + config.mongoUri.split("/")[2];

  const uri = `${uriBase}/${dbName}`;
  const conn = await mongoose.createConnection(uri).asPromise();

  connections[dbName] = conn;
  return conn;
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