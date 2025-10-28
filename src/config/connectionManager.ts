import mongoose, { Connection } from "mongoose";
import { getEnvironmentConfig } from "./environments";

const connections: Record<string, Connection> = {};

// ✅ FIX: Mutex to prevent race conditions in concurrent connection creation
const connectionCreationLocks: Map<string, Promise<Connection>> = new Map();

// ✅ FIX: Event listener cleanup trackers to prevent memory leaks
const connectionEventCleaners: Map<string, () => void> = new Map();

// ✅ FIX: Validate database name to prevent injection attacks
function validateDatabaseName(dbName: string): boolean {
  if (!dbName || typeof dbName !== 'string') {
    return false;
  }
  // MongoDB database names can contain: letters, numbers, underscore, hyphen
  // Cannot contain: /, \, ., ", *, <, >, :, |, ?, $, space, null
  const validNameRegex = /^[a-zA-Z0-9_-]+$/;
  return validNameRegex.test(dbName) && dbName.length > 0 && dbName.length <= 64;
}

// ✅ Sistema de gestión de conexiones optimizado
class ConnectionManager {
  private static instance: ConnectionManager;
  private connectionStats: Map<string, { count: number; lastUsed: number }> = new Map();
  private reconnectAttempts: Map<string, number> = new Map(); // ✅ Track reconnection attempts
  private readonly MAX_CONNECTIONS_PER_COMPANY = 200; // ✅ Aumentado: 200 por empresa (vs 50)
  private readonly MAX_TOTAL_CONNECTIONS = 500; // ✅ Balanceado: 500 total para cluster mode (safe limit)
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
      const newCount = currentStats.count - 1;
      if (newCount === 0) {
        // ✅ FIX: Clean up Map entries when count reaches 0 to prevent memory leak
        this.connectionStats.delete(company);
        this.reconnectAttempts.delete(company);
      } else {
        this.connectionStats.set(company, {
          count: newCount,
          lastUsed: currentStats.lastUsed
        });
      }
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
        try {
          // ✅ FIX: Remove event listeners before closing to prevent memory leak
          const cleaner = connectionEventCleaners.get(key);
          if (cleaner) {
            cleaner();
            connectionEventCleaners.delete(key);
          }
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

// Opciones de conexión optimizadas para cluster mode
export const buildMongoConnectionOptions = () => ({
  maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 30), // ✅ Balanceado: 30 para cluster mode (sustainable)
  minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE || 5), // ✅ Pool mínimo de 5 conexiones siempre listas
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
  waitQueueTimeoutMS: 60000, // ✅ Increased to 60s (from 30s) for bulk operations with retry logic
  maxConnecting: 10, // ✅ Aumentado de 5 a 10 para conexiones más rápidas
});

