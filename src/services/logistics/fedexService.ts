import axios, { AxiosInstance } from 'axios';
import {
  FedExCredentials,
  ShipmentRateRequest,
  ShipmentRateResponse,
  CreateShipmentRequest,
  CreateShipmentResponse,
  TrackingInfo,
  ShipmentRate,
  calculateDimensionalWeight,
  LogisticsProvider,
  TrackingStatus
} from '../../types/logistics.types';

interface FedExAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface FedExRateResponse {
  transactionId: string;
  customerTransactionId?: string;
  output: {
    rateReplyDetails: Array<{
      serviceType: string;
      serviceName: string;
      packagingType: string;
      ratedShipmentDetails: Array<{
        rateType: string;
        totalNetCharge: number;
        totalBaseCharge: number;
        totalNetFedExCharge: number;
        totalDutiesAndTaxes?: number;
        totalNetChargeWithDutiesAndTaxes?: number;
        currency: string;
        surcharges?: Array<{
          type: string;
          description: string;
          amount: number;
        }>;
      }>;
      operationalDetail?: {
        originLocationIds?: string[];
        originLocationNumbers?: number[];
        originServiceAreas?: string[];
        destinationLocationIds?: string[];
        destinationLocationNumbers?: number[];
        destinationServiceAreas?: string[];
        destinationLocationStateOrProvinceCodes?: string[];
        deliveryDate?: string;
        deliveryDay?: string;
        commitDate?: string;
        commitDay?: string;
        ineligibleForMoneyBackGuarantee?: boolean;
        astraDescription?: string;
        airportId?: string;
        serviceCode?: string;
      };
      signatureOptionType?: string;
      serviceDescription?: {
        serviceId?: string;
        serviceType?: string;
        code?: string;
        names?: Array<{
          type?: string;
          encoding?: string;
          value?: string;
        }>;
        operatingOrgCodes?: string[];
        astraDescription?: string;
        description?: string;
      };
    }>;
    quoteDate?: string;
    encoded?: boolean;
  };
}

export class FedExService {
  private credentials: FedExCredentials;
  private apiClient: AxiosInstance;
  private baseUrl: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

  constructor(credentials: FedExCredentials) {
    this.credentials = credentials;
    this.baseUrl = credentials.environment === 'sandbox' 
      ? 'https://apis-sandbox.fedex.com'
      : 'https://apis.fedex.com';

    this.apiClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // Interceptor para agregar token de autorización automáticamente
    this.apiClient.interceptors.request.use(async (config) => {
      await this.ensureValidToken();
      if (this.accessToken) {
        config.headers.Authorization = `Bearer ${this.accessToken}`;
      }
      return config;
    });
  }

  /**
   * Asegura que tenemos un token de acceso válido
   */
  private async ensureValidToken(): Promise<void> {
    if (this.accessToken && this.tokenExpiresAt && new Date() < this.tokenExpiresAt) {
      return; // Token aún válido
    }

    await this.authenticate();
  }

