/**
 * 📧 SISTEMA DE LECTURA DE EMAILS IMAP - GUÍA DE USO
 * 
 * Este sistema implementa lectura bidireccional de emails:
 * - SALIDA: nodemailer (existente) 
 * - ENTRADA: IMAP (nuevo)
 */

// ===============================
// 1. ENDPOINTS DISPONIBLES
// ===============================

/**
 * POST /api/email/monitoring/start
 * Headers: { "company-slug": "tu-empresa" }
 * Body: { "userId": "64..." }
 * 
 * Inicia monitoreo en tiempo real de emails entrantes
 */

/**
 * POST /api/email/monitoring/stop  
 * Headers: { "company-slug": "tu-empresa" }
 * Body: { "userId": "64..." }
 * 
 * Detiene el monitoreo
 */

/**
 * GET /api/email/monitoring/status
 * Headers: { "company-slug": "tu-empresa" }
 * 
 * Obtiene estado del monitoreo activo
 */

/**
 * GET /api/email/history-enhanced?direction=all&page=1&limit=50
 * Headers: { "company-slug": "tu-empresa" }
 * 
 * Historial mejorado con filtros:
 * - direction: "incoming" | "outgoing" | "all"
 * - status, dateFrom, dateTo, from, to, subject
 * - Paginación: page, limit
 */

/**
 * POST /api/email/sync-historical?days=7
 * Headers: { "company-slug": "tu-empresa" }
 * Body: { "userId": "64..." }
 * 
 * Sincroniza emails históricos desde IMAP
 */

/**
 * GET /api/email/stats?days=30
 * Headers: { "company-slug": "tu-empresa" }
 * 
 * Estadísticas de emails enviados/recibidos
 */

// ===============================
// 2. ESTRUCTURA DE DATOS
// ===============================

/**
 * Email Model (actualizado):
 */
interface EmailDocument {
  messageId?: string;           // ID único (evita duplicados)
  direction: 'incoming' | 'outgoing'; // Nueva funcionalidad
  from: string;
  to: string | string[];       // Múltiples destinatarios
  cc?: string | string[];      // Copia
  bcc?: string | string[];     // Copia oculta
  subject: string;
  textContent?: string;        // Nuevo campo
  htmlContent?: string;        // Nuevo campo
  text?: string;              // Compatibilidad hacia atrás
  html?: string;              // Compatibilidad hacia atrás
  receivedDate?: Date;        // Para emails entrantes
  sentDate?: Date;            // Para emails salientes
  status: 'pendiente' | 'enviado' | 'fallido' | 'recibido' | 'leído';
  attachments?: Array<{
    filename: string;
    contentType?: string;
    size?: number;
    path?: string;            // Path completo del archivo
  }>;
  companySlug?: string;       // Empresa asociada
}

// ===============================
// 3. EJEMPLOS DE USO FRONTEND
// ===============================

/**
 * Iniciar monitoreo de emails
 */
const startEmailMonitoring = async (companySlug: string, userId: string) => {
  const response = await fetch('/api/email/monitoring/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'company-slug': companySlug
    },
    body: JSON.stringify({ userId })
  });
  
  const result = await response.json();
  console.log('Monitoreo iniciado:', result);
};

/**
 * Obtener historial con filtros
 */
const getEmailHistory = async (companySlug: string, filters = {}) => {
  const params = new URLSearchParams({
    direction: 'all',
    page: '1',
    limit: '20',
    ...filters
  });
  
  const response = await fetch(`/api/email/history-enhanced?${params}`, {
    headers: { 'company-slug': companySlug }
  });
  
  const result = await response.json();
  console.log('Historial:', result);
  
  // Resultado incluye:
  // - result.data: Array de emails
  // - result.pagination: { page, limit, total, pages }
  // - result.filter: Filtros aplicados
};

/**
 * Sincronizar emails históricos
 */
