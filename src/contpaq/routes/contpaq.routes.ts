import { Router } from 'express';
import { ContpaqController } from '../controllers/contpaq.controller';

const router = Router();
const contpaqController = new ContpaqController();

// Rutas de Contpaq
router.get('/products', (req, res) => contpaqController.getProducts(req, res));
router.get('/sales', (req, res) => contpaqController.getSales(req, res));
router.get('/dashboard', (req, res) => contpaqController.getDashboard(req, res));
router.get('/test', (req, res) => contpaqController.testConnection(req, res));
router.get('/metrics', (req, res) => contpaqController.getMetrics(req, res));
router.get('/top-performers', (req, res) => contpaqController.getTopPerformers(req, res));
router.get('/inventory-analysis', (req, res) => contpaqController.getInventoryAnalysis(req, res));

// Análisis detallado de productos
router.get('/product-analysis/:codigo', (req, res) => contpaqController.getProductAnalysis(req, res));
router.get('/product-history/:codigo', (req, res) => contpaqController.getProductHistory(req, res));
router.get('/sales/date-range', (req, res) => contpaqController.getSalesByDateRange(req, res));

// Ruta de información
router.get('/', (req, res) => {
  res.json({
    message: 'API de Contpaq - Simple Green',
    version: '1.0.0',
    endpoints: {
      products: 'GET /api/contpaq/products',
      sales: 'GET /api/contpaq/sales',
      dashboard: 'GET /api/contpaq/dashboard',
      test: 'GET /api/contpaq/test',
      metrics: 'GET /api/contpaq/metrics',
      topPerformers: 'GET /api/contpaq/top-performers',
      inventoryAnalysis: 'GET /api/contpaq/inventory-analysis',
      productAnalysis: 'GET /api/contpaq/product-analysis/:codigo',
      productHistory: 'GET /api/contpaq/product-history/:codigo',
      salesByDateRange: 'GET /api/contpaq/sales/date-range?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&codigoProducto=CODIGO'
    }
  });
});

export default router;
