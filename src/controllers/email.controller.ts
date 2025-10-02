import OpenAI from "openai";
import { getEnvironmentConfig } from '../config/environments';
import { createReadStream } from 'fs';

const config = getEnvironmentConfig();

// Configuración OpenAI
const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});
import nodemailer from 'nodemailer';
import { Request, Response } from 'express';
import getEmailModel from '../models/email.model';
import { getConnectionByCompanySlug } from '../config/connectionManager';
import { getEmailConfigInternal } from '../core/users/user.controller';
import path from "node:path";
import fs from 'fs/promises';
import { existsSync } from 'fs';

// Interfaz para configuración SMTP dinámica
interface SmtpConfig {
  host: string;
  port: number;
  secure?: boolean;
  user: string;
  pass: string;
}

// Interfaz para attachments dinámicos
interface EmailAttachment {
  filename?: string;
  path?: string;
  content?: string | Buffer;
  contentType?: string;
  cid?: string; // Para imágenes embebidas
}

// Utility functions for temporary attachment management
async function ensureTempAttachmentsDir(): Promise<void> {
  const tempAttachmentsPath = path.join(process.cwd(), 'temp_attachments');
  
  try {
    await fs.mkdir(tempAttachmentsPath, { recursive: true });
    console.log(`📁 Main temp attachments directory ready: ${tempAttachmentsPath}`);
  } catch (error) {
    if (error.code !== 'EEXIST') {
      console.error(`❌ Error creating main temp attachments directory: ${error}`);
      throw error;
    }
  }
}

async function createCompanyEmailFolder(companySlug: string): Promise<string> {
  // Ensure main temp directory exists first
  await ensureTempAttachmentsDir();
  
  const folderName = `${companySlug}_email`;
  const folderPath = path.join(process.cwd(), 'temp_attachments', folderName);
  
  try {
    // Use recursive: true to create all necessary parent directories
    await fs.mkdir(folderPath, { recursive: true });
    
    // Verify the folder was created successfully
    if (!existsSync(folderPath)) {
      throw new Error(`Failed to create directory: ${folderPath}`);
    }
    
    console.log(`📁 Company email folder ready: ${folderPath}`);
    return folderPath;
  } catch (error) {
    // If error is EEXIST (folder already exists), that's fine
    if (error.code === 'EEXIST') {
      console.log(`📁 Company email folder already exists: ${folderPath}`);
      return folderPath;
    }
    
    console.error(`❌ Error creating temp folder: ${error}`);
    throw error;
  }
}

async function saveAttachmentTemporarily(
  attachment: EmailAttachment, 
  companySlug: string, 
  emailId: string
): Promise<string | null> {
  if (!attachment.content && !attachment.path) {
    return null;
  }

  try {
    // Ensure company email folder exists before saving
    const tempFolder = await createCompanyEmailFolder(companySlug);
    const timestamp = Date.now();
    const filename = attachment.filename || `attachment_${timestamp}`;
    const tempFilePath = path.join(tempFolder, `${emailId}_${timestamp}_${filename}`);

    // Double-check folder exists before writing file
    if (!existsSync(tempFolder)) {
      console.log(`📁 Folder doesn't exist, creating: ${tempFolder}`);
      await fs.mkdir(tempFolder, { recursive: true });
    }

    if (attachment.content) {
      // Debug: Log attachment content details
      console.log(`🔍 DEBUG - Attachment content details:`);
      console.log(`  - Type: ${typeof attachment.content}`);
      console.log(`  - Is Buffer: ${Buffer.isBuffer(attachment.content)}`);
      console.log(`  - Length: ${attachment.content.length}`);
      
      let contentToSave = attachment.content;
      
      // If content is base64 string, convert to buffer
      if (typeof attachment.content === 'string') {
        console.log(`📝 String content detected, checking if base64...`);
        
        // Check if it looks like base64 (basic check)
        const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
        const isLikelyBase64 = base64Regex.test(attachment.content) && attachment.content.length % 4 === 0;
        
        if (isLikelyBase64) {
          console.log(`✅ Content appears to be base64, converting to buffer`);
          try {
            contentToSave = Buffer.from(attachment.content, 'base64');
            console.log(`✅ Successfully converted base64 to buffer, size: ${contentToSave.length} bytes`);
          } catch (error) {
            console.error(`❌ Error converting base64: ${error}`);
            console.log(`🔄 Falling back to UTF-8 encoding`);
            contentToSave = Buffer.from(attachment.content, 'utf8');
          }
        } else {
          console.log(`📝 Content doesn't appear to be base64, treating as UTF-8 text`);
          contentToSave = Buffer.from(attachment.content, 'utf8');
        }
      }
      
      // Save content to temporary file
      await fs.writeFile(tempFilePath, contentToSave);
      console.log(`📎 Saved content attachment: ${tempFilePath}`);
      
      // Debug: Check first few bytes of saved file
      const savedContent = await fs.readFile(tempFilePath);
      const firstBytes = Array.from(savedContent.slice(0, 10)).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' ');
      console.log(`🔍 First 10 bytes of saved file: ${firstBytes}`);
      
    } else if (attachment.path && existsSync(attachment.path)) {
      // Copy existing file to temporary location
      const originalContent = await fs.readFile(attachment.path);
      await fs.writeFile(tempFilePath, originalContent);
      console.log(`📎 Copied file attachment: ${attachment.path} -> ${tempFilePath}`);
    } else {
      console.warn(`⚠️ Attachment source not found: ${attachment.path}`);
      return null;
    }

    return tempFilePath;
  } catch (error) {
    console.error(`❌ Error saving temporary attachment: ${error}`);
    return null;
  }
}

