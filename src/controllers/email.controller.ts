   import nodemailer from 'nodemailer';
   import { Request, Response } from 'express';
   import getEmailModel from '../models/email.model';
   import { getConnectionByCompanySlug } from '../config/connectionManager';

   const transporter = nodemailer.createTransport({
     host: 'smtp.gmail.com',
     port: 587,
     secure: false, // true for 465, false for other ports
     auth: {
       user: process.env.EMAIL_ADDRESS,
       pass: process.env.EMAIL_PASSWORD
     }
   });

      export async function sendEmail(req: Request, res: Response): Promise<void> {
     try {
       const { c_name } = req.params;
       const { to, subject, text, html } = req.body;

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

       // Preparar datos del email
       const emailData = {
         from: process.env.EMAIL_ADDRESS,
         to: to,
         subject: subject,
         text: text,
         html: html
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
           html: emailData.html || ''
         });

         await newEmail.save();
         console.log('✅ Email saved to database successfully');

         res.status(200).json({
           success: true,
           messageId: info.messageId,
           savedToDb: true,
           emailId: newEmail._id
         });

       } catch (dbError) {
         console.error('⚠️ Email sent but failed to save to database:', dbError);
         res.status(200).json({
           success: true,
           messageId: info.messageId,
           savedToDb: false,
           dbError: dbError.message
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

   // Función genérica para enviar y guardar emails
   export async function sendAndSaveEmail(
     to: string,
     subject: string,
     text: string,
     html?: string,
     companySlug: string = 'default'
   ) {
     try {
       // Preparar datos del email
       const emailData = {
         from: process.env.EMAIL_ADDRESS,
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
           html: emailData.html || ''
         });

         await newEmail.save();
         console.log('✅ Email saved to database successfully');

         return {
           success: true,
           messageId: info.messageId,
           savedToDb: true,
           emailId: newEmail._id
         };

       } catch (dbError) {
         console.error('⚠️ Email sent but failed to save to database:', dbError);
         return {
           success: true,
           messageId: info.messageId,
           savedToDb: false,
           dbError: dbError.message
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