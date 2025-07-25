/**
 * Test script to trigger Google Calendar tool and see all console.log output
 */

const axios = require('axios');

async function testCalendarToolLogging() {
  console.log('🧪 Testing Google Calendar Tool Logging');
  console.log('=' .repeat(50));
  
  try {
    // Test 1: Direct API call to simulate OpenAI tool trigger
    console.log('\n📋 Test 1: Direct API call to Google Calendar endpoint');
    console.log('This simulates what happens when the OpenAI tool calls the API');
    
    const testEvent = {
      summary: "Test Event - Logging Demo",
      description: "Testing the comprehensive logging system",
      startDateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
      endDateTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
      timeZone: "America/Mexico_City",
      location: "Virtual Meeting Room",
      attendeeEmails: []
    };

    console.log('📤 Sending test event to API...');
    
    const response = await axios.post(
      'http://localhost:3001/api/google-calendar/events-with-auto-token',
      testEvent,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': process.env.GOOGLE_CALENDAR_DEFAULT_EMAIL || 'blueage888@gmail.com'
        },
        timeout: 15000
      }
    );

    console.log('✅ API Response:', response.data);

  } catch (error) {
    console.log('❌ API Test Failed:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.log('\n⚠️  OAuth tokens not set up yet.');
      console.log('   The logging will still work, but event creation will fail.');
      console.log('   Complete OAuth setup first: node setup-google-calendar.js');
    }
  }

  try {
    // Test 2: Simulate WhatsApp message that should trigger calendar tool
    console.log('\n📱 Test 2: Simulate WhatsApp message processing');
    console.log('This tests the message detection and AI processing pipeline');
    
    const testMessages = [
      "Agéndame una reunión para mañana a las 3 PM",
      "Crear un evento llamado 'Revisión de proyecto' para el viernes",
      "Necesito una cita el próximo lunes a las 10 AM"
    ];

    for (const testMessage of testMessages) {
      console.log(`\n📝 Testing message: "${testMessage}"`);
      
      // This would normally be called by the WhatsApp webhook
      // For now, we'll just simulate the initial processing
      const calendarKeywords = ['agendar', 'reunión', 'evento', 'cita', 'calendar', 'meeting', 'appointment'];
      const hasCalendarKeywords = calendarKeywords.some(keyword => 
        testMessage.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (hasCalendarKeywords) {
        console.log('📅 ✅ Message contains calendar keywords - would trigger AI processing');
        console.log('🤖 AI would analyze this message and potentially call Google Calendar tool');
      } else {
        console.log('📝 ℹ️  Message does not contain obvious calendar keywords');
      }
    }

  } catch (error) {
    console.log('❌ WhatsApp simulation failed:', error.message);
  }

  console.log('\n🎯 LOGGING SUMMARY:');
  console.log('=' .repeat(50));
  console.log('✅ Enhanced logging has been added to:');
  console.log('   1. 💬 WhatsApp message reception (openaiService.ts)');
  console.log('   2. 🎪 Tool call detection in AI response (openaiService.ts)');
  console.log('   3. 🎯 OpenAI service tool routing (openaiService.ts)');
  console.log('   4. 🔥 Google Calendar tool execution (openaiTools.ts)');
  console.log('   5. 📤 API request details (openaiTools.ts)');
  console.log('   6. 📥 API response details (openaiTools.ts)');
  
  console.log('\n🚀 To see the full logging in action:');
  console.log('   1. Complete OAuth setup if not done: node setup-google-calendar.js');
  console.log('   2. Send a WhatsApp message like: "Agéndame una reunión para mañana"');
  console.log('   3. Watch the console for all the 🔥🎯🎪💬 emojis!');
  
  console.log('\n📊 You should see these log patterns:');
  console.log('   💬💬💬 = WhatsApp message received');
  console.log('   🎪🎪🎪 = Tool call detected');
  console.log('   🎯🎯🎯 = OpenAI routing to calendar tool');
  console.log('   🔥🔥🔥 = Google Calendar tool triggered');
  console.log('   📤📥 = API request/response details');
}

// Run if called directly
if (require.main === module) {
  testCalendarToolLogging().catch(console.error);
}

module.exports = { testCalendarToolLogging };
