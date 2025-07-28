/**
 * Test OAuth Google Calendar Integration
 * This script tests if the OAuth credentials from .env work for calendar creation
 */
require('dotenv').config();
const axios = require('axios');

console.log('\n🧪 TESTING OAUTH GOOGLE CALENDAR INTEGRATION 🧪');
console.log('='.repeat(60));

async function testCalendarWithOAuth() {
  try {
    console.log('\n📋 Checking Environment Variables:');
    console.log(`✅ GOOGLE_CALENDAR_CLIENT_ID: ${process.env.GOOGLE_CALENDAR_CLIENT_ID ? 'Set' : 'Missing'}`);
    console.log(`✅ GOOGLE_CALENDAR_CLIENT_SECRET: ${process.env.GOOGLE_CALENDAR_CLIENT_SECRET ? 'Set' : 'Missing'}`);
    console.log(`✅ GOOGLE_CALENDAR_ACCESS_TOKEN: ${process.env.GOOGLE_CALENDAR_ACCESS_TOKEN ? 'Set (' + process.env.GOOGLE_CALENDAR_ACCESS_TOKEN.substring(0, 20) + '...)' : 'Missing'}`);
    console.log(`✅ GOOGLE_CALENDAR_REFRESH_TOKEN: ${process.env.GOOGLE_CALENDAR_REFRESH_TOKEN ? 'Set (' + process.env.GOOGLE_CALENDAR_REFRESH_TOKEN.substring(0, 20) + '...)' : 'Missing'}`);
    console.log(`✅ GOOGLE_CALENDAR_DEFAULT_EMAIL: ${process.env.GOOGLE_CALENDAR_DEFAULT_EMAIL || 'Missing'}`);

    // Test server connectivity
    console.log('\n🌐 Testing Server Connectivity:');
    try {
      const healthCheck = await axios.get('http://localhost:3001/health', {
        timeout: 5000
      });
      console.log(`✅ Server is running (Status: ${healthCheck.status})`);
    } catch (serverError) {
      console.log('⚠️ Server health check failed:', serverError.message);
      console.log('💡 Make sure your development server is running with: npm run dev');
    }

    // Test calendar event creation
    console.log('\n📅 Testing Google Calendar Event Creation:');
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(15, 0, 0, 0); // 3:00 PM tomorrow
    
    const endTime = new Date(tomorrow);
    endTime.setHours(16, 0, 0, 0); // 4:00 PM tomorrow

    const eventData = {
      summary: "Test Event - OAuth Integration",
      description: "Testing OAuth calendar integration from environment variables",
      startDateTime: tomorrow.toISOString(),
      endDateTime: endTime.toISOString(),
      timeZone: "America/Mexico_City",
      location: "Virtual Voices Office"
    };

    console.log(`📤 Creating test event:`, {
      summary: eventData.summary,
      startDateTime: eventData.startDateTime,
      endDateTime: eventData.endDateTime
    });

    const response = await axios.post(
      'http://localhost:3001/api/google-calendar/events-with-auto-token',
      eventData,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': process.env.GOOGLE_CALENDAR_DEFAULT_EMAIL || 'blueage888@gmail.com'
        },
        timeout: 15000
      }
    );

    if (response.data.success) {
      console.log('\n🎉 SUCCESS! Google Calendar OAuth integration is working!');
      console.log(`✅ Event created successfully`);
      console.log(`📅 Event ID: ${response.data.event?.id}`);
      console.log(`🔗 Event Link: ${response.data.event?.htmlLink}`);
      console.log(`📝 Response:`, response.data.message);
      
      console.log('\n🚀 Ready for WhatsApp Calendar Messages!');
      console.log('💬 Try sending: "Hola, agéndame una reunión para mañana a las 2 PM"');
      
    } else {
      console.log('\n❌ Calendar event creation failed');
      console.log('Response:', response.data);
    }

  } catch (error) {
    console.error('\n❌ Error during OAuth calendar test:', error.message);
    
    if (error.response?.status === 401) {
      console.log('\n🔑 OAuth Token Issues:');
      console.log('   - Your access token may be expired');
      console.log('   - Your refresh token may be invalid');
      console.log('   - Check that your OAuth credentials are correct');
      console.log('\n💡 Solutions:');
      console.log('   1. Verify tokens in .env file are correct');
      console.log('   2. Regenerate tokens if needed');
      console.log('   3. Check Google Calendar API is enabled');
    } else if (error.response?.status === 400) {
      console.log('\n📋 Request Issues:');
      console.log('   - Check request format');
      console.log('   - Verify date formats');
      console.log('   Response:', error.response?.data);
    } else if (error.code === 'ECONNREFUSED') {
      console.log('\n🔌 Connection Issues:');
      console.log('   - Make sure your development server is running');
      console.log('   - Run: npm run dev');
      console.log('   - Check server is running on http://localhost:3001');
    } else {
      console.log('\n🚨 Unexpected Error:');
      console.log('Response data:', error.response?.data);
      console.log('Status:', error.response?.status);
    }
  }
}

// Test environment configuration
async function testEnvironmentSetup() {
  console.log('\n🔧 Environment Setup Test:');
  
  const requiredVars = [
    'GOOGLE_CALENDAR_CLIENT_ID',
    'GOOGLE_CALENDAR_CLIENT_SECRET', 
    'GOOGLE_CALENDAR_ACCESS_TOKEN',
    'GOOGLE_CALENDAR_REFRESH_TOKEN',
    'GOOGLE_CALENDAR_DEFAULT_EMAIL'
  ];
  
  let allSet = true;
  
  requiredVars.forEach(varName => {
    if (process.env[varName]) {
      console.log(`✅ ${varName}: Set`);
    } else {
      console.log(`❌ ${varName}: Missing`);
      allSet = false;
    }
  });
  
  if (allSet) {
    console.log('\n🎯 All required environment variables are set!');
    return true;
  } else {
    console.log('\n⚠️ Some environment variables are missing');
    console.log('💡 Make sure your .env file contains all Google Calendar OAuth credentials');
    return false;
  }
}

// Main execution
async function main() {
  console.log('🏁 Starting OAuth Google Calendar Integration Test...');
  
  const envOk = await testEnvironmentSetup();
  
  if (envOk) {
    await testCalendarWithOAuth();
  } else {
    console.log('\n❌ Environment setup incomplete. Please fix .env file first.');
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🧪 Test Complete');
}

main().catch(console.error);
