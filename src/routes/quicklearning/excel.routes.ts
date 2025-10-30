import { Router } from 'express';
import { downloadProspectosExcel, getProspectosStats, downloadProspectosCombinadoExcel } from '../../controllers/quicklearning/excelController';

const router = Router();

/**
 * @route GET /api/quicklearning/excel/prospectos
 * @desc Descargar Excel con datos de prospectos
 * @query startDate - Fecha de inicio (YYYY-MM-DD)
 * @query endDate - Fecha de fin (YYYY-MM-DD)
 * @query medio - Filtrar por medio específico
 * @query campana - Filtrar por campaña específica
 * @query limit - Límite de registros (default: 10000)
 * @access Public
 */
router.get('/prospectos', downloadProspectosExcel);

/**
 * @route GET /api/quicklearning/excel/stats
 * @desc Obtener estadísticas de prospectos
 * @query startDate - Fecha de inicio (YYYY-MM-DD)
 * @query endDate - Fecha de fin (YYYY-MM-DD)
 * @access Public
 */
router.get('/stats', getProspectosStats);

/**
 * @route GET /api/quicklearning/excel/prospectos-combinado
 * @desc Descargar Excel con dos hojas: Twilio y Prospectos DB
 * @query startDate - ISO (YYYY-MM-DDTHH:mm:ss.sssZ)
 * @query endDate - ISO (YYYY-MM-DDTHH:mm:ss.sssZ)
 * @query medio - Filtrar por medio (opcional)
 * @query campana - Filtrar por campaña (opcional)
 * @query companySlug - empresa (default quicklearning)
 * @access Public
 */
router.get('/prospectos-combinado', downloadProspectosCombinadoExcel);

export default router;
