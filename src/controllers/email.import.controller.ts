import { Request, Response } from 'express';
import { PSTFile } from 'pst-extractor';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { getConnectionByCompanySlug } from '../config/connectionManager';
import getEmailModel from '../models/email.model';

// Servicio mínimo para importar PST
class PSTImporter {
  async importPSTFile(filePath: string, companySlug: string, userId: string, maxEmails?: number | 'max') {
    console.log(`📂 Importando PST: ${filePath}${maxEmails === 'max' ? ' (completo)' : maxEmails ? ` (máximo ${maxEmails} emails)` : ''}`);
    
    const connection = await getConnectionByCompanySlug(companySlug);
    const EmailModel = getEmailModel(connection);
    
    const counters = { totalSaved: 0, totalErrors: 0, totalProcessed: 0, maxToProcess: maxEmails === 'max' ? Infinity : (maxEmails || Infinity) };
    
    try {
      const pstFile = new PSTFile(filePath);
      
      // Procesar carpetas del PST recursivamente
      await this.processPSTFolder(pstFile.getRootFolder(), EmailModel, companySlug, userId, counters);
      
      return { totalSaved: counters.totalSaved, totalErrors: counters.totalErrors, totalProcessed: counters.totalProcessed, wasLimited: counters.totalProcessed >= counters.maxToProcess };
      
    } catch (error) {
      console.error(`❌ Error importando PST:`, error);
      throw error;
    }
  }
  
  private async processPSTFolder(folder: any, EmailModel: any, companySlug: string, userId: string, counters: { totalSaved: number, totalErrors: number, totalProcessed: number, maxToProcess: number }) {
    // Si ya se alcanzó el límite, detener procesamiento
    if (counters.totalProcessed >= counters.maxToProcess) return;

    const folderName = folder.displayName || 'Root Folder';
    console.log(`📁 Procesando carpeta: ${folderName}`);
    
    // Solo omitir carpetas específicas que no queremos procesar (excepto Root Folder)
    if (folderName !== 'Root Folder' && this.shouldSkipFolder(folderName)) {
      console.log(`⏭️ Omitiendo carpeta: ${folderName}`);
      return;
    }
    
    // Procesar emails en esta carpeta
    if (folder.contentCount > 0) {
      let childMessage = folder.getNextChild();
      
      while (childMessage !== null) {
        // Verificar límite antes de procesar
        if (counters.totalProcessed >= counters.maxToProcess) break;
        
        try {
          counters.totalProcessed++;
          // Verificar si ya existe
          const messageId = childMessage.internetMessageId || `pst_${Date.now()}_${Math.random()}`;
          const exists = await EmailModel.findOne({
            messageId: messageId,
            companySlug
          });
          
          if (exists) {
            childMessage = folder.getNextChild();
            continue;
          }
          
          // Extraer contenido del email con conversión automática HTML-a-texto
          const rawTextContent = this.getMessageBody(childMessage);
          const rawHtmlContent = this.getMessageBodyHTML(childMessage);
          
          let finalTextContent = '';
          let finalHtmlContent = '';
          
          // Priorizar HTML si está disponible y convertirlo a texto plano
          if (rawHtmlContent && rawHtmlContent.trim()) {
            finalHtmlContent = rawHtmlContent.trim();
            // Usar nuestra conversión mejorada HTML-a-texto
            finalTextContent = this.htmlToText(rawHtmlContent);
            console.log(`📝 Email con HTML convertido a texto: "${childMessage.subject || 'Sin asunto'}" (${finalTextContent.length} chars)`);
          } else if (rawTextContent && rawTextContent.trim()) {
            finalTextContent = rawTextContent.trim();
            finalHtmlContent = rawTextContent.trim();
            console.log(`📄 Email con texto plano: "${childMessage.subject || 'Sin asunto'}" (${finalTextContent.length} chars)`);
          } else {
            console.log(`⚠️ Email sin contenido: "${childMessage.subject || 'Sin asunto'}"`);
          }

          // Crear email
          const newEmail = new EmailModel({
            messageId: messageId,
            direction: this.getFolderDirection(folderName),
            from: (childMessage.senderName || '') + ' <' + (childMessage.senderEmailAddress || '') + '>',
            to: childMessage.displayTo || '',
            cc: childMessage.displayCC || '',
            subject: childMessage.subject || 'Sin asunto',
            textContent: finalTextContent,
            htmlContent: finalHtmlContent,
            receivedDate: childMessage.clientSubmitTime || new Date(),
            sentDate: childMessage.messageDeliveryTime || new Date(),
            status: this.getFolderDirection(folderName) === 'incoming' ? 'recibido' : 'enviado',
            companySlug,
            userId,
            importSource: 'pst',
            importFolder: folderName,
            importedAt: new Date()
          });
          
          await newEmail.save();
          counters.totalSaved++;
          
        } catch (error) {
          counters.totalErrors++;
          console.error(`❌ Error procesando email:`, error.message);
        }
        
        childMessage = folder.getNextChild();
      }
    }
    
    // Procesar subcarpetas
    if (folder.hasSubfolders) {
      const childFolders = folder.getSubFolders();
      
      for (const childFolder of childFolders) {
        if (counters.totalProcessed >= counters.maxToProcess) break;
        await this.processPSTFolder(childFolder, EmailModel, companySlug, userId, counters);
      }
    }
  }
  
