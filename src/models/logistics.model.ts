import mongoose, { Document, Schema } from 'mongoose';

// Interfaces para los diferentes proveedores de logística
export interface FedExCredentials {
  clientId: string;
  clientSecret: string;
  accountNumber: string;
  meterNumber?: string;
  environment: 'sandbox' | 'production';
}

export interface Address {
  streetLines: string[];
  city: string;
  stateOrProvinceCode: string;
  postalCode: string;
  countryCode: string;
  residential?: boolean;
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

export interface ShipmentRateRequest {
  shipper: Address;
  recipient: Address;
  packages: Array<{
    weight: PackageWeight;
    dimensions: PackageDimensions;
  }>;
  serviceType?: string;
  pickupType?: 'DROPOFF_AT_FEDEX_LOCATION' | 'CONTACT_FEDEX_TO_SCHEDULE' | 'USE_SCHEDULED_PICKUP';
  requestedShipment?: {
    shipDatestamp?: string;
    totalWeight?: PackageWeight;
    preferredCurrency?: string;
  };
}

export interface ShipmentRateResponse {
  provider: string;
  serviceType: string;
  totalNetCharge: number;
  totalBaseCharge: number;
  totalNetChargeWithDutiesAndTaxes?: number;
  currency: string;
  transitTime?: string;
  deliveryTimestamp?: string;
  ratedShipmentDetails?: any[];
}

// Esquema principal de logística
export interface ILogisticsProvider extends Document {
  companySlug: string;
  provider: 'fedex' | 'ups' | 'dhl' | 'usps';
  credentials: FedExCredentials | any; // Se puede extender para otros proveedores
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Esquema para almacenar cotizaciones
export interface IShipmentQuote extends Document {
  companySlug: string;
  provider: string;
  quoteId: string;
  request: ShipmentRateRequest;
  response: ShipmentRateResponse[];
  status: 'pending' | 'completed' | 'error';
  errorMessage?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Esquema para historial de envíos
export interface IShipmentHistory extends Document {
  companySlug: string;
  provider: string;
  shipmentId: string;
  trackingNumber?: string;
  status: 'created' | 'in_transit' | 'delivered' | 'exception' | 'cancelled';
  shipper: Address;
  recipient: Address;
  packages: Array<{
    weight: PackageWeight;
    dimensions: PackageDimensions;
  }>;
  serviceType: string;
  totalCost: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

const LogisticsProviderSchema = new Schema<ILogisticsProvider>({
  companySlug: {
    type: String,
    required: true,
    index: true
  },
  provider: {
    type: String,
    required: true,
    enum: ['fedex', 'ups', 'dhl', 'usps']
  },
  credentials: {
    type: Schema.Types.Mixed,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  collection: 'logistics_providers'
});

const ShipmentQuoteSchema = new Schema<IShipmentQuote>({
  companySlug: {
    type: String,
    required: true,
    index: true
  },
  provider: {
    type: String,
    required: true
  },
  quoteId: {
    type: String,
    required: true,
    unique: true
  },
  request: {
    type: Schema.Types.Mixed,
    required: true
  },
  response: [{
    type: Schema.Types.Mixed
  }],
  status: {
    type: String,
    enum: ['pending', 'completed', 'error'],
    default: 'pending'
  },
  errorMessage: {
    type: String
  },
  expiresAt: {
    type: Date,
    required: true,
    expires: 0 // MongoDB TTL index para auto-eliminar documentos expirados
  }
}, {
  timestamps: true,
  collection: 'shipment_quotes'
});

const ShipmentHistorySchema = new Schema<IShipmentHistory>({
  companySlug: {
    type: String,
    required: true,
    index: true
  },
  provider: {
    type: String,
    required: true
  },
  shipmentId: {
    type: String,
    required: true
  },
  trackingNumber: {
    type: String
  },
  status: {
    type: String,
    enum: ['created', 'in_transit', 'delivered', 'exception', 'cancelled'],
    default: 'created'
  },
  shipper: {
    type: Schema.Types.Mixed,
    required: true
  },
  recipient: {
    type: Schema.Types.Mixed,
    required: true
  },
  packages: [{
    weight: {
      value: Number,
      units: String
    },
    dimensions: {
      length: Number,
      width: Number,
      height: Number,
      units: String
    }
  }],
  serviceType: {
    type: String,
    required: true
  },
  totalCost: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    required: true
  }
}, {
  timestamps: true,
  collection: 'shipment_history'
});

// Índices compuestos para mejorar rendimiento
LogisticsProviderSchema.index({ companySlug: 1, provider: 1 });
ShipmentQuoteSchema.index({ companySlug: 1, createdAt: -1 });
ShipmentHistorySchema.index({ companySlug: 1, createdAt: -1 });
ShipmentHistorySchema.index({ trackingNumber: 1 });

export const LogisticsProvider = mongoose.model<ILogisticsProvider>('LogisticsProvider', LogisticsProviderSchema);
export const ShipmentQuote = mongoose.model<IShipmentQuote>('ShipmentQuote', ShipmentQuoteSchema);
export const ShipmentHistory = mongoose.model<IShipmentHistory>('ShipmentHistory', ShipmentHistorySchema);

export default LogisticsProvider;