  /**
   * Autentica con FedEx y obtiene un token de acceso
   */
  private async authenticate(): Promise<void> {
    try {
      const response = await axios.post(`${this.baseUrl}/oauth/token`, 
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.credentials.clientId,
          client_secret: this.credentials.clientSecret,
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const authData: FedExAuthResponse = response.data;
      this.accessToken = authData.access_token;
      
      // Configurar expiración con un margen de seguridad de 5 minutos
      const expiresInMs = (authData.expires_in - 300) * 1000;
      this.tokenExpiresAt = new Date(Date.now() + expiresInMs);

      console.log('✅ FedEx authentication successful');
    } catch (error) {
      console.error('❌ FedEx authentication failed:', error.response?.data || error.message);
      throw new Error(`FedEx authentication failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Obtiene cotizaciones de envío de FedEx
   */
  async getRates(request: ShipmentRateRequest): Promise<ShipmentRateResponse> {
    try {
      // Calcular peso dimensional para cada paquete
      const packagesWithDimWeight = request.packages.map(pkg => {
        const dimWeight = calculateDimensionalWeight(pkg.dimensions, LogisticsProvider.FEDEX);
        const actualWeight = pkg.weight;
        
        // FedEx usa el mayor entre peso real y peso dimensional
        const billableWeight = dimWeight.value > actualWeight.value ? dimWeight : actualWeight;
        
        return {
          ...pkg,
          weight: billableWeight
        };
      });

      const fedexPayload = {
        accountNumber: {
          value: this.credentials.accountNumber
        },
        requestedShipment: {
          shipper: {
            address: {
              streetLines: request.shipper.streetLines,
              city: request.shipper.city,
              stateOrProvinceCode: request.shipper.stateOrProvinceCode,
              postalCode: request.shipper.postalCode,
              countryCode: request.shipper.countryCode,
              residential: request.shipper.residential || false
            }
          },
          recipients: [{
            address: {
              streetLines: request.recipient.streetLines,
              city: request.recipient.city,
              stateOrProvinceCode: request.recipient.stateOrProvinceCode,
              postalCode: request.recipient.postalCode,
              countryCode: request.recipient.countryCode,
              residential: request.recipient.residential || false
            }
          }],
          serviceType: request.serviceType || undefined,
          packagingType: request.requestedShipment?.packagingType || 'YOUR_PACKAGING',
          pickupType: request.pickupType || 'USE_SCHEDULED_PICKUP',
          requestedPackageLineItems: packagesWithDimWeight.map((pkg, index) => ({
            sequenceNumber: index + 1,
            groupPackageCount: 1,
            weight: {
              units: pkg.weight.units,
              value: pkg.weight.value
            },
            dimensions: {
              length: pkg.dimensions.length,
              width: pkg.dimensions.width,
              height: pkg.dimensions.height,
              units: pkg.dimensions.units
            }
          })),
          shipDatestamp: request.requestedShipment?.shipDatestamp || new Date().toISOString().split('T')[0],
          rateRequestType: request.requestedShipment?.rateRequestType || ['ACCOUNT', 'LIST'],
          preferredCurrency: request.requestedShipment?.preferredCurrency || 'USD'
        }
      };

      const response = await this.apiClient.post<FedExRateResponse>('/rate/v1/rates/quotes', fedexPayload);
      
      const rates: ShipmentRate[] = response.data.output.rateReplyDetails.map(rate => {
        const ratedShipment = rate.ratedShipmentDetails[0]; // Tomamos la primera opción de rate
        
        return {
          serviceType: rate.serviceType,
          serviceName: rate.serviceName || rate.serviceType,
          totalNetCharge: ratedShipment.totalNetCharge,
          totalBaseCharge: ratedShipment.totalBaseCharge,
          totalNetChargeWithDutiesAndTaxes: ratedShipment.totalNetChargeWithDutiesAndTaxes,
          currency: ratedShipment.currency,
          transitTime: rate.operationalDetail?.commitDate || undefined,
          deliveryTimestamp: rate.operationalDetail?.deliveryDate || undefined,
          deliveryDayOfWeek: rate.operationalDetail?.deliveryDay || undefined,
          ratedShipmentDetails: rate.ratedShipmentDetails,
          commit: rate.operationalDetail?.commitDate ? {
            label: `Delivery by ${rate.operationalDetail.commitDate}`,
            commitTimestamp: rate.operationalDetail.commitDate,
            dayOfWeek: rate.operationalDetail.commitDay || ''
          } : undefined
        };
      });

      return {
        provider: 'fedex',
        success: true,
        rates,
        transactionId: response.data.transactionId,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ FedEx rate request failed:', error.response?.data || error.message);
      
      return {
        provider: 'fedex',
        success: false,
        rates: [],
        errorMessage: error.response?.data?.errors?.[0]?.message || error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Crea un envío en FedEx
   */
  async createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResponse> {
    try {
      // Obtener rates primero para validar el servicio
      const ratesResponse = await this.getRates(request);
      
      if (!ratesResponse.success || ratesResponse.rates.length === 0) {
        throw new Error('No rates available for this shipment');
      }

      // Usar el primer rate disponible si no se especifica serviceType
      const selectedRate = request.serviceType 
        ? ratesResponse.rates.find(r => r.serviceType === request.serviceType)
        : ratesResponse.rates[0];

      if (!selectedRate) {
        throw new Error(`Service type ${request.serviceType} not available`);
      }

      const fedexPayload = {
        accountNumber: {
          value: this.credentials.accountNumber
        },
        requestedShipment: {
          shipper: {
            contact: {
              personName: request.shipper.personName || 'Shipper',
              phoneNumber: request.shipper.phoneNumber || '',
              companyName: request.shipper.companyName || ''
            },
            address: {
              streetLines: request.shipper.streetLines,
              city: request.shipper.city,
              stateOrProvinceCode: request.shipper.stateOrProvinceCode,
              postalCode: request.shipper.postalCode,
              countryCode: request.shipper.countryCode,
              residential: request.shipper.residential || false
            }
          },
          recipients: [{
            contact: {
              personName: request.recipient.personName || 'Recipient',
              phoneNumber: request.recipient.phoneNumber || '',
              companyName: request.recipient.companyName || ''
            },
            address: {
              streetLines: request.recipient.streetLines,
              city: request.recipient.city,
              stateOrProvinceCode: request.recipient.stateOrProvinceCode,
              postalCode: request.recipient.postalCode,
              countryCode: request.recipient.countryCode,
              residential: request.recipient.residential || false
            }
          }],
          serviceType: selectedRate.serviceType,
          packagingType: request.requestedShipment?.packagingType || 'YOUR_PACKAGING',
          pickupType: request.pickupType || 'USE_SCHEDULED_PICKUP',
          requestedPackageLineItems: request.packages.map((pkg, index) => ({
            sequenceNumber: index + 1,
            weight: {
              units: pkg.weight.units,
              value: pkg.weight.value
            },
            dimensions: {
              length: pkg.dimensions.length,
              width: pkg.dimensions.width,
              height: pkg.dimensions.height,
              units: pkg.dimensions.units
            }
          })),
          shipDatestamp: request.requestedShipment?.shipDatestamp || new Date().toISOString().split('T')[0],
          labelSpecification: {
            labelFormatType: request.labelFormat || 'COMMON2D',
            imageType: 'PDF',
            labelStockType: request.labelSize || 'PAPER_4X6'
          },
          shippingChargesPayment: {
            paymentType: 'SENDER'
          }
        }
      };

      // Agregar referencias del cliente si están presentes
      if (request.customerReference || request.invoiceNumber || request.poNumber) {
        fedexPayload.requestedShipment.requestedPackageLineItems.forEach((item: any) => {
          item.customerReferences = [];
          
          if (request.customerReference) {
            item.customerReferences.push({
              customerReferenceType: 'CUSTOMER_REFERENCE',
              value: request.customerReference
            });
          }
          
          if (request.invoiceNumber) {
            item.customerReferences.push({
              customerReferenceType: 'INVOICE_NUMBER',
              value: request.invoiceNumber
            });
          }
          
          if (request.poNumber) {
            item.customerReferences.push({
              customerReferenceType: 'P_O_NUMBER',
              value: request.poNumber
            });
          }
        });
      }

      const response = await this.apiClient.post('/ship/v1/shipments', fedexPayload);

      const shipmentData = response.data.output.transactionShipments[0];
      const masterTrackingNumber = shipmentData.masterTrackingNumber;
      const pieceTrackingNumber = shipmentData.pieceResponses[0].trackingNumber;
      
      return {
        provider: 'fedex',
        success: true,
        shipmentId: masterTrackingNumber,
        trackingNumber: pieceTrackingNumber,
        masterTrackingNumber: masterTrackingNumber,
        labelBase64: shipmentData.pieceResponses[0].packageDocuments?.[0]?.encodedLabel,
        totalCost: selectedRate.totalNetCharge,
        currency: selectedRate.currency,
        serviceType: selectedRate.serviceType,
        transactionId: response.data.transactionId,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ FedEx shipment creation failed:', error.response?.data || error.message);
      
      return {
        provider: 'fedex',
        success: false,
        errorMessage: error.response?.data?.errors?.[0]?.message || error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Rastrea un envío por número de seguimiento
   */
  async trackShipment(trackingNumber: string): Promise<TrackingInfo | null> {
    try {
      const response = await this.apiClient.post('/track/v1/trackingnumbers', {
        trackingInfo: [{
          trackingNumberInfo: {
            trackingNumber: trackingNumber
          }
        }],
        includeDetailedScans: true
      });

      const trackingData = response.data.output.completeTrackResults[0];
      
      if (!trackingData || !trackingData.trackResults[0]) {
        return null;
      }

      const result = trackingData.trackResults[0];
      
      return {
        trackingNumber: trackingNumber,
        status: this.mapFedExStatusToStandard(result.latestStatusDetail?.code),
        statusDescription: result.latestStatusDetail?.description || 'No status available',
        estimatedDelivery: result.dateAndTimes?.find(dt => dt.type === 'ESTIMATED_DELIVERY')?.dateTime,
        actualDelivery: result.dateAndTimes?.find(dt => dt.type === 'ACTUAL_DELIVERY')?.dateTime,
        events: result.scanEvents?.map(event => ({
          timestamp: event.date,
          status: event.eventType,
          description: event.eventDescription,
          location: event.scanLocation ? {
            city: event.scanLocation.city || '',
            stateOrProvinceCode: event.scanLocation.stateOrProvinceCode,
            countryCode: event.scanLocation.countryCode || ''
          } : undefined
        })) || [],
        lastUpdated: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ FedEx tracking failed:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Mapea códigos de estado de FedEx a nuestro estándar
   */
  private mapFedExStatusToStandard(fedexStatus?: string): TrackingStatus {
    const statusMap: { [key: string]: TrackingStatus } = {
      'OC': TrackingStatus.PICKED_UP,
      'IT': TrackingStatus.IN_TRANSIT,
      'OD': TrackingStatus.OUT_FOR_DELIVERY,
      'DL': TrackingStatus.DELIVERED,
      'DE': TrackingStatus.EXCEPTION,
      'CA': TrackingStatus.CANCELLED,
      'PU': TrackingStatus.PICKED_UP
    };

    return statusMap[fedexStatus || ''] || TrackingStatus.IN_TRANSIT;
  }

  /**
   * Valida credenciales de FedEx
   */
  async validateCredentials(): Promise<{ valid: boolean; error?: string }> {
    try {
      await this.authenticate();
      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: error.message 
      };
    }
  }
}
