import { Router } from 'express';
import { 
  generateVerificationCode,
  verifyCode,
  getVerificationStatus,
  resendVerificationCode
} from '../controllers/emailVerification.controller';
import { detectCompanyFromToken } from '../core/auth/companyMiddleware';

const router = Router();

// ==================================================
// RUTAS DE VERIFICACIÓN DE EMAIL
// ==================================================

// Generar código de verificación
router.post('/generate/:c_name', detectCompanyFromToken, generateVerificationCode);
router.post('/generate', detectCompanyFromToken, generateVerificationCode);

// Verificar código
router.post('/verify/:c_name', detectCompanyFromToken, verifyCode);
router.post('/verify', detectCompanyFromToken, verifyCode);

// Obtener estado de verificación
router.get('/status/:c_name/:userId', detectCompanyFromToken, getVerificationStatus);
router.get('/status/:userId', detectCompanyFromToken, getVerificationStatus);

// Reenviar código de verificación
router.post('/resend/:c_name', detectCompanyFromToken, resendVerificationCode);
router.post('/resend', detectCompanyFromToken, resendVerificationCode);

export default router;

