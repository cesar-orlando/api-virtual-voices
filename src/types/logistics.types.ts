// Tipos para la funcionalidad de logística

export interface LogisticsCredentials {
  fedex?: FedExCredentials;
  ups?: UPSCredentials;
  dhl?: DHLCredentials;
  usps?: USPSCredentials;
}

export interface FedExCredentials {
  clientId: string;
  clientSecret: string;
  accountNumber: string;
  meterNumber?: string;
  environment: 'sandbox' | 'production';
}

export interface UPSCredentials {
  clientId: string;
  clientSecret: string;
  accountNumber: string;
  environment: 'sandbox' | 'production';
}

export interface DHLCredentials {
  apiKey: string;
  accountNumber: string;
  environment: 'sandbox' | 'production';
}

export interface USPSCredentials {
  userId: string;
  password: string;
  environment: 'sandbox' | 'production';
}

export interface Address {
  streetLines: string[];
  city: string;
  stateOrProvinceCode: string;
  postalCode: string;
  countryCode: string;
  residential?: boolean;
  companyName?: string;
  personName?: string;
  phoneNumber?: string;
  emailAddress?: string;
}

export interface PackageDimensions {
  length: number;
  width: number;
  height: number;
  units: 'IN' | 'CM';
}

export interface PackageWeight {
  value: number;
  units: 'LB' | 'KG';
}

export interface Package {
  weight: PackageWeight;
  dimensions: PackageDimensions;
  packagingType?: string;
  declaredValue?: {
    amount: number;
    currency: string;
  };
  specialServicesRequested?: string[];
}

export interface ShipmentRateRequest {
  shipper: Address;
  recipient: Address;
  packages: Package[];
  serviceType?: string;
  pickupType?: 'DROPOFF_AT_FEDEX_LOCATION' | 'CONTACT_FEDEX_TO_SCHEDULE' | 'USE_SCHEDULED_PICKUP';
  requestedShipment?: {
    shipDatestamp?: string;
    totalWeight?: PackageWeight;
    preferredCurrency?: string;
    rateRequestType?: 'ACCOUNT' | 'LIST';
    packagingType?: 'YOUR_PACKAGING' | 'FEDEX_ENVELOPE' | 'FEDEX_BOX' | 'FEDEX_TUBE';
  };
}

export interface ShipmentRate {
  serviceType: string;
  serviceName: string;
  totalNetCharge: number;
  totalBaseCharge: number;
  totalNetChargeWithDutiesAndTaxes?: number;
  currency: string;
  transitTime?: string;
  deliveryTimestamp?: string;
  deliveryDayOfWeek?: string;
  ratedShipmentDetails?: RatedShipmentDetail[];
  commit?: {
    label: string;
    commitTimestamp: string;
    dayOfWeek: string;
  };
}

export interface RatedShipmentDetail {
  rateType: string;
  totalNetCharge: number;
  totalBaseCharge: number;
  totalNetFedExCharge: number;
  totalDutiesAndTaxes?: number;
  totalNetChargeWithDutiesAndTaxes?: number;
  currency: string;
  surcharges?: Surcharge[];
}

export interface Surcharge {
  type: string;
  description: string;
  amount: number;
}

export interface ShipmentRateResponse {
  provider: string;
  success: boolean;
  rates: ShipmentRate[];
  errorMessage?: string;
  transactionId?: string;
  timestamp: string;
}

export interface CreateShipmentRequest extends ShipmentRateRequest {
  labelFormat?: 'PDF' | 'PNG' | 'ZPL';
  labelSize?: '4X6' | '4X8' | '8.5X11';
  specialInstructions?: string;
  customerReference?: string;
  invoiceNumber?: string;
  poNumber?: string;
}

export interface CreateShipmentResponse {
  provider: string;
  success: boolean;
  shipmentId?: string;
  trackingNumber?: string;
  labelUrl?: string;
  labelBase64?: string;
  masterTrackingNumber?: string;
  totalCost?: number;
  currency?: string;
  serviceType?: string;
  errorMessage?: string;
  transactionId?: string;
  timestamp: string;
}

