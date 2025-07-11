const axios = require('axios');
require('dotenv').config();

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM_NUMBER = 'whatsapp:+5215585583374'; // Nuevo número proporcionado por el usuario

async function lookupTwilioMessages() {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json?From=${FROM_NUMBER}`;
  try {
    const response = await axios.get(url, {
      auth: {
        username: ACCOUNT_SID,
        password: AUTH_TOKEN
      }
    });
    console.log('Respuesta Twilio:', JSON.stringify(response.data, null, 2));
  } catch (err) {
    console.error('Error consultando Twilio:', err.response ? err.response.data : err.message);
  }
}

lookupTwilioMessages(); 