  private shouldSkipFolder(folderName: string): boolean {
    const skipFolders = [
      'elementos eliminados', 'deleted items', 'trash', 'papelera',
      'correo no deseado', 'junk', 'spam',
      'borradores', 'drafts',
      'social activity notifications',
      'suscripciones de rss', 'rss feeds',
      'raíz de yammer', 'yammer root',
      'configuración de pasos rápidos', 'quick step settings',
      'conversation action settings',
      'eventcheckpoints',
      'ipm_common_views',
      'ipm_views',
      'itemprocssearch',
      'buscar raíz', 'search root',
      'spam search folder'
    ];
    
    const lowerFolderName = folderName.toLowerCase();
    return skipFolders.some(folder => 
      lowerFolderName.includes(folder.toLowerCase()) || 
      folder.toLowerCase().includes(lowerFolderName)
    );
  }
  
  private getFolderDirection(folderName: string): 'incoming' | 'outgoing' {
    const outgoing = ['sent', 'enviados', 'sent items'];
    return outgoing.some(folder => 
      folderName.toLowerCase().includes(folder.toLowerCase())
    ) ? 'outgoing' : 'incoming';
  }

  public getMessageBody(message: any): string {
    try {
      // Primero intentar obtener texto plano directamente
      if (message.body && message.body.trim()) {
        return message.body.trim();
      }
      
      // Si no hay texto plano, intentar extraer de HTML
      const htmlContent = this.getMessageBodyHTML(message);
      if (htmlContent) {
        // Convertir HTML a texto plano básico
        return this.htmlToText(htmlContent);
      }
      
      // Acceder a propiedades específicas del PST para el body
      const bodyProperties = [16345, 26137, 4096]; // IDs comunes para body en PST
      
      for (const propId of bodyProperties) {
        if (message.pstTableItems && message.pstTableItems.has(propId)) {
          const tableItem = message.pstTableItems.get(propId);
          if (tableItem && tableItem._data) {
            try {
              // Intentar diferentes codificaciones
              let bodyText = '';
              
              // Intentar UTF-8 primero
              try {
                bodyText = tableItem._data.toString('utf8').replace(/\u0000/g, '').trim();
                if (bodyText) return bodyText;
              } catch (e) {}
              
              // Intentar UTF-16LE
              try {
                bodyText = tableItem._data.toString('utf16le').replace(/\u0000/g, '').trim();
                if (bodyText) return bodyText;
              } catch (e) {}
              
              // Intentar ASCII
              try {
                bodyText = tableItem._data.toString('ascii').replace(/\u0000/g, '').trim();
                if (bodyText) return bodyText;
              } catch (e) {}
            } catch (error) {
              console.error(`Error processing body property ${propId}:`, error.message);
            }
          }
        }
      }
      
      // Fallback: intentar con otras propiedades del mensaje
      if (message.bodyPrefix) return message.bodyPrefix;
      
      return '';
    } catch (error) {
      console.error('Error extracting message body:', error.message);
      return '';
    }
  }

