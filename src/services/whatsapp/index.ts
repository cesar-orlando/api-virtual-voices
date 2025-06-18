import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { handleIncomingMessage } from './handlers';
import { io } from '../../server'; // Ajusta la ruta según tu estructura
import { Types } from 'mongoose';
import fs from "fs";
import path from "path";

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
  // Si ya existe el cliente para esta sesión, no lo crees de nuevo
  const clientKey = `${company}:${sessionName}`;
  if (clients[clientKey]) {
    console.log(`Cliente WhatsApp para la sesión '${sessionName}' ya existe.`);
    return clients[clientKey];
  }

  console.log(`Iniciando sesión WhatsApp: ${company} - ${sessionName}`);
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
    // Opcional: notifica al frontend 
    if (io) {
      io.emit(`whatsapp-status-${company}-${user_id}`, { status: reason, message: reason, session: sessionName});
    }
  }

  return new Promise<Client>((resolve, reject) => {
    whatsappClient.on('qr', async (qr) => {
      
      // Ya se envió el QR, no lo envíes de nuevo y borra los datos de la sesion
      if (qrSent[clientKey]) {
        delete qrSent[clientKey];
        cleanUpResources('User didnt scan QR');
        reject(new Error('User didnt scan QR'));
        return;
      }

      // Usa una clave única por sesión
      qrSent[clientKey] = true;
      console.log(`[QR][${sessionName}] Escanea este QR con WhatsApp:`);
      qrcode.generate(qr, { small: true });
      if (io) {
        io.emit(`whatsapp-qr-${company}-${user_id}`, qr);
      }
    });

    whatsappClient.on('ready', async () => {
      console.log(`✅ WhatsApp [${company}] - [${sessionName}] conectado y listo`);
      if (io) {
        io.emit(`whatsapp-status-${company}-${user_id}`, { status: "ready", session: sessionName });
      }
      delete qrSent[clientKey];
      resolve(whatsappClient);
    });

    whatsappClient.on('auth_failure', (msg) => {
      console.error(`❌ Fallo de autenticación en la sesión ${company}:${sessionName} :`, msg);
      delete qrSent[clientKey];
      cleanUpResources('auth_failure');
      reject(new Error('Auth failure'));
    });

    whatsappClient.on('disconnected', (reason) => {
      console.error(`❌ Sesión ${company}:${sessionName} desconectada :`, reason);
      delete qrSent[clientKey];
      cleanUpResources('disconnected');
      reject(new Error('Disconnected'));
    });

    whatsappClient.on('message_create', async (message) => {
      console.log(`${company} - ${sessionName} - Mensaje creado en chat ${message.from}:`, message.body);
      await handleIncomingMessage(message, whatsappClient, company, sessionName);
    });

    whatsappClient.initialize();
  });
};
