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
  twilio: {
    accountSid: string;
    authToken: string;
    phoneNumber: string;
    webhookUrl: string;
  };
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
    openaiApiKey: process.env.OPENAI_API_KEY_DEV || '',
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
      webhookUrl: process.env.TWILIO_WEBHOOK_URL || `http://localhost:${process.env.PORT || 3001}/api/twilio/webhook`
    }
  },
  qa: {
    name: 'qa',
    mongoUri: process.env.MONGO_URI_QA || 'mongodb://localhost:27017',
    port: parseInt(process.env.PORT || '3002'),
    nodeEnv: 'qa',
    corsOrigin: process.env.CORS_ORIGIN_QA || 'http://localhost:3001',
    jwtSecret: process.env.JWT_SECRET || process.env.JWT_SECRET_QA || 'qa-secret-key',
    openaiApiKey: process.env.OPENAI_API_KEY_QA || '',
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID_QA || process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN_QA || process.env.TWILIO_AUTH_TOKEN || '',
      phoneNumber: process.env.TWILIO_PHONE_NUMBER_QA || process.env.TWILIO_PHONE_NUMBER || '',
      webhookUrl: process.env.TWILIO_WEBHOOK_URL_QA || `https://your-qa-domain.com/api/twilio/webhook`
    }
  },
  production: {
    name: 'production',
    mongoUri: process.env.MONGO_URI_PROD || 'mongodb://localhost:27017',
    port: parseInt(process.env.PORT || '3003'),
    nodeEnv: 'production',
    corsOrigin: process.env.CORS_ORIGIN_PROD || 'https://yourdomain.com',
    jwtSecret: process.env.JWT_SECRET || process.env.JWT_SECRET_PROD || 'prod-secret-key',
    openaiApiKey: process.env.OPENAI_API_KEY_PROD || '',
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID_PROD || process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN_PROD || process.env.TWILIO_AUTH_TOKEN || '',
      phoneNumber: process.env.TWILIO_PHONE_NUMBER_PROD || process.env.TWILIO_PHONE_NUMBER || '',
      webhookUrl: process.env.TWILIO_WEBHOOK_URL_PROD || `https://your-prod-domain.com/api/twilio/webhook`
    }
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

  // Validar configuración de Twilio
  const twilioFields = ['accountSid', 'authToken', 'phoneNumber'];
  for (const field of twilioFields) {
    if (!config.twilio[field as keyof typeof config.twilio]) {
      console.warn(`⚠️  Warning: Twilio ${field} is not configured for environment ${config.name}`);
    }
  }
}

// Función para mostrar información del entorno
export function logEnvironmentInfo(config: EnvironmentConfig): void {
  console.log(`🚀 Starting Virtual Voices API in ${config.name.toUpperCase()} mode`);
  console.log(`📊 Environment: ${config.nodeEnv}`);
  console.log(`🌐 Port: ${config.port}`);
  console.log(`🔗 CORS Origin: ${config.corsOrigin}`);
  console.log(`🗄️  MongoDB URI: ${config.mongoUri.replace(/\/\/.*@/, '//***:***@')}`);
  console.log(`🔐 JWT Secret: ${config.jwtSecret ? 'Configured' : 'Not configured'}`);
  console.log(`🤖 OpenAI API Key: ${config.openaiApiKey ? 'Configured' : 'Not configured'}`);
  console.log(`📱 Twilio Account SID: ${config.twilio.accountSid ? 'Configured' : 'Not configured'}`);
  console.log(`📱 Twilio Phone Number: ${config.twilio.phoneNumber || 'Not configured'}`);
  console.log(`📱 Twilio Webhook URL: ${config.twilio.webhookUrl}`);
  console.log('─'.repeat(50));
} 