  public getMessageBodyHTML(message: any): string {
    try {
      // Intentar obtener el HTML body
      if (message.bodyHTML && message.bodyHTML.trim()) {
        return message.bodyHTML.trim();
      }
      
      // Acceder a propiedades específicas del PST para HTML body
      const htmlBodyProperties = [16350, 16369, 4225]; // IDs comunes para HTML body en PST
      
      for (const propId of htmlBodyProperties) {
        if (message.pstTableItems && message.pstTableItems.has(propId)) {
          const tableItem = message.pstTableItems.get(propId);
          if (tableItem && tableItem._data) {
            try {
              // Intentar diferentes codificaciones para HTML
              let htmlText = '';
              
              // Intentar UTF-8 primero
              try {
                htmlText = tableItem._data.toString('utf8').replace(/\u0000/g, '').trim();
                if (htmlText && htmlText.includes('<')) return htmlText;
              } catch (e) {}
              
              // Intentar UTF-16LE
              try {
                htmlText = tableItem._data.toString('utf16le').replace(/\u0000/g, '').trim();
                if (htmlText && htmlText.includes('<')) return htmlText;
              } catch (e) {}
              
            } catch (error) {
              console.error(`Error processing HTML body property ${propId}:`, error.message);
            }
          }
        }
      }
      
      return '';
    } catch (error) {
      console.error('Error extracting message HTML body:', error.message);
      return '';
    }
  }

  // Método auxiliar para convertir HTML a texto plano mejorado
  public htmlToText(html: string): string {
    try {
      if (!html || typeof html !== 'string') return '';
      
      return html
        // Remover scripts y estilos completos
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        // Reemplazar elementos de bloque con saltos de línea
        .replace(/<\/?(p|div|h[1-6]|br|hr)\s*\/?>/gi, '\n')
        .replace(/<\/?(ul|ol|li)\s*\/?>/gi, '\n')
        .replace(/<\/tr>/gi, '\n')
        .replace(/<\/td>/gi, '\t')
        .replace(/<\/th>/gi, '\t')
        // Añadir espacios para elementos inline que podrían unirse
        .replace(/<\/?(span|em|strong|b|i|u|a)\s*\/?>/gi, ' ')
        // Remover todas las etiquetas HTML restantes
        .replace(/<[^>]*>/g, '')
        // Decodificar entidades HTML más completas
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&copy;/g, '©')
        .replace(/&reg;/g, '®')
        .replace(/&trade;/g, '™')
        // Decodificar entidades numéricas básicas
        .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
        .replace(/&#x([a-f\d]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
        // Limpiar espacios y saltos de línea excesivos
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s+/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    } catch (error) {
      console.error('Error converting HTML to text:', error.message);
      return html.replace(/<[^>]*>/g, '').trim(); // Fallback básico
    }
  }
}

