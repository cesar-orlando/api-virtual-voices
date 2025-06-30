import dotenv from 'dotenv';
dotenv.config();

// Configuración de entornos
export interface EnvironmentConfig {
  name: string;
  mongoUri: string;
  port: number;
  nodeEnv: string;
  corsOrigin: string;
  jwtSecret: string;
  openaiApiKey: string;
}

// Configuraciones por entorno
const environments: Record<string, EnvironmentConfig> = {
  development: {
    name: 'development',
    mongoUri: process.env.MONGO_URI_DEV || '',
    port: parseInt(process.env.PORT || '3001'),
    nodeEnv: 'development',
    corsOrigin: process.env.CORS_ORIGIN_DEV || '',
    jwtSecret: process.env.JWT_SECRET || process.env.JWT_SECRET_DEV || '',
    openaiApiKey: process.env.OPENAI_API_KEY_DEV || ''
  },
  qa: {
    name: 'qa',
    mongoUri: process.env.MONGO_URI_QA || 'mongodb://localhost:27017',
    port: parseInt(process.env.PORT || '3002'),
    nodeEnv: 'qa',
    corsOrigin: process.env.CORS_ORIGIN_QA || 'http://localhost:3001',
    jwtSecret: process.env.JWT_SECRET || process.env.JWT_SECRET_QA || 'qa-secret-key',
    openaiApiKey: process.env.OPENAI_API_KEY_QA || ''
  },
  production: {
    name: 'production',
    mongoUri: process.env.MONGO_URI_PROD || 'mongodb://localhost:27017',
    port: parseInt(process.env.PORT || '3003'),
    nodeEnv: 'production',
    corsOrigin: process.env.CORS_ORIGIN_PROD || 'https://yourdomain.com',
    jwtSecret: process.env.JWT_SECRET || process.env.JWT_SECRET_PROD || 'prod-secret-key',
    openaiApiKey: process.env.OPENAI_API_KEY_PROD || ''
  }
};

// Función para obtener la configuración del entorno actual
export function getEnvironmentConfig(): EnvironmentConfig {
  const env = process.env.NODE_ENV || 'development';
  const config = environments[env];
  
  if (!config) {
    throw new Error(`Environment configuration not found for: ${env}`);
  }
  
  return config;
}

// Función para validar la configuración
export function validateEnvironmentConfig(config: EnvironmentConfig): void {
  const requiredFields = ['mongoUri', 'jwtSecret', 'openaiApiKey'];
  
  for (const field of requiredFields) {
    if (!config[field as keyof EnvironmentConfig]) {
      console.warn(`⚠️  Warning: ${field} is not configured for environment ${config.name}`);
    }
  }
}

// Función para mostrar información del entorno
export function logEnvironmentInfo(config: EnvironmentConfig): void {
  console.log("process.env.MONGO_URI_DEV", process.env.MONGO_URI_DEV);
  console.log("process.env.JWT_SECRET", process.env.JWT_SECRET ? "Configured" : "Not configured");
  console.log("config", config);
  console.log(`🚀 Starting Virtual Voices API in ${config.name.toUpperCase()} mode`);
  console.log(`📊 Environment: ${config.nodeEnv}`);
  console.log(`🌐 Port: ${config.port}`);
  console.log(`🔗 CORS Origin: ${config.corsOrigin}`);
  console.log(`🗄️  MongoDB URI: ${config.mongoUri.replace(/\/\/.*@/, '//***:***@')}`);
  console.log(`🔐 JWT Secret: ${config.jwtSecret ? 'Configured' : 'Not configured'}`);
  console.log(`🤖 OpenAI API Key: ${config.openaiApiKey ? 'Configured' : 'Not configured'}`);
  console.log('─'.repeat(50));
} 