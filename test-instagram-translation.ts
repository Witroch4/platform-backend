/**
 * Test script for Instagram translation functionality
 */

import { detectChannelType } from './lib/webhook-utils';
import { 
  createInstagramTranslationJob,
  addInstagramTranslationJob,
  waitForInstagramTranslationResult,
  generateCorrelationId,
} from './lib/queue/instagram-translation.queue';

// Test channel detection
function testChannelDetection() {
  console.log('Testing channel detection...');
  
  // Test Instagram channel
  const instagramPayload = {
    originalDetectIntentRequest: {
      payload: {
        channel_type: 'Channel::Instagram',
        inbox_id: '4',
        contact_phone: '5511999999999',
        whatsapp_api_key: 'test_key_123',
      }
    },
    queryResult: {
      intent: {
        displayName: 'test.intent'
      }
    }
  };
  
  const instagramResult = detectChannelType(instagramPayload);
  console.log('Instagram detection result:', instagramResult);
  
  // Test WhatsApp channel (non-Instagram)
  const whatsappPayload = {
    originalDetectIntentRequest: {
      payload: {
        channel_type: 'Channel::WhatsApp',
        inbox_id: '4',
        contact_phone: '5511999999999',
        whatsapp_api_key: 'test_key_123',
      }
    },
    queryResult: {
      intent: {
        displayName: 'test.intent'
      }
    }
  };
  
  const whatsappResult = detectChannelType(whatsappPayload);
  console.log('WhatsApp detection result:', whatsappResult);
  
  // Test invalid payload
  const invalidResult = detectChannelType(null);
  console.log('Invalid payload result:', invalidResult);
}

// Test job creation
function testJobCreation() {
  console.log('Testing job creation...');
  
  const correlationId = generateCorrelationId();
  console.log('Generated correlation ID:', correlationId);
  
  const jobData = createInstagramTranslationJob({
    intentName: 'test.intent',
    inboxId: '4',
    contactPhone: '5511999999999',
    conversationId: 'conv_123',
    originalPayload: { test: 'payload' },
    correlationId,
  });
  
  console.log('Created job data:', jobData);
}

// Run tests
async function runTests() {
  try {
    console.log('=== Instagram Translation Tests ===\n');
    
    testChannelDetection();
    console.log('\n');
    
    testJobCreation();
    console.log('\n');
    
    console.log('All tests completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run if executed directly
if (require.main === module) {
  runTests();
}

export { runTests };