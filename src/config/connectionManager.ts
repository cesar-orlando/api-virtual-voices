import mongoose, { Connection } from "mongoose";
import { getEnvironmentConfig } from "./environments";

const connections: Record<string, Connection> = {};

// ✅ Sistema de gestión de conexiones optimizado
class ConnectionManager {
  private static instance: ConnectionManager;
  private connectionStats: Map<string, { count: number; lastUsed: number }> = new Map();
  private readonly MAX_CONNECTIONS_PER_COMPANY = 15; // Límite por empresa
  private readonly MAX_TOTAL_CONNECTIONS = 100; // Límite total del sistema
  private readonly CONNECTION_CLEANUP_INTERVAL = 300000; // 5 minutos

  static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  // Verificar si podemos crear una nueva conexión
  canCreateConnection(company: string): boolean {
    const currentStats = this.connectionStats.get(company) || { count: 0, lastUsed: 0 };
    const totalConnections = Array.from(this.connectionStats.values())
      .reduce((sum, stats) => sum + stats.count, 0);
    
    return currentStats.count < this.MAX_CONNECTIONS_PER_COMPANY && 
           totalConnections < this.MAX_TOTAL_CONNECTIONS;
  }

  // Registrar uso de conexión
  registerConnection(company: string): void {
    const currentStats = this.connectionStats.get(company) || { count: 0, lastUsed: 0 };
    this.connectionStats.set(company, {
      count: currentStats.count + 1,
      lastUsed: Date.now()
    });
  }

  // Desregistrar conexión
  unregisterConnection(company: string): void {
    const currentStats = this.connectionStats.get(company);
    if (currentStats && currentStats.count > 0) {
      this.connectionStats.set(company, {
        count: currentStats.count - 1,
        lastUsed: currentStats.lastUsed
      });
    }
  }

  // Obtener estadísticas de conexiones
  getConnectionStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    this.connectionStats.forEach((value, key) => {
      stats[key] = { ...value };
    });
    return stats;
  }

  // Limpiar conexiones inactivas
  cleanupInactiveConnections(): void {
    const now = Date.now();
    const inactiveThreshold = 600000; // 10 minutos

    Object.keys(connections).forEach(key => {
      const conn = connections[key];
      const stats = this.connectionStats.get(key);
      
      if (conn.readyState !== 1 || 
          (stats && (now - stats.lastUsed) > inactiveThreshold)) {
        console.log(`🧹 Cleaning up inactive connection: ${key}`);
        try {
          conn.close();
        } catch (error) {
          console.warn(`⚠️ Error closing connection ${key}:`, error);
        }
        delete connections[key];
        this.unregisterConnection(key);
      }
    });
  }
}

// Inicializar limpieza automática
const connectionManager = ConnectionManager.getInstance();
setInterval(() => {
  connectionManager.cleanupInactiveConnections();
}, connectionManager['CONNECTION_CLEANUP_INTERVAL']);

// Opciones de conexión optimizadas para 50+ usuarios concurrentes
const getConnectionOptions = () => ({
  maxPoolSize: 50,  // ✅ Aumentado de 10 a 50 para soportar 50+ usuarios
  minPoolSize: 10,  // ✅ Mínimo de conexiones listas
  serverSelectionTimeoutMS: 15000,  // ✅ Aumentado de 5s a 15s
  socketTimeoutMS: 120000,  // ✅ Aumentado de 45s a 120s
  bufferCommands: false,
  ssl: true,
  tls: true,
  tlsAllowInvalidCertificates: false,
  tlsAllowInvalidHostnames: false,
  retryWrites: true,
  w: 'majority' as const,
  // ✅ Optimizaciones para estabilidad y rendimiento
  heartbeatFrequencyMS: 30000,  // ✅ Reducido de 10s a 30s (menos overhead)
  maxIdleTimeMS: 300000,  // ✅ Aumentado de 60s a 5min (menos reconexiones)
  maxConnecting: 10,  // ✅ Límite de conexiones simultáneas
});

