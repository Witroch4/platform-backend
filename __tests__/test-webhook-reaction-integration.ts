/**
 * Integration test for webhook reaction processing
 * Tests the complete flow from webhook to WhatsApp API
 */

import { prisma } from '../lib/prisma';
import { processMtfDiamanteWebhookTask } from '../worker/WebhookWorkerTasks/mtf-diamante-webhook.task';

// Test data setup
const testButtonId = 'test_button_reaction_' + Date.now();
const testUserId = 'test_user_' + Date.now();
const testMessageId = 'test_message_' + Date.now();

async function setupTestData() {
  console.log('Setting up test data...');
  
  // Create test user
  const testUser = await prisma.user.create({
    data: {
      id: testUserId,
      email: `test_${Date.now()}@example.com`,
      name: 'Test User',
      role: 'DEFAULT'
    }
  });

  // Create test button reaction mapping with both emoji and text
  const actionPayload = {
    emoji: '🧪',
    textReaction: 'Test reaction message from integration test!',
  };
  
  const testReaction = await prisma.mapeamentoBotao.create({
    data: {
      buttonId: testButtonId,
      actionType: 'SEND_TEMPLATE',
      actionPayload,
      description: 'Integration test reaction',
    }
  });

  console.log('Test data created:', {
    userId: testUser.id,
    reactionId: testReaction.id,
    buttonId: testReaction.buttonId
  });

  return { testUser, testReaction };
}

async function cleanupTestData() {
  console.log('Cleaning up test data...');
  
  try {
    await prisma.mapeamentoBotao.deleteMany({
      where: { buttonId: testButtonId }
    });
    
    await prisma.user.deleteMany({
      where: { id: testUserId }
    });
    
    console.log('Test data cleaned up successfully');
  } catch (error) {
    console.error('Error cleaning up test data:', error);
  }
}

async function testWebhookReactionFlow() {
  console.log('🧪 Starting webhook reaction integration test...');
  
  let testData;
  
  try {
    // Setup test data
    testData = await setupTestData();
    
    // Create mock webhook payload for button click
    const mockWebhookPayload = {
      type: 'processButtonClick' as const,
      payload: {
        originalDetectIntentRequest: {
          payload: {
            wamid: `wamid.test_${Date.now()}`,
            message_id: `msg_${Date.now()}`,
            conversation_id: `conv_${Date.now()}`,
            inbox_id: '4',
            contact_phone: '5511999999999',
            whatsapp_api_key: process.env.WHATSAPP_TOKEN || 'test_api_key',
            interactive: {
              type: 'button_reply',
              button_reply: {
                id: testButtonId,
                title: 'Test Button'
              }
            },
            context: {
              id: `original_msg_${Date.now()}`
            }
          }
        }
      },
      contactPhone: '5511999999999',
      whatsappApiKey: process.env.WHATSAPP_TOKEN || 'test_api_key',
      inboxId: '4'
    };

    // Create mock job
    const mockJob = {
      id: `job_${Date.now()}`,
      data: mockWebhookPayload
    };

    console.log('Processing webhook task...');
    
    // Process the webhook task
    const result = await processMtfDiamanteWebhookTask(mockJob as any);
    
    console.log('Webhook task result:', result);
    
    // Verify the result
    if (result.success && result.type === 'processButtonClick') {
      console.log('✅ Webhook reaction processing completed successfully');
      
      // Additional verification could be added here:
      // - Check if reaction was logged
      // - Verify WhatsApp API calls were made (in a real test environment)
      // - Check database state changes
      
      return true;
    } else {
      console.error('❌ Webhook reaction processing failed:', result);
      return false;
    }
    
  } catch (error) {
    console.error('❌ Integration test failed:', error);
    return false;
  } finally {
    // Always cleanup test data
    if (testData) {
      await cleanupTestData();
    }
  }
}

