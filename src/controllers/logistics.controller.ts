import { Request, Response } from 'express';
import { LogisticsProvider, ShipmentQuote, ShipmentHistory } from '../models/logistics.model';
import { FedExService } from '../services/logistics/fedexService';
import {
  FedExCredentials,
  ShipmentRateRequest,
  CreateShipmentRequest,
  validateAddress,
  LogisticsProvider as LogisticsProviderType
} from '../types/logistics.types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Configura las credenciales de un proveedor de logística
 */
export const setupLogisticsProvider = async (req: Request, res: Response) => {
  try {
    const companySlug = req.query.companySlug as string;
    const { provider, credentials } = req.body;

    if (!companySlug) {
      return res.status(400).json({ 
        success: false, 
        message: 'companySlug is required' 
      });
    }

    if (!provider || !credentials) {
      return res.status(400).json({
        success: false,
        message: 'provider and credentials are required'
      });
    }

    // Validar que el proveedor sea soportado
    const supportedProviders = ['fedex', 'ups', 'dhl', 'usps'];
    if (!supportedProviders.includes(provider)) {
      return res.status(400).json({
        success: false,
        message: `Unsupported provider. Supported providers: ${supportedProviders.join(', ')}`
      });
    }

    // Validar credenciales según el proveedor
    let validationResult: { valid: boolean; error?: string } = { valid: false };

    if (provider === 'fedex') {
      const fedexCredentials = credentials as FedExCredentials;
      
      // Validar campos requeridos
      if (!fedexCredentials.clientId || !fedexCredentials.clientSecret || !fedexCredentials.accountNumber) {
        return res.status(400).json({
          success: false,
          message: 'FedEx requires clientId, clientSecret, and accountNumber'
        });
      }

      // Validar credenciales con la API de FedEx
      const fedexService = new FedExService(fedexCredentials);
      validationResult = await fedexService.validateCredentials();
    }

    if (!validationResult.valid) {
      return res.status(400).json({
        success: false,
        message: `Invalid credentials: ${validationResult.error}`
      });
    }

    // Buscar configuración existente
    let logisticsProvider = await LogisticsProvider.findOne({ companySlug, provider });

    if (logisticsProvider) {
      // Actualizar credenciales existentes
      logisticsProvider.credentials = credentials;
      logisticsProvider.isActive = true;
      await logisticsProvider.save();
    } else {
      // Crear nueva configuración
      logisticsProvider = new LogisticsProvider({
        companySlug,
        provider,
        credentials,
        isActive: true
      });
      await logisticsProvider.save();
    }

    res.status(200).json({
      success: true,
      message: `${provider.toUpperCase()} credentials configured successfully`,
      data: {
        id: logisticsProvider._id,
        provider: logisticsProvider.provider,
        isActive: logisticsProvider.isActive,
        createdAt: logisticsProvider.createdAt
      }
    });

  } catch (error) {
    console.error('❌ Setup logistics provider error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
};

/**
 * Obtiene los proveedores de logística configurados para una empresa
 */
export const getLogisticsProviders = async (req: Request, res: Response) => {
  try {
    const companySlug = req.query.companySlug as string;

    if (!companySlug) {
      return res.status(400).json({ 
        success: false, 
        message: 'companySlug is required' 
      });
    }

    const providers = await LogisticsProvider.find({ companySlug }, {
      companySlug: 1,
      provider: 1,
      isActive: 1,
      createdAt: 1,
      updatedAt: 1
      // Excluir credentials por seguridad
    });

    res.json({
      success: true,
      data: providers
    });

  } catch (error) {
    console.error('❌ Get logistics providers error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
};

/**
 * Obtiene cotización de envío
 */
export const getShippingQuote = async (req: Request, res: Response) => {
  try {
    const companySlug = req.query.companySlug as string;
    const { provider } = req.params;
    const rateRequest: ShipmentRateRequest = req.body;

    if (!companySlug) {
      return res.status(400).json({ 
        success: false, 
        message: 'companySlug is required' 
      });
    }

    // Validar campos requeridos
    if (!rateRequest.shipper || !rateRequest.recipient || !rateRequest.packages || rateRequest.packages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'shipper, recipient, and packages are required'
      });
    }

    // Validar direcciones
    const shipperErrors = validateAddress(rateRequest.shipper);
    const recipientErrors = validateAddress(rateRequest.recipient);

    if (shipperErrors.length > 0 || recipientErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid address data',
        errors: {
          shipper: shipperErrors,
          recipient: recipientErrors
        }
      });
    }

    // Validar paquetes
    for (let i = 0; i < rateRequest.packages.length; i++) {
      const pkg = rateRequest.packages[i];
      if (!pkg.weight || !pkg.dimensions) {
        return res.status(400).json({
          success: false,
          message: `Package ${i + 1} must have weight and dimensions`
        });
      }

      if (pkg.weight.value <= 0 || pkg.dimensions.length <= 0 || pkg.dimensions.width <= 0 || pkg.dimensions.height <= 0) {
        return res.status(400).json({
          success: false,
          message: `Package ${i + 1} must have positive weight and dimensions`
        });
      }
    }

    // Obtener credenciales del proveedor
    const logisticsProvider = await LogisticsProvider.findOne({ 
      companySlug, 
      provider: provider.toLowerCase(),
      isActive: true 
    });

    if (!logisticsProvider) {
      return res.status(404).json({
        success: false,
        message: `${provider.toUpperCase()} provider not configured for this company`
      });
    }

    let quoteResponse;

    // Procesar según el proveedor
    if (provider.toLowerCase() === 'fedex') {
      const fedexService = new FedExService(logisticsProvider.credentials as FedExCredentials);
      quoteResponse = await fedexService.getRates(rateRequest);
    } else {
      return res.status(400).json({
        success: false,
        message: `Provider ${provider} not yet implemented`
      });
    }

    // Generar ID único para la cotización
    const quoteId = uuidv4();

    // Guardar cotización en base de datos
    const shipmentQuote = new ShipmentQuote({
      companySlug,
      provider: provider.toLowerCase(),
      quoteId,
      request: rateRequest,
      response: quoteResponse.rates,
      status: quoteResponse.success ? 'completed' : 'error',
      errorMessage: quoteResponse.errorMessage,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // Expira en 24 horas
    });

    await shipmentQuote.save();

    res.json({
      success: quoteResponse.success,
      quoteId,
      provider: provider.toLowerCase(),
      rates: quoteResponse.rates,
      errorMessage: quoteResponse.errorMessage,
      transactionId: quoteResponse.transactionId,
      timestamp: quoteResponse.timestamp,
      expiresAt: shipmentQuote.expiresAt
    });

  } catch (error) {
    console.error('❌ Get shipping quote error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
};

/**
 * Crea un envío
 */
export const createShipment = async (req: Request, res: Response) => {
  try {
    const companySlug = req.query.companySlug as string;
    const { provider } = req.params;
    const shipmentRequest: CreateShipmentRequest = req.body;

    if (!companySlug) {
      return res.status(400).json({ 
        success: false, 
        message: 'companySlug is required' 
      });
    }

    // Validaciones similares a la cotización
    if (!shipmentRequest.shipper || !shipmentRequest.recipient || !shipmentRequest.packages || shipmentRequest.packages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'shipper, recipient, and packages are required'
      });
    }

    // Validar direcciones
    const shipperErrors = validateAddress(shipmentRequest.shipper);
    const recipientErrors = validateAddress(shipmentRequest.recipient);

    if (shipperErrors.length > 0 || recipientErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid address data',
        errors: {
          shipper: shipperErrors,
          recipient: recipientErrors
        }
      });
    }

    // Obtener credenciales del proveedor
    const logisticsProvider = await LogisticsProvider.findOne({ 
      companySlug, 
      provider: provider.toLowerCase(),
      isActive: true 
    });

    if (!logisticsProvider) {
      return res.status(404).json({
        success: false,
        message: `${provider.toUpperCase()} provider not configured for this company`
      });
    }

    let shipmentResponse;

    // Procesar según el proveedor
    if (provider.toLowerCase() === 'fedex') {
      const fedexService = new FedExService(logisticsProvider.credentials as FedExCredentials);
      shipmentResponse = await fedexService.createShipment(shipmentRequest);
    } else {
      return res.status(400).json({
        success: false,
        message: `Provider ${provider} not yet implemented`
      });
    }

    // Si el envío fue exitoso, guardarlo en el historial
    if (shipmentResponse.success && shipmentResponse.shipmentId) {
      const shipmentHistory = new ShipmentHistory({
        companySlug,
        provider: provider.toLowerCase(),
        shipmentId: shipmentResponse.shipmentId,
        trackingNumber: shipmentResponse.trackingNumber,
        status: 'created',
        shipper: shipmentRequest.shipper,
        recipient: shipmentRequest.recipient,
        packages: shipmentRequest.packages,
        serviceType: shipmentResponse.serviceType || shipmentRequest.serviceType || 'UNKNOWN',
        totalCost: shipmentResponse.totalCost || 0,
        currency: shipmentResponse.currency || 'USD'
      });

      await shipmentHistory.save();
    }

    res.json({
      success: shipmentResponse.success,
      shipmentId: shipmentResponse.shipmentId,
      trackingNumber: shipmentResponse.trackingNumber,
      masterTrackingNumber: shipmentResponse.masterTrackingNumber,
      labelBase64: shipmentResponse.labelBase64,
      totalCost: shipmentResponse.totalCost,
      currency: shipmentResponse.currency,
      serviceType: shipmentResponse.serviceType,
      errorMessage: shipmentResponse.errorMessage,
      transactionId: shipmentResponse.transactionId,
      timestamp: shipmentResponse.timestamp
    });

  } catch (error) {
    console.error('❌ Create shipment error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
};

/**
 * Rastrea un envío
 */
export const trackShipment = async (req: Request, res: Response) => {
  try {
    const companySlug = req.query.companySlug as string;
    const { provider, trackingNumber } = req.params;

    if (!companySlug) {
      return res.status(400).json({ 
        success: false, 
        message: 'companySlug is required' 
      });
    }

    if (!trackingNumber) {
      return res.status(400).json({
        success: false,
        message: 'trackingNumber is required'
      });
    }

    // Obtener credenciales del proveedor
    const logisticsProvider = await LogisticsProvider.findOne({ 
      companySlug, 
      provider: provider.toLowerCase(),
      isActive: true 
    });

    if (!logisticsProvider) {
      return res.status(404).json({
        success: false,
        message: `${provider.toUpperCase()} provider not configured for this company`
      });
    }

    let trackingInfo;

    // Procesar según el proveedor
    if (provider.toLowerCase() === 'fedex') {
      const fedexService = new FedExService(logisticsProvider.credentials as FedExCredentials);
      trackingInfo = await fedexService.trackShipment(trackingNumber);
    } else {
      return res.status(400).json({
        success: false,
        message: `Provider ${provider} not yet implemented`
      });
    }

    if (!trackingInfo) {
      return res.status(404).json({
        success: false,
        message: 'Tracking information not found'
      });
    }

    // Actualizar estado en el historial si existe
    const shipmentHistory = await ShipmentHistory.findOne({ 
      companySlug, 
      trackingNumber 
    });

    if (shipmentHistory) {
      shipmentHistory.status = trackingInfo.status.toLowerCase() as 'created' | 'in_transit' | 'delivered' | 'exception' | 'cancelled';
      await shipmentHistory.save();
    }

    res.json({
      success: true,
      trackingInfo
    });

  } catch (error) {
    console.error('❌ Track shipment error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
};

/**
 * Obtiene el historial de envíos de una empresa
 */
export const getShipmentHistory = async (req: Request, res: Response) => {
  try {
    const companySlug = req.query.companySlug as string;
    const { page = 1, limit = 20, provider, status } = req.query;

    if (!companySlug) {
      return res.status(400).json({ 
        success: false, 
        message: 'companySlug is required' 
      });
    }

    const query: any = { companySlug };
    
    if (provider) {
      query.provider = provider;
    }
    
    if (status) {
      query.status = status;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [shipments, total] = await Promise.all([
      ShipmentHistory.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      ShipmentHistory.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: shipments,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });

  } catch (error) {
    console.error('❌ Get shipment history error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
};

/**
 * Obtiene cotizaciones guardadas
 */
export const getSavedQuotes = async (req: Request, res: Response) => {
  try {
    const companySlug = req.query.companySlug as string;
    const { page = 1, limit = 20, provider, status } = req.query;

    if (!companySlug) {
      return res.status(400).json({ 
        success: false, 
        message: 'companySlug is required' 
      });
    }

    const query: any = { companySlug };
    
    if (provider) {
      query.provider = provider;
    }
    
    if (status) {
      query.status = status;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [quotes, total] = await Promise.all([
      ShipmentQuote.find(query, {
        companySlug: 1,
        provider: 1,
        quoteId: 1,
        response: 1,
        status: 1,
        errorMessage: 1,
        expiresAt: 1,
        createdAt: 1
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      ShipmentQuote.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: quotes,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });

  } catch (error) {
    console.error('❌ Get saved quotes error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
};
