import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { handleIncomingMessage } from './handlers';
import { io } from '../../server'; // Ajusta la ruta según tu estructura

// Objeto global para almacenar clientes por sesión
export const clients: Record<string, Client> = {};

export const startWhatsappBot = (sessionName: string, company: string) => {
  // Si ya existe el cliente para esta sesión, no lo crees de nuevo
  if (clients[sessionName]) {
    console.log(`Cliente WhatsApp para la sesión '${sessionName}' ya existe.`);
    return clients[sessionName];
  }

  console.log(`Iniciando sesión WhatsApp: ${company} - ${sessionName}`);
  const whatsappClient = new Client({
    authStrategy: new LocalAuth({ clientId: sessionName }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox'],
    },
  });

  whatsappClient.on('qr', async (qr) => {
    console.log(`[QR][${sessionName}] Escanea este QR con WhatsApp:`);
    qrcode.generate(qr, { small: true });
    if (io) {
      io.emit(`whatsapp-qr-${company}`, qr);
    }
  });

  whatsappClient.on('ready', () => {
    console.log(`✅ WhatsApp [${company}] - [${sessionName}] conectado y listo`);
  });

  whatsappClient.on('message_create', async (message) => {
    console.log(`${company} - ${sessionName} - Mensaje creado:`, message.body);
    await handleIncomingMessage(message, whatsappClient, company);
  });

  whatsappClient.initialize();
  clients[sessionName] = whatsappClient; // Guarda el cliente para evitar duplicados
  return whatsappClient;
};
