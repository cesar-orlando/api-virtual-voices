/**
 * Test script for Google Calendar Auto-Refresh Token functionality
 * 
 * This script demonstrates how to:
 * 1. Store tokens initially
 * 2. Use auto-refresh endpoint
 * 3. Manually refresh tokens
 * 4. Check token status
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3001/api/google-calendar';
const TEST_EMAIL = process.env.GOOGLE_CALENDAR_DEFAULT_EMAIL || 'blueage888@gmail.com';

// Test functions
async function testTokenInfo() {
  console.log('\n🔍 Testing token info...');
  try {
    const response = await axios.get(`${BASE_URL}/token-info`, {
      params: { email: TEST_EMAIL }
    });
    console.log('✅ Token info:', response.data);
    return response.data;
  } catch (error) {
    console.log('❌ Token info error:', error.response?.data || error.message);
    return null;
  }
}

async function testManualRefresh() {
  console.log('\n🔄 Testing manual token refresh...');
  try {
    const response = await axios.post(`${BASE_URL}/refresh-token`, {
      email: TEST_EMAIL
    });
    console.log('✅ Manual refresh success:', response.data);
    return response.data;
  } catch (error) {
    console.log('❌ Manual refresh error:', error.response?.data || error.message);
    return null;
  }
}

async function testAutoRefreshEvent() {
  console.log('\n📅 Testing auto-refresh event creation...');
  
  // Create event for tomorrow at 2 PM
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(14, 0, 0, 0);
  
  const eventEnd = new Date(tomorrow);
  eventEnd.setHours(15, 0, 0, 0);
  
  try {
    const response = await axios.post(`${BASE_URL}/events-with-auto-token`, {
      summary: 'Auto-Refresh Test Event',
      description: 'Testing automatic token refresh functionality',
      startDateTime: tomorrow.toISOString(),
      endDateTime: eventEnd.toISOString(),
      timeZone: 'America/Mexico_City'
    }, {
      headers: {
        'X-User-Email': TEST_EMAIL,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Event created with auto-refresh:', {
      id: response.data.event?.id,
      summary: response.data.event?.summary,
      htmlLink: response.data.event?.htmlLink,
      start: response.data.event?.start,
      end: response.data.event?.end
    });
    return response.data;
  } catch (error) {
    console.log('❌ Auto-refresh event error:', error.response?.data || error.message);
    return null;
  }
}

async function storeTestTokens(tokens) {
  console.log('\n💾 Storing test tokens...');
  try {
    const response = await axios.post(`${BASE_URL}/store-tokens`, {
      email: TEST_EMAIL,
      ...tokens
    });
    console.log('✅ Tokens stored:', response.data);
    return response.data;
  } catch (error) {
    console.log('❌ Store tokens error:', error.response?.data || error.message);
    return null;
  }
}

// Main test function
async function runTests() {
  console.log('🚀 Starting Google Calendar Auto-Refresh Tests');
  console.log(`📧 Using email: ${TEST_EMAIL}`);
  console.log(`🌐 Base URL: ${BASE_URL}`);
  
  // Step 1: Check current token status
  const tokenInfo = await testTokenInfo();
  
  if (!tokenInfo || !tokenInfo.success) {
    console.log('\n⚠️  No tokens found. Please complete OAuth flow first:');
    console.log(`   1. Go to: ${BASE_URL}/auth-url`);
    console.log(`   2. Complete authorization`);
    console.log(`   3. Use the /exchange-code endpoint with your email`);
    console.log(`   4. Or manually store tokens using /store-tokens endpoint`);
    return;
  }
  
  // Step 2: Test manual refresh (if refresh token available)
  if (tokenInfo.tokenInfo?.hasRefreshToken) {
    await testManualRefresh();
  } else {
    console.log('\n⚠️  No refresh token available for manual refresh test');
  }
  
  // Step 3: Test auto-refresh event creation
  await testAutoRefreshEvent();
  
  // Step 4: Check token status again
  await testTokenInfo();
  
  console.log('\n🎉 Tests completed!');
}

// Run if called directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  testTokenInfo,
  testManualRefresh,
  testAutoRefreshEvent,
  storeTestTokens,
  runTests
};
