import express from "express";
import cors from "cors";
import tableRoutes from "./routes/table.routes";
import dynamicRecordRoutes from "./routes/record.routes";
import whatsappRoutes from './routes/whatsapp.routes';
import companyRoutes from "./routes/company.routes";
import iaConfigRoutes from "./routes/iaConfig.routes";
import userRoutes from "./routes/user.routes";
import coreUserRoutes from "./core/users/user.routes";
import toolRoutes from "./routes/tool.routes";
import { getEnvironmentConfig } from "./config/environments";
import { getDatabaseInfo } from "./config/database";
import { swaggerUi, specs } from "./config/swagger";

const app = express();

app.use(cors());

// Configurar límites de body-parser para importaciones masivas
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

app.use('/api/users', userRoutes);

// Core user system routes
app.use("/api/core/users", coreUserRoutes);

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

// Rutas para herramientas dinámicas
app.use("/api/tools", toolRoutes);

// Swagger Documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(specs, {
  customSiteTitle: 'Virtual Voices API Documentation',
  customCss: '.swagger-ui .topbar { display: none }',
  customfavIcon: '/favicon.ico'
}));

app.get("/", (req, res) => {
    const config = getEnvironmentConfig();
    const dbInfo = getDatabaseInfo();
    
    res.json({
      status: "ok",
      code: 200,
      message: "Sistema operativo: Virtual Voices Node Engine v2.4",
      uptime: `${Math.floor(process.uptime())}s`,
      trace: "XJ-85::Verified",
      environment: config.name,
      nodeEnv: config.nodeEnv,
      port: config.port,
      database: dbInfo.mongoUri,
      corsOrigin: config.corsOrigin,
      documentation: `${req.protocol}://${req.get('host')}/api/docs`,
      timestamp: new Date().toISOString(),
      features: {
        quickLearningEnterprise: "✅ Conectado a base de datos externa",
        multiCompany: "✅ Soporte multi-empresa",
        authentication: "✅ JWT con secrets específicos por empresa"
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
      limit: '50mb'
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