export async function getDbConnection(dbName: string): Promise<Connection> {
  // ✅ FIX: Validate database name to prevent injection
  if (!validateDatabaseName(dbName)) {
    throw new Error(`Invalid database name: "${dbName}". Database names can only contain letters, numbers, underscores, and hyphens.`);
  }

  // ✅ Verificar si ya existe una conexión activa
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

  // ✅ FIX: Mutex to prevent race condition - if another request is creating connection, wait for it
  const existingLock = connectionCreationLocks.get(dbName);
  if (existingLock) {
    try {
      const conn = await existingLock;
      // Double-check connection is still valid
      if (conn.readyState === 1) {
        return conn;
      }
      // If connection failed, continue to create a new one
    } catch (error) {
      // Existing connection creation failed, will create new one
    } finally {
      // Clean up the lock if it failed
      connectionCreationLocks.delete(dbName);
    }
  }

  // ✅ FIX: Create promise for mutex lock BEFORE checking limits
  const connectionPromise = (async (): Promise<Connection> => {
    try {
      // ✅ Verificar límites de conexiones antes de crear nueva
      if (!connectionManager.canCreateConnection(dbName)) {
        throw new Error(`Connection limit exceeded for ${dbName}. Max connections per company: 200, max total: 450`);
      }

      // Si existe una conexión pero no está activa, limpiarla
      if (connections[dbName]) {
        try {
          // ✅ FIX: Clean up event listeners before closing
          const cleaner = connectionEventCleaners.get(dbName);
          if (cleaner) {
            cleaner();
            connectionEventCleaners.delete(dbName);
          }
          await connections[dbName].close();
        } catch (error) {
          console.warn(`⚠️ Error closing old connection for ${dbName}:`, error);
        }
        delete connections[dbName];
        connectionManager.unregisterConnection(dbName);
      }

      const config = getEnvironmentConfig();
      // ✅ FIX: More robust URI construction with proper validation
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
      
      const conn = await mongoose.createConnection(uri, buildMongoConnectionOptions()).asPromise();
      connections[dbName] = conn;
      connectionManager.registerConnection(dbName);
      
      // ✅ FIX: Setup event listeners with cleanup function to prevent memory leaks
      const errorHandler = async (error: Error) => {
        console.error(`❌ Database error for ${dbName}:`, error);
        
        // ✅ FIX: Don't attempt reconnection if we've exceeded limits
        if (!connectionManager.shouldAttemptReconnection(dbName)) {
          console.error(`❌ Max reconnection attempts reached for ${dbName}. Giving up.`);
          connectionManager.resetReconnectAttempts(dbName);
          return;
        }

        const attempts = connectionManager.incrementReconnectAttempts(dbName);
        const retryDelay = Math.min(30000, 5000 * Math.pow(2, attempts - 1));
        
        setTimeout(async () => {
          try {
            await getDbConnection(dbName);
            connectionManager.resetReconnectAttempts(dbName);
          } catch (reconnectError) {
            console.error(`❌ Failed to reconnect to ${dbName}:`, reconnectError);
          }
        }, retryDelay);
      };
      
      const disconnectedHandler = async () => {
        console.warn(`⚠️ Database disconnected for ${dbName}`);
        connectionManager.unregisterConnection(dbName);
        delete connections[dbName];
        
        // ✅ FIX: Apply same reconnection limits
        if (!connectionManager.shouldAttemptReconnection(dbName)) {
          console.error(`❌ Max reconnection attempts reached for ${dbName} after disconnect. Giving up.`);
          connectionManager.resetReconnectAttempts(dbName);
          return;
        }

        const attempts = connectionManager.incrementReconnectAttempts(dbName);
        
        setTimeout(async () => {
          try {
            await getDbConnection(dbName);
            connectionManager.resetReconnectAttempts(dbName);
          } catch (reconnectError) {
            console.error(`❌ Failed to reconnect to ${dbName} after disconnect:`, reconnectError);
          }
        }, 10000);
      };
      
      const reconnectedHandler = () => {
        connectionManager.registerConnection(dbName);
        connectionManager.resetReconnectAttempts(dbName);
      };
      
      const closeHandler = () => {
        connectionManager.unregisterConnection(dbName);
        delete connections[dbName];
        
        // ✅ FIX: Clean up event listeners when connection closes
        const cleaner = connectionEventCleaners.get(dbName);
        if (cleaner) {
          cleaner();
          connectionEventCleaners.delete(dbName);
        }
      };

      // Register event handlers
      conn.on('error', errorHandler);
      conn.on('disconnected', disconnectedHandler);
      conn.on('reconnected', reconnectedHandler);
      conn.on('close', closeHandler);

      // ✅ FIX: Store cleanup function to remove all event listeners later
      connectionEventCleaners.set(dbName, () => {
        conn.removeListener('error', errorHandler);
        conn.removeListener('disconnected', disconnectedHandler);
        conn.removeListener('reconnected', reconnectedHandler);
        conn.removeListener('close', closeHandler);
      });
      
      return conn;
    } catch (error) {
      console.error(`❌ Error creating connection for ${dbName}:`, error);
      // ✅ FIX: Clean up on error
      connectionManager.unregisterConnection(dbName);
      delete connections[dbName];
      throw error;
    } finally {
      // ✅ FIX: Always remove the lock when done (success or failure)
      connectionCreationLocks.delete(dbName);
    }
  })();

  // ✅ FIX: Store the promise in the lock map
  connectionCreationLocks.set(dbName, connectionPromise);

  return connectionPromise;
}

