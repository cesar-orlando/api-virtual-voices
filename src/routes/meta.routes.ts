import express from 'express';
import { handleMessengerWebhook } from '../services/meta/messenger';
import { 
  getFacebookChatMessages, 
  getFacebookUsers, 
  sendFacebookMessageController,
  getDatabaseConnectionsStatus,
  cleanupDatabaseConnections
} from '../controllers/meta.controller';

const router = express.Router();

// Verificación del webhook (GET)
router.get('/messenger', (req, res) => {
  const VERIFY_TOKEN = 'virtual_voices';

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verificado correctamente');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Recepción de mensajes y eventos (POST)
router.post('/messenger', handleMessengerWebhook);
router.post('/messenger/send-message', (req, res, next) => {
  Promise.resolve(sendFacebookMessageController(req, res)).catch(next);
});
router.get('/messenger/usuarios/:c_name/:user_id', getFacebookUsers);
router.get("/messenger/messages/:c_name/:sessionId/:userId", getFacebookChatMessages);

// ✅ Endpoints de monitoreo de conexiones de base de datos
router.get('/database/connections/status', getDatabaseConnectionsStatus);
router.post('/database/connections/cleanup', cleanupDatabaseConnections);

export default router;