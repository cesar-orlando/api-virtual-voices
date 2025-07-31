import { Assistant } from '../services/agents/Assistant';

async function testCalendarAssistant() {
  console.log('🧪 Testing Calendar Assistant...');
  
  try {
    // Initialize the assistant
    const assistant = new Assistant('VirtualVoices');
    await assistant.initialize();
    
    console.log('✅ Assistant initialized successfully');
    
    // Test creating an event
    console.log('\n📅 Testing event creation...');
    const createResponse = await assistant.processMessage(
      'Create a team meeting tomorrow at 2:30 PM for 1 hour. Include john@example.com and sarah@example.com as attendees. The meeting is about project planning.'
    );
    console.log('Create Response:', createResponse);
    
    // Test parsing natural language time
    console.log('\n🕐 Testing time parsing...');
    const parseResponse = await assistant.processMessage(
      'What would "next Friday at 10 AM" be in ISO format?'
    );
    console.log('Parse Response:', parseResponse);
    
    // Test getting access token
    console.log('\n🔑 Testing access token...');
    const tokenResponse = await assistant.processMessage(
      'Get a fresh Google Calendar access token'
    );
    console.log('Token Response:', tokenResponse);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Export for use in testing
export { testCalendarAssistant };

// Run test if called directly
if (require.main === module) {
  testCalendarAssistant().then(() => {
    console.log('🎉 Test completed');
    process.exit(0);
  }).catch(error => {
    console.error('💥 Test error:', error);
    process.exit(1);
  });
}