async function cleanupOldAttachments(): Promise<void> {
  const tempAttachmentsPath = path.join(process.cwd(), 'temp_attachments');
  
  if (!existsSync(tempAttachmentsPath)) {
    console.log('📁 No temp_attachments directory found, creating it...');
    await ensureTempAttachmentsDir();
    return;
  }

  try {
    const companies = await fs.readdir(tempAttachmentsPath);
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days in milliseconds
    let deletedFiles = 0;
    let deletedFolders = 0;

    for (const companyFolder of companies) {
      const companyPath = path.join(tempAttachmentsPath, companyFolder);
      const stats = await fs.stat(companyPath);
      
      if (stats.isDirectory()) {
        const files = await fs.readdir(companyPath);
        
        for (const file of files) {
          const filePath = path.join(companyPath, file);
          try {
            const fileStats = await fs.stat(filePath);
            
            if (fileStats.mtime.getTime() < thirtyDaysAgo) {
              await fs.unlink(filePath);
              console.log(`🗑️ Deleted old attachment: ${filePath}`);
              deletedFiles++;
            }
          } catch (fileError) {
            console.warn(`⚠️ Could not process file ${filePath}: ${fileError.message}`);
          }
        }

        // Remove empty folders
        try {
          const remainingFiles = await fs.readdir(companyPath);
          if (remainingFiles.length === 0) {
            await fs.rmdir(companyPath);
            console.log(`🗑️ Deleted empty company folder: ${companyPath}`);
            deletedFolders++;
          }
        } catch (dirError) {
          console.warn(`⚠️ Could not remove directory ${companyPath}: ${dirError.message}`);
        }
      }
    }

    if (deletedFiles > 0 || deletedFolders > 0) {
      console.log(`✅ Cleanup completed: ${deletedFiles} files and ${deletedFolders} folders removed`);
    } else {
      console.log('✅ Cleanup completed: No old files found to delete');
    }
  } catch (error) {
    console.error(`❌ Error during cleanup: ${error}`);
  }
}

