import express from 'express';
import { handleMessengerWebhook } from '../services/meta/messenger';

const router = express.Router();

// Verificación del webhook (GET)
router.get('/meta/messenger', (req, res) => {
  const VERIFY_TOKEN = 'virtual_voices_test';

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
router.post('/meta/messenger', handleMessengerWebhook);

export default router;