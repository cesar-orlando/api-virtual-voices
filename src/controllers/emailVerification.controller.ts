import { Request, Response } from 'express';
import { getConnectionByCompanySlug } from '../config/connectionManager';
import getEmailVerificationModel from '../models/emailVerification.model';
import getUserModel from '../core/users/user.model';
import { getSMTPConfig, validateSMTPConfig } from '../config/smtpConfig';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

// ==================================================
// GENERAR CÓDIGO DE VERIFICACIÓN
// ==================================================

export async function generateVerificationCode(req: Request, res: Response): Promise<void> {
  try {
    const { userId, email } = req.body;
    const companySlug = req.params.c_name || req.headers['company-slug'] as string;
    
    if (!userId || !email || !companySlug) {
      res.status(400).json({
        success: false,
        error: 'userId, email y companySlug son requeridos'
      });
      return;
    }

    const connection = await getConnectionByCompanySlug(companySlug);
    const EmailVerificationModel = getEmailVerificationModel(connection);

    // Verificar si ya existe una verificación activa
    const existingVerification = await EmailVerificationModel.findOne({
      userId,
      email: email.toLowerCase(),
      companySlug,
      isVerified: false,
      expiresAt: { $gt: new Date() }
    });

    if (existingVerification) {
      // Si ya existe y no ha expirado, no generar nuevo código
      const timeLeft = Math.ceil((existingVerification.expiresAt.getTime() - Date.now()) / 1000 / 60);
      
      res.status(200).json({
        success: true,
        message: `Ya tienes un código de verificación activo. Expira en ${timeLeft} minutos.`,
        canResend: false,
        timeLeft
      });
      return;
    }

    // Generar nuevo código de verificación
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

    // Crear registro de verificación
    const verification = new EmailVerificationModel({
      userId,
      email: email.toLowerCase(),
      verificationCode,
      expiresAt,
      companySlug,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    await verification.save();

    // Enviar email de verificación
    try {
      await sendVerificationEmail(email, verificationCode, companySlug);
      
      res.status(200).json({
        success: true,
        message: 'Código de verificación enviado a tu correo',
        expiresIn: 15, // minutos
        canResend: false
      });
    } catch (emailError) {
      console.error('Error enviando email de verificación:', emailError);
      
      // Eliminar el registro si no se pudo enviar el email
      await EmailVerificationModel.findByIdAndDelete(verification._id);
      
      res.status(500).json({
        success: false,
        error: 'Error enviando código de verificación. Intenta de nuevo.'
      });
    }

  } catch (error) {
    console.error('Error generando código de verificación:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
}

// ==================================================
// VERIFICAR CÓDIGO
// ==================================================

export async function verifyCode(req: Request, res: Response): Promise<void> {
  try {
    const { userId, email, code } = req.body;
    const companySlug = req.params.c_name || req.headers['company-slug'] as string;
    
    if (!userId || !email || !code || !companySlug) {
      res.status(400).json({
        success: false,
        error: 'userId, email, code y companySlug son requeridos'
      });
      return;
    }

    const connection = await getConnectionByCompanySlug(companySlug);
    const EmailVerificationModel = getEmailVerificationModel(connection);

    // Buscar verificación pendiente
    const verification = await EmailVerificationModel.findOne({
      userId,
      email: email.toLowerCase(),
      companySlug,
      isVerified: false
    }).sort({ createdAt: -1 });

    if (!verification) {
      res.status(400).json({
        success: false,
        error: 'No se encontró código de verificación. Genera uno nuevo.'
      });
      return;
    }

    // Verificar código
    let isValid = false;
    
    if (verification.isVerified) {
      isValid = false; // Ya está verificado
    } else if (verification.attempts >= 5) {
      isValid = false; // Demasiados intentos
    } else if (new Date() > verification.expiresAt) {
      isValid = false; // Código expirado
    } else {
      verification.attempts += 1;
      
      if (verification.verificationCode === code) {
        verification.isVerified = true;
        verification.verifiedAt = new Date();
        isValid = true;
      }
    }
    
    if (isValid) {
      await verification.save();
      
      // ACTUALIZAR EL USUARIO EN LA BASE DE DATOS
      try {
        const UserModel = getUserModel(connection);
        await UserModel.findByIdAndUpdate(userId, {
          'emailConfig.isEnabled': true,
          'emailConfig.verifiedAt': new Date(),
          status: 'active',
          updatedAt: new Date()
        });
        
        console.log(`✅ Usuario ${userId} actualizado: emailConfig.isEnabled = true, status = active`);
      } catch (updateError) {
        console.error('❌ Error actualizando usuario:', updateError);
        // No fallar la verificación si hay error actualizando el usuario
      }
      
      res.status(200).json({
        success: true,
        message: 'Email verificado correctamente',
        verified: true
      });
    } else {
      await verification.save(); // Guardar intentos incrementados
      
      const remainingAttempts = 5 - verification.attempts;
      
      if (verification.attempts >= 5) {
        res.status(400).json({
          success: false,
          error: 'Demasiados intentos fallidos. Genera un nuevo código.',
          attemptsExceeded: true
        });
      } else if (new Date() > verification.expiresAt) {
        res.status(400).json({
          success: false,
          error: 'Código expirado. Genera uno nuevo.',
          expired: true
        });
      } else {
        res.status(400).json({
          success: false,
          error: `Código incorrecto. Te quedan ${remainingAttempts} intentos.`,
          remainingAttempts
        });
      }
    }

  } catch (error) {
    console.error('Error verificando código:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
}

// ==================================================
// VERIFICAR ESTADO DE VERIFICACIÓN
// ==================================================

export async function getVerificationStatus(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const companySlug = req.params.c_name || req.headers['company-slug'] as string;
    
    if (!userId || !companySlug) {
      res.status(400).json({
        success: false,
        error: 'userId y companySlug son requeridos'
      });
      return;
    }

    const connection = await getConnectionByCompanySlug(companySlug);
    const EmailVerificationModel = getEmailVerificationModel(connection);

    // Obtener estado de verificación manualmente
    const verification = await EmailVerificationModel.findOne({
      userId,
      companySlug,
      isVerified: false
    }).sort({ createdAt: -1 });
    
    let status: any = {
      isVerified: false,
      attempts: 0,
      canResend: true
    };
    
    if (verification) {
      const now = new Date();
      const canResend = verification.attempts < 5 && now > verification.expiresAt;
      
      status = {
        isVerified: false,
        email: verification.email,
        attempts: verification.attempts,
        expiresAt: verification.expiresAt,
        canResend,
        activeCode: verification.verificationCode // TEMPORAL: Para testing
      };
    }
    
    res.status(200).json({
      success: true,
      ...status
    });

  } catch (error) {
    console.error('Error obteniendo estado de verificación:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
}

// ==================================================
// REENVIAR CÓDIGO DE VERIFICACIÓN
// ==================================================

export async function resendVerificationCode(req: Request, res: Response): Promise<void> {
  try {
    const { userId, email } = req.body;
    const companySlug = req.params.c_name || req.headers['company-slug'] as string;
    
    if (!userId || !email || !companySlug) {
      res.status(400).json({
        success: false,
        error: 'userId, email y companySlug son requeridos'
      });
      return;
    }

    const connection = await getConnectionByCompanySlug(companySlug);
    const EmailVerificationModel = getEmailVerificationModel(connection);

    // Verificar si puede reenviar
    const existingVerification = await EmailVerificationModel.findOne({
      userId,
      companySlug,
      isVerified: false
    }).sort({ createdAt: -1 });
    
    let status: any = {
      isVerified: false,
      attempts: 0,
      canResend: true
    };
    
    if (existingVerification) {
      const now = new Date();
      const canResend = existingVerification.attempts < 5 && now > existingVerification.expiresAt;
      
      status = {
        isVerified: false,
        email: existingVerification.email,
        attempts: existingVerification.attempts,
        expiresAt: existingVerification.expiresAt,
        canResend
      };
    }
    
    if (!status.canResend) {
      res.status(400).json({
        success: false,
        error: 'No puedes reenviar el código en este momento. Espera a que expire el actual.',
        canResend: false,
        expiresAt: status.expiresAt
      });
      return;
    }

    // Generar nuevo código
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

    // Crear nuevo registro
    const newVerification = new EmailVerificationModel({
      userId,
      email: email.toLowerCase(),
      verificationCode,
      expiresAt,
      companySlug,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    await newVerification.save();

    // Enviar email
    try {
      await sendVerificationEmail(email, verificationCode, companySlug);
      
      res.status(200).json({
        success: true,
        message: 'Nuevo código de verificación enviado',
        expiresIn: 15
      });
    } catch (emailError) {
      console.error('Error enviando email de verificación:', emailError);
      await EmailVerificationModel.findByIdAndDelete(newVerification._id);
      
      res.status(500).json({
        success: false,
        error: 'Error enviando código de verificación'
      });
    }

  } catch (error) {
    console.error('Error reenviando código:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
}

// ==================================================
// VALIDAR EMAIL EN LOGIN
// ==================================================

export async function validateEmailOnLogin(
  userId: string, 
  email: string, 
  companySlug: string
): Promise<{
  isValid: boolean;
  isVerified: boolean;
  needsVerification: boolean;
  message?: string;
  alertType?: 'warning' | 'error' | 'info';
}> {
  try {
    const connection = await getConnectionByCompanySlug(companySlug);
    const EmailVerificationModel = getEmailVerificationModel(connection);

    // Verificar si el email está verificado
    const verification = await EmailVerificationModel.findOne({
      userId,
      email: email.toLowerCase(),
      companySlug,
      isVerified: true
    });
    
    const isVerified = !!verification;
    
    if (isVerified) {
      return {
        isValid: true,
        isVerified: true,
        needsVerification: false
      };
    }

    // Si no está verificado, verificar si es un email autorizado
    const isAuthorizedEmail = await checkAuthorizedEmail(email, companySlug);
    
    if (!isAuthorizedEmail) {
      return {
        isValid: false,
        isVerified: false,
        needsVerification: false,
        message: 'Este email no está autorizado. Contacta a tu administrador para que te asigne un email válido.',
        alertType: 'error'
      };
    }

    // Email autorizado pero no verificado
    return {
      isValid: true,
      isVerified: false,
      needsVerification: true,
      message: 'Tu email necesita verificación. Te hemos enviado un código de verificación.',
      alertType: 'warning'
    };

  } catch (error) {
    console.error('Error validando email en login:', error);
    return {
      isValid: false,
      isVerified: false,
      needsVerification: false,
      message: 'Error validando email. Intenta de nuevo.',
      alertType: 'error'
    };
  }
}

// ==================================================
// FUNCIONES HELPER
// ==================================================

async function sendVerificationEmail(email: string, code: string, companySlug: string): Promise<void> {
  try {
    // Obtener configuración SMTP global de Virtual Voices
    const smtpConfig = getSMTPConfig();
    
    // Validar configuración
    const validation = validateSMTPConfig(smtpConfig);
    if (!validation.isValid) {
      throw new Error(`Configuración SMTP inválida: ${validation.errors.join(', ')}`);
    }

    // Crear transporter de Nodemailer
    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass
      }
    });

    const subject = '🔐 Código de Verificación - Virtual Voices';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">🔐 Verificación de Email</h2>
        <p>Hola,</p>
        <p>Has iniciado sesión con un nuevo email. Para completar la verificación, usa el siguiente código:</p>
        
        <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
          <h1 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 5px;">${code}</h1>
        </div>
        
        <p><strong>Este código expira en 15 minutos.</strong></p>
        
        <p>Si no solicitaste esta verificación, contacta inmediatamente a tu administrador.</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #666; font-size: 12px;">
          ${smtpConfig.signature}<br>
          Este es un email automático, no respondas.
        </p>
      </div>
    `;

    const text = `
      🔐 Código de Verificación - Virtual Voices
      
      Hola,
      
      Has iniciado sesión con un nuevo email. Para completar la verificación, usa el siguiente código:
      
      ${code}
      
      Este código expira en 15 minutos.
      
      Si no solicitaste esta verificación, contacta inmediatamente a tu administrador.
      
      ---
      ${smtpConfig.signature}
      Este es un email automático, no respondas.
    `;

    // Configurar email
    const mailOptions = {
      from: `"${smtpConfig.fromName}" <${smtpConfig.fromEmail}>`,
      to: email,
      subject,
      text,
      html
    };

    // Enviar email
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email de verificación enviado:', info.messageId);

  } catch (error) {
    console.error('❌ Error enviando email de verificación:', error);
    throw error;
  }
}

async function checkAuthorizedEmail(email: string, companySlug: string): Promise<boolean> {
  try {
    // Aquí puedes implementar lógica para verificar si el email está autorizado
    // Por ejemplo, verificar contra una lista de dominios permitidos o usuarios registrados
    
    // Por ahora, permitir todos los emails (puedes cambiar esto según tus necesidades)
    return true;
    
    // Ejemplo de verificación por dominio:
    // const allowedDomains = ['virtualvoices.com.mx', 'empresa.com'];
    // const domain = email.split('@')[1];
    // return allowedDomains.includes(domain);
    
  } catch (error) {
    console.error('Error verificando email autorizado:', error);
    return false;
  }
}