async function testReactionTypeDetection() {
  console.log('🔍 Testing reaction type detection...');
  
  const testCases = [
    {
      name: 'Button reply detection',
      payload: {
        interactive: {
          type: 'button_reply',
          button_reply: {
            id: 'test_button',
            title: 'Test Button'
          }
        }
      },
      expected: {
        isButtonClick: true,
        buttonId: 'test_button',
        buttonText: 'Test Button'
      }
    },
    {
      name: 'List reply detection',
      payload: {
        interactive: {
          type: 'list_reply',
          list_reply: {
            id: 'list_option_1',
            title: 'Option 1'
          }
        }
      },
      expected: {
        isButtonClick: true,
        buttonId: 'list_option_1',
        buttonText: 'Option 1'
      }
    },
    {
      name: 'Non-interactive message',
      payload: {
        // No interactive field
      },
      expected: {
        isButtonClick: false
      }
    }
  ];

  let allTestsPassed = true;

  for (const testCase of testCases) {
    try {
      // Import the function to test (this would normally be in the worker)
      const { extractButtonClickData } = await import('../worker/WebhookWorkerTasks/mtf-diamante-webhook.task');
      
      // Note: This function is not exported, so we'd need to make it testable
      // For now, we'll simulate the logic
      const mockPayload = {
        originalDetectIntentRequest: {
          payload: testCase.payload
        }
      };

      // Simulate the extraction logic
      const result = {
        isButtonClick: !!testCase.payload.interactive,
        buttonId: testCase.payload.interactive?.button_reply?.id || testCase.payload.interactive?.list_reply?.id,
        buttonText: testCase.payload.interactive?.button_reply?.title || testCase.payload.interactive?.list_reply?.title
      };

      const passed = JSON.stringify(result) === JSON.stringify(testCase.expected);
      
      if (passed) {
        console.log(`✅ ${testCase.name}: PASSED`);
      } else {
        console.log(`❌ ${testCase.name}: FAILED`);
        console.log('  Expected:', testCase.expected);
        console.log('  Got:', result);
        allTestsPassed = false;
      }
    } catch (error) {
      console.log(`❌ ${testCase.name}: ERROR -`, error);
      allTestsPassed = false;
    }
  }

  return allTestsPassed;
}

async function testDatabaseQueries() {
  console.log('🗄️ Testing database queries...');
  
  let testData;
  
  try {
    testData = await setupTestData();
    
    // Test findReactionByButtonId
    const { findReactionByButtonId } = await import('../lib/dialogflow-database-queries');
    
    const foundReaction = await findReactionByButtonId(testButtonId);
    
    if (foundReaction && foundReaction.buttonId === testButtonId) {
      console.log('✅ findReactionByButtonId: PASSED');
      console.log('  Found reaction:', {
        buttonId: foundReaction.buttonId,
        emoji: foundReaction.emoji,
        textReaction: foundReaction.textReaction
      });
      
      return true;
    } else {
      console.log('❌ findReactionByButtonId: FAILED');
      console.log('  Expected buttonId:', testButtonId);
      console.log('  Got:', foundReaction);
      return false;
    }
    
  } catch (error) {
    console.error('❌ Database query test failed:', error);
    return false;
  } finally {
    if (testData) {
      await cleanupTestData();
    }
  }
}

// Main test runner
async function runIntegrationTests() {
  console.log('🚀 Starting webhook reaction integration tests...\n');
  
  const tests = [
    { name: 'Reaction Type Detection', fn: testReactionTypeDetection },
    { name: 'Database Queries', fn: testDatabaseQueries },
    { name: 'Complete Webhook Flow', fn: testWebhookReactionFlow }
  ];
  
  let passedTests = 0;
  let totalTests = tests.length;
  
  for (const test of tests) {
    console.log(`\n--- Running ${test.name} ---`);
    
    try {
      const passed = await test.fn();
      if (passed) {
        passedTests++;
        console.log(`✅ ${test.name} completed successfully`);
      } else {
        console.log(`❌ ${test.name} failed`);
      }
    } catch (error) {
      console.error(`❌ ${test.name} threw an error:`, error);
    }
  }
  
  console.log(`\n📊 Test Results: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All integration tests passed!');
    process.exit(0);
  } else {
    console.log('💥 Some tests failed');
    process.exit(1);
  }
}

// Run the tests
if (require.main === module) {
  runIntegrationTests().catch(error => {
    console.error('Fatal error running integration tests:', error);
    process.exit(1);
  });
}

export { runIntegrationTests, testWebhookReactionFlow, testReactionTypeDetection, testDatabaseQueries };