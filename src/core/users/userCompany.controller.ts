// Endpoint para obtener la empresa correcta del usuario
import { Request, Response } from 'express';
import { getCurrentCompanyContext } from '../auth/companyMiddleware';
import { getCompanyContext } from '../../shared/projectManager';

// Obtener información de empresa del usuario logueado
export const getUserCompany = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyContext = getCurrentCompanyContext(req);
    
    if (!companyContext) {
      res.status(401).json({ 
        error: 'Company context required',
        message: 'No se pudo determinar la empresa del usuario'
      });
      return;
    }

    // Filtrar QuickLearning para usuarios normales
    if (companyContext.slug === 'quicklearning') {
      res.status(403).json({
        error: 'Access denied',
        message: 'QuickLearning no es accesible para usuarios normales'
      });
      return;
    }

    // Obtener configuración completa de la empresa
    const empresaInfo = {
      slug: companyContext.slug,
      name: companyContext.name,
      displayName: companyContext.name,
      isEnterprise: false, // Las empresas normales no son enterprise
      features: {
        quickLearning: false, // Solo QuickLearning tiene esta feature
        controlMinutos: companyContext.config?.features?.controlMinutos || false,
        elevenLabs: companyContext.config?.features?.elevenLabs || false,
        autoAssignment: companyContext.config?.features?.autoAssignment || false
      },
      database: {
        type: "company" // Empresas normales usan su propia DB
      },
      branding: {
        primaryColor: "#0066CC", // Color por defecto para empresas
        secondaryColor: "#004499"
      }
    };

    console.log('✅ Empresa obtenida para usuario:', empresaInfo);
    res.json(empresaInfo);
  } catch (error) {
    console.error('Error getting user company:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
