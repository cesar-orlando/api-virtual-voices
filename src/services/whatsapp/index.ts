import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { handleIncomingMessage } from './handlers';
import { io } from '../../server'; // Ajusta la ruta según tu estructura
import { Types } from 'mongoose';
import path from 'path';

// Objeto global para almacenar clientes por sesión
export const clients: Record<string, Client> = {};

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
      clientId: sessionName,
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

  whatsappClient.on('qr', async (qr) => {
    console.log(`[QR][${sessionName}] Escanea este QR con WhatsApp:`);
    qrcode.generate(qr, { small: true });
    if (io) {
      io.emit(`whatsapp-qr-${company}-${user_id}`, qr);
    }
  });

  whatsappClient.on('ready', async () => {
  console.log(`✅ WhatsApp [${company}] - [${sessionName}] conectado y listo`);
  });

  whatsappClient.on('message_create', async (message) => {
    console.log(`${company} - ${sessionName} - Mensaje creado en chat ${message.from}:`, message.body);
    await handleIncomingMessage(message, whatsappClient, company, sessionName);
  });
  whatsappClient.initialize();
  clients[clientKey] = whatsappClient; // Guarda el cliente para evitar duplicados
  return whatsappClient;
};
