import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import { getEmailConfigInternal } from '../core/users/user.controller';

// Types
export interface ProcessedEmail {
  uid: number;
  messageId?: string;
  subject: string;
  from: string;
  to: string;
  cc?: string;
  bcc?: string;
  date: Date;
  body: string;
  text?: string;
  html?: string;
  direction: 'incoming' | 'outgoing';
  source?: string;
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  content?: Buffer;
  path?: string;
}

export interface EmailConfig {
  imapConfig: {
    user: string;
    password: string;
    host: string;
    port: number;
    secure: boolean;
  };
  smtpConfig?: {
    user: string;
    password: string;
    host: string;
    port: number;
    secure: boolean;
  };
}

export class EmailReaderService {
  private imap: Imap | null = null;
  private isConnected = false;
  private config: EmailConfig;

  constructor(config: EmailConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnected && this.imap) {
        resolve();
        return;
      }

      console.log(`🔌 Conectando IMAP a ${this.config.imapConfig.host}:${this.config.imapConfig.port}`);
      console.log(`👤 Usuario: ${this.config.imapConfig.user}`);
      console.log(`🔒 Secure: ${this.config.imapConfig.secure}`);

      // Configuración específica para Office 365
      const isOffice365 = this.config.imapConfig.host.includes('outlook.com') || 
                         this.config.imapConfig.host.includes('office365');

      const imapConfig: Imap.Config = {
        user: this.config.imapConfig.user,
        password: this.config.imapConfig.password,
        host: this.config.imapConfig.host,
        port: this.config.imapConfig.port,
        tls: this.config.imapConfig.secure,
        authTimeout: 60000,  // Aumentamos timeout para Office 365
        connTimeout: 60000,  // Aumentamos timeout para Office 365
        tlsOptions: {
          rejectUnauthorized: false,
          servername: this.config.imapConfig.host,
          // Configuraciones adicionales para Office 365
          ...(isOffice365 && {
            ciphers: 'ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE+CHACHA20:!aNULL:!MD5:!DSS',
            secureProtocol: 'TLSv1_2_method'
          })
        },
        // Configuraciones adicionales para Office 365
        ...(isOffice365 && {
          keepalive: true,
          debug: console.log  // Solo para debugging
        })
      };

      console.log(`🔧 Configuración IMAP:`, {
        host: imapConfig.host,
        port: imapConfig.port,
        user: imapConfig.user,
        tls: imapConfig.tls,
        isOffice365
      });

      this.imap = new Imap(imapConfig);

      this.imap.once('ready', () => {
        console.log('✅ IMAP connected successfully');
        this.isConnected = true;
        resolve();
      });

      this.imap.once('error', (err: Error) => {
        console.error('❌ IMAP connection error details:', {
          message: err.message,
          stack: err.stack,
          host: this.config.imapConfig.host,
          port: this.config.imapConfig.port,
          user: this.config.imapConfig.user
        });
        
        // Mensajes de error más específicos para Office 365
        let errorMessage = `IMAP connection failed: ${err.message}`;
        
        if (err.message.includes('Invalid credentials') || err.message.includes('authentication failed')) {
          errorMessage = `Credenciales IMAP inválidas para ${this.config.imapConfig.user}. Verifica que la contraseña sea correcta y que IMAP esté habilitado en Office 365.`;
        } else if (err.message.includes('ENOTFOUND') || err.message.includes('getaddrinfo')) {
          errorMessage = `No se pudo resolver el host IMAP ${this.config.imapConfig.host}. Verifica la configuración del servidor.`;
        } else if (err.message.includes('ECONNREFUSED') || err.message.includes('connect ECONNREFUSED')) {
          errorMessage = `Conexión rechazada al servidor IMAP ${this.config.imapConfig.host}:${this.config.imapConfig.port}. Verifica que el puerto sea correcto.`;
        } else if (err.message.includes('timeout')) {
          errorMessage = `Timeout de conexión IMAP. El servidor ${this.config.imapConfig.host} no responde.`;
        }
        
        this.isConnected = false;
        reject(new Error(errorMessage));
      });

      this.imap.once('end', () => {
        this.isConnected = false;
      });

