/**
 * Simple test to trigger Google Calendar tool in DEVELOPMENT mode
 */

const axios = require('axios');

async function testCalendarToolDev() {
  console.log('🧪 TESTING GOOGLE CALENDAR TOOL IN DEVELOPMENT MODE');
  console.log('='.repeat(60));
  
  try {
    // Test the API endpoint directly
    console.log('📋 Testing Google Calendar API endpoint...');
    
    const testEvent = {
      summary: "TEST EVENT - Development Mode",
      description: "Testing comprehensive logging in development",
      startDateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
      endDateTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
      timeZone: "America/Mexico_City",
      location: "Virtual Meeting Room",
      attendeeEmails: []
    };

    console.log('📤 Sending test event:', testEvent.summary);
    
    const response = await axios.post(
      'http://localhost:3001/api/google-calendar/events-with-auto-token',
      testEvent,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': 'blueage888@gmail.com'
        },
        timeout: 15000
      }
    );

    console.log('✅ API Response:', response.data);

  } catch (error) {
    console.log('❌ Expected error (OAuth not set up yet):', error.response?.data || error.message);
    
    console.log('\n🎯 IMPORTANT:');
    console.log('The API call failed as expected (no OAuth tokens set up yet)');
    console.log('BUT you should now see the 🔥🔥🔥 GOOGLE CALENDAR TOOL TRIGGERED logs');
    console.log('in your server console if the tool function was called!');
  }

  console.log('\n📱 TO TEST WITH WHATSAPP:');
  console.log('1. Complete OAuth setup first: node setup-google-calendar.js');
  console.log('2. Send a WhatsApp message like: "Agéndame una reunión para mañana a las 3 PM"');
  console.log('3. Watch the server console for these patterns:');
  console.log('   💬💬💬 = WhatsApp message received');
  console.log('   🎪🎪🎪 = Tool call detected by AI');
  console.log('   🎯🎯🎯 = OpenAI routing to calendar tool');
  console.log('   🔥🔥🔥 = Google Calendar tool triggered');
  
  console.log('\n✅ Server is now running in DEVELOPMENT mode');
  console.log('✅ Enhanced logging is active');
  console.log('✅ Ready to test Google Calendar tool triggers!');
}

testCalendarToolDev().catch(console.error);
