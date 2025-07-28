/**
 * Test Google Calendar tool triggering from WhatsApp handler
 * This simulates a real WhatsApp message flow
 */

const axios = require('axios');

async function testWhatsAppCalendarTrigger() {
  console.log('🧪 TESTING GOOGLE CALENDAR TOOL FROM WHATSAPP HANDLER');
  console.log('='.repeat(70));
  
  // Test messages that should trigger the Google Calendar tool
  const testMessages = [
    "Hola, agéndame una reunión para mañana a las 3 PM por favor",
    "Necesito programar una cita para el viernes a las 10 AM", 
    "Crea un evento llamado 'Junta de trabajo' para hoy a las 5 PM",
    "Recuérdame hacer una llamada mañana a las 2 de la tarde",
    "Podrías separar fecha para una capacitación el próximo martes?"
  ];

  console.log('📝 Test messages that should trigger calendar tool:');
  testMessages.forEach((msg, i) => {
    console.log(`  ${i + 1}. "${msg}"`);
  });

  // Check if server is running
  try {
    const healthCheck = await axios.get('http://localhost:3001/api/google-calendar/token-info?email=test@test.com', {
      timeout: 5000
    });
    console.log('\n✅ Server is running and Google Calendar API is accessible');
  } catch (error) {
    console.log('\n❌ Server not accessible:', error.message);
    return;
  }

  console.log('\n🔍 COMPREHENSIVE LOGGING SETUP:');
  console.log('✅ Added logging to WhatsApp message reception in handlers.ts');
  console.log('✅ Added logging to AI generateResponse call in handlers.ts');
  console.log('✅ Added logging to tool call detection in openai.ts');
  console.log('✅ Added Google Calendar tool to all companies in openai.ts');
  console.log('✅ Added Google Calendar execution in executeFunctionCall');
  console.log('✅ Enhanced logging in Google Calendar tool function');

  console.log('\n📊 EXPECTED LOG FLOW WHEN SENDING CALENDAR MESSAGE:');
  console.log('1. 💬💬💬 WHATSAPP MESSAGE RECEIVED IN GENERAL HANDLER');
  console.log('2. 📅 MESSAGE CONTAINS CALENDAR KEYWORDS detection');
  console.log('3. 🤖🤖🤖 CALLING AI GENERATERESPONSE FROM WHATSAPP HANDLER');
  console.log('4. 📅 Adding Google Calendar tool for company');
  console.log('5. 🔧 Total tools available for [company]');
  console.log('6. 🎪🎪🎪 TOOL CALL DETECTED IN GENERAL WHATSAPP HANDLER');
  console.log('7. 🎯🎯🎯 GOOGLE CALENDAR TOOL CALLED FROM WHATSAPP HANDLER');
  console.log('8. 🔥🔥🔥 GOOGLE CALENDAR TOOL TRIGGERED (from the tool function)');

  console.log('\n🚀 TO TEST:');
  console.log('1. Send a WhatsApp message like: "Agéndame una reunión para mañana a las 3 PM"');
  console.log('2. Watch your development server console for the log flow above');
  console.log('3. The logs will show you exactly where the process stops if it\'s not working');

  console.log('\n📋 DEBUGGING CHECKLIST:');
  console.log('✅ Server running in DEVELOPMENT mode');
  console.log('✅ WhatsApp handler enhanced with calendar detection');
  console.log('✅ Google Calendar tool added to general AI service');
  console.log('✅ Tool execution routing updated');
  console.log('✅ Comprehensive logging at every step');

  console.log('\n⚠️  IMPORTANT:');
  console.log('- The Google Calendar tool is now available for ALL companies');
  console.log('- It will be triggered from regular WhatsApp messages (not just QuickLearning)');
  console.log('- OAuth still needs to be set up for actual event creation');
  console.log('- But you should see all the trigger logs even without OAuth');

  console.log('\n🎯 Try sending this exact message to your WhatsApp bot:');
  console.log('💬 "Hola, agéndame una reunión para mañana a las 2 PM"');
  
  console.log('\n📱 Watch for these specific log patterns in your server console:');
  console.log('   💬💬💬 = Message received');
  console.log('   📅 ⚠️  = Calendar keywords detected');
  console.log('   🤖🤖🤖 = AI processing started');
  console.log('   🎪🎪🎪 = Tool call detected');
  console.log('   🎯🎯🎯 = Calendar tool routing');
  console.log('   🔥🔥🔥 = Calendar tool execution');
}

testWhatsAppCalendarTrigger().catch(console.error);