      try {
        this.imap.connect();
      } catch (error) {
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.imap && this.isConnected) {
      return new Promise((resolve) => {
        this.imap!.once('end', () => {
          this.isConnected = false;
          resolve();
        });
        this.imap!.end();
      });
    }
  }

  getStatus() {
    return {
      connected: this.isConnected,
      config: {
        host: this.config.imapConfig.host,
        user: this.config.imapConfig.user
      }
    };
  }

  async getHistoricalEmailsSimple(days: number = 7): Promise<{ 
    inbox: ProcessedEmail[]; 
    sent: ProcessedEmail[] 
  }> {
    if (!this.imap || !this.isConnected) {
      throw new Error('IMAP no está conectado');
    }

    console.log(`📥 Obteniendo emails de los últimos ${days} días...`);
    
    const inboxEmails: ProcessedEmail[] = [];
    const sentEmails: ProcessedEmail[] = [];

    try {
      // Obtener emails del INBOX
      console.log(`📥 Procesando carpeta INBOX...`);
      const inboxResults = await this.getEmailsFromFolder('INBOX', days);
      inboxEmails.push(...inboxResults);

      // Intentar obtener emails enviados de todas las carpetas posibles
      const sentFolders = [
        '[Gmail]/Sent Mail',  // Gmail en inglés
        '[Gmail]/Enviados',   // Gmail en español
        'Sent',               // Carpeta estándar
        'Enviados',           // Carpeta estándar en español
        'Sent Items',         // Outlook/Exchange
        'Elementos enviados', // Outlook en español
        'Outbox'              // Bandeja de salida
      ];
      
      let processedSentFolders = 0;
      
      for (const folder of sentFolders) {
        try {
          console.log(`📤 Procesando carpeta de enviados: ${folder}...`);
          const sentResults = await this.getEmailsFromFolder(folder, days);
          
          if (sentResults.length > 0) {
            sentEmails.push(...sentResults);
            processedSentFolders++;
            console.log(`✅ Carpeta ${folder}: ${sentResults.length} emails encontrados`);
          } else {
            console.log(`📭 Carpeta ${folder}: Sin emails en el período especificado`);
          }
        } catch (error) {
          console.log(`⚠️ No se pudo acceder a la carpeta ${folder}: ${error.message}`);
        }
      }

      // Remover duplicados basados en messageId
      const uniqueSentEmails = this.removeDuplicateEmails(sentEmails);
      
      console.log(`✅ Procesamiento completado:`);
      console.log(`   📥 INBOX: ${inboxEmails.length} emails`);
      console.log(`   📤 ENVIADOS: ${uniqueSentEmails.length} emails únicos de ${processedSentFolders} carpetas`);
      
      return { inbox: inboxEmails, sent: uniqueSentEmails };

    } catch (error) {
      console.error('❌ Error obteniendo emails:', error);
      throw error;
    }
  }

  private removeDuplicateEmails(emails: ProcessedEmail[]): ProcessedEmail[] {
    const seen = new Set<string>();
    return emails.filter(email => {
      // Usar messageId como clave única, o uid + source si no hay messageId
      const key = email.messageId || `${email.uid}-${email.source}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private async getEmailsFromFolder(folderName: string, days: number): Promise<ProcessedEmail[]> {
    return new Promise((resolve, reject) => {
      this.imap!.openBox(folderName, true, (err, box) => {
        if (err) {
          reject(new Error(`No se pudo abrir la carpeta ${folderName}: ${err.message}`));
          return;
        }

        console.log(`📂 Carpeta ${folderName} abierta. Total de mensajes: ${box.messages.total}`);

        if (box.messages.total === 0) {
          resolve([]);
          return;
        }

        console.log(`🔍 Buscando emails en ${folderName} (limitando a los últimos mensajes)...`);

        // Por ahora, obtener todos los emails (limitaremos después)
        // Evitamos el filtro SINCE que está causando problemas
        this.imap!.search(['ALL'], (err, results) => {
          if (err) {
            reject(new Error(`Error buscando emails en ${folderName}: ${err.message}`));
            return;
          }

          if (!results || results.length === 0) {
            console.log(`📭 No se encontraron emails en ${folderName}`);
            resolve([]);
            return;
          }

          console.log(`🔍 Encontrados ${results.length} emails totales en ${folderName}, procesando los últimos 50...`);

          const emails: ProcessedEmail[] = [];
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - days);
          
          const fetch = this.imap!.fetch(results.slice(-50), { // Limitar a los últimos 50
            bodies: 'HEADER.FIELDS (FROM TO CC BCC SUBJECT DATE MESSAGE-ID)',
            struct: true
          });

          fetch.on('message', (msg, seqno) => {
            let headers: any = {};
            let uid = 0;

            msg.on('body', (stream, info) => {
              let buffer = '';
              stream.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
              });
              stream.once('end', () => {
                headers = Imap.parseHeader(buffer);
              });
            });

            msg.once('attributes', (attrs) => {
              uid = attrs.uid;
            });

            msg.once('end', () => {
              try {
                const emailDate = headers.date ? new Date(headers.date[0]) : new Date();
                
                // Filtrar por fecha después de obtener los headers
                if (emailDate >= cutoffDate) {
                  const email: ProcessedEmail = {
                    uid: uid,
                    messageId: headers['message-id'] ? headers['message-id'][0] : `${uid}-${folderName}`,
                    subject: headers.subject ? headers.subject[0] : 'Sin asunto',
                    from: headers.from ? headers.from[0] : '',
                    to: headers.to ? headers.to[0] : '',
                    cc: headers.cc ? headers.cc.join(', ') : '',
                    bcc: headers.bcc ? headers.bcc.join(', ') : '',
                    date: emailDate,
                    body: '', // Por ahora no obtenemos el cuerpo completo para mayor velocidad
                    direction: folderName === 'INBOX' ? 'incoming' : 'outgoing',
                    source: folderName
                  };

                  emails.push(email);
                }
              } catch (error) {
                console.error(`❌ Error procesando email ${uid}:`, error);
              }
            });
          });

          fetch.once('error', (err) => {
            reject(new Error(`Error fetching emails from ${folderName}: ${err.message}`));
          });

          fetch.once('end', () => {
            console.log(`✅ Procesados ${emails.length} emails válidos de ${folderName} (${days} días hacia atrás)`);
            resolve(emails);
          });
        });
      });
    });
  }

  async getHistoricalEmails(days: number = 7): Promise<ProcessedEmail[]> {
    const result = await this.getHistoricalEmailsSimple(days);
    return [...result.inbox, ...result.sent];
  }
}

export class EmailReaderManager {
  private static instance: EmailReaderManager;
  private readers: Map<string, EmailReaderService> = new Map();

  private constructor() {}

  static getInstance(): EmailReaderManager {
    if (!EmailReaderManager.instance) {
      EmailReaderManager.instance = new EmailReaderManager();
    }
    return EmailReaderManager.instance;
  }

  async createReader(companySlug: string, userId: string): Promise<EmailReaderService | null> {
    try {
      const emailConfig = await getEmailConfigInternal(companySlug, userId);
      if (!emailConfig) {
        console.error(`❌ No email config found for ${companySlug}_${userId}`);
        return null;
      }

      const config: EmailConfig = {
        imapConfig: {
          user: emailConfig.imapConfig.user,
          password: emailConfig.imapConfig.pass,
          host: emailConfig.imapConfig.host,
          port: emailConfig.imapConfig.port,
          secure: emailConfig.imapConfig.secure
        }
      };

      console.log(`🔧 Creando reader IMAP para ${emailConfig.imapConfig.user} con proveedor ${emailConfig.provider || 'gmail'}`);
      console.log(`📧 IMAP Config: ${emailConfig.imapConfig.host}:${emailConfig.imapConfig.port} (secure: ${emailConfig.imapConfig.secure})`);

      const reader = new EmailReaderService(config);
      
      // Conectar automáticamente
      await reader.connect();
      
      const key = `${companySlug}_${userId}`;
      this.readers.set(key, reader);
      
      console.log(`✅ Email reader creado y conectado para ${key}`);
      return reader;
      
    } catch (error) {
      console.error(`❌ Error creating email reader:`, error);
      return null;
    }
  }

  getReader(companySlug: string, userId: string): EmailReaderService | null {
    const key = `${companySlug}_${userId}`;
    return this.readers.get(key) || null;
  }

  async getOrCreateReader(companySlug: string, userId: string): Promise<EmailReaderService | null> {
    let reader = this.getReader(companySlug, userId);
    if (!reader) {
      reader = await this.createReader(companySlug, userId);
    }
    return reader;
  }

  async startMonitoring(companySlug: string, userId: string): Promise<boolean> {
    try {
      let reader = this.getReader(companySlug, userId);
      if (!reader) {
        reader = await this.createReader(companySlug, userId);
        if (!reader) return false;
      }
      await reader.connect();
      return true;
    } catch (error) {
      console.error(`❌ Error starting monitoring:`, error);
      return false;
    }
  }

  async stopMonitoring(companySlug: string, userId: string): Promise<void> {
    const reader = this.getReader(companySlug, userId);
    if (reader) {
      await reader.disconnect();
    }
  }

  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.readers.values()).map(reader => 
      reader.disconnect()
    );
    await Promise.all(disconnectPromises);
    this.readers.clear();
  }

  async disconnectReader(companySlug: string, userId: string): Promise<void> {
    const reader = this.getReader(companySlug, userId);
    if (reader) {
      await reader.disconnect();
    }
  }

  getAllReaders(): Map<string, EmailReaderService> {
    return this.readers;
  }

  async stopAllMonitoring(): Promise<void> {
    return this.disconnectAll();
  }

  async processFullSync(companySlug: string, userId: string, options: {
    months?: number;
    mailboxes?: string[];
    background?: boolean;
  } = {}): Promise<{ 
    inbox: ProcessedEmail[]; 
    sent: ProcessedEmail[] 
  }> {
    try {
      let reader = this.getReader(companySlug, userId);
      if (!reader) {
        reader = await this.createReader(companySlug, userId);
        if (!reader) {
          throw new Error('Could not create email reader');
        }
      }

      // Asegurar que esté conectado
      if (!reader.getStatus().connected) {
        await reader.connect();
      }
      
      const days = (options.months || 6) * 30;
      const result = await reader.getHistoricalEmailsSimple(days);
      
      return result;
    } catch (error) {
      console.error(`❌ Error in full sync:`, error);
      throw error;
    }
  }
}

export const emailReaderManager = EmailReaderManager.getInstance();