// Función para validar y procesar attachments
async function processAttachments(
  attachments: EmailAttachment[] | undefined, 
  companySlug: string, 
  emailId: string
): Promise<any[]> {
  if (!attachments || !Array.isArray(attachments)) {
    return [];
  }

  const processedAttachments: any[] = [];

  for (const attachment of attachments) {
    // Validar que tenga al menos path o content
    if (!attachment.path && !attachment.content) {
      continue;
    }

    const processedAttachment: any = {};

    // Filename dinámico o generado automáticamente
    if (attachment.filename) {
      processedAttachment.filename = attachment.filename;
    } else if (attachment.path) {
      // Extraer filename del path si no se proporciona
      processedAttachment.filename = path.basename(attachment.path);
    } else {
      // Generar filename por defecto para content
      processedAttachment.filename = `attachment_${Date.now()}`;
    }

    // Save attachment temporarily and use temporary path
    const tempPath = await saveAttachmentTemporarily(attachment, companySlug, emailId);
    
    if (tempPath) {
      processedAttachment.path = tempPath;
      
      // Opcionales
      if (attachment.contentType) {
        processedAttachment.contentType = attachment.contentType;
      }
      if (attachment.cid) {
        processedAttachment.cid = attachment.cid;
      }

      processedAttachments.push(processedAttachment);
    }
  }

  return processedAttachments;
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
    console.log(`📧 Email request received for company: ${req.params.c_name}`);
    console.log(`📄 Request body keys: ${Object.keys(req.body).join(', ')}`);
    
    const { c_name } = req.params;
    const { 
      to, 
      subject, 
      text, 
      html,
      smtpConfig, // Nueva configuración SMTP dinámica opcional
      attachments // Attachments dinámicos y opcionales
    } = req.body;

    // Validaciones
    if (!to || !subject || !text) {
      console.error('❌ Missing required fields:', { to: !!to, subject: !!subject, text: !!text });
      res.status(400).json({
        success: false,
        message: 'Los campos to, subject y text son requeridos',
        received: {
          to: !!to,
          subject: !!subject,
          text: !!text,
          html: !!html,
          attachments: Array.isArray(attachments) ? attachments.length : 'not array'
        }
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

    // Generate temporary email ID for attachment management
    const tempEmailId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Procesar attachments dinámicos
    const processedAttachments = await processAttachments(attachments, c_name, tempEmailId);
    console.log(`📎 Procesando ${processedAttachments.length} attachments`);

    // Verificar si hay usuario autenticado para usar su configuración
    const authenticatedUser = (req as any).user;
    
    // Determinar qué transporter usar
    let transporter;
    let fromAddress;
    let userSignature = '';
    let finalHtml = html;
    
    // 1. Prioridad: configuración del usuario autenticado
    if (authenticatedUser) {
      console.log(`📧 Obteniendo configuración de email del usuario: ${authenticatedUser.id}`);
      const userEmailConfig = await getEmailConfigInternal(c_name, authenticatedUser.id);
      
      if (userEmailConfig && userEmailConfig.smtpConfig) {
        transporter = createDynamicTransporter(userEmailConfig.smtpConfig);
        fromAddress = userEmailConfig.smtpConfig.user;
        userSignature = userEmailConfig.signature || '';
        
        // Agregar firma al HTML si existe
        if (userSignature && finalHtml) {
          finalHtml = html + '<br><br>' + userSignature;
        } else if (userSignature) {
          finalHtml = text.replace(/\n/g, '<br>') + '<br><br>' + userSignature;
        }
        
        console.log(`✅ Usando configuración SMTP del usuario: ${userEmailConfig.smtpConfig.host}:${userEmailConfig.smtpConfig.port}`);
      }
    }
    
    // 2. Segunda prioridad: configuración SMTP personalizada en el request
    if (!transporter && smtpConfig) {
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
    }
    
    // 3. Última opción: transporter por defecto
    if (!transporter) {
      transporter = defaultTransporter;
      fromAddress = process.env.EMAIL_ADDRESS;
      console.log('📧 Usando configuración SMTP por defecto');
    }

    // Preparar datos del email
    const emailData: any = {
      from: fromAddress,
      to: to,
      subject: subject,
      text: text,
      html: finalHtml,
    };

    // Agregar attachments solo si existen
    if (processedAttachments.length > 0) {
      emailData.attachments = processedAttachments;
      console.log(`📎 Email incluye ${processedAttachments.length} attachments`);
    }

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
        attachments: processedAttachments.length > 0 ? processedAttachments.map(att => ({
          filename: att.filename,
          contentType: att.contentType,
          hasContent: !!att.content,
          hasPath: !!att.path,
          tempPath: att.path // Store temporary path for cleanup
        })) : undefined, // Guardar metadatos de attachments (sin el contenido real)
        smtpConfig: smtpConfig ? {
          host: smtpConfig.host,
          port: smtpConfig.port,
          user: smtpConfig.user
          // No guardamos la contraseña por seguridad
        } : undefined,
        userId: authenticatedUser?.id // Guardar el ID del usuario que envió el email
      });

      await newEmail.save();
      console.log('✅ Email saved to database successfully');

      res.status(200).json({
        success: true,
        messageId: info.messageId,
        savedToDb: true,
        emailId: newEmail._id,
        usedCustomSmtp: !!smtpConfig,
        usedUserConfig: !!authenticatedUser && !smtpConfig,
        fromAddress: fromAddress,
        attachmentsCount: processedAttachments.length
      });

    } catch (dbError) {
      console.error('⚠️ Email sent but failed to save to database:', dbError);
      res.status(200).json({
        success: true,
        messageId: info.messageId,
        savedToDb: false,
        dbError: dbError.message,
        usedCustomSmtp: !!smtpConfig,
        usedUserConfig: !!authenticatedUser && !smtpConfig,
        fromAddress: fromAddress,
        attachmentsCount: processedAttachments.length
      });
    }

  } catch (error) {
    console.error('❌ Error sending email:', error);
    console.error('🔍 Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack?.split('\n')[0]
    });
    
    // Provide more specific error messages
    let errorMessage = error.message;
    let statusCode = 500;
    
    if (error.code === 'ENOTFOUND') {
      errorMessage = 'SMTP server not found. Please check the host configuration.';
      statusCode = 400;
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Connection refused by SMTP server. Please check host and port.';
      statusCode = 400;
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'Connection timeout. Please check network connectivity and SMTP settings.';
      statusCode = 400;
    } else if (error.responseCode === 535) {
      errorMessage = 'Authentication failed. Please check email credentials.';
      statusCode = 401;
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      code: error.code,
      details: {
        originalError: error.message,
        company: req.params.c_name,
        timestamp: new Date().toISOString()
      }
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
  smtpConfig?: SmtpConfig,
  userId?: string, // Nuevo parámetro para obtener configuración del usuario
  attachments?: EmailAttachment[] // Nuevo parámetro para attachments
) {
  try {
    // Determinar qué transporter usar
    let transporter;
    let fromAddress;
    let userSignature = '';
    let finalHtml = html;
    
    // 1. Prioridad: configuración del usuario si se proporciona userId
    if (userId) {
      console.log(`📧 sendAndSaveEmail obteniendo configuración del usuario: ${userId}`);
      const userEmailConfig = await getEmailConfigInternal(companySlug, userId);
      
      if (userEmailConfig && userEmailConfig.smtpConfig) {
        transporter = createDynamicTransporter(userEmailConfig.smtpConfig);
        fromAddress = userEmailConfig.smtpConfig.user;
        userSignature = userEmailConfig.signature || '';
        
        // Agregar firma al HTML si existe
        if (userSignature && finalHtml) {
          finalHtml = html + '<br><br>' + userSignature;
        } else if (userSignature) {
          finalHtml = text.replace(/\n/g, '<br>') + '<br><br>' + userSignature;
        }
        
        console.log(`✅ sendAndSaveEmail usando configuración del usuario: ${userEmailConfig.smtpConfig.host}:${userEmailConfig.smtpConfig.port}`);
      }
    }
    
    // 2. Segunda prioridad: configuración SMTP personalizada
    if (!transporter && smtpConfig) {
      transporter = createDynamicTransporter(smtpConfig);
      fromAddress = smtpConfig.user;
      console.log(`📧 sendAndSaveEmail usando SMTP personalizada: ${smtpConfig.host}:${smtpConfig.port}`);
    }
    
    // 3. Última opción: transporter por defecto
    if (!transporter) {
      transporter = defaultTransporter;
      fromAddress = process.env.EMAIL_ADDRESS;
      console.log('📧 sendAndSaveEmail usando SMTP por defecto');
    }

    // Generate temporary email ID for attachment management
    const tempEmailId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Procesar attachments dinámicos
    const processedAttachments = await processAttachments(attachments, companySlug, tempEmailId);

    // Preparar datos del email
    const emailData: any = {
      from: fromAddress,
      to: to,
      subject: subject,
      text: text,
      html: finalHtml
    };

    // Agregar attachments solo si existen
    if (processedAttachments.length > 0) {
      emailData.attachments = processedAttachments;
    }

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
        attachments: processedAttachments.length > 0 ? processedAttachments.map(att => ({
          filename: att.filename,
          contentType: att.contentType,
          hasContent: !!att.content,
          hasPath: !!att.path,
          tempPath: att.path // Store temporary path for cleanup
        })) : undefined,
        smtpConfig: smtpConfig ? {
          host: smtpConfig.host,
          port: smtpConfig.port,
          user: smtpConfig.user
        } : undefined,
        userId: userId // Guardar el ID del usuario
      });

      await newEmail.save();
      console.log('✅ Email saved to database successfully');

      return {
        success: true,
        messageId: info.messageId,
        savedToDb: true,
        emailId: newEmail._id,
        usedCustomSmtp: !!smtpConfig,
        usedUserConfig: !!userId && !smtpConfig,
        fromAddress: fromAddress,
        attachmentsCount: processedAttachments.length
      };

    } catch (dbError) {
      console.error('⚠️ Email sent but failed to save to database:', dbError);
      return {
        success: true,
        messageId: info.messageId,
        savedToDb: false,
        dbError: dbError.message,
        usedCustomSmtp: !!smtpConfig,
        usedUserConfig: !!userId && !smtpConfig,
        fromAddress: fromAddress,
        attachmentsCount: processedAttachments.length
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

    // Enriquecer datos con información de disponibilidad de archivos
    const enrichedEmails = await Promise.all(emails.map(async (email) => {
      if (email.attachments && email.attachments.length > 0) {
        const enrichedAttachments = await Promise.all(email.attachments.map(async (attachment) => {
          let fileExists = false;
          let fileSize = null;
          
          if (attachment.tempPath) {
            try {
              const stats = await fs.stat(attachment.tempPath);
              fileExists = true;
              fileSize = stats.size;
            } catch (error) {
              // File doesn't exist or can't be accessed
              fileExists = false;
            }
          }
          
          return {
            ...attachment,
            fileExists,
            fileSize,
            downloadUrl: fileExists ? `/api/email/download/${c_name}/${encodeURIComponent(attachment.filename)}?emailId=${email._id}` : null,
            previewUrl: fileExists ? `/api/email/download/${c_name}/${encodeURIComponent(attachment.filename)}?emailId=${email._id}&preview=true` : null
          };
        }));
        
        return {
          ...email,
          attachments: enrichedAttachments
        };
      }
      
      return email;
    }));

    const total = await EmailModel.countDocuments({});

    res.status(200).json({
      success: true,
      data: enrichedEmails,
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

// Endpoint para descargar archivos adjuntos
export async function downloadEmailAttachment(req: Request, res: Response): Promise<void> {
  try {
    const { c_name, filename } = req.params;
    const { preview } = req.query;

    console.log(`📁 Download request: company=${c_name}, filename=${filename}, preview=${preview}`);

    if (!c_name || !filename) {
      res.status(400).json({
        success: false,
        message: 'Los parámetros c_name y filename son requeridos'
      });
      return;
    }

    // Buscar el archivo en cualquier email de la compañía
    const conn = await getConnectionByCompanySlug(c_name);
    const EmailModel = getEmailModel(conn);
    
    // Buscar el email que contiene este archivo
    const email = await EmailModel.findOne({
      'attachments.filename': decodeURIComponent(filename)
    }).lean();
    
    if (!email) {
      console.log(`❌ Email with file ${filename} not found for company ${c_name}`);
      res.status(404).json({
        success: false,
        message: 'Archivo adjunto no encontrado'
      });
      return;
    }

    // Buscar el attachment específico
    const attachment = email.attachments?.find(att => att.filename === decodeURIComponent(filename));
    
    if (!attachment) {
      console.log(`❌ Attachment ${filename} not found in email ${email._id}`);
      res.status(404).json({
        success: false,
        message: 'Archivo adjunto no encontrado en este email'
      });
      return;
    }

    console.log(`📄 Found attachment:`, {
      filename: attachment.filename,
      contentType: attachment.contentType,
      tempPath: attachment.tempPath,
      hasContent: attachment.hasContent,
      hasPath: attachment.hasPath
    });

    // Verificar que el archivo existe en el sistema de archivos
    if (!attachment.tempPath) {
      console.log(`❌ No tempPath for attachment ${filename}`);
      res.status(404).json({
        success: false,
        message: 'Ruta del archivo no disponible'
      });
      return;
    }

    try {
      await fs.access(attachment.tempPath);
      console.log(`✅ File exists: ${attachment.tempPath}`);
    } catch (error) {
      console.log(`❌ File not accessible: ${attachment.tempPath}`, error);
      res.status(404).json({
        success: false,
        message: 'El archivo ya no está disponible en el servidor'
      });
      return;
    }

    // Obtener stats del archivo para Content-Length
    const stats = await fs.stat(attachment.tempPath);
    console.log(`📊 File stats: size=${stats.size}, isFile=${stats.isFile()}`);

    // Determinar el tipo de contenido - asegurar que sea correcto para imágenes
    let mimeType = attachment.contentType;
    
    // Si no hay contentType o es genérico, intentar determinarlo por extensión
    if (!mimeType || mimeType === 'application/octet-stream') {
      const ext = attachment.filename.toLowerCase().split('.').pop();
      console.log(`🔍 File extension: ${ext}`);
      
      switch (ext) {
        case 'jpg':
        case 'jpeg':
          mimeType = 'image/jpeg';
          break;
        case 'png':
          mimeType = 'image/png';
          break;
        case 'gif':
          mimeType = 'image/gif';
          break;
        case 'webp':
          mimeType = 'image/webp';
          break;
        case 'pdf':
          mimeType = 'application/pdf';
          break;
        default:
          mimeType = 'application/octet-stream';
      }
    }

    console.log(`📄 Final MIME type: ${mimeType}`);

    // Configurar headers básicos
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', stats.size.toString());
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Configurar Content-Disposition según el modo
    if (preview === 'true') {
      // Modo preview: mostrar en el navegador para tipos soportados
      const isImage = mimeType.startsWith('image/');
      const isPdf = mimeType === 'application/pdf';
      const isText = mimeType.startsWith('text/');
      
      if (isImage) {
        // Para imágenes, usar inline SIN filename para mostrar en navegador
        res.setHeader('Content-Disposition', 'inline');
        // Headers adicionales para prevenir problemas de GPU/shader
        res.setHeader('X-Frame-Options', 'ALLOWALL');
        res.setHeader('Content-Security-Policy', 'default-src *; img-src * data: blob:; script-src \'none\'; object-src \'none\';');
        console.log(`👁️ Previewing image: ${attachment.filename} (${mimeType}) for company ${c_name}`);
      } else if (isPdf || isText) {
        // Para PDFs y texto, usar inline con filename
        res.setHeader('Content-Disposition', `inline; filename="${attachment.filename}"`);
        console.log(`👁️ Previewing file: ${attachment.filename} (${mimeType}) for company ${c_name}`);
      } else {
        // Para otros tipos, forzar descarga
        res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename}"`);
        console.log(`📁 Downloading file: ${attachment.filename} (${mimeType}) for company ${c_name}`);
      }
    } else {
      // Modo descarga: siempre descargar
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename}"`);
      console.log(`📁 Downloading file: ${attachment.filename} (${mimeType}) for company ${c_name}`);
    }

    // Agregar headers para evitar problemas de caché
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    console.log(`📄 File details: ${attachment.filename}, size: ${stats.size}, type: ${mimeType}`);

    // Crear el stream de lectura del archivo
    const fileStream = createReadStream(attachment.tempPath);
    
    // Manejar errores del stream
    fileStream.on('error', (error) => {
      console.error('❌ Error streaming file:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Error al leer el archivo'
        });
      }
    });

    fileStream.on('open', () => {
      console.log(`📂 File stream opened successfully for ${attachment.filename}`);
    });

    fileStream.on('end', () => {
      console.log(`✅ File stream completed for ${attachment.filename}`);
    });

    // Manejar errores de la respuesta
    res.on('error', (error) => {
      console.error('❌ Response error:', error);
      fileStream.destroy();
    });

    // Manejar cancelación del cliente
    req.on('close', () => {
      console.log(`🚫 Client disconnected for ${attachment.filename}`);
      fileStream.destroy();
    });

    // Pipe el stream al response
    fileStream.pipe(res);

  } catch (error) {
    console.error('❌ Error downloading email attachment:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Error al descargar el archivo',
        error: error.message
      });
    }
  }
}

