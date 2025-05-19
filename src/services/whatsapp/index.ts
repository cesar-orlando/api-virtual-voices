import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { handleIncomingMessage } from './handlers';

export const whatsappClient = new Client({
  authStrategy: new LocalAuth({ clientId: 'virtual-voices' }), // guarda sesión en .wwebjs_auth
  puppeteer: {
    headless: true,
    args: ['--no-sandbox'],
  },
});

export const startWhatsappBot = () => {
  whatsappClient.on('qr', (qr) => {
    console.log('[QR] Escanea este QR con WhatsApp:');
    qrcode.generate(qr, { small: true });
  });

  whatsappClient.on('ready', () => {
    console.log('✅ WhatsApp conectado y listo');
  });

  whatsappClient.on('message_create', async (message) => {
    console.log('Mensaje creado:', message.body);
    await handleIncomingMessage(message, whatsappClient);
  });

  whatsappClient.initialize();
};
