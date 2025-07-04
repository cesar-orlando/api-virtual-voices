import { Client, LocalAuth } from 'whatsapp-web.js';
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
  if (process.env.RENDER === 'true') {
    return '/opt/render/project/src/.wwebjs_auth';
  }
  return path.join(process.cwd(), '.wwebjs_auth');
};

export const startWhatsappBot = (sessionName: string, company: string, user_id: Types.ObjectId) => {
  const clientKey = `${company}:${sessionName}`;
  if (clients[clientKey]) {
    console.log(`Cliente WhatsApp para la sesión '${sessionName}' ya existe.`);
    return clients[clientKey];
  }

  const whatsappClient = new Client({
    authStrategy: new LocalAuth({ 
      clientId: `${company}-${sessionName}`,
      dataPath: getAuthDir()
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
        '--disable-gpu'
      ],
    },
  });

  clients[clientKey] = whatsappClient;

  async function cleanUpResources(reason: string) {
    console.log(`🧹 Limpiando recursos para ${clientKey} por: ${reason}`);
    if (clients[clientKey]) {
      clients[clientKey].destroy();
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
      console.log('updateSessionStatus --- >Emitiendo QR a:', `whatsapp-qr-${company}-${user_id}`);
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
  async function saveProspectIfNotExists(company: string, number: string, name?: string) {
    console.log("entrando a saveProspectIfNotExists", { company, number });
    try {
      if (!isValidUserNumber(number)) {
        console.log("[PROSPECTO] Número no válido:", number);
        return;
      }
      const num = extractNumberFromWhatsAppId(number);
      if (!num) {
        console.log("[PROSPECTO] No se pudo extraer número:", number);
        return;
      }
      const conn = await getDbConnection(company);
      const Table = getTableModel(conn);
      const Record = getRecordModel(conn);

      const table = await Table.findOne({ slug: 'prospectos', c_name: company, isActive: true });
      if (!table) {
        console.log("[PROSPECTO] Tabla 'prospectos' NO existe o NO está activa para:", company);
        return;
      }

      const existing = await Record.findOne({ tableSlug: 'prospectos', c_name: company, 'data.number': num });
      if (existing) {
        console.log("[PROSPECTO] Ya existe prospecto para número:", num);
        return;
      }

      const newProspect = new Record({
        tableSlug: 'prospectos',
        c_name: company,
        createdBy: 'whatsapp-bot',
        data: {
          name: name || '',
          number: num,
          ia: false
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
        reject(new Error('User didnt scan QR'));
        return;
      }
      qrSent[clientKey] = true;
      console.log(`[QR][${sessionName}] Escanea este QR con WhatsApp:`);
      qrcode.generate(qr, { small: true });
      if (io) {
        console.log('Emitiendo QR a:', `whatsapp-qr-${company}-${user_id}`);
        io.emit(`whatsapp-qr-${company}-${user_id}`, qr);
      }
    });

    whatsappClient.on('ready', async () => {
      console.log(`✅ WhatsApp [${company}] - [${sessionName}] conectado y listo`);
      const chats = await whatsappClient.getChats();
      console.log('CHATS DISPONIBLES:', chats.map(c => ({id: c.id._serialized, name: c.name, isGroup: c.isGroup})));
      // Guardar todos los chats en WhatsappChat y prospectos (con mensajes iniciales si es posible)
      try {
        const conn = await getDbConnection(company);
        const WhatsappChat = getWhatsappChatModel(conn);
        for (const chat of chats) {
          // Solo chats individuales
          if (chat.isGroup || !chat.id._serialized.endsWith('@c.us')) continue;
          // Guardar en WhatsappChat
          let chatRecord = await WhatsappChat.findOne({ phone: chat.id._serialized });
          if (!chatRecord) {
            chatRecord = new WhatsappChat({
              tableSlug: "clientes",
              phone: chat.id._serialized,
              name: chat.name || chat.id._serialized,
              messages: [],
            });
            // Intenta obtener los últimos mensajes
            try {
              const messages = await chat.fetchMessages({ limit: 5 });
              for (const msg of messages) {
                chatRecord.messages.push({
                  direction: msg.fromMe ? "outbound" : "inbound",
                  body: msg.body,
                  respondedBy: msg.fromMe ? "human" : "user",
                  createdAt: msg.timestamp ? new Date(msg.timestamp * 1000) : new Date(),
                });
              }
            } catch (err) {
              console.error('Error obteniendo mensajes iniciales:', err);
            }
            await chatRecord.save();
          }
          // Guardar en prospectos si no existe, pasando el nombre
          await saveProspectIfNotExists(company, chat.id._serialized, chat.name);
        }
        console.log('Todos los chats guardados en WhatsappChat y prospectos.');
      } catch (err) {
        console.error('Error guardando chats masivamente:', err);
      }
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
      reject(new Error('Auth failure'));
    });

    whatsappClient.on('disconnected', async (reason) => {
      console.log(`❌ Sesión ${company}:${sessionName} desconectada :`, reason);
      delete qrSent[clientKey];
      await cleanUpResources('disconnected');
      setTimeout(async () => {
        await updateSessionStatus('disconnected', reason);
      }, 2000);
      reject(new Error('Disconnected'));
    });

    whatsappClient.on('message', async (message) => {
      // Log de todos los mensajes recibidos
      console.log('MENSAJE RECIBIDO:', message.from, message.body);
      // Guardar prospecto si no existe (solo chats individuales)
      const number = message.from;
      await saveProspectIfNotExists(company, number, (message as any).notifyName || number);

      // GUARDAR MENSAJE EN WhatsappChat
      try {
        const conn = await getDbConnection(company);
        const WhatsappChat = getWhatsappChatModel(conn);
        let chatRecord = await WhatsappChat.findOne({ phone: message.from });
        if (!chatRecord) {
          chatRecord = new WhatsappChat({
            tableSlug: "clientes",
            phone: message.from,
            name: (message as any).notifyName || message.from,
            messages: [],
          });
        }
        chatRecord.messages.push({
          direction: message.fromMe ? "outbound" : "inbound",
          body: message.body,
          respondedBy: message.fromMe ? "human" : "user",
          createdAt: new Date(),
        });
        await chatRecord.save();
        console.log(`[WhatsappChat] Mensaje guardado para ${message.from}`);
      } catch (err) {
        console.error('[WhatsappChat] Error guardando mensaje:', err);
      }

      // Si el mensaje es del número 4521311888, responde automáticamente
      if (number === '5214521311888@c.us') {
        try {
          await whatsappClient.sendMessage(number, '¡Hola! Este es un mensaje automático de prueba desde el bot.');
          console.log('✅ Mensaje de prueba enviado a 4521311888');
        } catch (err) {
          console.error('❌ Error enviando mensaje de prueba a 4521311888:', err);
        }
      }
      await handleIncomingMessage(message, whatsappClient, company, sessionName);
    });

    whatsappClient.initialize();
  });
};
