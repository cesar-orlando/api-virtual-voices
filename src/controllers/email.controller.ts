import OpenAI from "openai";
import { getEnvironmentConfig } from '../config/environments';

const config = getEnvironmentConfig();

// Configuración OpenAI
const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});
import nodemailer from 'nodemailer';
import { Request, Response } from 'express';
import getEmailModel from '../models/email.model';
import { getConnectionByCompanySlug } from '../config/connectionManager';

// Interfaz para configuración SMTP dinámica
interface SmtpConfig {
  host: string;
  port: number;
  secure?: boolean;
  user: string;
  pass: string;
}

// Función para crear transporter dinámico
function createDynamicTransporter(smtpConfig: SmtpConfig) {
  return nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure ?? (smtpConfig.port === 465), // true for 465, false for other ports
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.pass
    }
  });
}

// Transporter por defecto (fallback) usando variables de entorno
const defaultTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_ADDRESS,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Función principal para enviar email con configuración SMTP dinámica
export async function sendEmail(req: Request, res: Response): Promise<void> {
  try {
    const { c_name } = req.params;
    const { 
      to, 
      subject, 
      text, 
      html,
      smtpConfig // Nueva configuración SMTP dinámica opcional
    } = req.body;

    // Validaciones
    if (!to || !subject || !text) {
      res.status(400).json({
        success: false,
        message: 'Los campos to, subject y text son requeridos'
      });
      return;
    }

    if (!c_name) {
      res.status(400).json({
        success: false,
        message: 'El parámetro c_name es requerido'
      });
      return;
    }

    // Determinar qué transporter usar
    let transporter;
    let fromAddress;
    
    if (smtpConfig) {
      // Validar configuración SMTP personalizada
      const requiredFields = ['host', 'port', 'user', 'pass'];
      for (const field of requiredFields) {
        if (!smtpConfig[field]) {
          res.status(400).json({
            success: false,
            message: `Campo requerido en smtpConfig: ${field}`
          });
          return;
        }
      }
      
      transporter = createDynamicTransporter(smtpConfig);
      fromAddress = smtpConfig.user;
      console.log(`📧 Usando configuración SMTP personalizada: ${smtpConfig.host}:${smtpConfig.port}`);
    } else {
      // Usar transporter por defecto
      transporter = defaultTransporter;
      fromAddress = process.env.EMAIL_ADDRESS;
      console.log('📧 Usando configuración SMTP por defecto');
    }

    // Preparar datos del email
    const emailData = {
      from: fromAddress,
      to: to,
      subject: subject,
      text: text,
      html: html,
    };

    // Enviar el email
    const info = await transporter.sendMail(emailData);
    console.log('✅ Email sent successfully. Message ID:', info.messageId);

    // Guardar en base de datos
    try {
      const conn = await getConnectionByCompanySlug(c_name);
      const EmailModel = getEmailModel(conn);

      const newEmail = new EmailModel({
        from: emailData.from,
        to: emailData.to,
        subject: emailData.subject,
        text: emailData.text,
        html: emailData.html || '',
        smtpConfig: smtpConfig ? {
          host: smtpConfig.host,
          port: smtpConfig.port,
          user: smtpConfig.user
          // No guardamos la contraseña por seguridad
        } : undefined
      });

      await newEmail.save();
      console.log('✅ Email saved to database successfully');

      res.status(200).json({
        success: true,
        messageId: info.messageId,
        savedToDb: true,
        emailId: newEmail._id,
        usedCustomSmtp: !!smtpConfig
      });

    } catch (dbError) {
      console.error('⚠️ Email sent but failed to save to database:', dbError);
      res.status(200).json({
        success: true,
        messageId: info.messageId,
        savedToDb: false,
        dbError: dbError.message,
        usedCustomSmtp: !!smtpConfig
      });
    }

  } catch (error) {
    console.error('❌ Error sending email:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Función genérica para enviar y guardar emails con configuración SMTP opcional
export async function sendAndSaveEmail(
  to: string,
  subject: string,
  text: string,
  html?: string,
  companySlug: string = 'default',
  smtpConfig?: SmtpConfig
) {
  try {
    // Determinar qué transporter usar
    let transporter;
    let fromAddress;
    
    if (smtpConfig) {
      transporter = createDynamicTransporter(smtpConfig);
      fromAddress = smtpConfig.user;
      console.log(`📧 sendAndSaveEmail usando SMTP personalizada: ${smtpConfig.host}:${smtpConfig.port}`);
    } else {
      transporter = defaultTransporter;
      fromAddress = process.env.EMAIL_ADDRESS;
      console.log('📧 sendAndSaveEmail usando SMTP por defecto');
    }

    // Preparar datos del email
    const emailData = {
      from: fromAddress,
      to: to,
      subject: subject,
      text: text,
      html: html
    };

    // Enviar el email
    const info = await transporter.sendMail(emailData);
    console.log(`✅ Email sent to ${to}. Message ID:`, info.messageId);

    // Guardar en base de datos
    try {
      const conn = await getConnectionByCompanySlug(companySlug);
      const EmailModel = getEmailModel(conn);

      const newEmail = new EmailModel({
        from: emailData.from,
        to: emailData.to,
        subject: emailData.subject,
        text: emailData.text,
        html: emailData.html || '',
        smtpConfig: smtpConfig ? {
          host: smtpConfig.host,
          port: smtpConfig.port,
          user: smtpConfig.user
        } : undefined
      });

      await newEmail.save();
      console.log('✅ Email saved to database successfully');

      return {
        success: true,
        messageId: info.messageId,
        savedToDb: true,
        emailId: newEmail._id,
        usedCustomSmtp: !!smtpConfig
      };

    } catch (dbError) {
      console.error('⚠️ Email sent but failed to save to database:', dbError);
      return {
        success: true,
        messageId: info.messageId,
        savedToDb: false,
        dbError: dbError.message,
        usedCustomSmtp: !!smtpConfig
      };
    }

  } catch (error) {
    console.error(`❌ Error sending email to ${to}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Endpoint para obtener historial de emails
export async function getEmailHistory(req: Request, res: Response): Promise<void> {
  try {
    const { c_name } = req.params;
    const { page = 1, limit = 20 } = req.query;

    if (!c_name) {
      res.status(400).json({
        success: false,
        message: 'El parámetro c_name es requerido'
      });
      return;
    }

    const conn = await getConnectionByCompanySlug(c_name);
    const EmailModel = getEmailModel(conn);

    const skip = (Number(page) - 1) * Number(limit);

    const emails = await EmailModel.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await EmailModel.countDocuments({});

    res.status(200).json({
      success: true,
      data: emails,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });

  } catch (error) {
    console.error('❌ Error getting email history:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener historial de emails',
      error: error.message
    });
  }
}

// NUEVO: Endpoint para probar configuración SMTP
export async function testSmtpConfig(req: Request, res: Response): Promise<void> {
  try {
    const { smtpConfig } = req.body;

    if (!smtpConfig) {
      res.status(400).json({
        success: false,
        message: 'smtpConfig es requerido'
      });
      return;
    }

    // Validar campos requeridos
    const requiredFields = ['host', 'port', 'user', 'pass'];
    for (const field of requiredFields) {
      if (!smtpConfig[field]) {
        res.status(400).json({
          success: false,
          message: `Campo requerido en smtpConfig: ${field}`
        });
        return;
      }
    }

    // Crear transporter y verificar conexión
    const transporter = createDynamicTransporter(smtpConfig);
    
    // Verificar conexión SMTP
    await transporter.verify();
    
    console.log(`✅ SMTP configuration verified: ${smtpConfig.host}:${smtpConfig.port}`);
    
    res.status(200).json({
      success: true,
      message: 'Configuración SMTP verificada correctamente',
      config: {
        host: smtpConfig.host,
        port: smtpConfig.port,
        user: smtpConfig.user,
        secure: smtpConfig.secure ?? (smtpConfig.port === 465)
      }
    });

  } catch (error) {
    console.error('❌ Error testing SMTP config:', error);
    res.status(400).json({
      success: false,
      message: 'Error en la configuración SMTP',
      error: error.message
    });
  }
}

// Función para obtener texto estructurado de OpenAI
async function getStructuredEmail(text: string, html?: string): Promise<string> {
  const prompt = `Redacta el siguiente mensaje como un correo formal y estructurado para un cliente, solamente el cuerpo del correo:\n---\n${text}, vas a utilizar ${html} solamente como contexto del remitente, no se vuelve a escribir en el correo. Recuerda separar parrafos con estructura html "<p></p>"`;
  const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1, // Temperatura más baja para mayor precisión
      top_p: 0.1, // Top-p más bajo para respuestas más determinísticas
      frequency_penalty: 0.5, // Penalizar repetición
      presence_penalty: 0.5 // Penalizar temas nuevos no relevantes
    }
  ); 
  return response.choices[0].message.content;
}
// Endpoint para enviar correo estructurado con OpenAI
export async function sendStructuredEmail(req: Request, res: Response): Promise<void> {
  try {
    const { c_name } = req.params;
    const { to, subject, text, html, smtpConfig } = req.body;

    // 1. Redactar el texto con OpenAI
    const AiText = await getStructuredEmail(text, html);

    // 2. Usar el texto generado como cuerpo del correo
    req.body.text = AiText;
    req.body.html = AiText + html;
    console.log('texto AI:', AiText);
    // Opcional: también puedes generar html si lo necesitas

    // 3. Llamar a la función original para enviar el correo
    await sendEmail(req, res);

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