const syncHistoricalEmails = async (companySlug: string, userId: string, days = 7) => {
  const response = await fetch(`/api/email/sync-historical?days=${days}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'company-slug': companySlug
    },
    body: JSON.stringify({ userId })
  });
  
  const result = await response.json();
  console.log('Sincronización:', result);
  
  // Resultado incluye:
  // - result.results.total: Total encontrados
  // - result.results.saved: Nuevos guardados
  // - result.results.errors: Errores
};

/**
 * Obtener estadísticas
 */
const getEmailStats = async (companySlug: string, days = 30) => {
  const response = await fetch(`/api/email/stats?days=${days}`, {
    headers: { 'company-slug': companySlug }
  });
  
  const result = await response.json();
  console.log('Estadísticas:', result);
  
  // Resultado incluye:
  // - result.stats.incoming: { received, read, total }
  // - result.stats.outgoing: { pending, sent, failed, total }
  // - result.stats.totalEmails
};

// ===============================
// 4. INTEGRACIÓN CON WEBSOCKETS
// ===============================

/**
 * El sistema emite eventos que puedes capturar:
 */
const emailReader = new EmailReaderService(companySlug, userId);

emailReader.on('newEmail', (email) => {
  console.log('📧 Nuevo email:', email.subject);
  // Aquí puedes:
  // - Mostrar notificación
  // - Actualizar lista de emails
  // - Emitir via WebSocket al frontend
  // io.to(companySlug).emit('newEmail', email);
});

emailReader.on('monitoringStarted', () => {
  console.log('✅ Monitoreo iniciado');
});

emailReader.on('maxReconnectAttemptsReached', () => {
  console.error('❌ Máximos intentos de reconexión alcanzados');
});

// ===============================
// 5. CONFIGURACIÓN REQUERIDA
// ===============================

/**
 * Para que funcione, el usuario debe tener configuración de email:
 * 
 * 1. Ir a configuración de usuario
 * 2. Configurar email SMTP (Gmail, Outlook, Yahoo, etc.)
 * 3. El sistema automáticamente convierte SMTP a IMAP:
 *    - smtp.gmail.com → imap.gmail.com
 *    - smtp-mail.outlook.com → outlook.office365.com
 *    - smtp.mail.yahoo.com → imap.mail.yahoo.com
 */

// ===============================
// 6. COMPATIBILIDAD
// ===============================

/**
 * - Mantiene 100% compatibilidad con envío existente
 * - Los campos antiguos (text, html) siguen funcionando
 * - Los endpoints existentes no cambian
 * - Se agregaron nuevos campos opcionales
 * - Direccionalidad automática: 'outgoing' para envíos existentes
 */

// ===============================
// 7. EJEMPLO COMPLETO DE FLUJO
// ===============================

const emailWorkflow = async () => {
  const companySlug = 'mi-empresa';
  const userId = '64f7b8a9e12345678901234a'; // ID del usuario con email configurado
  
  try {
    // 1. Iniciar monitoreo
    await startEmailMonitoring(companySlug, userId);
    
    // 2. Sincronizar últimos 3 días
    await syncHistoricalEmails(companySlug, userId, 3);
    
    // 3. Obtener historial solo de emails entrantes
    await getEmailHistory(companySlug, { 
      direction: 'incoming',
      limit: '10' 
    });
    
    // 4. Ver estadísticas del último mes
    await getEmailStats(companySlug, 30);
    
    console.log('🎉 Email workflow completado');
    
  } catch (error) {
    console.error('❌ Error en workflow:', error);
  }
};

// ===============================
// 8. SOLUCIÓN DE PROBLEMAS
// ===============================

/**
 * Errores comunes:
 * 
 * 1. "User ID is required"
 *    → Asegúrate de enviar userId en el body
 * 
 * 2. "Email configuration not found"
 *    → El usuario debe tener configuración SMTP activa
 * 
 * 3. "IMAP connection error"
 *    → Verificar credenciales y configuración de email
 *    → Para Gmail: habilitar "App passwords"
 *    → Para Outlook: verificar autenticación moderna
 * 
 * 4. "Max reconnect attempts reached"
 *    → Problema de conectividad o credenciales
 *    → Reiniciar monitoreo con credenciales correctas
 */

export {
  startEmailMonitoring,
  getEmailHistory,
  syncHistoricalEmails,
  getEmailStats,
  emailWorkflow
};