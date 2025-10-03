import mongoose, { Connection } from "mongoose";
import { getEnvironmentConfig } from "./environments";

const connections: Record<string, Connection> = {};

// ✅ Sistema de gestión de conexiones optimizado
class ConnectionManager {
  private static instance: ConnectionManager;
  private connectionStats: Map<string, { count: number; lastUsed: number }> = new Map();
  private reconnectAttempts: Map<string, number> = new Map(); // ✅ Track reconnection attempts
  private readonly MAX_CONNECTIONS_PER_COMPANY = 200; // ✅ Aumentado: 200 por empresa (vs 50)
  private readonly MAX_TOTAL_CONNECTIONS = 450; // ✅ Aumentado: 450 total (vs 400) - Dejamos 50 de margen
  private readonly CONNECTION_CLEANUP_INTERVAL = 300000; // 5 minutos
  private readonly MAX_RECONNECT_ATTEMPTS = 5; // ✅ Limit reconnection attempts

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

  // ✅ New method: Check if should attempt reconnection
  shouldAttemptReconnection(company: string): boolean {
    const attempts = this.reconnectAttempts.get(company) || 0;
    return attempts < this.MAX_RECONNECT_ATTEMPTS;
  }

  // ✅ New method: Increment reconnection attempts
  incrementReconnectAttempts(company: string): number {
    const attempts = (this.reconnectAttempts.get(company) || 0) + 1;
    this.reconnectAttempts.set(company, attempts);
    return attempts;
  }

  // ✅ New method: Reset reconnection attempts
  resetReconnectAttempts(company: string): void {
    this.reconnectAttempts.delete(company);
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

const connectionManager = ConnectionManager.getInstance();

// Ejecutar limpieza automática de conexiones inactivas a menos que se deshabilite explícitamente
if (process.env.DISABLE_CONNECTION_CLEANUP !== 'true') {
  setInterval(() => {
    connectionManager.cleanupInactiveConnections();
  }, connectionManager['CONNECTION_CLEANUP_INTERVAL']);
}

// Opciones de conexión con enfoque conservador para reducir conexiones ociosas
export const buildMongoConnectionOptions = () => ({
  maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 25),
  minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE || 0),
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 60000,
  bufferCommands: false,
  ssl: true,
  tls: true,
  tlsAllowInvalidCertificates: false,
  tlsAllowInvalidHostnames: false,
  retryWrites: true,
  w: 'majority' as const,
  heartbeatFrequencyMS: 15000,
  maxIdleTimeMS: 180000,
  waitQueueTimeoutMS: 10000,
  maxConnecting: 5,
});

