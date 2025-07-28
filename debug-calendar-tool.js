/**
 * Debug Google Calendar Tool Integration
 */

const axios = require('axios');

// Test the direct OpenAI tool function
async function testOpenAITool() {
  console.log('🔧 Testing OpenAI Calendar Tool Function...');
  
  try {
    // Import the tool function directly
    const { create_google_calendar_event } = require('./src/services/quicklearning/openaiTools.ts');
    
    const result = await create_google_calendar_event(
      "Test Event from Tool",
      "2024-07-25T14:00:00.000Z",
      "2024-07-25T15:00:00.000Z",
      "Testing direct tool call",
      "Test Location",
      [],
      "America/Mexico_City"
    );
    
    console.log('✅ Tool Result:', result);
    return result;
    
  } catch (error) {
    console.log('❌ Tool Error:', error.message);
    return null;
  }
}

// Test the API endpoint directly
async function testDirectAPI() {
  console.log('\n🌐 Testing Direct API Endpoint...');
  
  const eventData = {
    summary: "Direct API Test Event",
    description: "Testing API endpoint directly",
    startDateTime: "2024-07-25T14:00:00.000Z",
    endDateTime: "2024-07-25T15:00:00.000Z",
    location: "Test Location",
    timeZone: "America/Mexico_City",
    attendeeEmails: []
  };
  
  try {
    const response = await axios.post(
      'http://localhost:3001/api/google-calendar/events-with-auto-token',
      eventData,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': process.env.GOOGLE_CALENDAR_DEFAULT_EMAIL || 'blueage888@gmail.com'
        },
        timeout: 10000
      }
    );
    
    console.log('✅ API Response:', response.data);
    return response.data;
    
  } catch (error) {
    console.log('❌ API Error:', error.response?.data || error.message);
    return null;
  }
}

// Test token status
async function testTokenStatus() {
  console.log('\n🔍 Checking Token Status...');
  
  try {
    const response = await axios.get(
      `http://localhost:3001/api/google-calendar/token-info?email=${process.env.GOOGLE_CALENDAR_DEFAULT_EMAIL || 'blueage888@gmail.com'}`
    );
    
    console.log('✅ Token Status:', response.data);
    return response.data;
    
  } catch (error) {
    console.log('❌ Token Check Error:', error.response?.data || error.message);
    return null;
  }
}

// Test the QuickLearning OpenAI service directly
async function testQuickLearningService() {
  console.log('\n🤖 Testing QuickLearning OpenAI Service...');
  
  try {
    // Import the service
    const { quickLearningOpenAIService } = require('./src/services/quicklearning/openaiService.ts');
    
    const testMessage = "Agéndame una reunión para mañana a las 2 PM";
    const testPhone = "+521234567890";
    
    console.log(`📱 Test Message: "${testMessage}"`);
    
    const result = await quickLearningOpenAIService.generateResponse(testMessage, testPhone);
    
    console.log('✅ AI Response:', result);
    return result;
    
  } catch (error) {
    console.log('❌ AI Service Error:', error.message);
    return null;
  }
}

// Main debugging function
async function debugCalendarIntegration() {
  console.log('🚀 Debugging Google Calendar Tool Integration');
  console.log('=' .repeat(60));
  
  // Check if server is running
  try {
    await axios.get('http://localhost:3001/api/google-calendar/auth-url');
    console.log('✅ Server is running');
  } catch (error) {
    console.log('❌ Server not running. Please start with: npm start');
    return;
  }
  
  // Run tests in sequence
  const tokenStatus = await testTokenStatus();
  const apiResult = await testDirectAPI();
  // await testOpenAITool(); // Skip this as it requires TypeScript compilation
  const aiResult = await testQuickLearningService();
  
  console.log('\n🎯 SUMMARY & NEXT STEPS:');
  console.log('=' .repeat(60));
  
  // Check if OAuth is set up
  if (!tokenStatus || !tokenStatus.tokenData || !tokenStatus.tokenData.access_token) {
    console.log('⚠️  OAUTH SETUP REQUIRED:');
    console.log('   1. Run: node setup-google-calendar.js');
    console.log('   2. Or visit: http://localhost:3001/api/google-calendar/auth');
    console.log('   3. Complete the authorization flow');
    console.log('   4. Re-run this debug tool');
  } else {
    console.log('✅ OAuth tokens are configured');
    
    if (apiResult && apiResult.success) {
      console.log('✅ Google Calendar API is working');
    } else {
      console.log('❌ Google Calendar API has issues');
    }
    
    console.log('\n🚀 WhatsApp Integration Test:');
    console.log('   Send a message like: "Agéndame una reunión para mañana a las 3 PM"');
    console.log('   The AI should automatically create a calendar event');
  }
  
  console.log('\n📊 System Status:');
  console.log(`   Server: ✅ Running`);
  console.log(`   OAuth: ${tokenStatus?.tokenData?.access_token ? '✅' : '❌'} ${tokenStatus?.tokenData?.access_token ? 'Configured' : 'Not configured'}`);
  console.log(`   API: ${apiResult?.success ? '✅' : '❌'} ${apiResult?.success ? 'Working' : 'Needs OAuth setup'}`);
  console.log(`   AI Service: ${aiResult ? '✅' : '❌'} ${aiResult ? 'Working' : 'Has issues'}`);
  
  console.log('\n🎉 Debugging completed!');
}

// Run if called directly
if (require.main === module) {
  debugCalendarIntegration().catch(console.error);
}

module.exports = {
  testDirectAPI,
  testTokenStatus,
  testQuickLearningService,
  debugCalendarIntegration
};