export async function getDbConnection(dbName: string): Promise<Connection> {
  // ✅ Verificar si ya existe una conexión activa
  if (connections[dbName] && connections[dbName].readyState === 1) {
    connectionManager.registerConnection(dbName);
    return connections[dbName];
  }

  // ✅ Verificar límites de conexiones antes de crear nueva
  if (!connectionManager.canCreateConnection(dbName)) {
    console.warn(`⚠️ Connection limit reached for ${dbName}. Waiting for available connection...`);
    // Esperar hasta 10 segundos por una conexión disponible
    let attempts = 0;
    while (attempts < 20 && !connectionManager.canCreateConnection(dbName)) {
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }
    
    if (!connectionManager.canCreateConnection(dbName)) {
      throw new Error(`Connection limit exceeded for ${dbName}. Max connections per company: 15`);
    }
  }

  // Si existe una conexión pero no está activa, limpiarla
  if (connections[dbName]) {
    try {
      await connections[dbName].close();
    } catch (error) {
      console.warn(`⚠️ Error closing old connection for ${dbName}:`, error);
    }
    delete connections[dbName];
    connectionManager.unregisterConnection(dbName);
  }

  const config = getEnvironmentConfig();
  const uriBase = config.mongoUri.split("/")[0] + "//" + config.mongoUri.split("/")[2];

  const uri = `${uriBase}/${dbName}`;
  
  try {
    const conn = await mongoose.createConnection(uri, getConnectionOptions()).asPromise();
    connections[dbName] = conn;
    connectionManager.registerConnection(dbName);
    
    console.log(`✅ New connection created for ${dbName}. Total connections: ${Object.keys(connections).length}`);
    
    // ✅ Manejar eventos de conexión con reconexión inteligente
    conn.on('error', async (error) => {
      console.error(`❌ Database error for ${dbName}:`, error);
      connectionManager.unregisterConnection(dbName);
      delete connections[dbName];
      
      // ✅ Reconexión con backoff exponencial (menos agresiva)
      const retryDelay = Math.min(30000, 5000 * Math.pow(2, 0)); // Max 30s
      setTimeout(async () => {
        try {
          await getDbConnection(dbName);
        } catch (reconnectError) {
          console.error(`❌ Failed to reconnect to ${dbName}:`, reconnectError);
        }
      }, retryDelay);
    });
    
    conn.on('disconnected', async () => {
      console.warn(`⚠️ Database disconnected for ${dbName}`);
      connectionManager.unregisterConnection(dbName);
      delete connections[dbName];
      
      // ✅ Reconexión menos agresiva
      setTimeout(async () => {
        try {
          await getDbConnection(dbName);
        } catch (reconnectError) {
          console.error(`❌ Failed to reconnect to ${dbName} after disconnect:`, reconnectError);
        }
      }, 10000); // 10 segundos en lugar de 3
    });
    
    conn.on('reconnected', () => {
      console.log(`✅ Database reconnected for ${dbName}`);
      connectionManager.registerConnection(dbName);
    });
    
    conn.on('close', () => {
      console.log(`🔌 Database connection closed for ${dbName}`);
      connectionManager.unregisterConnection(dbName);
      delete connections[dbName];
    });
    
    return conn;
  } catch (error) {
    console.error(`❌ Error creating connection for ${dbName}:`, error);
    connectionManager.unregisterConnection(dbName);
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

// ✅ Función para obtener información de conexiones activas
export function getActiveConnections(): string[] {
  return Object.keys(connections).filter(key => {
    const conn = connections[key];
    return conn.readyState === 1; // Connected
  });
}

// ✅ Función para obtener estadísticas detalladas de conexiones
export function getConnectionStats(): Record<string, any> {
  const activeConnections = getActiveConnections();
  const managerStats = connectionManager.getConnectionStats();
  
  return {
    totalConnections: Object.keys(connections).length,
    activeConnections: activeConnections.length,
    inactiveConnections: Object.keys(connections).length - activeConnections.length,
    connectionsByCompany: managerStats,
    maxConnectionsPerCompany: 15,
    maxTotalConnections: 100,
    memoryUsage: process.memoryUsage()
  };
}

// ✅ Función para limpiar conexiones inactivas (ahora usa el manager)
export function cleanupInactiveConnections(): void {
  const beforeCount = Object.keys(connections).length;
  connectionManager.cleanupInactiveConnections();
  const afterCount = Object.keys(connections).length;
  
  if (beforeCount !== afterCount) {
    console.log(`🧹 Cleaned up ${beforeCount - afterCount} inactive connections`);
  }
}

// ✅ Exportar el connection manager para uso externo
export { connectionManager };

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