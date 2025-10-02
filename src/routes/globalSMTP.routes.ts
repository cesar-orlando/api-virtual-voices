import { Router } from 'express';
import { 
  configureGlobalSMTP,
  getGlobalSMTPConfig,
  testGlobalSMTP
} from '../controllers/globalSMTP.controller';

const router = Router();

// ==================================================
// RUTAS DE CONFIGURACIÓN SMTP GLOBAL
// ==================================================

// Configurar SMTP global de Virtual Voices
router.post('/configure', configureGlobalSMTP);

// Obtener configuración SMTP actual
router.get('/config', getGlobalSMTPConfig);

// Probar configuración SMTP
router.post('/test', testGlobalSMTP);

export default router;

