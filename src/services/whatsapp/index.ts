import { Client, LocalAuth, RemoteAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { handleIncomingMessage } from './handlers';
import { io } from '../../server'; // Ajusta la ruta según tu estructura
import { Types } from 'mongoose';
import fs from "fs";
import path from "path";
import { getDbConnection } from '../../config/connectionManager';
import { getSessionModel } from '../../models/whatsappSession.model';
import getTableModel from '../../models/table.model';
import getRecordModel from '../../models/record.model';
import { getWhatsappChatModel } from '../../models/whatsappChat.model';

// Objeto global para almacenar clientes por sesión
export const clients: Record<string, Client> = {};

// Objeto global para limitar la generacion de QR
const qrSent: Record<string, boolean> = {};

// Determinar el directorio de autenticación basado en el entorno
const getAuthDir = () => {
  // En local, siempre usar la ruta local
  if (process.env.NODE_ENV === 'development' || !process.env.RENDER) {
    const localPath = path.join(process.cwd(), '.wwebjs_auth');
    console.log(`🏠 Entorno local, usando ruta: ${localPath}`);
    return localPath;
  }
  
  // Solo en Render usar la ruta persistente
  if (process.env.RENDER === 'true') {
    const renderPath = '/opt/render/project/src/.wwebjs_auth';
    console.log(`🔧 Render detectado, usando ruta persistente: ${renderPath}`);
    return renderPath;
  }
  
  // Fallback a local
  const localPath = path.join(process.cwd(), '.wwebjs_auth');
  console.log(`🏠 Fallback a ruta local: ${localPath}`);
  return localPath;
};

export const startWhatsappBot = (sessionName: string, company: string, user_id: Types.ObjectId) => {
  const clientKey = `${company}:${sessionName}`;
  if (clients[clientKey]) {
    console.log(`Cliente WhatsApp para la sesión '${sessionName}' ya existe.`);
    return clients[clientKey];
  }

  const authDir = getAuthDir();
  console.log(`🔐 Iniciando WhatsApp con sesión: ${company}-${sessionName}`);
  console.log(`🔄 TEST PERSISTENCIA - Deploy: ${new Date().toISOString()}`);
  
  // Crear directorio si no existe
  if (!fs.existsSync(authDir)) {
    try {
      fs.mkdirSync(authDir, { recursive: true });
      console.log(`✅ Directorio creado: ${authDir}`);
    } catch (err) {
      console.error(`❌ Error creando directorio: ${err}`);
    }
  }
  
  // Verificar si existe sesión previa
  const sessionPath = path.join(authDir, `session-${company}-${sessionName}`);
  
  if (fs.existsSync(sessionPath)) {
    console.log(`✅ Sesión previa encontrada en: ${sessionPath}`);
  } else {
    console.log(`❌ No se encontró sesión previa en: ${sessionPath}`);
  }

  // Usar LocalAuth con configuración optimizada para Render
  const whatsappClient = new Client({
    authStrategy: new LocalAuth({ 
      clientId: `${company}-${sessionName}`,
      dataPath: authDir
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-field-trial-config',
        '--disable-ipc-flooding-protection',
        '--memory-pressure-off',
        '--max_old_space_size=4096'
      ],
      timeout: 60000,
    },
    webVersion: '2.2402.5',
    webVersionCache: {
      type: 'local'
    }
  });

  clients[clientKey] = whatsappClient;

  async function cleanUpResources(reason: string) {
    console.log(`🧹 Limpiando recursos para ${clientKey} por: ${reason}`);
    if (clients[clientKey]) {
      try {
        await clients[clientKey].destroy();
      } catch (err) {
        console.warn("Error al destruir cliente:", err);
      }
      
      setTimeout(() => {
        try {
          delete clients[clientKey];
          const sessionFolder = path.join(
            process.cwd(),
            ".wwebjs_auth",
            `session-${company}-${sessionName}`
          );
          if (fs.existsSync(sessionFolder)) {
              fs.rmSync(sessionFolder, { recursive: true, force: true });
          }
        } catch (err:any) {
          if (err.code === 'EPERM' || err.code === 'EBUSY') {
            console.warn("No se pudo eliminar la carpeta/archivo de sesión porque está en uso. Se ignorará este error.");
          } else {
            console.error("Error al destruir el cliente:", err);
          }
        }
      }, 5000);
    }
  }

  async function updateSessionStatus(status: string, reason?: string) {
    const conn = await getDbConnection(company);
    const WhatsappSession = getSessionModel(conn);
    const existingSession = await WhatsappSession.findOne({ name: sessionName });
    if (existingSession) {
      existingSession.status = status;
      existingSession.save();
      io.emit(`whatsapp-status-${company}-${user_id}`, { status, session: sessionName, message: reason });
    }
  }

  // Función para validar si el número es de usuario real (no status, no grupo)
  function isValidUserNumber(number: string): boolean {
    return (
      !!number &&
      number.endsWith('@c.us') &&
      !number.startsWith('status@') &&
      !number.includes('broadcast')
    );
  }

  // Extrae solo los dígitos antes de @c.us para el campo number
  function extractNumberFromWhatsAppId(id: string): number | null {
    const match = id.match(/^(\d+)@c\.us$/);
    return match ? Number(match[1]) : null;
  }

  // Función para guardar prospecto si no existe
  async function saveProspectIfNotExists(company: string, number: string, name?: string, activateIA?: boolean) {
    try {
      if (!isValidUserNumber(number)) {
        return;
      }
      const num = extractNumberFromWhatsAppId(number);
      if (!num) {
        return;
      }
      const conn = await getDbConnection(company);
      const Table = getTableModel(conn);
      const Record = getRecordModel(conn);

      const table = await Table.findOne({ slug: 'prospectos', c_name: company, isActive: true });
      if (!table) {
        return;
      }

      const existing = await Record.findOne({ tableSlug: 'prospectos', c_name: company, 'data.number': num });
      if (existing) {
        return;
      }

      const newProspect = new Record({
        tableSlug: 'prospectos',
        c_name: company,
        createdBy: 'whatsapp-bot',
        data: {
          name: name || '',
          number: num,
          ia: activateIA === true // Si se pasa activateIA true, se activa la IA
        }
      });
      await newProspect.save();
      console.log(`✅ Prospecto guardado: ${num}`);
    } catch (err) {
      console.error('Error guardando prospecto:', err);
    }
  }

  return new Promise<Client>((resolve, reject) => {
    whatsappClient.on('qr', async (qr) => {
      if (qrSent[clientKey]) {
        delete qrSent[clientKey];
        await cleanUpResources('User didnt scan QR');
        await updateSessionStatus('disconnected', 'User didnt scan QR');
        reject(console.error(`User didnt scan QR for ${clientKey}`));
        return;
      }
      qrSent[clientKey] = true;
      console.log(`[QR][${sessionName}] Escanea este QR con WhatsApp:`);
      qrcode.generate(qr, { small: true });
      if (io) {
        console.log('Emitiendo QR a:', `whatsapp-qr-${company}-${user_id}`);
        io.emit(`whatsapp-qr-${company}-${user_id}`, qr);
        // Emitir estado de QR mostrado (sin loading)
        io.emit(`whatsapp-status-${company}-${user_id}`, { 
          status: 'qr_ready', 
          session: sessionName, 
          message: 'Escanea el código QR con WhatsApp' 
        });
      }
    });

    // Evento cuando el usuario escanea el QR
    whatsappClient.on('loading_screen', async (percent, message) => {
      if (io) {
        io.emit(`whatsapp-status-${company}-${user_id}`, { 
          status: 'qr_scanned', 
          session: sessionName, 
          message: `Cargando WhatsApp... ${percent}%`,
          loadingPercent: percent
        });
      }
    });

    // Evento cuando la autenticación está en progreso
    whatsappClient.on('authenticated', async () => {
      console.log(`🔓 WhatsApp autenticado exitosamente para: ${company}-${sessionName}`);
      
      if (io) {
        io.emit(`whatsapp-status-${company}-${user_id}`, { 
          status: 'authenticated', 
          session: sessionName, 
          message: 'Inicializando sesión...'
        });
      }
    });

    whatsappClient.on('ready', async () => {
      console.log(`🚀 WhatsApp listo y conectado para: ${company}-${sessionName}`);
      
      // Verificar si la sesión se guardó después de estar listo
      setTimeout(() => {
        const sessionPath = path.join(authDir, `session-${company}-${sessionName}`);
        if (fs.existsSync(sessionPath)) {
          console.log(`✅ Sesión guardada exitosamente en: ${sessionPath}`);
          // Listar archivos de la sesión
          try {
            const files = fs.readdirSync(sessionPath);
            console.log(`📁 Archivos de sesión:`, files);
          } catch (err) {
            console.log(`❌ Error leyendo archivos de sesión:`, err);
          }
        } else {
          console.log(`❌ Sesión NO se guardó en: ${sessionPath}`);
        }
      }, 5000);
      
      const chats = await whatsappClient.getChats();

      const fetchLimit = 50;
      const conn = await getDbConnection(company);
      const WhatsappChat = getWhatsappChatModel(conn);

      const saveMessagesToRecord = (record: any, messages: any[]) => {
        for (const msg of messages) {
          try {
            // Validar que el mensaje tenga las propiedades necesarias
            if (!msg || !msg.id || !msg.id.id) {
              console.warn('Mensaje inválido encontrado, saltando...');
              continue;
            }

            const alreadyExists = record.messages.some((m: any) => m.msgId === msg.id.id);
            if (alreadyExists) continue;

            record.messages.push({
              msgId: msg.id.id,
              direction: msg.fromMe ? "outbound" : "inbound",
              body: msg.body || '',
              respondedBy: msg.fromMe ? "human" : "user",
              createdAt: msg.timestamp ? new Date(msg.timestamp * 1000) : new Date(),
            });
          } catch (msgError) {
            console.warn('Error procesando mensaje individual:', msgError);
            continue;
          }
        }

        try {
          record.messages.sort(
            (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        } catch (sortError) {
          console.warn('Error ordenando mensajes:', sortError);
        }
      };

      (async () => {
        try {
          for (const chat of chats) {
            if (chat.isGroup || !chat.id._serialized.endsWith('@c.us')) continue;

            let chatRecord = await WhatsappChat.findOne({ phone: chat.id._serialized });
            
            // Manejo seguro de fetchMessages con retry
            let messages = [];
            try {
              messages = await chat.fetchMessages({ limit: fetchLimit });
            } catch (fetchError) {
              console.warn(`Error fetching messages for ${chat.id._serialized}:`, fetchError);
              // Continuar con el siguiente chat si hay error
              continue;
            }

            if (!chatRecord) {
              chatRecord = new WhatsappChat({
                tableSlug: "clientes",
                phone: chat.id._serialized,
                name: chat.name || chat.id._serialized,
                messages: [],
              });
            }

            try {
              saveMessagesToRecord(chatRecord, messages);
              await chatRecord.save();
            } catch (saveError) {
              console.error(`Error saving chat record for ${chat.id._serialized}:`, saveError);
              continue;
            }

            // NO await: Guardar prospecto si no existe
            saveProspectIfNotExists(company, chat.id._serialized, chat.name);
          }
        } catch (err) {
          console.error('Error guardando chats masivamente:', err);
        } 
      })(); // Lanzar en background

      // Notificar que la sesión está completamente lista DESPUÉS de guardar todo
      if (io) {
        io.emit(`whatsapp-status-${company}-${user_id}`, {
          status: 'ready',
          session: sessionName,
          message: 'WhatsApp conectado y listo para usar',
        });
      }

      console.log(`✅ Sesión ${clientKey} inicializada y chats guardados`);

      resolve(whatsappClient);

      setTimeout(async () => {
        await updateSessionStatus('connected');
      }, 2000);

      delete qrSent[clientKey];
    });


    whatsappClient.on('auth_failure', async (msg) => {
      console.log(`❌ Fallo de autenticación en la sesión ${company}:${sessionName} :`, msg);
      delete qrSent[clientKey];
      await cleanUpResources('auth_failure');
      setTimeout(async () => {
        await updateSessionStatus('error', 'Auth Failure');
      }, 2000);
      reject(console.error('Auth failure'));
    });

    whatsappClient.on('disconnected', async (reason) => {
      console.log(`❌ Sesión ${company}:${sessionName} desconectada :`, reason);
      whatsappClient.initialize();
      delete qrSent[clientKey];
      await cleanUpResources('disconnected');
      setTimeout(async () => {
        await updateSessionStatus('disconnected', reason);
      }, 2000);
      reject(console.error('Disconnected'));
    });

    whatsappClient.on('message_create', async (message) => {
      try {
        // Log de todos los mensajes recibidos
        console.log(`MENSAJE ${message.fromMe ? 'ENVIADO' : 'RECIBIDO'}:`, message.from, message.body);

        // Validar que el mensaje sea válido
        if (!message || !message.from) {
          console.warn('Mensaje inválido recibido, saltando...');
          return;
        }
        
        // Guardar prospecto si no existe (solo chats individuales)
        const number = message.from;
        try {
          await saveProspectIfNotExists(company, number, (message as any).notifyName || number, true); // activa IA
        } catch (prospectError) {
          console.warn('Error guardando prospecto:', prospectError);
        }

        // Lógica de producción: solo responde la IA (handleIncomingMessage) y guarda la respuesta en WhatsappChat
        try {
          await handleIncomingMessage(message, whatsappClient, company, sessionName);
        } catch (handlerError) {
          console.error('Error en handleIncomingMessage:', handlerError);
        }
      } catch (error) {
        console.error('Error general en evento message:', error);
      }
    });

    whatsappClient.initialize();
  });
};
