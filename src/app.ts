import express from "express";
import cors from "cors";
import tableRoutes from "./routes/table.routes";
import dynamicRecordRoutes from "./routes/record.routes";
import whatsappRoutes from './routes/whatsapp.routes';
import companyRoutes from "./routes/company.routes";
import iaConfigRoutes from "./routes/iaConfig.routes";
import chatInternalRoutes from "./routes/chatInternal.routes";
import toolRoutes from "./routes/tool.routes";
import uploadRoutes from "./routes/upload.routes";
import googleRoutes from "./routes/google.routes";
import chatMetricsRoutes from "./routes/chatMetrics.routes";
import metaRoutes from './routes/meta.routes';
import sessionRoutes from "./routes/session.routes";
import calendarEventRoutes from './routes/calendarEvent.routes';
import taskRoutes from './routes/task.routes';
import notificationRoutes from './routes/notification.routes';
import schedulerRoutes from './routes/scheduler.routes';

// Nuevas rutas del sistema multiempresa
import coreUserRoutes from "./core/users/user.routes";
import quickLearningRoutes from "./projects/quicklearning/routes";
import quickLearningTwilioRoutes from "./routes/quicklearning/twilioRoutes";
import twilioTestRoutes from "./routes/quicklearning/twilioTestRoutes";
import twilioWebhookRoutes from "./routes/quicklearning/twilioWebhookRoutes";
import quickLearningMetricsRoutes from "./routes/quicklearning/metricsRoutes";
import emailRoutes from "./routes/email.routes";
import emailVerificationRoutes from "./routes/emailVerification.routes";
import globalSMTPRoutes from "./routes/globalSMTP.routes";
import botReactivationRoutes from "./routes/botReactivation.routes";

// Swagger configuration
import { swaggerUi, specs } from "./config/swagger";

import { getEnvironmentConfig } from "./config/environments";
import { getDatabaseInfo } from "./config/database";
import { initializeProjects } from "./shared/projectManager";
import { detectCompanyFromToken } from "./core/auth/companyMiddleware";
import elevenLabsRoutes from "./routes/elevenLabs.routes";
import logisticsRoutes from "./routes/logistics.routes";
import contpaqRoutes from "./contpaq/routes/contpaq.routes";
import voiceRoutes from "./routes/voice.routes";

const app = express();

app.use(cors());

// JSON error handling middleware
app.use(express.json({ 
  limit: '200mb',
  verify: (req, res, buf, encoding) => {
    try {
      JSON.parse(buf.toString());
    } catch (err) {
      console.error('❌ JSON Parse Error:', err.message);
      console.error('📄 Raw body:', buf.toString().substring(0, 200) + '...');
      throw new SyntaxError('Invalid JSON format in request body');
    }
  }
}));

app.use(express.urlencoded({ limit: '200mb', extended: true }));

// Global JSON error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError && err.message.includes('JSON')) {
    console.error('❌ JSON parsing error on route:', req.path);
    console.error('❌ Request method:', req.method);
    console.error('❌ Content-Type:', req.headers['content-type']);
    
    res.status(400).json({
      success: false,
      error: 'Invalid JSON format',
      message: 'Please check your JSON syntax. Common issues: trailing commas, unquoted strings, or missing quotes.',
      details: {
        originalError: err.message,
        receivedContentType: req.headers['content-type'],
        path: req.path,
        method: req.method
      }
    });
    return;
  }
  next(err);
});

// ========================================
// SWAGGER DOCUMENTATION
// ========================================
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(specs, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "Virtual Voices API - Multi-Empresa",
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true
  }
}));

// Middleware para logging de importaciones masivas
app.use((req, res, next) => {
  if (req.path.includes('/import') && req.method === 'POST') {
    const contentLength = req.headers['content-length'];
    const sizeInMB = contentLength ? (parseInt(contentLength) / (1024 * 1024)).toFixed(2) : 'unknown';
    
    console.log(`📥 Import request received:`);
    console.log(`   - Path: ${req.path}`);
    console.log(`   - Method: ${req.method}`);
    console.log(`   - Content-Length: ${sizeInMB}MB`);
    console.log(`   - User-Agent: ${req.headers['user-agent']}`);
    
    // Log cuando la request se complete
    res.on('finish', () => {
      console.log(`📤 Import response sent:`);
      console.log(`   - Status: ${res.statusCode}`);
      console.log(`   - Response size: ${res.get('Content-Length') || 'unknown'} bytes`);
    });
  }
  next();
});

// Middleware global para detectar empresa automáticamente
app.use(detectCompanyFromToken);

// Inicializar proyectos al arrancar
initializeProjects();

// Initialize Google Calendar token management
fetch('http://localhost:3001/api/google/calendar/ensure-valid-token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
}).then(() => {
  console.log('✅ Google Calendar token management initialized');
}).catch(err => {
  console.log('⚠️ Google Calendar token initialization warning:', err.message);
  console.log('   This is normal if Google Calendar credentials are not configured yet');
});

// ========================================
// CORE USER SYSTEM ROUTES (Multi-Empresa)
// ========================================
app.use('/api/core/users', coreUserRoutes);
app.use('/api/users', coreUserRoutes); // Alias para compatibilidad