// Endpoint simple para debugging de archivos adjuntos
export async function debugAttachment(req: Request, res: Response): Promise<void> {
  try {
    const { c_name, filename } = req.params;

    console.log(`🔍 Debug request: company=${c_name}, filename=${filename}`);

    if (!c_name || !filename) {
      res.status(400).json({
        success: false,
        message: 'Los parámetros c_name y filename son requeridos'
      });
      return;
    }

    // Buscar el archivo en cualquier email de la compañía
    const conn = await getConnectionByCompanySlug(c_name);
    const EmailModel = getEmailModel(conn);
    
    // Buscar el email que contiene este archivo
    const email = await EmailModel.findOne({
      'attachments.filename': decodeURIComponent(filename)
    }).lean();
    
    if (!email) {
      console.log(`❌ Email with file ${filename} not found for company ${c_name}`);
      res.status(404).json({
        success: false,
        message: 'Archivo adjunto no encontrado',
        searchedFilename: decodeURIComponent(filename)
      });
      return;
    }

    // Buscar el attachment específico
    const attachment = email.attachments?.find(att => att.filename === decodeURIComponent(filename));
    
    if (!attachment) {
      console.log(`❌ Attachment ${filename} not found in email ${email._id}`);
      res.status(404).json({
        success: false,
        message: 'Archivo adjunto no encontrado en este email',
        availableAttachments: email.attachments?.map(att => att.filename) || []
      });
      return;
    }

    // Verificar que el archivo existe en el sistema de archivos
    let fileExists = false;
    let fileStats = null;
    
    if (attachment.tempPath) {
      try {
        await fs.access(attachment.tempPath);
        fileStats = await fs.stat(attachment.tempPath);
        fileExists = true;
        console.log(`✅ File exists: ${attachment.tempPath}`);
      } catch (error) {
        console.log(`❌ File not accessible: ${attachment.tempPath}`, error);
        fileExists = false;
      }
    }

    res.json({
      success: true,
      debug: {
        requestedFilename: filename,
        decodedFilename: decodeURIComponent(filename),
        foundAttachment: {
          filename: attachment.filename,
          contentType: attachment.contentType,
          tempPath: attachment.tempPath,
          hasContent: attachment.hasContent,
          hasPath: attachment.hasPath
        },
        fileSystem: {
          fileExists,
          fileSize: fileStats?.size || 0,
          isFile: fileStats?.isFile() || false
        },
        emailId: email._id
      }
    });

  } catch (error) {
    console.error('❌ Error debugging attachment:', error);
    res.status(500).json({
      success: false,
      message: 'Error al buscar el archivo',
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

// Función auxiliar para enviar email usando automáticamente la configuración del usuario autenticado
export async function sendEmailWithUserConfig(
  to: string,
  subject: string,
  text: string,
  html: string = '',
  companySlug: string,
  userId: string,
  attachments?: EmailAttachment[]
) {
  return await sendAndSaveEmail(to, subject, text, html, companySlug, undefined, userId, attachments);
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

// Cleanup scheduler - run daily
export function startAttachmentCleanupScheduler(): void {
  // Ensure temp directory exists on startup
  ensureTempAttachmentsDir()
    .then(() => {
      console.log('✅ Temp attachments directory initialized');
      // Run cleanup immediately on startup
      cleanupOldAttachments();
    })
    .catch(error => {
      console.error('❌ Failed to initialize temp attachments directory:', error);
    });
  
  // Schedule cleanup every 24 hours
  setInterval(() => {
    console.log('🧹 Running scheduled attachment cleanup...');
    cleanupOldAttachments();
  }, 24 * 60 * 60 * 1000); // 24 hours

  console.log('✅ Attachment cleanup scheduler started - runs every 24 hours');
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
    req.body.html = AiText + (html || '');
    console.log('texto AI:', AiText);
    
    // 3. Llamar a la función original para enviar el correo
    // La función sendEmail ya maneja automáticamente la configuración del usuario
    await sendEmail(req, res);

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function simpleImageServe(req: Request, res: Response): Promise<void> {
  try {
    const { c_name, filename } = req.params;
    const decodedFilename = decodeURIComponent(filename);
    
    console.log(`🖼️ Simple image serve for: ${decodedFilename} from company: ${c_name}`);
    
    // Buscar en la carpeta temp_attachments de la compañía
    const companyAttachmentsDir = path.join(process.cwd(), 'temp_attachments', c_name);
    
    // Buscar el archivo
    let foundPath = null;
    try {
      const files = await fs.readdir(companyAttachmentsDir);
      for (const file of files) {
        if (file.endsWith(decodedFilename)) {
          foundPath = path.join(companyAttachmentsDir, file);
          break;
        }
      }
    } catch (err) {
      res.status(404).send('File not found');
      return;
    }
    
    if (!foundPath) {
      res.status(404).send('File not found');
      return;
    }
    
    // Obtener tipo MIME por extensión
    const ext = decodedFilename.toLowerCase().split('.').pop();
    let mimeType = 'application/octet-stream';
    
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        mimeType = 'image/jpeg';
        break;
      case 'png':
        mimeType = 'image/png';
        break;
      case 'gif':
        mimeType = 'image/gif';
        break;
      case 'webp':
        mimeType = 'image/webp';
        break;
      case 'pdf':
        mimeType = 'application/pdf';
        break;
      default:
        mimeType = 'application/octet-stream';
    }
    
    // Headers muy simples para evitar problemas de GPU
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': 'inline',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    
    console.log(`📤 Serving image with simple headers: ${foundPath}`);
    
    // Servir el archivo directamente
    const stream = createReadStream(foundPath);
    
    stream.on('error', (err) => {
      console.error('❌ Stream error:', err);
      if (!res.headersSent) {
        res.status(500).send('Error serving file');
      }
    });
    
    stream.pipe(res);
    
  } catch (error) {
    console.error('❌ Simple image serve error:', error);
    if (!res.headersSent) {
      res.status(500).send('Error serving image');
    }
  }
}

export async function checkFileHealth(req: Request, res: Response): Promise<void> {
  try {
    const { c_name, filename } = req.params;
    const decodedFilename = decodeURIComponent(filename);
    
    console.log(`🔍 Checking file health for: ${decodedFilename} from company: ${c_name}`);
    
    // Buscar en la carpeta temp_attachments de la compañía
    const companyAttachmentsDir = path.join(process.cwd(), 'temp_attachments', c_name);
    
    // Buscar el archivo
    let foundPath = null;
    try {
      const files = await fs.readdir(companyAttachmentsDir);
      for (const file of files) {
        if (file.endsWith(decodedFilename)) {
          foundPath = path.join(companyAttachmentsDir, file);
          break;
        }
      }
    } catch (err) {
      res.status(404).json({ success: false, error: 'Directory not found' });
      return;
    }
    
    if (!foundPath) {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }
    
    // Leer los primeros bytes del archivo
    const fileContent = await fs.readFile(foundPath);
    const first20Bytes = Array.from(fileContent.slice(0, 20)).map(b => `0x${b.toString(16).padStart(2, '0')}`);
    const first20AsString = fileContent.slice(0, 20).toString('utf8');
    
    // Verificar si es un archivo válido según su extensión
    const ext = decodedFilename.toLowerCase().split('.').pop();
    let expectedSignature = '';
    let isValidFile = false;
    
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        expectedSignature = 'FF D8 FF';
        isValidFile = fileContent[0] === 0xFF && fileContent[1] === 0xD8 && fileContent[2] === 0xFF;
        break;
      case 'png':
        expectedSignature = '89 50 4E 47';
        isValidFile = fileContent[0] === 0x89 && fileContent[1] === 0x50 && fileContent[2] === 0x4E && fileContent[3] === 0x47;
        break;
      case 'gif':
        expectedSignature = '47 49 46 38';
        isValidFile = fileContent[0] === 0x47 && fileContent[1] === 0x49 && fileContent[2] === 0x46 && fileContent[3] === 0x38;
        break;
      case 'pdf':
        expectedSignature = '25 50 44 46';
        isValidFile = fileContent[0] === 0x25 && fileContent[1] === 0x50 && fileContent[2] === 0x44 && fileContent[3] === 0x46;
        break;
      default:
        expectedSignature = 'Unknown format';
        isValidFile = true; // For unknown formats, assume valid
    }
    
    const stats = await fs.stat(foundPath);
    
    res.json({
      success: true,
      fileHealth: {
        filename: decodedFilename,
        fullPath: foundPath,
        size: stats.size,
        extension: ext,
        isValidFile,
        expectedSignature,
        actualFirst20Bytes: first20Bytes,
        first20AsString: first20AsString.replace(/[^\x20-\x7E]/g, '.'), // Replace non-printable chars
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime
      }
    });
    
  } catch (error) {
    console.error('❌ File health check error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ==================================================
// NUEVAS FUNCIONES DE SINCRONIZACIÓN COMPLETA
// ==================================================

import { EmailReaderManager } from '../services/emailReader.service';

// Función procesadora principal para sincronización completa
export async function processFullEmailSync(
  companySlug: string, 
  userId: string, 
  options: {
    monthsBack: number;
    mailboxes: string[];
    includeAttachments: boolean;
    maxEmailsPerBatch: number;
  }
): Promise<any> {
  const { monthsBack, includeAttachments, maxEmailsPerBatch } = options;
  
  console.log(`🚀 Procesando sincronización completa para ${companySlug}_${userId}`);
  
  const connection = await getConnectionByCompanySlug(companySlug);
  const EmailModel = getEmailModel(connection);
  
  const manager = EmailReaderManager.getInstance();
  const reader = await manager.getOrCreateReader(companySlug, userId);
  
  if (!reader) {
    throw new Error('No se pudo establecer conexión IMAP');
  }

  const results = {
    totalProcessed: 0,
    totalSaved: 0,
    totalSkipped: 0,
    totalErrors: 0,
    mailboxResults: {} as any,
    startTime: new Date(),
    endTime: null as Date | null,
    duration: 0
  };

  try {
    console.log(`📁 Obteniendo emails usando método simplificado para Gmail...`);
    
    // Usar el método simplificado que funciona mejor con Gmail
    const emailData = await reader.getHistoricalEmailsSimple(monthsBack * 30);

    // Procesar emails recibidos (incoming)
    if (emailData.inbox && emailData.inbox.length > 0) {
      console.log(`📥 Procesando ${emailData.inbox.length} emails recibidos`);
      
      const inboxResult = {
        processed: 0,
        saved: 0,
        skipped: 0,
        errors: 0,
        errorDetails: [] as string[]
      };

      for (const email of emailData.inbox.slice(0, maxEmailsPerBatch)) {
        try {
          const existingEmail = await EmailModel.findOne({ 
            messageId: email.messageId,
            direction: 'incoming'
          });
          
          if (existingEmail) {
            inboxResult.skipped++;
            continue;
          }

          // Procesar attachments si está habilitado
          const processedAttachments = [];
          if (includeAttachments && email.attachments && email.attachments.length > 0) {
            for (const attachment of email.attachments) {
              processedAttachments.push({
                filename: attachment.filename,
                contentType: attachment.contentType,
                size: attachment.size || 0,
                hasContent: false,
                hasPath: !!attachment.path,
                path: attachment.path
              });
            }
          }

          const newEmail = new EmailModel({
            messageId: email.messageId,
            direction: 'incoming',
            from: email.from,
            to: Array.isArray(email.to) ? email.to.join(', ') : email.to,
            cc: Array.isArray(email.cc) ? email.cc.join(', ') : email.cc || '',
            bcc: Array.isArray(email.bcc) ? email.bcc.join(', ') : email.bcc || '',
            subject: email.subject || 'Sin asunto',
            textContent: email.text || '',
            htmlContent: email.html || '',
            receivedDate: email.date || new Date(),
            sentDate: new Date(),
            attachments: processedAttachments.length > 0 ? processedAttachments : undefined,
            status: 'recibido',
            companySlug: companySlug,
            userId: userId,
            syncedHistorically: true,
            syncedAt: new Date()
          });

          await newEmail.save();
          inboxResult.saved++;

        } catch (emailError) {
          inboxResult.errors++;
          inboxResult.errorDetails.push(`${email.subject}: ${emailError.message}`);
          console.error(`❌ Error procesando email recibido:`, emailError);
        }
        
        inboxResult.processed++;
      }

      results.mailboxResults['INBOX'] = inboxResult;
      results.totalSaved += inboxResult.saved;
      results.totalSkipped += inboxResult.skipped;
      results.totalErrors += inboxResult.errors;

      console.log(`✅ INBOX completado: ${inboxResult.saved} guardados, ${inboxResult.skipped} omitidos, ${inboxResult.errors} errores`);
    }

    // Procesar emails enviados (outgoing)
    if (emailData.sent && emailData.sent.length > 0) {
      console.log(`📤 Procesando ${emailData.sent.length} emails enviados`);
      
      const sentResult = {
        processed: 0,
        saved: 0,
        skipped: 0,
        errors: 0,
        errorDetails: [] as string[]
      };

      for (const email of emailData.sent.slice(0, maxEmailsPerBatch)) {
        try {
          const existingEmail = await EmailModel.findOne({ 
            messageId: email.messageId,
            direction: 'outgoing'
          });
          
          if (existingEmail) {
            sentResult.skipped++;
            continue;
          }

          // Procesar attachments si está habilitado
          const processedAttachments = [];
          if (includeAttachments && email.attachments && email.attachments.length > 0) {
            for (const attachment of email.attachments) {
              processedAttachments.push({
                filename: attachment.filename,
                contentType: attachment.contentType,
                size: attachment.size || 0,
                hasContent: false,
                hasPath: !!attachment.path,
                path: attachment.path
              });
            }
          }

          const newEmail = new EmailModel({
            messageId: email.messageId,
            direction: 'outgoing',
            from: email.from,
            to: Array.isArray(email.to) ? email.to.join(', ') : email.to,
            cc: Array.isArray(email.cc) ? email.cc.join(', ') : email.cc || '',
            bcc: Array.isArray(email.bcc) ? email.bcc.join(', ') : email.bcc || '',
            subject: email.subject || 'Sin asunto',
            textContent: email.text || '',
            htmlContent: email.html || '',
            receivedDate: new Date(),
            sentDate: email.date || new Date(),
            attachments: processedAttachments.length > 0 ? processedAttachments : undefined,
            status: 'enviado',
            companySlug: companySlug,
            userId: userId,
            syncedHistorically: true,
            syncedAt: new Date()
          });

          await newEmail.save();
          sentResult.saved++;

        } catch (emailError) {
          sentResult.errors++;
          sentResult.errorDetails.push(`${email.subject}: ${emailError.message}`);
          console.error(`❌ Error procesando email enviado:`, emailError);
        }
        
        sentResult.processed++;
      }

      results.mailboxResults['Sent'] = sentResult;
      results.totalSaved += sentResult.saved;
      results.totalSkipped += sentResult.skipped;
      results.totalErrors += sentResult.errors;

      console.log(`✅ Sent completado: ${sentResult.saved} guardados, ${sentResult.skipped} omitidos, ${sentResult.errors} errores`);
    }

  } catch (error) {
    console.error(`❌ Error general en sincronización:`, error);
    throw error;
  }

  results.endTime = new Date();
  results.duration = results.endTime.getTime() - results.startTime.getTime();

  console.log(`🎉 Sincronización completa finalizada en ${results.duration}ms`);
  console.log(`📊 Resumen: ${results.totalSaved} guardados, ${results.totalSkipped} omitidos, ${results.totalErrors} errores`);

  return results;
}

// Endpoint para sincronización completa de emails con background processing
export const fullEmailSync = async (req: Request, res: Response): Promise<void> => {
  try {
    const companySlug = req.headers['company-slug'] as string || req.params.c_name;
    const { userId, monthsBack = 6, includeAttachments = false, maxEmailsPerBatch = 100, background = false } = req.body;
    
    if (!companySlug) {
      res.status(400).json({ success: false, error: 'Company slug is required' });
      return;
    }

    if (!userId) {
      res.status(400).json({ success: false, error: 'User ID is required' });
      return;
    }

    const mailboxes = ["INBOX", "Sent", "Sent Items", "Enviados"];

    console.log(`🔄 Iniciando sincronización completa para ${companySlug}_${userId}`);
    console.log(`📅 Parámetros: ${monthsBack} meses, mailboxes: ${JSON.stringify(mailboxes)}, background: ${background}`);

    if (background) {
      // Procesamiento en background
      setImmediate(async () => {
        try {
          await processFullEmailSync(companySlug, userId, {
            monthsBack,
            mailboxes,
            includeAttachments,
            maxEmailsPerBatch
          });
        } catch (error) {
          console.error(`❌ Error en sincronización background:`, error);
        }
      });

      res.status(202).json({ 
        success: true, 
        message: 'Sincronización completa iniciada en background',
        parameters: { monthsBack, mailboxes, includeAttachments, maxEmailsPerBatch }
      });
    } else {
      // Procesamiento síncrono
      const results = await processFullEmailSync(companySlug, userId, {
        monthsBack,
        mailboxes,
        includeAttachments,
        maxEmailsPerBatch
      });

      res.status(200).json({ 
        success: true, 
        message: 'Sincronización completa completada',
        results
      });
    }

  } catch (error) {
    console.error(`❌ Error en fullEmailSync:`, error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Endpoint mejorado para obtener historial completo de emails con filtros avanzados
export const getEnhancedEmailHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const companySlug = req.headers['company-slug'] as string || req.params.c_name;
    const { 
      page = 1, 
      limit = 50, 
      direction, // 'incoming', 'outgoing', o ambos
      fromDate, 
      toDate,
      search, // búsqueda en subject, from, to
      includeHistorical = true, // incluir emails sincronizados históricamente
      sortBy = 'date', // 'date', 'subject', 'from'
      sortOrder = 'desc' // 'asc', 'desc'
    } = req.query;
    
    if (!companySlug) {
      res.status(400).json({ success: false, error: 'Company slug is required' });
      return;
    }

    const connection = await getConnectionByCompanySlug(companySlug);
    const EmailModel = getEmailModel(connection);

    // Construir filtros
    const filters: any = {};
    
    if (direction && direction !== 'all') {
      filters.direction = direction;
    }
    
    if (fromDate || toDate) {
      filters.receivedDate = {};
      if (fromDate) filters.receivedDate.$gte = new Date(fromDate as string);
      if (toDate) filters.receivedDate.$lte = new Date(toDate as string);
    }
    
    if (search) {
      filters.$or = [
        { subject: { $regex: search, $options: 'i' } },
        { from: { $regex: search, $options: 'i' } },
        { to: { $regex: search, $options: 'i' } },
        { textContent: { $regex: search, $options: 'i' } }
      ];
    }

    // Configurar ordenamiento
    const sortOptions: any = {};
    if (sortBy === 'date') {
      sortOptions.receivedDate = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'subject') {
      sortOptions.subject = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'from') {
      sortOptions.from = sortOrder === 'desc' ? -1 : 1;
    }

    const skip = (Number(page) - 1) * Number(limit);

    console.log(`📊 Obteniendo historial de emails con filtros:`, {
      companySlug,
      filters,
      page,
      limit,
      sortBy,
      sortOrder
    });

    const emails = await EmailModel.find(filters)
      .sort(sortOptions)
      .skip(skip)
      .limit(Number(limit))
      .lean();

    // Enriquecer datos con información adicional
    const enrichedEmails = emails.map((email: any) => ({
      ...email,
      isHistorical: !!email.syncedHistorically,
      hasAttachments: !!(email.attachments && email.attachments.length > 0),
      attachmentCount: email.attachments ? email.attachments.length : 0,
      preview: email.textContent ? email.textContent.substring(0, 200) + '...' : '',
      syncInfo: {
        syncedHistorically: !!email.syncedHistorically,
        syncedAt: email.syncedAt || email.createdAt
      }
    }));

    const total = await EmailModel.countDocuments(filters);
    
    // Obtener estadísticas adicionales
    const stats = await EmailModel.aggregate([
      { $match: filters },
      {
        $group: {
          _id: null,
          totalEmails: { $sum: 1 },
          incomingCount: { $sum: { $cond: [{ $eq: ['$direction', 'incoming'] }, 1, 0] } },
          outgoingCount: { $sum: { $cond: [{ $eq: ['$direction', 'outgoing'] }, 1, 0] } },
          historicalCount: { $sum: { $cond: ['$syncedHistorically', 1, 0] } },
          withAttachments: { $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ['$attachments', []] } }, 0] }, 1, 0] } }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: enrichedEmails,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      },
      filters: {
        direction,
        fromDate,
        toDate,
        search,
        includeHistorical,
        sortBy,
        sortOrder
      },
      statistics: stats[0] || {
        totalEmails: 0,
        incomingCount: 0,
        outgoingCount: 0,
        historicalCount: 0,
        withAttachments: 0
      }
    });

  } catch (error) {
    console.error(`❌ Error en getEnhancedEmailHistory:`, error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
