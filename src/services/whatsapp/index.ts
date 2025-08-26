import { Client, LocalAuth, Message, RemoteAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { handleIncomingMessage } from './handlers';
import { io } from '../../server'; // Ajusta la ruta según tu estructura
import { Types } from 'mongoose';
import fs from "fs";
import path from "path";
import { getDbConnection } from '../../config/connectionManager';
import { getSessionModel } from '../../models/session.model';
import getTableModel from '../../models/table.model';
import getRecordModel from '../../models/record.model';
import { getWhatsappChatModel } from '../../models/whatsappChat.model';
import getUserModel from '../../core/users/user.model';

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
  
  // En Render usar la ruta persistente real: /var/data
  if (process.env.RENDER === 'true') {
    const renderPath = '/var/data/.wwebjs_auth';
    console.log(`🔧 Render detectado, usando ruta persistente REAL: ${renderPath}`);
    return renderPath;
  }
  
  // Fallback a local
  const localPath = path.join(process.cwd(), '.wwebjs_auth');
  console.log(`🏠 Fallback a ruta local: ${localPath}`);
  return localPath;
};

export const startWhatsappBot = (sessionName: string, company: string, user_id: Types.ObjectId): Promise<Client> => {
  const clientKey = `${company}:${sessionName}`;
  if (clients[clientKey]) {
    console.log(`Cliente WhatsApp para la sesión '${sessionName}' ya existe.`);
    return Promise.resolve(clients[clientKey]);
  }

  const authDir = getAuthDir();
  // console.log(`🔐 Iniciando WhatsApp con sesión: ${clientId}`);
  
  // Crear directorio si no existe
  if (!fs.existsSync(authDir)) {
    try {
      fs.mkdirSync(authDir, { recursive: true });
      console.log(`✅ Directorio creado: ${authDir}`);
    } catch (err) {
      console.error(`❌ Error creando directorio: ${err}`);
    }
  }


  // Sanitizar clientId para que solo contenga caracteres válidos
  const sanitizeForClientId = (str: string): string => {
    return str.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  };
  
  const sanitizedCompany = sanitizeForClientId(company);
  const sanitizedSessionName = sanitizeForClientId(sessionName);
  const clientId = `${sanitizedCompany}_${sanitizedSessionName}`;

  // Usar LocalAuth con configuración optimizada para Render
  const whatsappClient = new Client({
    authStrategy: new LocalAuth({ 
      clientId: clientId,
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

  return new Promise<Client>((resolve, reject) => {

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
              `session-${clientId}`
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

    // Enum para identificar el origen de la creación del prospecto
    enum ProspectCreationSource {
      BULK_IMPORT = 'bulk_import',
      REAL_TIME_MESSAGE = 'real_time_message'
    }

    // Función centralizada para manejar la creación/actualización de prospectos
    async function upsertProspect(params: {
      company: string;
      number: string;
      lastMessageData: { lastMessage: string, lastMessageDate: Date };
      name?: string;
      activateIA?: boolean;
      source: ProspectCreationSource;
    }) {
      const { company, number, lastMessageData, name, activateIA, source } = params;
      
      try {
        if (!isValidUserNumber(number)) {
          console.log(`⚠️ Número inválido ignorado: ${number}`);
          return null;
        }
        
        const num = extractNumberFromWhatsAppId(number);
        if (!num) {
          console.log(`⚠️ No se pudo extraer número de: ${number}`);
          return null;
        }

        const conn = await getDbConnection(company);
        const Table = getTableModel(conn);
        const Record = getRecordModel(conn);
        const User = getUserModel(conn);

        // Asegurar que existe la tabla de prospectos
        let table = await Table.findOne({ slug: 'prospectos', c_name: company, isActive: true });
        if (!table) {
          table = new Table({
            name: "Prospectos",
            slug: "prospectos",
            icon: "👤",
            c_name: company,
            createdBy: 'whatsapp-bot',
            fields: [
              { name: "name", label: "Nombre", type: "text", order: 1 },
              { name: "number", label: "Número", type: "number", order: 2 },
              { name: "ia", label: "IA", type: "boolean", order: 3 },
              { name: "asesor", label: "Asesor", type: "object", required: false, options: [], order: 4 },
              { name: "lastmessage", label: "Ultimo Mensaje", type: "text", required: false, options: [], order: 5 },
              { name: "lastmessagedate", label: "Fecha Ultimo Mensaje", type: "date", required: false, options: [], order: 6 }
            ]
          });
          await table.save();
          console.log(`✅ Tabla 'prospectos' creada para ${company}`);
        }

        const userData = await User.findOne({ _id: user_id });

        let auditContext = {
          skipAudit: true,
        };

        // Determinar el nombre más apropiado
        const prospectName = name && name !== number && !name.includes('@c.us') ? name : '';
        
        // Configuración específica por fuente
        const sourceConfig = {
          [ProspectCreationSource.BULK_IMPORT]: {
            priority: 1,
            defaultIA: false,
            logPrefix: '📦 BULK'
          },
          [ProspectCreationSource.REAL_TIME_MESSAGE]: {
            priority: 2,
            defaultIA: true,
            logPrefix: '⚡ REALTIME'
          }
        };

        const config = sourceConfig[source];

        // Upsert con lógica inteligente de prioridad
        const result = await Record.findOneAndUpdate(
          { 
            tableSlug: 'prospectos', 
            c_name: company, 
            'data.number': num 
          },
          {
            $setOnInsert: {
              tableSlug: 'prospectos',
              c_name: company,
              createdBy: 'whatsapp-bot',
              'data.number': num,
              'data.name': prospectName,
              'data.ia': activateIA ?? config.defaultIA,
              'data.asesor.id': user_id,
              'data.asesor.name': userData?.name,
              'data._source': source,
              'data._priority': config.priority,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            $set: {
              'data.lastmessage': lastMessageData?.lastMessage || '',
              'data.lastmessagedate': lastMessageData?.lastMessageDate || new Date(),
            },
            // Solo actualizar nombre si el nuevo es mejor (no vacío y actual está vacío o es el número)
            ...(prospectName && {
              $setOnInsert: {
                'data.name': prospectName
              }
            })
          },
          { 
            upsert: true, 
            new: true, 
            timestamps: { updatedAt: false }, 
            context: 'query',
            setDefaultsOnInsert: true
          } as any
        ).setOptions({ auditContext, $locals: { auditContext } } as any);

        if (result) {
          // Verificar si necesitamos actualizar el nombre (convertir a documento para acceder a las propiedades)
          const doc = result as any;
          if (prospectName && 
              (!doc.data?.name || doc.data.name === number || doc.data.name.includes('@c.us'))) {

            let auditContext = {
              _updatedByUser: { id: 'Bot', name: `whatsapp-bot-${source}` },
              _updatedBy: `whatsapp-bot-${source}`,
              _auditSource: 'Whatsapp Start',
            };

            await Record.findOneAndUpdate(
              { _id: doc._id },
              { 
                $set: { 
                  'data.name': prospectName,
                  updatedBy: `whatsapp-bot-${source}`
                }
              },
              { context: 'query', timestamps: { updatedAt: false } }
            ).setOptions({ auditContext, $locals: { auditContext } } as any);
            
            console.log(`${config.logPrefix} ✨ Nombre actualizado para ${num}: "${prospectName}"`);
          }
          return result;
        } else {
          console.log(`${config.logPrefix} 🆕 Prospecto creado: ${num} - ${prospectName || 'Sin nombre'}`);
          return null; // Nuevo registro creado
        }
        
      } catch (err) {
        console.error(`❌ Error procesando prospecto desde ${source}:`, err);
        return null;
      }
    }

    whatsappClient.on('qr', async (qr) => {
      if (qrSent[clientKey]) {
        delete qrSent[clientKey];
        await cleanUpResources('User didnt scan QR');
        await updateSessionStatus('disconnected', 'User didnt scan QR');
        reject(console.error(`User didnt scan QR for ${clientKey}`));
        return;
      }
      qrSent[clientKey] = true;
      // console.log(`[QR][${sessionName}] Escanea este QR con WhatsApp:`);
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
      console.log(`🔓 WhatsApp autenticado exitosamente para: ${clientId}`);
      
      if (io) {
        io.emit(`whatsapp-status-${company}-${user_id}`, { 
          status: 'authenticated', 
          session: sessionName, 
          message: 'Inicializando sesión...'
        });
      }
    });

    whatsappClient.on('ready', async () => {
      console.log(`🚀 WhatsApp listo y conectado para: ${clientId}`);

      resolve(whatsappClient);
      
      const chats = await whatsappClient.getChats();

      const fetchLimit = 50;
      const conn = await getDbConnection(company);
      const WhatsappChat = getWhatsappChatModel(conn);
      const WhatsappSession = getSessionModel(conn);
      const existingSessionDoc = await WhatsappSession.findOne({ name: sessionName });

      const saveMessagesToRecord = (record: any, messages: Message[]) => {
        // Encuentra el índice del último mensaje enviado por mí (outbound)
        const lastOutboundIdx = [...messages].reverse().findIndex(msg => msg.fromMe);
        const lastOutboundAbsIdx = lastOutboundIdx === -1 ? -1 : messages.length - 1 - lastOutboundIdx;

        if (!messages || messages.length === 0) return;
        const existingIds = new Set<string>((record.messages || []).map((m: any) => m.msgId));
        let appended = false;
        for (let idx = 0; idx < messages.length; idx++) {
          const msg = messages[idx];
          try {
            if (!msg || !msg.id || !msg.id.id) continue;
            if (existingIds.has(msg.id.id)) continue;

            let status: 'enviado' | 'recibido' | 'leído';
            if (msg.fromMe) {
              // Mensaje enviado por mí
              status = msg.ack === 3 ? 'leído' : 'enviado';
            } else {
              // Mensaje recibido
              status = (lastOutboundAbsIdx !== -1 && idx < lastOutboundAbsIdx) ? 'leído' : 'recibido';
            }

            record.messages.push({
              msgId: msg.id.id,
              body: msg.body || '',
              createdAt: msg.timestamp ? new Date(msg.timestamp * 1000) : new Date(),
              direction: msg.fromMe ? 'outbound' : 'inbound',
              respondedBy: msg.fromMe ? 'human' : 'user',
              status
            });
            appended = true;
          } catch (pushErr) {
            console.warn('No se pudo procesar un mensaje, se continúa...', pushErr);
          }
        }
        if (appended) {
          const ts = (d: any) => d instanceof Date ? d.getTime() : (d ? new Date(d).getTime() : 0);
          record.messages.sort((a: any, b: any) => ts(a.createdAt) - ts(b.createdAt));
        }
      };

      // Importación en background
      (async () => {
        try {
          for (const chat of chats) {
            if (chat.isGroup || !chat.id._serialized.endsWith('@c.us')) continue;

            // Upsert atómico del chat (filtro estricto para evitar carreras)
            let chatRecord = await WhatsappChat.findOneAndUpdate(
              { phone: chat.id._serialized, "session.name": sessionName },
              {
                $setOnInsert: {
                  tableSlug: "prospectos",
                  phone: chat.id._serialized,
                  messages: []
                },
                $set: {
                  ...(chat.name ? { name: chat.name } : {}),
                  ...(existingSessionDoc?._id ? { "session.id": existingSessionDoc._id } : {}),
                  "session.name": sessionName,
                  ...(existingSessionDoc as any)?.user?.id ? { "advisor.id": (existingSessionDoc as any).user.id } : {},
                  ...(existingSessionDoc as any)?.user?.name ? { "advisor.name": (existingSessionDoc as any).user.name } : {},
                } as any
              },
              { upsert: true, new: true }
            );

            // Obtener mensajes recientes del chat
            let messages: Message[] = [];
            try {
              messages = await chat.fetchMessages({ limit: fetchLimit });
            } catch (fetchError) {
              console.warn(`Error fetching messages for ${chat.id._serialized}:`, fetchError);
              continue;
            }

            try {
              saveMessagesToRecord(chatRecord, messages);
              await chatRecord.save();
            } catch (saveError) {
              console.error(`Error saving chat record for ${chat.id._serialized}:`, saveError);
              continue;
            }

            // Guardar prospecto si no existe usando el último mensaje persistido
            const lastMsg = chatRecord?.messages && chatRecord.messages.length > 0
              ? chatRecord.messages[chatRecord.messages.length - 1]
              : null;
            if (!lastMsg) continue;
            
            await upsertProspect({
              company,
              number: chat.id._serialized,
              lastMessageData: {
                lastMessage: lastMsg.body || '',
                lastMessageDate: lastMsg.createdAt || new Date()
              },
              name: chat.name,
              activateIA: false, // No activar IA en bulk import
              source: ProspectCreationSource.BULK_IMPORT
            });
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

    whatsappClient.on('message_ack', async (msg, ack) => {
      try {
        // 0 = pendiente, 1 = enviado, 2 = entregado, 3 = leído, 4 = reproducido (audio)
        if (ack === 3) {
          const conn = await getDbConnection(company);
          const WhatsappChat = getWhatsappChatModel(conn);
          // Actualiza el status del mensaje a 'leído' solo si no lo está ya
          await WhatsappChat.findOneAndUpdate(
            {
              phone: msg.from,
              "session.name": sessionName,
              "messages.msgId": msg.id.id,
              "messages.status": { $ne: "leído" }
            },
            {
              $set: { "messages.$[targetMsg].status": "leído" }
            },
            {
              arrayFilters: [ { "targetMsg.msgId": msg.id.id, "targetMsg.status": { $ne: "leído" } } ]
            }
          );
        }
      } catch (err) {
        console.error('Error actualizando estado de mensaje:', err);
      }
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
          await upsertProspect({
            company,
            number,
            lastMessageData: { 
              lastMessage: message.body, 
              lastMessageDate: message.timestamp ? new Date(message.timestamp * 1000) : new Date() 
            },
            name: (message as any).notifyName,
            activateIA: true, // Activar IA en mensajes en tiempo real
            source: ProspectCreationSource.REAL_TIME_MESSAGE
          });
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