export interface TrackingInfo {
  trackingNumber: string;
  status: TrackingStatus;
  statusDescription: string;
  estimatedDelivery?: string;
  actualDelivery?: string;
  events: TrackingEvent[];
  lastUpdated: string;
}

export interface TrackingEvent {
  timestamp: string;
  status: string;
  description: string;
  location?: {
    city: string;
    stateOrProvinceCode?: string;
    countryCode: string;
  };
}

export enum TrackingStatus {
  LABEL_CREATED = 'LABEL_CREATED',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  EXCEPTION = 'EXCEPTION',
  RETURNED = 'RETURNED',
  CANCELLED = 'CANCELLED'
}

export enum LogisticsProvider {
  FEDEX = 'fedex',
  UPS = 'ups',
  DHL = 'dhl',
  USPS = 'usps'
}

export enum ServiceType {
  // FedEx Services
  FEDEX_GROUND = 'FEDEX_GROUND',
  FEDEX_EXPRESS_SAVER = 'FEDEX_EXPRESS_SAVER',
  FEDEX_2_DAY = 'FEDEX_2_DAY',
  FEDEX_2_DAY_AM = 'FEDEX_2_DAY_AM',
  STANDARD_OVERNIGHT = 'STANDARD_OVERNIGHT',
  PRIORITY_OVERNIGHT = 'PRIORITY_OVERNIGHT',
  FIRST_OVERNIGHT = 'FIRST_OVERNIGHT',
  
  // UPS Services
  UPS_GROUND = 'UPS_GROUND',
  UPS_3_DAY_SELECT = 'UPS_3_DAY_SELECT',
  UPS_2ND_DAY_AIR = 'UPS_2ND_DAY_AIR',
  UPS_NEXT_DAY_AIR = 'UPS_NEXT_DAY_AIR',
  
  // DHL Services
  DHL_EXPRESS_WORLDWIDE = 'DHL_EXPRESS_WORLDWIDE',
  DHL_EXPRESS_12_00 = 'DHL_EXPRESS_12_00',
  DHL_EXPRESS_10_30 = 'DHL_EXPRESS_10_30',
  
  // USPS Services
  USPS_GROUND_ADVANTAGE = 'USPS_GROUND_ADVANTAGE',
  USPS_PRIORITY_MAIL = 'USPS_PRIORITY_MAIL',
  USPS_PRIORITY_MAIL_EXPRESS = 'USPS_PRIORITY_MAIL_EXPRESS'
}

// Utility function para calcular peso dimensional
export const calculateDimensionalWeight = (
  dimensions: PackageDimensions,
  provider: LogisticsProvider = LogisticsProvider.FEDEX
): PackageWeight => {
  const { length, width, height, units } = dimensions;
  
  // Convertir a centímetros si está en pulgadas
  const lengthCM = units === 'IN' ? length * 2.54 : length;
  const widthCM = units === 'IN' ? width * 2.54 : width;
  const heightCM = units === 'IN' ? height * 2.54 : height;
  
  // Factor de conversión según el proveedor
  const conversionFactor = provider === LogisticsProvider.FEDEX ? 5000 : 5000; // Puede variar por proveedor
  
  const dimensionalWeightKG = (lengthCM * widthCM * heightCM) / conversionFactor;
  
  return {
    value: parseFloat(dimensionalWeightKG.toFixed(2)),
    units: 'KG'
  };
};

// Utility function para validar dirección
export const validateAddress = (address: Address): string[] => {
  const errors: string[] = [];
  
  if (!address.streetLines || address.streetLines.length === 0) {
    errors.push('Street address is required');
  }
  
  if (!address.city) {
    errors.push('City is required');
  }
  
  if (!address.stateOrProvinceCode) {
    errors.push('State/Province code is required');
  }
  
  if (!address.postalCode) {
    errors.push('Postal code is required');
  }
  
  if (!address.countryCode) {
    errors.push('Country code is required');
  }
  
  // Validar formato del código de país (debe ser de 2 caracteres)
  if (address.countryCode && address.countryCode.length !== 2) {
    errors.push('Country code must be 2 characters (ISO 3166-1 alpha-2)');
  }
  
  return errors;
};