// Nueva función específica para Quick Learning Enterprise
export async function getQuickLearningConnection(): Promise<Connection> {
  const connectionKey = 'quicklearning_enterprise';
  
  // Verificar si ya existe una conexión activa
  if (connections[connectionKey] && connections[connectionKey].readyState === 1) {
    const currentStats = connectionManager['connectionStats'].get(connectionKey);
    if (currentStats) {
      connectionManager['connectionStats'].set(connectionKey, {
        ...currentStats,
        lastUsed: Date.now()
      });
    }
    return connections[connectionKey];
  }

  // ✅ FIX: Apply mutex to QuickLearning too
  const existingLock = connectionCreationLocks.get(connectionKey);
  if (existingLock) {
    try {
      const conn = await existingLock;
      if (conn.readyState === 1) {
        return conn;
      }
    } catch (error) {
      // Existing QuickLearning connection creation failed, will create new one
    } finally {
      connectionCreationLocks.delete(connectionKey);
    }
  }

  const connectionPromise = (async (): Promise<Connection> => {
    try {
      // ✅ FIX: Check connection limits for QuickLearning too
      if (!connectionManager.canCreateConnection(connectionKey)) {
        throw new Error(`Connection limit exceeded for QuickLearning. Max connections per company: 200, max total: 450`);
      }

      // Si existe una conexión pero no está activa, limpiarla
      if (connections[connectionKey]) {
        try {
          const cleaner = connectionEventCleaners.get(connectionKey);
          if (cleaner) {
            cleaner();
            connectionEventCleaners.delete(connectionKey);
          }
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

      const conn = await mongoose.createConnection(quicklearningUri, buildMongoConnectionOptions()).asPromise();
      connections[connectionKey] = conn;
      connectionManager.registerConnection(connectionKey);
      
      // ✅ FIX: Setup event listeners with cleanup
      const errorHandler = async (error: Error) => {
        console.error('❌ QuickLearning database connection error:', error);
        
        if (!connectionManager.shouldAttemptReconnection(connectionKey)) {
          console.error(`❌ Max reconnection attempts reached for QuickLearning. Giving up.`);
          connectionManager.resetReconnectAttempts(connectionKey);
          return;
        }

        const attempts = connectionManager.incrementReconnectAttempts(connectionKey);
        setTimeout(async () => {
          try {
            await getQuickLearningConnection();
            connectionManager.resetReconnectAttempts(connectionKey);
          } catch (reconnectError) {
            console.error(`❌ Failed to reconnect to QuickLearning:`, reconnectError);
          }
        }, 5000);
      };
      
      const disconnectedHandler = async () => {
        console.warn('⚠️ QuickLearning database disconnected');
        delete connections[connectionKey];
        
        if (!connectionManager.shouldAttemptReconnection(connectionKey)) {
          console.error(`❌ Max reconnection attempts reached for QuickLearning after disconnect. Giving up.`);
          connectionManager.resetReconnectAttempts(connectionKey);
          return;
        }

        const attempts = connectionManager.incrementReconnectAttempts(connectionKey);
        setTimeout(async () => {
          try {
            await getQuickLearningConnection();
            connectionManager.resetReconnectAttempts(connectionKey);
          } catch (reconnectError) {
            console.error(`❌ Failed to reconnect to QuickLearning after disconnect:`, reconnectError);
          }
        }, 3000);
      };
      
      const reconnectedHandler = () => {
        connectionManager.resetReconnectAttempts(connectionKey);
      };
      
      const closeHandler = () => {
        delete connections[connectionKey];
        
        const cleaner = connectionEventCleaners.get(connectionKey);
        if (cleaner) {
          cleaner();
          connectionEventCleaners.delete(connectionKey);
        }
      };

      conn.on('error', errorHandler);
      conn.on('disconnected', disconnectedHandler);
      conn.on('reconnected', reconnectedHandler);
      conn.on('close', closeHandler);

      connectionEventCleaners.set(connectionKey, () => {
        conn.removeListener('error', errorHandler);
        conn.removeListener('disconnected', disconnectedHandler);
        conn.removeListener('reconnected', reconnectedHandler);
        conn.removeListener('close', closeHandler);
      });
      
      return conn;
    } catch (error) {
      console.error('❌ Error creating QuickLearning connection:', error);
      delete connections[connectionKey];
      connectionManager.unregisterConnection(connectionKey);
      throw error;
    } finally {
      connectionCreationLocks.delete(connectionKey);
    }
  })();

  connectionCreationLocks.set(connectionKey, connectionPromise);
  return connectionPromise;
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
  Object.keys(connections).forEach(key => {
    const conn = connections[key];
    if (conn.readyState === 1) { // Connected
      // ✅ FIX: Clean up event listeners before closing
      const cleaner = connectionEventCleaners.get(key);
      if (cleaner) {
        cleaner();
        connectionEventCleaners.delete(key);
      }
      conn.close();
    }
    delete connections[key];
  });
  
  // ✅ FIX: Clear all locks and cleaners
  connectionCreationLocks.clear();
  connectionEventCleaners.clear();
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
    maxTotalConnections: 500,
    mongoAtlasLimit: 1000,
    safetyMargin: 500,
    poolConfiguration: {
      maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 30),
      minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE || 5),
    },
    memoryUsage: process.memoryUsage()
  };
}

