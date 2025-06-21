import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { handleIncomingMessage } from './handlers';
import { io } from '../../server'; // Ajusta la ruta según tu estructura
import { Types } from 'mongoose';
import fs from "fs";
import path from "path";
import { getDbConnection } from '../../config/connectionManager';
import { getSessionModel } from '../../models/whatsappSession.model';

// Objeto global para almacenar clientes por sesión
export const clients: Record<string, Client> = {};

// Objeto global para limitar la generacion de QR
const qrSent: Record<string, boolean> = {};

// Determinar el directorio de autenticación basado en el entorno
const getAuthDir = () => {
  if (process.env.RENDER) {
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
      io.emit(`whatsapp-status-${company}-${user_id}`, { status, session: sessionName, message: reason });
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
        io.emit(`whatsapp-qr-${company}-${user_id}`, qr);
      }
    });

    whatsappClient.on('ready', async () => {
      console.log(`✅ WhatsApp [${company}] - [${sessionName}] conectado y listo`);
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
      console.log(`${company} - ${sessionName} - Mensaje creado en chat ${message.from}:`, message.body);
      await handleIncomingMessage(message, whatsappClient, company, sessionName);
    });

    whatsappClient.initialize();
  });
};