export async function getDbConnection(dbName: string): Promise<Connection> {
  // ✅ Verificar si ya existe una conexión activa
  if (connections[dbName] && connections[dbName].readyState === 1) {
    // ✅ FIX: Don't register again for existing connections
    const currentStats = connectionManager['connectionStats'].get(dbName);
    if (currentStats) {
      connectionManager['connectionStats'].set(dbName, {
        ...currentStats,
        lastUsed: Date.now()
      });
    }
    return connections[dbName];
  }

  // ✅ Verificar límites de conexiones antes de crear nueva (with mutex)
  if (!connectionManager.canCreateConnection(dbName)) {
    console.warn(`⚠️ Connection limit reached for ${dbName}. Waiting for available connection...`);
    // Esperar hasta 10 segundos por una conexión disponible
    let attempts = 0;
    while (attempts < 20 && !connectionManager.canCreateConnection(dbName)) {
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
      
      // ✅ Check if connection was created by another process
      if (connections[dbName] && connections[dbName].readyState === 1) {
        const currentStats = connectionManager['connectionStats'].get(dbName);
        if (currentStats) {
          connectionManager['connectionStats'].set(dbName, {
            ...currentStats,
            lastUsed: Date.now()
          });
        }
        return connections[dbName];
      }
    }
    
    if (!connectionManager.canCreateConnection(dbName)) {
      throw new Error(`Connection limit exceeded for ${dbName}. Max connections per company: 200`);
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
  // ✅ FIX: More robust URI construction
  let uri: string;
  try {
    const mongoUrl = new URL(config.mongoUri);
    mongoUrl.pathname = `/${dbName}`;
    uri = mongoUrl.toString();
  } catch (error) {
    // Fallback to old method if URL parsing fails
    const uriBase = config.mongoUri.split("/")[0] + "//" + config.mongoUri.split("/")[2];
    uri = `${uriBase}/${dbName}`;
  }
  
  try {
    const conn = await mongoose.createConnection(uri, buildMongoConnectionOptions()).asPromise();
    connections[dbName] = conn;
    connectionManager.registerConnection(dbName);
    
    console.log(`✅ New connection created for ${dbName}. Total connections: ${Object.keys(connections).length}`);
    
    // ✅ Manejar eventos de conexión con reconexión inteligente
    conn.on('error', async (error) => {
      console.error(`❌ Database error for ${dbName}:`, error);
      connectionManager.unregisterConnection(dbName);
      delete connections[dbName];
      
      // ✅ FIX: Limit reconnection attempts
      const attempts = connectionManager['reconnectAttempts'].get(dbName) || 0;
      if (attempts < connectionManager['MAX_RECONNECT_ATTEMPTS']) {
        connectionManager['reconnectAttempts'].set(dbName, attempts + 1);
        
        // ✅ FIX: Proper exponential backoff
        const retryDelay = Math.min(30000, 5000 * Math.pow(2, attempts));
        setTimeout(async () => {
          try {
            await getDbConnection(dbName);
            // Reset attempts on successful reconnection
            connectionManager['reconnectAttempts'].delete(dbName);
          } catch (reconnectError) {
            console.error(`❌ Failed to reconnect to ${dbName}:`, reconnectError);
          }
        }, retryDelay);
      } else {
        console.error(`❌ Max reconnection attempts reached for ${dbName}. Giving up.`);
        connectionManager['reconnectAttempts'].delete(dbName);
      }
    });
    
    conn.on('disconnected', async () => {
      console.warn(`⚠️ Database disconnected for ${dbName}`);
      connectionManager.unregisterConnection(dbName);
      delete connections[dbName];
      
      // ✅ FIX: Apply same reconnection limits to disconnected event
      const attempts = connectionManager['reconnectAttempts'].get(dbName) || 0;
      if (attempts < connectionManager['MAX_RECONNECT_ATTEMPTS']) {
        connectionManager['reconnectAttempts'].set(dbName, attempts + 1);
        
        setTimeout(async () => {
          try {
            await getDbConnection(dbName);
            connectionManager['reconnectAttempts'].delete(dbName);
          } catch (reconnectError) {
            console.error(`❌ Failed to reconnect to ${dbName} after disconnect:`, reconnectError);
          }
        }, 10000);
      } else {
        console.error(`❌ Max reconnection attempts reached for ${dbName} after disconnect. Giving up.`);
        connectionManager['reconnectAttempts'].delete(dbName);
      }
    });
    
    conn.on('reconnected', () => {
      console.log(`✅ Database reconnected for ${dbName}`);
      connectionManager.registerConnection(dbName);
      // ✅ Reset reconnection attempts on successful reconnection
      connectionManager['reconnectAttempts'].delete(dbName);
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
    // ✅ FIX: Update last used time instead of registering again
    const currentStats = connectionManager['connectionStats'].get(connectionKey);
    if (currentStats) {
      connectionManager['connectionStats'].set(connectionKey, {
        ...currentStats,
        lastUsed: Date.now()
      });
    }
    return connections[connectionKey];
  }

  // ✅ FIX: Check connection limits for QuickLearning too
  if (!connectionManager.canCreateConnection(connectionKey)) {
    throw new Error(`Connection limit exceeded for QuickLearning. Max connections per company: 200`);
  }

  // Si existe una conexión pero no está activa, limpiarla
  if (connections[connectionKey]) {
    try {
      await connections[connectionKey].close();
    } catch (error) {
      console.warn(`⚠️ Error closing old QuickLearning connection:`, error);
    }
    delete connections[connectionKey];
    connectionManager.unregisterConnection(connectionKey);
  }

  const quicklearningUri = process.env.MONGO_URI_QUICKLEARNING;
  if (!quicklearningUri) {
    throw new Error('MONGO_URI_QUICKLEARNING not configured');
  }

  try {
    const conn = await mongoose.createConnection(quicklearningUri, buildMongoConnectionOptions()).asPromise();
    connections[connectionKey] = conn;
    connectionManager.registerConnection(connectionKey); // ✅ FIX: Register with connection manager
    
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
    maxConnectionsPerCompany: 200,
    maxTotalConnections: 450,
    mongoAtlasLimit: 500,
    safetyMargin: 50,
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
