// ==================================================
// CONFIGURACIÓN SMTP GLOBAL DE VIRTUAL VOICES
// ==================================================

export interface SMTPConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
  fromName: string;
  fromEmail: string;
  signature: string;
}

// Configuración SMTP por defecto de Virtual Voices
export const DEFAULT_SMTP_CONFIG: SMTPConfig = {
  host: process.env.SMTP_HOST || 'smtp.zoho.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  user: process.env.SMTP_USER || 'contacto@virtualvoices.com.mx',
  pass: process.env.SMTP_PASS || '',
  secure: process.env.SMTP_SECURE === 'true',
  fromName: 'Virtual Voices',
  fromEmail: 'contacto@virtualvoices.com.mx',
  signature: 'Virtual Voices - Sistema de Gestión'
};

// Función para obtener configuración SMTP
export function getSMTPConfig(): SMTPConfig {
  return {
    host: process.env.SMTP_HOST || DEFAULT_SMTP_CONFIG.host,
    port: parseInt(process.env.SMTP_PORT || DEFAULT_SMTP_CONFIG.port.toString()),
    user: process.env.SMTP_USER || DEFAULT_SMTP_CONFIG.user,
    pass: process.env.SMTP_PASS || DEFAULT_SMTP_CONFIG.pass,
    secure: process.env.SMTP_SECURE === 'true',
    fromName: process.env.SMTP_FROM_NAME || DEFAULT_SMTP_CONFIG.fromName,
    fromEmail: process.env.SMTP_FROM_EMAIL || DEFAULT_SMTP_CONFIG.fromEmail,
    signature: process.env.SMTP_SIGNATURE || DEFAULT_SMTP_CONFIG.signature
  };
}

// Función para validar configuración SMTP
export function validateSMTPConfig(config: Partial<SMTPConfig>): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!config.host) errors.push('SMTP host es requerido');
  if (!config.port || config.port <= 0) errors.push('SMTP port es requerido y debe ser mayor a 0');
  if (!config.user) errors.push('SMTP user es requerido');
  if (!config.pass) errors.push('SMTP password es requerido');
  if (!config.fromEmail) errors.push('From email es requerido');
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

