import { Request, Response } from 'express';
import axios from 'axios';

const CONTPAQ_SERVICE_URL = process.env.CONTPAQ_SERVICE_URL || 'https://68e9ada09625.ngrok-free.app';

export class ContpaqController {
  
  // Obtener productos
  async getProducts(req: Request, res: Response): Promise<void> {
    try {
      const response = await axios.get(`${CONTPAQ_SERVICE_URL}/products`);
      
      if (response.data.status === 'OK') {
        res.json({
          success: true,
          data: response.data.data,
          count: response.data.count,
          source: 'Contpaq Windows Service'
        });
      } else {
        throw new Error(response.data.message);
      }
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error obteniendo productos desde Contpaq',
        error: error.message
      });
    }
  }

  // Obtener ventas
  async getSales(req: Request, res: Response): Promise<void> {
    try {
      const response = await axios.get(`${CONTPAQ_SERVICE_URL}/sales`);
      
      if (response.data.status === 'OK') {
        res.json({
          success: true,
          data: response.data.data,
          count: response.data.count,
          source: 'Contpaq Windows Service'
        });
      } else {
        throw new Error(response.data.message);
      }
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error obteniendo ventas desde Contpaq',
        error: error.message
      });
    }
  }

  // Dashboard ejecutivo
  async getDashboard(req: Request, res: Response): Promise<void> {
    try {
      // Obtener datos reales del servicio de Windows
      const [productsResponse, salesResponse] = await Promise.all([
        axios.get(`${CONTPAQ_SERVICE_URL}/products`),
        axios.get(`${CONTPAQ_SERVICE_URL}/sales`)
      ]);

      const products = productsResponse.data.status === 'OK' ? productsResponse.data.data : [];
      const sales = salesResponse.data.status === 'OK' ? salesResponse.data.data : [];

      // Calcular KPIs
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      
      const salesToday = sales.filter((sale: any) => 
        sale.fecha.startsWith(todayStr)
      ).length;

      // Top productos (simulado basado en ventas)
      const productSales = sales.reduce((acc: any, sale: any) => {
        const key = sale.codigoProducto;
        if (!acc[key]) {
          acc[key] = {
            codigo: sale.codigoProducto,
            nombre: sale.nombreProducto,
            totalVendido: 0,
            totalVentas: 0
          };
        }
        acc[key].totalVendido += sale.cantidad;
        acc[key].totalVentas += 1;
        return acc;
      }, {});

      const topProducts = Object.values(productSales)
        .sort((a: any, b: any) => b.totalVendido - a.totalVendido)
        .slice(0, 10);

      // Top clientes
      const clientSales = sales.reduce((acc: any, sale: any) => {
        const key = sale.cliente;
        if (!acc[key]) {
          acc[key] = {
            cliente: sale.cliente,
            rfc: sale.rfc,
            totalCompras: 0,
            totalProductos: 0
          };
        }
        acc[key].totalCompras += 1;
        acc[key].totalProductos += sale.cantidad;
        return acc;
      }, {});

      const topClients = Object.values(clientSales)
        .sort((a: any, b: any) => b.totalCompras - a.totalCompras)
        .slice(0, 10);

      const dashboardData = {
        summary: {
          totalProducts: products.length,
          totalSales: sales.length,
          salesToday,
          lastSync: new Date()
        },
        charts: {
          topProducts,
          topClients
        },
        generatedAt: new Date(),
        source: 'Contpaq Windows Service'
      };

      res.json({
        success: true,
        data: dashboardData
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error generando dashboard',
        error: error.message
      });
    }
  }

  // Probar conexión
  async testConnection(req: Request, res: Response): Promise<void> {
    try {
      const response = await axios.get(`${CONTPAQ_SERVICE_URL}/test`);
      
      res.json({
        success: true,
        message: 'Conexión exitosa al servicio de Contpaq',
        data: response.data,
        serviceUrl: CONTPAQ_SERVICE_URL
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error conectando al servicio de Contpaq',
        error: error.message,
        serviceUrl: CONTPAQ_SERVICE_URL
      });
    }
  }

  // Métricas avanzadas
  async getMetrics(req: Request, res: Response): Promise<void> {
    try {
      const response = await axios.get(`${CONTPAQ_SERVICE_URL}/metrics`);
      res.json({ success: true, data: response.data.data, source: "Contpaq Windows Service" });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error obteniendo métricas desde Contpaq',
        error: error.message,
        serviceUrl: CONTPAQ_SERVICE_URL
      });
    }
  }

  // Top performers
  async getTopPerformers(req: Request, res: Response): Promise<void> {
    try {
      const response = await axios.get(`${CONTPAQ_SERVICE_URL}/top-performers`);
      res.json({ success: true, data: response.data.data, source: "Contpaq Windows Service" });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error obteniendo top performers desde Contpaq',
        error: error.message,
        serviceUrl: CONTPAQ_SERVICE_URL
      });
    }
  }

  // Análisis de inventario
  async getInventoryAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const response = await axios.get(`${CONTPAQ_SERVICE_URL}/inventory-analysis`);
      res.json({ success: true, data: response.data.data, source: "Contpaq Windows Service" });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error obteniendo análisis de inventario desde Contpaq',
        error: error.message,
        serviceUrl: CONTPAQ_SERVICE_URL
      });
    }
  }

  // Análisis detallado de producto individual
  async getProductAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const { codigo } = req.params;
      const { startDate, endDate } = req.query;
      
      const response = await axios.get(`${CONTPAQ_SERVICE_URL}/product-analysis/${codigo}?startDate=${startDate}&endDate=${endDate}`);
      res.json({ success: true, data: response.data.data, source: "Contpaq Windows Service" });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error obteniendo análisis de producto desde Contpaq',
        error: error.message,
        serviceUrl: CONTPAQ_SERVICE_URL
      });
    }
  }

  // Ventas por rango de fechas
  async getSalesByDateRange(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, codigoProducto } = req.query;
      
      const response = await axios.get(`${CONTPAQ_SERVICE_URL}/sales/date-range?startDate=${startDate}&endDate=${endDate}&codigoProducto=${codigoProducto}`);
      res.json({ success: true, data: response.data.data, source: "Contpaq Windows Service" });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error obteniendo ventas por fecha desde Contpaq',
        error: error.message,
        serviceUrl: CONTPAQ_SERVICE_URL
      });
    }
  }

  // Historial completo de producto
  async getProductHistory(req: Request, res: Response): Promise<void> {
    try {
      const { codigo } = req.params;
      const { limit = 50, offset = 0 } = req.query;
      
      const response = await axios.get(`${CONTPAQ_SERVICE_URL}/product-history/${codigo}?limit=${limit}&offset=${offset}`);
      res.json({ success: true, data: response.data.data, source: "Contpaq Windows Service" });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error obteniendo historial de producto desde Contpaq',
        error: error.message,
        serviceUrl: CONTPAQ_SERVICE_URL
      });
    }
  }

  // Reporte de cobranza - Facturas pendientes
  async getCobranza(req: Request, res: Response): Promise<void> {
    try {
      const { asesor, estado, cliente, fechaInicio, fechaFin } = req.query;
      
      let url = `${CONTPAQ_SERVICE_URL}/cobranza?`;
      const params = new URLSearchParams();
      
      if (asesor) params.append('asesor', asesor as string);
      if (estado) params.append('estado', estado as string);
      if (cliente) params.append('cliente', cliente as string);
      if (fechaInicio) params.append('fechaInicio', fechaInicio as string);
      if (fechaFin) params.append('fechaFin', fechaFin as string);
      
      url += params.toString();
      
      const response = await axios.get(url);
      res.json({ success: true, data: response.data.data, source: "Contpaq Windows Service" });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error obteniendo reporte de cobranza desde Contpaq',
        error: error.message,
        serviceUrl: CONTPAQ_SERVICE_URL
      });
    }
  }
}
