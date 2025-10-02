import { Request, Response } from 'express';
import { getSMTPConfig, validateSMTPConfig } from '../config/smtpConfig';
import nodemailer from 'nodemailer';

// ==================================================
// CONFIGURAR SMTP GLOBAL DE VIRTUAL VOICES
// ==================================================

export async function configureGlobalSMTP(req: Request, res: Response): Promise<void> {
  try {
    const { smtpConfig } = req.body;
    
    if (!smtpConfig) {
      res.status(400).json({
        success: false,
        error: 'smtpConfig es requerido'
      });
      return;
    }

    // Validar configuración SMTP
    const validation = validateSMTPConfig(smtpConfig);
    if (!validation.isValid) {
      res.status(400).json({
        success: false,
        error: 'Configuración SMTP inválida',
        details: validation.errors
      });
      return;
    }

    // Probar la configuración SMTP
    try {
      const transporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        auth: {
          user: smtpConfig.user,
          pass: smtpConfig.pass
        }
      });

      // Verificar conexión
      await transporter.verify();
      
      res.status(200).json({
        success: true,
        message: 'Configuración SMTP válida y funcionando',
        smtpConfig: {
          host: smtpConfig.host,
          port: smtpConfig.port,
          user: smtpConfig.user,
          secure: smtpConfig.secure,
          fromName: smtpConfig.fromName,
          fromEmail: smtpConfig.fromEmail
        }
      });

    } catch (smtpError) {
      res.status(400).json({
        success: false,
        error: 'Error conectando con el servidor SMTP',
        details: smtpError.message
      });
    }

  } catch (error) {
    console.error('Error configurando SMTP global:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
}

// ==================================================
// OBTENER CONFIGURACIÓN SMTP ACTUAL
// ==================================================

export async function getGlobalSMTPConfig(req: Request, res: Response): Promise<void> {
  try {
    const smtpConfig = getSMTPConfig();
    
    res.status(200).json({
      success: true,
      smtpConfig: {
        host: smtpConfig.host,
        port: smtpConfig.port,
        user: smtpConfig.user,
        secure: smtpConfig.secure,
        fromName: smtpConfig.fromName,
        fromEmail: smtpConfig.fromEmail,
        hasPassword: !!smtpConfig.pass
      }
    });

  } catch (error) {
    console.error('Error obteniendo configuración SMTP:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
}

// ==================================================
// PROBAR CONFIGURACIÓN SMTP
// ==================================================

export async function testGlobalSMTP(req: Request, res: Response): Promise<void> {
  try {
    const { testEmail } = req.body;
    
    if (!testEmail) {
      res.status(400).json({
        success: false,
        error: 'testEmail es requerido'
      });
      return;
    }

    const smtpConfig = getSMTPConfig();
    
    // Validar configuración
    const validation = validateSMTPConfig(smtpConfig);
    if (!validation.isValid) {
      res.status(400).json({
        success: false,
        error: 'Configuración SMTP no válida',
        details: validation.errors
      });
      return;
    }

    // Crear transporter
    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass
      }
    });

    // Crear email de prueba
    const mailOptions = {
      from: `"${smtpConfig.fromName}" <${smtpConfig.fromEmail}>`,
      to: testEmail,
      subject: '🧪 Prueba de Configuración SMTP - Virtual Voices',
      text: `
        Hola,
        
        Este es un email de prueba para verificar que la configuración SMTP de Virtual Voices está funcionando correctamente.
        
        Configuración:
        - Host: ${smtpConfig.host}
        - Puerto: ${smtpConfig.port}
        - Usuario: ${smtpConfig.user}
        - Seguro: ${smtpConfig.secure ? 'Sí' : 'No'}
        
        Si recibes este email, la configuración está funcionando correctamente.
        
        ---
        ${smtpConfig.signature}
      `,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">🧪 Prueba de Configuración SMTP</h2>
          <p>Hola,</p>
          <p>Este es un email de prueba para verificar que la configuración SMTP de Virtual Voices está funcionando correctamente.</p>
          
          <div style="background-color: #f4f4f4; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <h3>Configuración:</h3>
            <ul>
              <li><strong>Host:</strong> ${smtpConfig.host}</li>
              <li><strong>Puerto:</strong> ${smtpConfig.port}</li>
              <li><strong>Usuario:</strong> ${smtpConfig.user}</li>
              <li><strong>Seguro:</strong> ${smtpConfig.secure ? 'Sí' : 'No'}</li>
            </ul>
          </div>
          
          <p>Si recibes este email, la configuración está funcionando correctamente.</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">
            ${smtpConfig.signature}<br>
            Este es un email automático de prueba.
          </p>
        </div>
      `
    };

    // Enviar email
    const info = await transporter.sendMail(mailOptions);
    
    res.status(200).json({
      success: true,
      message: 'Email de prueba enviado correctamente',
      testEmail,
      messageId: info.messageId,
      smtpConfig: {
        host: smtpConfig.host,
        port: smtpConfig.port,
        user: smtpConfig.user
      }
    });

  } catch (error) {
    console.error('Error probando SMTP:', error);
    res.status(500).json({
      success: false,
      error: 'Error enviando email de prueba',
      details: error.message
    });
  }
}
