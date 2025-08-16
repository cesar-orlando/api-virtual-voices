// Endpoint para refrescar token con empresa correcta
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getConnectionByCompanySlug } from '../../config/connectionManager';
import getUserModel from './user.model';

// Función para obtener JWT secret específico por empresa
function getJwtSecret(companySlug?: string): string {
  if (companySlug === "quicklearning") {
    return process.env.JWT_SECRET_QUICKLEARNING || process.env.JWT_SECRET || "changeme";
  }
  return process.env.JWT_SECRET || "changeme";
}

export const refreshTokenWithCorrectCompany = async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ message: "Token requerido" });
      return;
    }

    const token = authHeader.substring(7);
    
    // Decodificar token sin verificar para obtener información básica
    const decoded = jwt.decode(token) as any;
    if (!decoded) {
      res.status(401).json({ message: "Token inválido" });
      return;
    }

    console.log('🔄 Refrescando token para usuario:', decoded.email);
    
    // Buscar usuario en base de datos para obtener información actualizada
    let userFound = null;
    let correctCompany = null;

    // Lista de empresas conocidas para buscar
    const companiesSearch = ['mitsubishi', 'grupokg', 'grupo-milkasa'];
    
    for (const companySlug of companiesSearch) {
      try {
        const conn = await getConnectionByCompanySlug(companySlug);
        const User = getUserModel(conn);
        const user = await User.findOne({ email: decoded.email });
        
        if (user) {
          userFound = user;
          correctCompany = companySlug;
          console.log('✅ Usuario encontrado en empresa:', companySlug);
          break;
        }
      } catch (error) {
        console.log(`⚠️ Error buscando en ${companySlug}:`, error.message);
      }
    }

    if (!userFound) {
      res.status(404).json({ message: "Usuario no encontrado en ninguna empresa" });
      return;
    }

    // Generar nuevo token con la empresa correcta
    const newToken = jwt.sign(
      {
        sub: userFound._id,
        email: userFound.email,
        name: userFound.name,
        role: userFound.role,
        c_name: correctCompany,
        companySlug: correctCompany,
        id: userFound._id,
      },
      getJwtSecret(correctCompany),
      { expiresIn: "1h" }
    );

    // Respuesta con token actualizado
    res.json({
      message: "Token refrescado exitosamente",
      token: newToken,
      user: {
        id: userFound._id,
        name: userFound.name,
        email: userFound.email,
        role: userFound.role,
        companySlug: correctCompany,
        status: userFound.status,
        branch: userFound.branch
      },
      correctCompany: {
        slug: correctCompany,
        name: correctCompany,
        displayName: correctCompany,
        isEnterprise: false
      }
    });

    console.log('✅ Token refrescado para:', decoded.email, 'empresa:', correctCompany);
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
