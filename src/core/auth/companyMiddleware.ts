import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getCompanyContext } from '../../shared/projectManager';
import { CompanyContext } from '../../shared/types';
import { getEnvironmentConfig } from '../../config/environments';

// Extender Request para incluir contexto de empresa
declare global {
  namespace Express {
    interface Request {
      companyContext?: CompanyContext;
    }
  }
}

// Middleware para detectar empresa desde JWT
export function detectCompanyFromToken(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    const config = getEnvironmentConfig();
    
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as any;
      
      const slug = decoded.companySlug || decoded.c_name;
      if (slug) {
        const companyContext = getCompanyContext(slug);
        if (companyContext) {
          req.companyContext = companyContext;
        }
      }
    } catch (jwtError: any) {
      // Ignorar todos los errores de JWT (expired, invalid, etc.) y continuar
      // console.warn('⚠️ Token JWT inválido o expirado en ruta:', req.path);
      // Continuar sin contexto de empresa
    }
  } catch (error) {
    console.warn('⚠️ Error general en middleware de autenticación:', error);
  }
  
  next();
}

// Middleware para requerir contexto de empresa
export function requireCompanyContext(req: Request, res: Response, next: NextFunction): void {
  if (!req.companyContext) {
    res.status(401).json({ 
      error: 'Company context required',
      message: 'No se pudo determinar la empresa del usuario'
    });
    return;
  }
  next();
}

// Middleware para verificar si la empresa tiene una funcionalidad específica
export function requireFeature(feature: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.companyContext) {
      res.status(401).json({ 
        error: 'Company context required',
        message: 'No se pudo determinar la empresa del usuario'
      });
      return;
    }

    const { hasFeature } = require('../../shared/projectManager');
    if (!hasFeature(req.companyContext.slug, feature as any)) {
      res.status(403).json({ 
        error: 'Feature not available',
        message: `La funcionalidad '${feature}' no está disponible para esta empresa`
      });
      return;
    }

    next();
  };
}

// Función helper para obtener contexto de empresa
export function getCurrentCompanyContext(req: Request): CompanyContext | null {
  return req.companyContext || null;
} 