// Endpoint para subir PST
export async function uploadPST(req: Request, res: Response) {
  try {
    const { c_name } = req.params;
    const { userId, maxEmails } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file uploaded' 
      });
    }
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'UserId required' 
      });
    }
    
    const filePath = req.file.path;
    
    // Responder inmediatamente
    res.status(202).json({
      success: true,
      message: 'PST upload started',
      filename: req.file.filename
    });
    
    // Procesar en background
    setTimeout(async () => {
      try {
        const importer = new PSTImporter();
        const result = await importer.importPSTFile(filePath, c_name, userId, maxEmails);
        
        console.log(`✅ PST import completed: ${result.totalSaved} emails imported (${result.totalProcessed} processed)`);
        
        // Limpiar archivo
        await fs.unlink(filePath);
        
      } catch (error) {
        console.error(`❌ PST import failed:`, error);
        try {
          await fs.unlink(filePath);
        } catch {}
      }
    }, 1000);
    
  } catch (error) {
    console.error(`❌ Upload error:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Endpoint para ver estado de importación
export async function getPSTStatus(req: Request, res: Response) {
  try {
    const { c_name } = req.params;
    const { userId } = req.query;
    
    const connection = await getConnectionByCompanySlug(c_name);
    const EmailModel = getEmailModel(connection);
    
    const filter: any = { importSource: 'pst' };
    if (userId) filter.userId = userId;
    
    const total = await EmailModel.countDocuments(filter);
    
    const folders = await EmailModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$importFolder',
          count: { $sum: 1 }
        }
      }
    ]);
    
    res.json({
      success: true,
      data: {
        totalImported: total,
        folders: folders
      }
    });
    
  } catch (error) {
    console.error(`❌ Status error:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Endpoint para procesar archivos PST locales (archivos grandes ya en el servidor)
export async function processLocalPST(req: Request, res: Response) {
  try {
    const { c_name } = req.params;
    const { filename, userId, maxEmails } = req.body;
    
    console.log(`📂 Procesamiento local PST solicitado:`, { filename, c_name, userId, maxEmails });
    
    if (!filename || !userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'filename y userId son requeridos' 
      });
    }
    
    // Ruta al archivo PST local
    const pstImportsDir = path.join(process.cwd(), 'pst-imports');
    const filePath = path.join(pstImportsDir, filename);
    
    console.log(`🔍 Buscando archivo en: ${filePath}`);
    
    // Verificar que el archivo existe
    if (!existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: `Archivo no encontrado: ${filename}`,
        path: filePath,
        availableFiles: await fs.readdir(pstImportsDir).catch(() => [])
      });
    }
    
    // Verificar que es un archivo .pst
    if (!filename.toLowerCase().endsWith('.pst')) {
      return res.status(400).json({
        success: false,
        error: 'El archivo debe tener extensión .pst'
      });
    }
    
    // Obtener información del archivo
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;
    const fileSizeGB = fileSize / (1024 * 1024 * 1024);
    
    console.log(`📊 Archivo encontrado:`, {
      size: `${fileSizeGB.toFixed(2)} GB`,
      path: filePath,
      isLarge: fileSizeGB > 2
    });
    
    // Responder inmediatamente
    res.status(202).json({
      success: true,
      message: 'Local PST processing started',
      fileInfo: {
        filename: filename,
        size: fileSize,
        sizeFormatted: `${fileSizeGB.toFixed(2)} GB`,
        isLargeFile: fileSizeGB > 2,
        estimatedProcessingTime: fileSizeGB > 2 ? `${Math.ceil(fileSizeGB * 10)} minutos` : '5-15 minutos'
      },
      startedAt: new Date().toISOString()
    });
    
    // Procesar en background con configuración especial para archivos grandes
    setTimeout(async () => {
      try {
        console.log(`🚀 Iniciando procesamiento PST local: ${filename} (${fileSizeGB.toFixed(2)} GB)`);
        
        const importer = new PSTImporter();
        const startTime = Date.now();
        
        const result = await importer.importPSTFile(filePath, c_name, userId, maxEmails);
        
        const duration = Date.now() - startTime;
        const durationMinutes = (duration / 1000 / 60).toFixed(1);
        
        console.log(`🎉 PST local procesado exitosamente:`, {
          filename,
          totalSaved: result.totalSaved,
          totalProcessed: result.totalProcessed,
          totalErrors: result.totalErrors,
          duration: `${durationMinutes} minutos`,
          sizeGB: fileSizeGB.toFixed(2)
        });
        
        // Para archivos grandes exitosos, crear un archivo de log
        if (fileSizeGB > 1) {
          const logPath = path.join(pstImportsDir, `${filename}_import_log.txt`);
          const logContent = `
PST Import Completed Successfully
================================
File: ${filename}
Size: ${fileSizeGB.toFixed(2)} GB
Company: ${c_name}
User ID: ${userId}
Started: ${new Date().toISOString()}
Duration: ${durationMinutes} minutes
Emails Imported: ${result.totalSaved}
Errors: ${result.totalErrors}
Status: SUCCESS
================================
          `.trim();
          
          await fs.writeFile(logPath, logContent);
          console.log(`📝 Log creado: ${logPath}`);
        }
        
        // No eliminar el archivo automáticamente para archivos grandes
        console.log(`📁 Archivo PST conservado para verificación: ${filePath}`);
        
      } catch (importError) {
        console.error(`❌ Error procesando PST local:`, {
          filename,
          error: importError.message,
          stack: importError.stack
        });
        
        // Crear archivo de error para archivos grandes
        const errorLogPath = path.join(pstImportsDir, `${filename}_error_log.txt`);
        const errorContent = `
PST Import Failed
================
File: ${filename}
Size: ${fileSizeGB.toFixed(2)} GB
Company: ${c_name}
User ID: ${userId}
Error Time: ${new Date().toISOString()}
Error: ${importError.message}
Stack: ${importError.stack}
Status: FAILED
================
        `.trim();
        
        try {
          await fs.writeFile(errorLogPath, errorContent);
          console.log(`📝 Error log creado: ${errorLogPath}`);
        } catch (logError) {
          console.error(`❌ No se pudo crear log de error:`, logError.message);
        }
      }
    }, 1000);
    
  } catch (error) {
    console.error(`❌ Error en procesamiento local PST:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: {
        timestamp: new Date().toISOString(),
        endpoint: 'processLocalPST'
      }
    });
  }
}

// Endpoint para listar archivos PST disponibles localmente
export async function listLocalPST(req: Request, res: Response) {
  try {
    const pstImportsDir = path.join(process.cwd(), 'pst-imports');
    
    // Verificar que la carpeta existe
    if (!existsSync(pstImportsDir)) {
      return res.status(404).json({
        success: false,
        error: 'Carpeta pst-imports no encontrada'
      });
    }
    
    // Leer contenido de la carpeta
    const files = await fs.readdir(pstImportsDir);
    
    // Filtrar solo archivos .pst y obtener información
    const pstFiles = [];
    for (const file of files) {
      if (file.toLowerCase().endsWith('.pst')) {
        const filePath = path.join(pstImportsDir, file);
        const stats = await fs.stat(filePath);
        
        pstFiles.push({
          filename: file,
          size: stats.size,
          sizeFormatted: `${(stats.size / 1024 / 1024 / 1024).toFixed(2)} GB`,
          lastModified: stats.mtime,
          isLarge: stats.size > 2 * 1024 * 1024 * 1024 // >2GB
        });
      }
    }
    
    // Buscar archivos de log
    const logFiles = files.filter(file => 
      file.endsWith('_import_log.txt') || file.endsWith('_error_log.txt')
    );
    
    res.json({
      success: true,
      data: {
        pstFiles: pstFiles.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime()),
        logFiles: logFiles,
        totalFiles: pstFiles.length,
        totalSize: pstFiles.reduce((sum, file) => sum + file.size, 0),
        directory: pstImportsDir
      }
    });
    
  } catch (error) {
    console.error(`❌ Error listando archivos PST locales:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Actualizar emails existentes con cuerpo del mensaje
export const updateEmailBodies = async (req: Request, res: Response) => {
  try {
    const { companySlug } = req.params;
    const { filename, userId } = req.body;

    console.log('🔄 Actualizando cuerpos de emails existentes:', { filename, companySlug, userId });

    const pstImportsPath = path.join(process.cwd(), 'pst-imports');
    const filePath = path.join(pstImportsPath, filename);

    if (!existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'Archivo PST no encontrado'
      });
    }

    // Get the email model
    const connection = await getConnectionByCompanySlug(companySlug);
    const EmailModel = getEmailModel(connection);
    
    // Find ALL emails from PST import that don't have textContent or have empty textContent
    const emailsWithoutBody = await EmailModel.find({
      companySlug,
      importSource: 'pst',
      $or: [
        { textContent: { $in: ['', null] } },
        { htmlContent: { $exists: true, $ne: '' }, textContent: { $in: ['', null] } }
      ]
    }); // Process ALL emails at once

    console.log(`📧 Encontrados ${emailsWithoutBody.length} emails sin cuerpo de texto para actualizar`);

    if (emailsWithoutBody.length === 0) {
      return res.json({
        success: true,
        message: 'Todos los emails ya tienen contenido de texto',
        updated: 0
      });
    }

    // Open PST file
    const pstFile = new PSTFile(filePath);
    const rootFolder = pstFile.getRootFolder();
    
    const startTime = Date.now();
    const counters = { updated: 0, errors: 0, processed: 0 };
    
    console.log(`🚀 Iniciando procesamiento de ${emailsWithoutBody.length} emails...`);
    
    // Create a map of emails to update by messageId for faster lookup
    const emailsMap = new Map();
    emailsWithoutBody.forEach(email => {
      emailsMap.set(email.messageId, email);
    });
    
    // Log progress every 50 processed emails
    const logInterval = 50;
    
    // Process folders to find and update emails
    await updateEmailBodiesInFolder(rootFolder, EmailModel, emailsMap, counters, logInterval);

    const endTime = Date.now();
    const processingTime = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log(`\n✅ ===== PROCESAMIENTO COMPLETADO =====`);
    console.log(`⏱️  Tiempo total: ${processingTime} segundos`);
    console.log(`📊 Emails procesados: ${counters.processed}`);
    console.log(`✅ Emails actualizados: ${counters.updated}`);
    console.log(`❌ Errores encontrados: ${counters.errors}`);
    console.log(`📈 Emails restantes en mapa: ${emailsMap.size}`);
    console.log(`🎯 Tasa de éxito: ${((counters.updated / emailsWithoutBody.length) * 100).toFixed(1)}%`);
    console.log(`=====================================\n`);

    return res.json({
      success: true,
      message: 'Cuerpos de emails actualizados exitosamente con conversión HTML-to-text mejorada',
      result: {
        totalFound: emailsWithoutBody.length,
        processed: counters.processed,
        updated: counters.updated,
        errors: counters.errors,
        processingTimeSeconds: parseFloat(processingTime),
        successRate: `${((counters.updated / emailsWithoutBody.length) * 100).toFixed(1)}%`
      }
    });

  } catch (error) {
    console.error('❌ Error actualizando cuerpos de emails:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Helper function to update email bodies in a folder
const updateEmailBodiesInFolder = async (
  folder: any, 
  EmailModel: any, 
  emailsMap: Map<string, any>, 
  counters: { updated: number, errors: number, processed: number },
  logInterval: number = 50
) => {
  // Create an importer instance to access the htmlToText method
  const importer = new PSTImporter();
  
  // Process emails in this folder
  if (folder.contentCount > 0) {
    let childMessage = folder.getNextChild();
    
    while (childMessage !== null) {
      try {
        counters.processed++;
        
        // Log progress every logInterval emails
        if (counters.processed % logInterval === 0) {
          console.log(`📈 Progreso: ${counters.processed} emails procesados (${counters.updated} actualizados, ${counters.errors} errores)`);
        }
        
        const messageId = childMessage.internetMessageId || `pst_${Date.now()}_${Math.random()}`;
        
        // Check if this email needs updating
        const emailToUpdate = emailsMap.get(messageId);
        if (emailToUpdate) {
          const rawTextContent = importer.getMessageBody(childMessage);
          const rawHtmlContent = importer.getMessageBodyHTML(childMessage);
          
          let finalTextContent = '';
          let finalHtmlContent = '';
          
          if (rawHtmlContent) {
            finalHtmlContent = rawHtmlContent;
            // Use our improved HTML-to-text conversion
            finalTextContent = (importer as any).htmlToText(rawHtmlContent);
          } else if (rawTextContent) {
            finalTextContent = rawTextContent;
            finalHtmlContent = rawTextContent;
          }
          
          if (finalTextContent || finalHtmlContent) {
            // Update the email with processed body content
            await EmailModel.findByIdAndUpdate(emailToUpdate._id, {
              textContent: finalTextContent || '',
              htmlContent: finalHtmlContent || ''
            });
            
            counters.updated++;
            console.log(`✅ Email actualizado [${counters.updated}]: ${(childMessage.subject || 'Sin asunto').substring(0, 50)} (${finalTextContent.length} chars)`);
            
            // Remove from map to avoid processing again
            emailsMap.delete(messageId);
          } else {
            console.log(`⚠️ Email sin contenido: ${(childMessage.subject || 'Sin asunto').substring(0, 50)}`);
          }
        }
        
      } catch (error) {
        counters.errors++;
        console.error(`❌ Error procesando email [${counters.errors}]:`, error.message);
      }
      
      childMessage = folder.getNextChild();
    }
  }
  
  // Process subfolders recursively
  if (folder.hasSubfolders) {
    const childFolders = folder.getSubFolders();
    
    for (const childFolder of childFolders) {
      await updateEmailBodiesInFolder(childFolder, EmailModel, emailsMap, counters, logInterval);
    }
  }
};

// Test endpoint para probar la conversión HTML a texto
export const testHtmlToText = async (req: Request, res: Response) => {
  try {
    const { html } = req.body;
    
    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required'
      });
    }

    const importer = new PSTImporter();
    const textContent = importer.htmlToText(html);

    return res.json({
      success: true,
      original: html,
      converted: textContent,
      originalLength: html.length,
      convertedLength: textContent.length
    });

  } catch (error) {
    console.error('❌ Error testing HTML to text conversion:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Endpoint para re-procesar un archivo PST con la conversión mejorada
export const reprocessPSTWithImprovedConversion = async (req: Request, res: Response) => {
  try {
    const { companySlug } = req.params;
    const { filename, userId, maxEmails } = req.body;

    console.log('🔄 Re-procesando PST con conversión HTML-a-texto mejorada:', { filename, companySlug, userId, maxEmails });

    const pstImportsPath = path.join(process.cwd(), 'pst-imports');
    const filePath = path.join(pstImportsPath, filename);

    if (!existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'Archivo PST no encontrado'
      });
    }

    // Get the email model
    const connection = await getConnectionByCompanySlug(companySlug);
    const EmailModel = getEmailModel(connection);
    
    // Delete existing PST emails to avoid duplicates
    const deleteResult = await EmailModel.deleteMany({
      companySlug,
      importSource: 'pst'
    });
    
    console.log(`🗑️ Eliminados ${deleteResult.deletedCount} emails existentes del PST`);

    // Re-import with improved conversion
    const importer = new PSTImporter();
    const result = await importer.importPSTFile(filePath, companySlug, userId, maxEmails);

    console.log(`✅ Re-procesamiento completado con conversión mejorada`);

    return res.json({
      success: true,
      message: 'PST re-procesado exitosamente con conversión HTML-a-texto mejorada',
      result: {
        ...result,
        deletedOldEmails: deleteResult.deletedCount
      }
    });

  } catch (error) {
    console.error('❌ Error re-procesando PST:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};