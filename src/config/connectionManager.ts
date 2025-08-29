import mongoose, { Connection } from "mongoose";
import { getEnvironmentConfig } from "./environments";

const connections: Record<string, Connection> = {};

// Opciones de conexión mejoradas para MongoDB Atlas
const getConnectionOptions = () => ({
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
  // Opciones adicionales para estabilidad
  heartbeatFrequencyMS: 10000,
  maxIdleTimeMS: 60000,
});

export async function getDbConnection(dbName: string): Promise<Connection> {
  // Verificar si ya existe una conexión activa
  if (connections[dbName] && connections[dbName].readyState === 1) {
    return connections[dbName];
  }

  // Si existe una conexión pero no está activa, limpiarla
  if (connections[dbName]) {
    try {
      await connections[dbName].close();
    } catch (error) {
      console.warn(`⚠️ Error closing old connection for ${dbName}:`, error);
    }
    delete connections[dbName];
  }

  const config = getEnvironmentConfig();
  const uriBase = config.mongoUri.split("/")[0] + "//" + config.mongoUri.split("/")[2];

  const uri = `${uriBase}/${dbName}`;
  
  try {
    const conn = await mongoose.createConnection(uri, getConnectionOptions()).asPromise();
    connections[dbName] = conn;
    
    // Manejar eventos de conexión
    conn.on('error', async (error) => {
      // No eliminar la conexión inmediatamente, intentar reconectar
      delete connections[dbName];
      
      // Intentar reconectar después de 5 segundos
      setTimeout(async () => {
        try {
          await getDbConnection(dbName);
        } catch (reconnectError) {
          console.error(`❌ Failed to reconnect to ${dbName}:`, reconnectError);
        }
      }, 5000);
    });
    
    conn.on('disconnected', async () => {
      console.warn(`⚠️ Database disconnected for ${dbName}`);
      // No eliminar inmediatamente, intentar reconectar
      delete connections[dbName];
      
      // Intentar reconectar después de 3 segundos
      setTimeout(async () => {
        try {
          await getDbConnection(dbName);
        } catch (reconnectError) {
          console.error(`❌ Failed to reconnect to ${dbName} after disconnect:`, reconnectError);
        }
      }, 3000);
    });
    
    conn.on('reconnected', () => {
    });
    
    conn.on('close', () => {
      delete connections[dbName];
    });
    
    return conn;
  } catch (error) {
    console.error(`❌ Error creating connection for ${dbName}:`, error);
    throw error;
  }
}

// Nueva función específica para Quick Learning Enterprise
export async function getQuickLearningConnection(): Promise<Connection> {
  const connectionKey = 'quicklearning_enterprise';
  
  // Verificar si ya existe una conexión activa
  if (connections[connectionKey] && connections[connectionKey].readyState === 1) {
    return connections[connectionKey];
  }

  // Si existe una conexión pero no está activa, limpiarla
  if (connections[connectionKey]) {
    try {
      await connections[connectionKey].close();
    } catch (error) {
      console.warn(`⚠️ Error closing old QuickLearning connection:`, error);
    }
    delete connections[connectionKey];
  }

  const quicklearningUri = process.env.MONGO_URI_QUICKLEARNING;
  if (!quicklearningUri) {
    throw new Error('MONGO_URI_QUICKLEARNING not configured');
  }

  try {
    const conn = await mongoose.createConnection(quicklearningUri, getConnectionOptions()).asPromise();
    connections[connectionKey] = conn;
    
    // Manejar eventos de conexión
    conn.on('error', async (error) => {
      console.error('❌ QuickLearning database connection error:', error);
      delete connections[connectionKey];
      
      // Intentar reconectar después de 5 segundos
      setTimeout(async () => {
        try {
          await getQuickLearningConnection();
        } catch (reconnectError) {
          console.error(`❌ Failed to reconnect to QuickLearning:`, reconnectError);
        }
      }, 5000);
    });
    
    conn.on('disconnected', async () => {
      delete connections[connectionKey];
      
      // Intentar reconectar después de 3 segundos
      setTimeout(async () => {
        try {
          await getQuickLearningConnection();
        } catch (reconnectError) {
        }
      }, 3000);
    });
    
    conn.on('reconnected', () => {
    });
    
    conn.on('close', () => {
      delete connections[connectionKey];
    });
    
    return conn;
  } catch (error) {
    console.error('❌ Error creating QuickLearning connection:', error);
    throw error;
  }
}

// Función principal para obtener conexión por empresa
export async function getConnectionByCompanySlug(companySlug?: string): Promise<Connection> {
  // Si es Quick Learning, usar su base de datos enterprise externa
  if (companySlug === "quicklearning") {
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

// Función para limpiar conexiones inactivas
export function cleanupInactiveConnections(): void {
  const beforeCount = Object.keys(connections).length;
  
  Object.keys(connections).forEach(key => {
    const conn = connections[key];
    if (conn.readyState !== 1) { // Not connected
      console.log(`🧹 Cleaning up inactive connection: ${key}`);
      delete connections[key];
    }
  });
  
  const afterCount = Object.keys(connections).length;
  if (beforeCount !== afterCount) {
    console.log(`🧹 Cleaned up ${beforeCount - afterCount} inactive connections`);
  }
}

// Función para ejecutar operaciones de base de datos con reconexión automática
export async function executeWithReconnection<T>(
  dbName: string,
  operation: (connection: Connection) => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const connection = await getDbConnection(dbName);
      
      // Verificar que la conexión esté activa
      if (connection.readyState !== 1) {
        throw new Error(`Connection to ${dbName} is not ready. State: ${connection.readyState}`);
      }
      
      // Ejecutar la operación
      const result = await operation(connection);
      return result;
      
    } catch (error) {
      lastError = error as Error;
      console.warn(`⚠️ Attempt ${attempt}/${maxRetries} failed for ${dbName}:`, error);
      
      if (attempt < maxRetries) {
        // Esperar antes del siguiente intento (tiempo exponencial)
        const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        // Limpiar la conexión fallida para forzar una nueva
        if (connections[dbName]) {
          try {
            await connections[dbName].close();
          } catch (closeError) {
            console.warn(`⚠️ Error closing failed connection:`, closeError);
          }
          delete connections[dbName];
        }
      }
    }
  }
  
  throw new Error(`Failed to execute operation on ${dbName} after ${maxRetries} attempts. Last error: ${lastError?.message}`);
}

// Función específica para QuickLearning con reconexión automática
export async function executeQuickLearningWithReconnection<T>(
  operation: (connection: Connection) => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const connection = await getQuickLearningConnection();
      
      // Verificar que la conexión esté activa
      if (connection.readyState !== 1) {
        throw new Error(`QuickLearning connection is not ready. State: ${connection.readyState}`);
      }
      
      // Ejecutar la operación
      const result = await operation(connection);
      return result;
      
    } catch (error) {
      lastError = error as Error;
      console.warn(`⚠️ QuickLearning attempt ${attempt}/${maxRetries} failed:`, error);
      
      if (attempt < maxRetries) {
        // Esperar antes del siguiente intento
        const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.log(`⏳ Waiting ${waitTime}ms before QuickLearning retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        // Limpiar la conexión fallida
        const connectionKey = 'quicklearning_enterprise';
        if (connections[connectionKey]) {
          try {
            await connections[connectionKey].close();
          } catch (closeError) {
            console.warn(`⚠️ Error closing failed QuickLearning connection:`, closeError);
          }
          delete connections[connectionKey];
        }
      }
    }
  }
  
  throw new Error(`Failed to execute QuickLearning operation after ${maxRetries} attempts. Last error: ${lastError?.message}`);
}