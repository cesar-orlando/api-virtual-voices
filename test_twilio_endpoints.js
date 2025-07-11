const axios = require('axios');
require('dotenv').config();

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const PHONE_NUMBER = '+5215585583374';

async function testTwilioEndpoints() {
  console.log('🔍 Probando diferentes endpoints de Twilio para WhatsApp...\n');
  
  const auth = {
    username: ACCOUNT_SID,
    password: AUTH_TOKEN
  };

  // Opción 1: Buscar mensajes entrantes (From)
  console.log('1️⃣ Probando mensajes ENTRANTES (From):');
  try {
    const response1 = await axios.get(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json?From=whatsapp:${PHONE_NUMBER}`,
      { auth }
    );
    console.log('✅ Respuesta:', JSON.stringify(response1.data, null, 2));
  } catch (err) {
    console.log('❌ Error:', err.response?.data || err.message);
  }
  console.log('\n' + '='.repeat(50) + '\n');

  // Opción 2: Buscar mensajes salientes (To)
  console.log('2️⃣ Probando mensajes SALIENTES (To):');
  try {
    const response2 = await axios.get(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json?To=whatsapp:${PHONE_NUMBER}`,
      { auth }
    );
    console.log('✅ Respuesta:', JSON.stringify(response2.data, null, 2));
  } catch (err) {
    console.log('❌ Error:', err.response?.data || err.message);
  }
  console.log('\n' + '='.repeat(50) + '\n');

  // Opción 3: Buscar todos los mensajes de WhatsApp (sin filtro)
  console.log('3️⃣ Probando TODOS los mensajes de WhatsApp:');
  try {
    const response3 = await axios.get(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json?PageSize=5`,
      { auth }
    );
    console.log('✅ Respuesta:', JSON.stringify(response3.data, null, 2));
  } catch (err) {
    console.log('❌ Error:', err.response?.data || err.message);
  }
  console.log('\n' + '='.repeat(50) + '\n');

  // Opción 4: Buscar mensajes por fecha (últimos 30 días)
  console.log('4️⃣ Probando mensajes de los últimos 30 días:');
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateStr = thirtyDaysAgo.toISOString().split('T')[0];
    
    const response4 = await axios.get(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json?DateSent>=${dateStr}&PageSize=10`,
      { auth }
    );
    console.log('✅ Respuesta:', JSON.stringify(response4.data, null, 2));
  } catch (err) {
    console.log('❌ Error:', err.response?.data || err.message);
  }
}

testTwilioEndpoints(); 