// ✅ Función para limpiar conexiones inactivas (ahora usa el manager)
export function cleanupInactiveConnections(): void {
  connectionManager.cleanupInactiveConnections();
}

// ✅ FIX: Graceful shutdown - close all connections properly
export async function closeAllConnections(): Promise<void> {
  const closePromises = Object.keys(connections).map(async (key) => {
    try {
      const conn = connections[key];
      
      // Clean up event listeners first
      const cleaner = connectionEventCleaners.get(key);
      if (cleaner) {
        cleaner();
        connectionEventCleaners.delete(key);
      }
      
      if (conn.readyState === 1 || conn.readyState === 2) { // Connected or Connecting
        await conn.close();
      }
      
      delete connections[key];
      connectionManager.unregisterConnection(key);
    } catch (error) {
      console.error(`⚠️ Error closing connection ${key}:`, error);
    }
  });

  await Promise.allSettled(closePromises);
  
  // Clear all locks and cleaners
  connectionCreationLocks.clear();
  connectionEventCleaners.clear();
}

// ✅ FIX: Setup graceful shutdown handlers
process.on('SIGTERM', async () => {
  await closeAllConnections();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await closeAllConnections();
  process.exit(0);
});

// Handle uncaught errors to prevent connection leaks
process.on('uncaughtException', async (error) => {
  console.error('❌ Uncaught Exception:', error);
  await closeAllConnections();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit on unhandled rejection, just log it
});

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
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        // Limpiar la conexión fallida para forzar una nueva
        if (connections[dbName]) {
          try {
            const cleaner = connectionEventCleaners.get(dbName);
            if (cleaner) {
              cleaner();
              connectionEventCleaners.delete(dbName);
            }
            await connections[dbName].close();
          } catch (closeError) {
            console.warn(`⚠️ Error closing failed connection:`, closeError);
          }
          delete connections[dbName];
          connectionManager.unregisterConnection(dbName);
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
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        // Limpiar la conexión fallida
        const connectionKey = 'quicklearning_enterprise';
        if (connections[connectionKey]) {
          try {
            const cleaner = connectionEventCleaners.get(connectionKey);
            if (cleaner) {
              cleaner();
              connectionEventCleaners.delete(connectionKey);
            }
            await connections[connectionKey].close();
          } catch (closeError) {
            console.warn(`⚠️ Error closing failed QuickLearning connection:`, closeError);
          }
          delete connections[connectionKey];
          connectionManager.unregisterConnection(connectionKey);
        }
      }
    }
  }
  
  throw new Error(`Failed to execute QuickLearning operation after ${maxRetries} attempts. Last error: ${lastError?.message}`);
}
