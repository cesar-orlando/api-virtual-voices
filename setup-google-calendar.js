/**
 * Google Calendar OAuth Setup Script
 * Run this to complete the OAuth flow and store tokens
 */

const axios = require('axios');
const readline = require('readline');

const BASE_URL = 'http://localhost:3001/api/google-calendar';
const DEFAULT_EMAIL = 'blueage888@gmail.com';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setupGoogleCalendar() {
  console.log('🚀 Google Calendar OAuth Setup');
  console.log('=' .repeat(50));
  
  try {
    // Step 1: Check if server is running
    console.log('1️⃣ Checking server status...');
    await axios.get(`${BASE_URL}/auth-url`);
    console.log('✅ Server is running');
    
    // Step 2: Get authorization URL
    console.log('\n2️⃣ Getting authorization URL...');
    const authResponse = await axios.get(`${BASE_URL}/auth-url`);
    const authUrl = authResponse.data.authUrl;
    
    console.log('✅ Authorization URL generated:');
    console.log(`🔗 ${authUrl}`);
    
    // Step 3: Ask user to complete OAuth
    console.log('\n3️⃣ Complete OAuth Authorization:');
    console.log('📋 Please follow these steps:');
    console.log('   1. Copy the URL above');
    console.log('   2. Open it in your browser');
    console.log('   3. Sign in with Google account: ' + DEFAULT_EMAIL);
    console.log('   4. Grant calendar permissions');
    console.log('   5. Copy the authorization code from the redirect URL');
    console.log('   6. The code appears after "code=" in the URL');
    
    const authCode = await question('\n📝 Enter the authorization code: ');
    
    if (!authCode.trim()) {
      console.log('❌ No authorization code provided. Exiting...');
      rl.close();
      return;
    }
    
    // Step 4: Exchange code for tokens and store them
    console.log('\n4️⃣ Exchanging code for tokens...');
    const tokenResponse = await axios.post(`${BASE_URL}/exchange-token`, {
      code: authCode.trim(),
      email: DEFAULT_EMAIL
    });
    
    if (tokenResponse.data.success) {
      console.log('✅ Tokens obtained and stored successfully!');
      console.log('📧 Email:', DEFAULT_EMAIL);
      console.log('🔒 Access Token:', tokenResponse.data.tokens.access_token ? 'Present' : 'Missing');
      console.log('🔄 Refresh Token:', tokenResponse.data.tokens.refresh_token ? 'Present' : 'Missing');
      console.log('⏰ Expires:', new Date(tokenResponse.data.tokens.expiry_date || 0).toLocaleString());
    } else {
      console.log('❌ Failed to obtain tokens:', tokenResponse.data.message);
      rl.close();
      return;
    }
    
    // Step 5: Verify token storage
    console.log('\n5️⃣ Verifying token storage...');
    const verifyResponse = await axios.get(`${BASE_URL}/token-info?email=${DEFAULT_EMAIL}`);
    
    if (verifyResponse.data.success) {
      console.log('✅ Tokens verified in database!');
      console.log('📊 Token Info:');
      console.log('   - Has Access Token:', verifyResponse.data.tokenInfo.hasAccessToken);
      console.log('   - Has Refresh Token:', verifyResponse.data.tokenInfo.hasRefreshToken);
      console.log('   - Expires:', verifyResponse.data.tokenInfo.expiryDate);
      console.log('   - Is Expired:', verifyResponse.data.tokenInfo.isExpired);
    } else {
      console.log('❌ Token verification failed:', verifyResponse.data.message);
      rl.close();
      return;
    }
    
    // Step 6: Test calendar creation
    console.log('\n6️⃣ Testing calendar event creation...');
    const testEvent = {
      summary: 'OAuth Setup Test Event',
      description: 'This event was created to test the OAuth setup',
      startDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
      endDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(), // Tomorrow + 1 hour
      location: 'Test Location',
      timeZone: 'America/Mexico_City'
    };
    
    const eventResponse = await axios.post(`${BASE_URL}/events-with-auto-token`, testEvent, {
      headers: {
        'Content-Type': 'application/json',
        'X-User-Email': DEFAULT_EMAIL
      }
    });
    
    if (eventResponse.data.success) {
      console.log('✅ Test event created successfully!');
      console.log('📅 Event:', eventResponse.data.event.summary);
      console.log('🔗 Calendar URL:', eventResponse.data.event.htmlLink);
      console.log('⏰ Start:', new Date(eventResponse.data.event.start.dateTime).toLocaleString());
    } else {
      console.log('❌ Test event creation failed:', eventResponse.data.message);
    }
    
    // Success message
    console.log('\n🎉 Setup Complete!');
    console.log('✅ Google Calendar integration is now ready');
    console.log('✅ WhatsApp messages will automatically create calendar events');
    console.log('✅ Tokens will refresh automatically when needed');
    
    console.log('\n📱 Try sending WhatsApp messages like:');
    console.log('   - "Agéndame una reunión mañana a las 2 PM"');
    console.log('   - "Recuérdame mi clase el viernes a las 4"');
    console.log('   - "Programa una cita para el lunes"');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.response?.data || error.message);
  }
  
  rl.close();
}

// Run setup
if (require.main === module) {
  setupGoogleCalendar().catch(console.error);
}

module.exports = { setupGoogleCalendar };
