/**
 * Direct Handler Test - Simulates real WhatsApp messages through handleIncomingMessage
 */

import { handleIncomingMessage } from './src/services/whatsapp/handlers';

// Mock Message class to simulate WhatsApp message structure
class MockMessage {
  constructor(body, from, to, fromMe = false) {
    this.body = body;
    this.from = from;
    this.to = to;
    this.fromMe = fromMe;
    this.isStatus = false;
    this.hasQuotedMsg = false;
    this.type = 'chat';
    this.timestamp = Date.now();
  }

  async getQuotedMessage() {
    return null;
  }
}

// Mock Client class to simulate WhatsApp client
class MockClient {
  constructor() {
    this.sentMessages = [];
  }

  async sendMessage(to, message) {
    console.log(`\n📤 [MOCK CLIENT] Sending WhatsApp message to ${to}:`);
    console.log(`📝 Message: ${message}`);
    
    const sentMessage = {
      id: `mock_${Date.now()}`,
      body: message,
      to: to,
      timestamp: Date.now()
    };
    
    this.sentMessages.push(sentMessage);
    return sentMessage;
  }

  getSentMessages() {
    return this.sentMessages;
  }

  clearSentMessages() {
    this.sentMessages = [];
  }
}

async function testDirectHandlerCall() {
  console.log('🧪 Testing Direct WhatsApp Handler Call for Calendar Events');
  console.log('=========================================================\n');

  const mockClient = new MockClient();
  
  // Test calendar message
  const calendarTestMessage = new MockMessage(
    "Crear una cita para mañana a las 2pm con el cliente",
    "+1234567890@c.us",  // from user
    "+14155238886@c.us"  // to bot
  );

  console.log('📋 Test Setup:');
  console.log(`• Company: quicklearning`);
  console.log(`• Session: default`);
  console.log(`• From: ${calendarTestMessage.from}`);
  console.log(`• To: ${calendarTestMessage.to}`);
  console.log(`• Message: "${calendarTestMessage.body}"`);
  console.log(`• Is Calendar Message: YES 📅`);

  try {
    console.log('\n🚀 Calling handleIncomingMessage...');
    console.log('==========================================');
    
    await handleIncomingMessage(
      calendarTestMessage,
      mockClient,
      'VirtualVoices', // company
      'default'        // sessionName
    );
    
    console.log('\n✅ Handler call completed successfully!');
    
    // Check if any messages were sent by the mock client
    const sentMessages = mockClient.getSentMessages();
    console.log(`\n📊 Results Summary:`);
    console.log(`• Messages sent by bot: ${sentMessages.length}`);
    
    if (sentMessages.length > 0) {
      console.log(`\n📤 Bot Responses:`);
      sentMessages.forEach((msg, index) => {
        console.log(`${index + 1}. To: ${msg.to}`);
        console.log(`   Message: ${msg.body.substring(0, 100)}${msg.body.length > 100 ? '...' : ''}`);
      });
    }
    
    return true;
    
  } catch (error) {
    console.error('\n❌ Handler call failed:');
    console.error(`Error: ${error.message}`);
    console.error(`Type: ${error.constructor.name}`);
    
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    
    return false;
  }
}

async function testMultipleCalendarMessages() {
  console.log('\n\n🧪 Testing Multiple Calendar Message Types');
  console.log('==========================================\n');

  const mockClient = new MockClient();
  
  const testCases = [
    {
      message: "Crear una cita para mañana a las 2pm con el cliente",
      description: "Create appointment - Spanish"
    },
    {
      message: "Necesito agendar una reunión para el viernes a las 3pm",
      description: "Schedule meeting - Spanish"
    },
    {
      message: "Can you schedule a meeting for tomorrow at 10am?",
      description: "Schedule meeting - English"
    },
    {
      message: "Cancelar mi cita del martes próximo",
      description: "Cancel appointment - Spanish"
    }
  ];

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`\n--- Test ${i + 1}: ${testCase.description} ---`);
    
    const message = new MockMessage(
      testCase.message,
      `+123456789${i}@c.us`,
      "+14155238886@c.us"
    );

    console.log(`📝 Message: "${testCase.message}"`);
    
    try {
      await handleIncomingMessage(message, mockClient, 'quicklearning', 'default');
      console.log(`✅ Test ${i + 1} completed`);
      
      // Add delay between tests to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`❌ Test ${i + 1} failed: ${error.message}`);
    }
  }
  
  console.log(`\n📊 Total messages sent by bot: ${mockClient.getSentMessages().length}`);
}

// Main execution
async function runTests() {
  console.log('🎯 Starting WhatsApp Calendar Handler Tests');
  console.log('===========================================\n');
  
  try {
    // Test 1: Single calendar message
    const test1Success = await testDirectHandlerCall();
    
    if (test1Success) {
      // Test 2: Multiple calendar messages
      await testMultipleCalendarMessages();
    }
    
    console.log('\n🏁 All tests completed!');
    console.log('\n💡 Tips for verification:');
    console.log('• Check server logs for calendar detection messages');
    console.log('• Look for Calendar Assistant initialization');
    console.log('• Verify Google Calendar API calls are made');
    console.log('• Check if actual calendar events are created');
    
  } catch (error) {
    console.error('\n💥 Test execution failed:', error);
  }
}

// Export for use in other scripts
export { testDirectHandlerCall, testMultipleCalendarMessages, MockMessage, MockClient };

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}
