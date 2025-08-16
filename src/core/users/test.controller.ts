import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

// Función simple para testear el decode del JWT
export const testToken = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Decode sin verificar para ver el contenido
    const decoded = jwt.decode(token);
    console.log('🧪 Token decoded:', decoded);

    // Intentar verificar con diferentes secretos
    let verified = null;
    try {
      verified = jwt.verify(token, process.env.JWT_SECRET || "changeme");
      console.log('✅ Verified with main secret');
    } catch (error) {
      console.log('❌ Failed with main secret');
      try {
        verified = jwt.verify(token, process.env.JWT_SECRET_QUICKLEARNING || process.env.JWT_SECRET || "changeme");
        console.log('✅ Verified with quicklearning secret');
      } catch (error2) {
        console.log('❌ Failed with quicklearning secret');
      }
    }

    res.json({
      decoded,
      verified,
      headers: req.headers,
      env: {
        JWT_SECRET: process.env.JWT_SECRET ? 'SET' : 'NOT_SET',
        JWT_SECRET_QUICKLEARNING: process.env.JWT_SECRET_QUICKLEARNING ? 'SET' : 'NOT_SET'
      }
    });

  } catch (error) {
    console.error('💥 Error in testToken:', error);
    res.status(500).json({ error: error.message });
  }
};