// Rutas para tablas
app.use("/api/tables", tableRoutes);

// Rutas para registros dinámicos
app.use("/api/records", dynamicRecordRoutes);

// Rutas para chat de WhatsApp
app.use('/api/whatsapp', whatsappRoutes);

// Rutas para empresas
app.use("/api/companies", companyRoutes);

// Rutas para configuraciones de IA
app.use("/api/ia-configs", iaConfigRoutes);

// Rutas para chat interno con memoria, RAG y generador de prompts
app.use("/api/chat-internal", chatInternalRoutes);


// Rutas para herramientas dinámicas
app.use("/api/tools", toolRoutes);

// Rutas para subida de archivos
app.use("/api/upload", uploadRoutes);

// Rutas para Google Calendar
app.use("/api/google", googleRoutes);

// Google OAuth callback route (must be at root level to match redirect URI)
// Removed in simplified version - not needed for direct token approach
// import { handleGoogleCallback } from "./controllers/googleCalendar.controller";
// app.get("/auth/google/callback", handleGoogleCallback);

app.use("/api/chat-metrics", chatMetricsRoutes);

// Calendar Event management routes
app.use("/api/calendar-events", calendarEventRoutes);

// Notification routes
app.use("/api/notifications", notificationRoutes);

// Scheduler routes
app.use("/api/scheduler", schedulerRoutes);

// Rutas específicas de Quick Learning (mantener para compatibilidad)
app.use('/api/projects/quicklearning', quickLearningRoutes);

// Rutas de Twilio para Quick Learning (mantener para compatibilidad)
app.use('/api/quicklearning/twilio', quickLearningTwilioRoutes);

// Rutas de métricas para Quick Learning (mantener para compatibilidad)
app.use('/api/quicklearning', quickLearningMetricsRoutes);

// Rutas de prueba para el nuevo sistema de agentes
app.use('/api/test', twilioTestRoutes);

// Rutas de webhook para Twilio
app.use('/api/webhook', twilioWebhookRoutes);

app.use('/api/meta', metaRoutes);

// Rutas de sesiones
app.use('/api/sessions', sessionRoutes);

// Rutas de tareas (estilo Trello)
app.use('/api/tasks', taskRoutes);

app.use('/api/email', emailRoutes);
app.use('/api/email-verification', emailVerificationRoutes);
app.use('/api/global-smtp', globalSMTPRoutes);

// Rutas de ElevenLabs Agents (usando query parameters en lugar de parámetros de ruta)
app.use('/api/elevenlabs', elevenLabsRoutes);

// Rutas de Logística (FedEx, UPS, DHL, etc.)
app.use('/api/logistics', logisticsRoutes);

// Rutas de Contpaq - Simple Green
app.use('/api/contpaq', contpaqRoutes);

// Rutas de Bot Auto-Reactivation
app.use('/api/bot-reactivation', botReactivationRoutes);

// Rutas de Voice Calls (Desvío de llamadas con IA)
app.use('/voice', voiceRoutes);

// Ruta de prueba para ElevenLabs sin parámetros dinámicos
app.get('/api/elevenlabs-test', (req, res) => {
  res.json({
    success: true,
    message: "ElevenLabs test route working",
    params: req.params,
    url: req.url,
    path: req.path
  });
});

app.get("/", (req, res) => {
    const config = getEnvironmentConfig();
    const dbInfo = getDatabaseInfo();
    
    res.json({
      status: "ok",
      code: 200,
      message: "Sistema operativo: Virtual Voices Node Engine v2.5 (Multiempresa)",
      uptime: `${Math.floor(process.uptime())}s`,
      trace: "XJ-85::Verified::MultiTenant",
      environment: config.name,
      nodeEnv: config.nodeEnv,
      port: config.port,
      database: dbInfo.mongoUri,
      corsOrigin: config.corsOrigin,
      features: {
        multiempresa: true,
        quickLearning: true,
        controlMinutos: true,
        elevenLabs: true,
        autoAssignment: true,
        swaggerDocs: true,
        logistics: true,
        fedexShipping: true
      },
      links: {
        swagger: "/api/docs",
      }
    });
});

// Health check endpoint para el frontend
app.get("/api/health", (req, res) => {
    const config = getEnvironmentConfig();
    
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: `${Math.floor(process.uptime())}s`,
      environment: config.name,
      features: {
        socketIO: true,
        twilioWebhook: true,
        realTimeNotifications: true,
        typingIndicators: true
      }
    });
});

// Middleware de manejo de errores para payload too large
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (error.type === 'entity.too.large') {
    console.error('🚨 Payload Too Large Error:', {
      path: req.path,
      method: req.method,
      contentLength: req.headers['content-length'],
      limit: '200mb'
    });
    
    res.status(413).json({
      error: 'Payload Too Large',
      message: 'The request payload exceeds the maximum allowed size of 50MB',
      details: {
        currentSize: req.headers['content-length'] ? `${(parseInt(req.headers['content-length']) / (1024 * 1024)).toFixed(2)}MB` : 'unknown',
        maxSize: '50MB',
        suggestion: 'Try splitting your data into smaller batches or compress the data before sending'
      }
    });
    return;
  }
  
  // Para otros errores, pasar al siguiente middleware
  next(error);
});
  
export default app;