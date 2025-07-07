// Tipos compartidos para el sistema multiempresa

export interface ProjectConfig {
  slug: string;
  name: string;
  databaseUri: string;
  twilio: {
    testNumber: string;
    productionNumber: string;
  };
  roles: string[];
  features: {
    controlMinutos: boolean;
    elevenLabs: boolean;
    autoAssignment: boolean;
    customFlows: boolean;
  };
  customConfig?: Record<string, any>;
}

export interface UserWithCompany {
  id: string;
  name: string;
  email: string;
  role: string;
  companySlug: string;
  companyName: string;
  token: string;
}

export interface CompanyContext {
  slug: string;
  name: string;
  config: ProjectConfig;
  database: string;
}

// Tipos para control de minutos
export interface MinutosControl {
  userId: string;
  companySlug: string;
  estado: 'activo' | 'ocupado' | 'desactivado';
  minutosAcumulados: number;
  ultimaActividad: Date;
  jerarquiaVisibilidad: string[];
}

// Tipos para ElevenLabs
export interface ElevenLabsCall {
  id: string;
  companySlug: string;
  userId: string;
  phoneNumber: string;
  duration: number;
  status: 'completed' | 'failed' | 'in-progress';
  recordingUrl?: string;
  createdAt: Date;
}

// Tipos para asignación automática
export interface AutoAssignmentRule {
  tipo: string;
  criterio: string;
  destino: string;
  prioridad: number;
}

export interface AutoAssignmentConfig {
  enabled: boolean;
  rules: AutoAssignmentRule[];
  criteria: 'ventas' | 'tiempo_respuesta' | 'manual';
} 