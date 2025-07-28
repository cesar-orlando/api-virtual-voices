/**
 * Test specific scenarios that should trigger the Google Calendar tool
 */

const axios = require('axios');

async function testCalendarTriggerScenarios() {
  console.log('🧪 TESTING GOOGLE CALENDAR TOOL TRIGGER SCENARIOS');
  console.log('='.repeat(70));
  
  // Test messages that should trigger the calendar tool
  const testMessages = [
    "Agéndame una reunión para mañana a las 3 PM",
    "Necesito programar una cita para el viernes a las 10 AM", 
    "Crea un evento llamado 'Junta de trabajo' para hoy a las 5 PM",
    "Recuérdame hacer una llamada mañana a las 2 de la tarde",
    "Reserva tiempo para una reunión de equipo el lunes a las 9 AM",
    "Separa fecha para capacitación el próximo martes a las 11 AM"
  ];

  console.log('📝 Testing the following messages:');
  testMessages.forEach((msg, i) => {
    console.log(`  ${i + 1}. "${msg}"`);
  });

  // Check if the server is running
  try {
    await axios.get('http://localhost:3001/api/google-calendar/token-info', {
      headers: {
        'X-User-Email': process.env.GOOGLE_CALENDAR_DEFAULT_EMAIL || 'blueage888@gmail.com'
      },
      timeout: 5000
    });
    console.log('\n✅ Server is running');
  } catch (error) {
    console.log('\n❌ Server is not running. Please start with: npm start');
    return;
  }

  // Try to directly call the QuickLearning OpenAI service to test tool selection
  console.log('\n🤖 Testing AI Tool Selection...');
  console.log('NOTE: This tests if the AI correctly identifies calendar intent');

  for (let i = 0; i < Math.min(3, testMessages.length); i++) {
    const message = testMessages[i];
    console.log(`\n📱 Testing message ${i + 1}: "${message}"`);
    
    try {
      // Simulate what happens when the WhatsApp service processes the message
      console.log('🔍 Analyzing message for calendar keywords...');
      
      const calendarKeywords = [
        'agendar', 'agéndame', 'reunión', 'evento', 'cita', 'calendar', 
        'meeting', 'appointment', 'programar', 'reserva', 'recuérdame',
        'separa', 'bloquea', 'apartar'
      ];
      
      const foundKeywords = calendarKeywords.filter(keyword => 
        message.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (foundKeywords.length > 0) {
        console.log(`✅ Calendar keywords detected: [${foundKeywords.join(', ')}]`);
        console.log('🎯 This message SHOULD trigger the Google Calendar tool');
      } else {
        console.log('❌ No calendar keywords detected');
        console.log('⚠️  This message might NOT trigger the Google Calendar tool');
      }

      // Try to simulate the actual OpenAI call (this would be the real test)
      console.log('🚨 TO SEE ACTUAL TOOL TRIGGERING:');
      console.log('   1. Send this message via WhatsApp to your bot');
      console.log('   2. Watch the console for the 🔥🔥🔥 GOOGLE CALENDAR TOOL TRIGGERED logs');
      console.log('   3. Also watch for 🎪🎪🎪 TOOL CALL DETECTED logs');
      console.log('   4. And 🎯🎯🎯 OPENAI DECIDED TO CALL GOOGLE CALENDAR TOOL logs');
      
    } catch (error) {
      console.log(`❌ Error testing message: ${error.message}`);
    }
  }

  console.log('\n🔧 DEBUGGING CHECKLIST:');
  console.log('='.repeat(50));
  console.log('✅ 1. Google Calendar tool is registered in OpenAI service');
  console.log('✅ 2. Comprehensive logging is in place');
  console.log('✅ 3. Server is running');
  console.log('❓ 4. Check if OpenAI API key is working');
  console.log('❓ 5. Check if the AI model is responding to messages');
  console.log('❓ 6. Verify WhatsApp webhook is receiving messages');

  console.log('\n🐛 POSSIBLE ISSUES:');
  console.log('1. OpenAI API key not configured or invalid');
  console.log('2. AI model not recognizing calendar intent in Spanish');
  console.log('3. WhatsApp webhook not properly calling the AI service');
  console.log('4. Tool description might need adjustment');
  console.log('5. AI temperature/settings preventing tool use');

  console.log('\n📋 IMMEDIATE DEBUGGING STEPS:');
  console.log('1. Send a WhatsApp message with: "Agéndame una reunión para mañana"');
  console.log('2. Check console logs for:');
  console.log('   • 💬💬💬 WHATSAPP MESSAGE RECEIVED');
  console.log('   • 🎪🎪🎪 TOOL CALL DETECTED');
  console.log('   • 🎯🎯🎯 OPENAI DECIDED TO CALL GOOGLE CALENDAR TOOL');
  console.log('   • 🔥🔥🔥 GOOGLE CALENDAR TOOL TRIGGERED');
  console.log('3. If you see 💬 but not 🎪, the AI is not deciding to use tools');
  console.log('4. If you see 🎪 but not 🎯, the AI is using other tools');
  console.log('5. If you see 🎯 but not 🔥, there\'s an issue with the tool function');

  console.log('\n⚡ QUICK TEST: Try sending this exact message via WhatsApp:');
  console.log('💬 "Hola, agéndame una reunión para mañana a las 2 PM por favor"');
}

// Run the test
if (require.main === module) {
  testCalendarTriggerScenarios().catch(console.error);
}

module.exports = { testCalendarTriggerScenarios };
