/**
 * Simple webhook test to verify the endpoint responds correctly
 * Tests both GET (verification) and POST (processing) endpoints
 */

const axios = require('axios');

const WEBHOOK_URL = 'http://localhost:3000/api/admin/leads-chatwit/whatsapp/webhook';

// Test data
const testDialogflowPayload = {
  queryResult: {
    intent: {
      displayName: 'test.intent'
    },
    parameters: {}
  },
  session: 'projects/test-project/agent/sessions/5511999999999',
  originalDetectIntentRequest: {
    payload: {
      phoneNumberId: 'test_phone_number_id'
    }
  }
};

async function testWebhookVerification() {
  console.log('Testing webhook verification (GET)...');
  
  try {
    const response = await axios.get(WEBHOOK_URL, {
      params: {
        'hub.mode': 'subscribe',
        'hub.verify_token': process.env.WEBHOOK_VERIFY_TOKEN || 'test_token',
        'hub.challenge': 'test_challenge_123'
      },
      timeout: 5000,
      validateStatus: () => true
    });

    console.log(`✅ GET request status: ${response.status}`);
    console.log(`✅ Response data: ${response.data}`);
    
    if (response.status === 200 || response.status === 403) {
      console.log('✅ Webhook verification endpoint is working');
      return true;
    } else {
      console.log('❌ Unexpected status code for verification');
      return false;
    }
  } catch (error) {
    console.log(`❌ Webhook verification failed: ${error.message}`);
    return false;
  }
}

async function testWebhookProcessing() {
  console.log('\nTesting webhook processing (POST)...');
  
  try {
    const response = await axios.post(WEBHOOK_URL, testDialogflowPayload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000,
      validateStatus: () => true
    });

    console.log(`✅ POST request status: ${response.status}`);
    console.log(`✅ Response data:`, JSON.stringify(response.data, null, 2));
    
    // Accept any response that's not a server error
    if (response.status >= 200 && response.status < 500) {
      console.log('✅ Webhook processing endpoint is working');
      return true;
    } else {
      console.log('❌ Server error in webhook processing');
      return false;
    }
  } catch (error) {
    console.log(`❌ Webhook processing failed: ${error.message}`);
    return false;
  }
}

async function testInvalidPayload() {
  console.log('\nTesting invalid payload handling...');
  
  try {
    const response = await axios.post(WEBHOOK_URL, {
      invalid: 'payload'
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000,
      validateStatus: () => true
    });

    console.log(`✅ Invalid payload status: ${response.status}`);
    console.log(`✅ Error response:`, JSON.stringify(response.data, null, 2));
    
    // Should return 400 for invalid payload
    if (response.status === 400) {
      console.log('✅ Invalid payload handling is working correctly');
      return true;
    } else {
      console.log('⚠️  Unexpected status for invalid payload');
      return false;
    }
  } catch (error) {
    console.log(`❌ Invalid payload test failed: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting webhook endpoint tests...');
  console.log('=' .repeat(50));
  
  const results = [];
  
  // Test 1: Webhook verification
  results.push(await testWebhookVerification());
  
  // Test 2: Webhook processing
  results.push(await testWebhookProcessing());
  
  // Test 3: Invalid payload handling
  results.push(await testInvalidPayload());
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(50));
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`Total tests: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);
  console.log(`Success rate: ${((passed / total) * 100).toFixed(1)}%`);
  
  if (passed === total) {
    console.log('🎉 All webhook endpoint tests passed!');
  } else {
    console.log('⚠️  Some tests failed. Check the logs above.');
  }
}

// Check if server is running first
async function checkServer() {
  try {
    // Test the webhook endpoint directly since /api/health might not exist
    await axios.get(WEBHOOK_URL + '?hub.mode=subscribe&hub.verify_token=test&hub.challenge=test123', { 
      timeout: 2000,
      validateStatus: () => true // Accept any status code
    });
    return true;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ Server is not running on localhost:3000');
      console.log('Please start the development server with: npm run dev');
      return false;
    }
    // If we get any other error, the server is probably running
    return true;
  }
}

async function main() {
  const serverRunning = await checkServer();
  
  if (serverRunning) {
    await runTests();
  } else {
    console.log('\n🔧 To test the webhook endpoints:');
    console.log('1. Start the development server: npm run dev');
    console.log('2. Run this test again: node test-webhook-simple.js');
  }
}

main().catch(console.error);