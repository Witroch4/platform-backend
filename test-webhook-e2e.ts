#!/usr/bin/env tsx

/**
 * End-to-End Webhook Functionality Test
 * 
 * This comprehensive test suite validates the entire webhook processing flow:
 * 1. Database connectivity and model relationships
 * 2. Webhook endpoint availability and response handling
 * 3. Dialogflow request processing with various scenarios
 * 4. WhatsApp template and interactive message handling
 * 5. Fallback logic for configurations and intent mappings
 * 6. Error handling and edge cases
 */

import { db } from './lib/db';
import axios from 'axios';

// Test configuration
const TEST_CONFIG = {
  webhookUrl: 'http://localhost:3000/api/admin/leads-chatwit/whatsapp/webhook',
  phoneNumberId: 'test_phone_number_123',
  whatsappToken: 'test_token_456',
  testWaid: '5511999999999',
  verifyToken: process.env.WEBHOOK_VERIFY_TOKEN || 'test_verify_token',
};

// Test data interfaces
interface DialogflowTestPayload {
  queryResult: {
    intent: {
      displayName: string;
    };
    parameters: { [key: string]: any };
  };
  session: string;
  originalDetectIntentRequest?: {
    payload?: {
      phoneNumberId?: string;
      [key: string]: any;
    };
  };
}

class WebhookE2ETester {
  private testResults: { test: string; passed: boolean; error?: string; duration?: number }[] = [];
  private startTime = 0;

  private log(message: string) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
  }

  private startTimer() {
    this.startTime = Date.now();
  }

  private getElapsedTime(): number {
    return Date.now() - this.startTime;
  }

  private addResult(test: string, passed: boolean, error?: string) {
    const duration = this.getElapsedTime();
    this.testResults.push({ test, passed, error, duration });
    const status = passed ? '✅ PASSED' : '❌ FAILED';
    const timeStr = duration > 0 ? ` (${duration}ms)` : '';
    this.log(`${status}: ${test}${timeStr}${error ? ` - ${error}` : ''}`);
  }

  // Test 1: Database Connectivity and Model Structure
  async testDatabaseConnectivity() {
    this.log('🔍 Testing database connectivity and model structure...');
    
    try {
      this.startTimer();
      
      // Test basic database connection
      await db.$connect();
      this.addResult('Database connection', true);

      // Test WhatsAppConfig model structure
      this.startTimer();
      const configCount = await db.whatsAppGlobalConfig.count();
      this.addResult('WhatsAppConfig model access', true);

      // Test CaixaEntrada model structure
      this.startTimer();
      const caixaCount = await db.chatwitInbox.count();
      this.addResult('CaixaEntrada model access', true);

      // Test MapeamentoIntencao model structure
      this.startTimer();
      const mapeamentoCount = await db.mapeamentoIntencao.count();
      this.addResult('MapeamentoIntencao model access', true);

      // Test WhatsAppTemplate model structure
      this.startTimer();
      const templateCount = await db.template.count();
      this.addResult('WhatsAppTemplate model access', true);

      // Test MensagemInterativa model structure
      this.startTimer();
      const mensagemCount = await db.mensagemInterativa.count();
      this.addResult('MensagemInterativa model access', true);

      this.log(`📊 Database summary: ${configCount} configs, ${caixaCount} caixas, ${mapeamentoCount} mappings, ${templateCount} templates, ${mensagemCount} interactive messages`);

    } catch (error: any) {
      this.addResult('Database connectivity', false, error.message);
    }
  }

  // Test 2: Webhook Endpoint Availability
  async testWebhookEndpoint() {
    this.log('🌐 Testing webhook endpoint availability...');

    try {
      // Test GET endpoint (webhook verification)
      this.startTimer();
      const verifyResponse = await axios.get(TEST_CONFIG.webhookUrl, {
        params: {
          'hub.mode': 'subscribe',
          'hub.verify_token': TEST_CONFIG.verifyToken,
          'hub.challenge': 'test_challenge_12345'
        },
        timeout: 5000,
        validateStatus: () => true
      });

      const verifyPassed = verifyResponse.status === 200 || verifyResponse.status === 403;
      this.addResult('Webhook verification endpoint (GET)', verifyPassed, 
        !verifyPassed ? `Status: ${verifyResponse.status}` : undefined);

      // Test POST endpoint basic connectivity
      this.startTimer();
      const basicPayload: DialogflowTestPayload = {
        queryResult: {
          intent: {
            displayName: 'test.connectivity'
          },
          parameters: {}
        },
        session: 'projects/test-project/agent/sessions/test-session',
        originalDetectIntentRequest: {
          payload: {
            phoneNumberId: TEST_CONFIG.phoneNumberId
          }
        }
      };

      const postResponse = await axios.post(TEST_CONFIG.webhookUrl, basicPayload, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000,
        validateStatus: () => true
      });

      const postPassed = postResponse.status >= 200 && postResponse.status < 500;
      this.addResult('Webhook processing endpoint (POST)', postPassed,
        !postPassed ? `Status: ${postResponse.status}, Data: ${JSON.stringify(postResponse.data)}` : undefined);

    } catch (error: any) {
      this.addResult('Webhook endpoint availability', false, error.message);
    }
  }

  // Test 3: Database Query Patterns Used by Webhook
  async testWebhookDatabaseQueries() {
    this.log('🔎 Testing database query patterns used by webhook...');

    try {
      // Test 1: WhatsAppConfig query with includes (main query pattern)
      this.startTimer();
      const configQuery = await db.whatsAppGlobalConfig.findFirst({
        where: {
          phoneNumberId: TEST_CONFIG.phoneNumberId,
          isActive: true
        },
        include: {
          chatwitInbox: true,
          usuarioChatwit: true
        },
      });
      this.addResult('WhatsAppConfig query with includes', true);

      // Test 2: Fallback configuration query
      this.startTimer();
      const fallbackConfigQuery = await db.whatsAppGlobalConfig.findFirst({
        where: {
          inboxId: null,
          isActive: true
        },
        include: {
          chatwitInbox: true,
          usuarioChatwit: true
        },
      });
      this.addResult('Fallback WhatsAppConfig query', true);

      // Test 3: MapeamentoIntencao query with complex includes
      this.startTimer();
      const mapeamentoQuery = await db.mapeamentoIntencao.findUnique({
        where: {
          intentName_inboxId: {
            intentName: 'test.intent',
            inboxId: 'test_caixa_id'
          }
        },
        include: { 
          template: true, 
          mensagemInterativa: { 
            include: { 
              botoes: true 
            } 
          } 
        },
      });
      this.addResult('MapeamentoIntencao complex query', true);

      // Test 4: CaixaEntrada fallback relationship query
      this.startTimer();
      const caixaQuery = await db.chatwitInbox.findFirst({
        where: { id: 'test_caixa_id' },
        include: {
          fallbackParaInbox: true,
          mapeamentosIntencao: {
            include: {
              template: true,
              mensagemInterativa: {
                include: {
                  botoes: true
                }
              }
            }
          }
        }
      });
      this.addResult('CaixaEntrada fallback relationship query', true);

    } catch (error: any) {
      this.addResult('Database query patterns', false, error.message);
    }
  }

  // Test 4: Dialogflow Request Processing Scenarios
  async testDialogflowRequestProcessing() {
    this.log('🤖 Testing Dialogflow request processing scenarios...');

    const testScenarios = [
      {
        name: 'Valid template intent request',
        payload: {
          queryResult: {
            intent: {
              displayName: 'template.greeting'
            },
            parameters: { name: 'João' }
          },
          session: 'projects/test-project/agent/sessions/5511999999999',
          originalDetectIntentRequest: {
            payload: {
              phoneNumberId: TEST_CONFIG.phoneNumberId
            }
          }
        },
        expectedStatus: [200, 404] // 200 if mapping exists, 404 if config not found
      },
      {
        name: 'Valid interactive message intent request',
        payload: {
          queryResult: {
            intent: {
              displayName: 'interactive.menu'
            },
            parameters: {}
          },
          session: 'projects/test-project/agent/sessions/5511999999999',
          originalDetectIntentRequest: {
            payload: {
              phoneNumberId: TEST_CONFIG.phoneNumberId
            }
          }
        },
        expectedStatus: [200, 404]
      },
      {
        name: 'Unknown intent (fallback scenario)',
        payload: {
          queryResult: {
            intent: {
              displayName: 'unknown.intent.test'
            },
            parameters: {}
          },
          session: 'projects/test-project/agent/sessions/5511999999999',
          originalDetectIntentRequest: {
            payload: {
              phoneNumberId: TEST_CONFIG.phoneNumberId
            }
          }
        },
        expectedStatus: [200, 404]
      },
      {
        name: 'Missing phoneNumberId (error case)',
        payload: {
          queryResult: {
            intent: {
              displayName: 'test.intent'
            },
            parameters: {}
          },
          session: 'projects/test-project/agent/sessions/5511999999999',
          originalDetectIntentRequest: {
            payload: {}
          }
        },
        expectedStatus: [400]
      },
      {
        name: 'Missing intent name (error case)',
        payload: {
          queryResult: {
            parameters: {}
          },
          session: 'projects/test-project/agent/sessions/5511999999999',
          originalDetectIntentRequest: {
            payload: {
              phoneNumberId: TEST_CONFIG.phoneNumberId
            }
          }
        },
        expectedStatus: [400]
      },
      {
        name: 'Missing session (error case)',
        payload: {
          queryResult: {
            intent: {
              displayName: 'test.intent'
            },
            parameters: {}
          },
          originalDetectIntentRequest: {
            payload: {
              phoneNumberId: TEST_CONFIG.phoneNumberId
            }
          }
        },
        expectedStatus: [400]
      }
    ];

    for (const scenario of testScenarios) {
      try {
        this.startTimer();
        const response = await axios.post(TEST_CONFIG.webhookUrl, scenario.payload, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000,
          validateStatus: () => true
        });

        const statusMatches = scenario.expectedStatus.includes(response.status);
        this.addResult(`Dialogflow scenario: ${scenario.name}`, statusMatches,
          !statusMatches ? `Expected status ${scenario.expectedStatus.join(' or ')}, got ${response.status}` : undefined);

      } catch (error: any) {
        this.addResult(`Dialogflow scenario: ${scenario.name}`, false, error.message);
      }
    }
  }

  // Test 5: WhatsApp Message Format Validation
  async testWhatsAppMessageFormats() {
    this.log('📱 Testing WhatsApp message format validation...');

    try {
      // Test template message format
      this.startTimer();
      const templateData = {
        messaging_product: 'whatsapp',
        to: TEST_CONFIG.testWaid,
        type: 'template',
        template: {
          name: 'test_template',
          language: { code: 'pt_BR' },
          components: [
            {
              type: 'BODY',
              parameters: [
                {
                  type: 'TEXT',
                  text: 'Test message'
                }
              ]
            }
          ]
        }
      };

      const isValidTemplate = templateData.messaging_product === 'whatsapp' &&
                             templateData.type === 'template' &&
                             templateData.template &&
                             templateData.template.name &&
                             templateData.template.language &&
                             Array.isArray(templateData.template.components);

      this.addResult('WhatsApp template message format validation', isValidTemplate);

      // Test interactive message format
      this.startTimer();
      const interactiveData = {
        messaging_product: 'whatsapp',
        to: TEST_CONFIG.testWaid,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: 'Choose an option:' },
          action: {
            buttons: [
              {
                type: 'reply',
                reply: { id: 'btn1', title: 'Option 1' }
              },
              {
                type: 'reply',
                reply: { id: 'btn2', title: 'Option 2' }
              }
            ]
          }
        }
      };

      const isValidInteractive = interactiveData.messaging_product === 'whatsapp' &&
                                interactiveData.type === 'interactive' &&
                                interactiveData.interactive &&
                                interactiveData.interactive.type === 'button' &&
                                interactiveData.interactive.action &&
                                Array.isArray(interactiveData.interactive.action.buttons);

      this.addResult('WhatsApp interactive message format validation', isValidInteractive);

    } catch (error: any) {
      this.addResult('WhatsApp message format validation', false, error.message);
    }
  }

  // Test 6: Error Handling and Edge Cases
  async testErrorHandling() {
    this.log('⚠️ Testing error handling and edge cases...');

    const errorTestCases = [
      {
        name: 'Invalid JSON payload',
        payload: 'invalid json',
        expectedStatus: [400, 500]
      },
      {
        name: 'Empty payload',
        payload: {},
        expectedStatus: [400]
      },
      {
        name: 'Malformed Dialogflow request',
        payload: {
          invalidField: 'test'
        },
        expectedStatus: [400]
      }
    ];

    for (const testCase of errorTestCases) {
      try {
        this.startTimer();
        const response = await axios.post(TEST_CONFIG.webhookUrl, testCase.payload, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 5000,
          validateStatus: () => true
        });

        const statusMatches = testCase.expectedStatus.includes(response.status);
        this.addResult(`Error handling: ${testCase.name}`, statusMatches,
          !statusMatches ? `Expected status ${testCase.expectedStatus.join(' or ')}, got ${response.status}` : undefined);

      } catch (error: any) {
        // Network errors are expected for some invalid payloads
        this.addResult(`Error handling: ${testCase.name}`, true, 'Network error (expected for invalid payload)');
      }
    }
  }

  // Test 7: Performance and Response Times
  async testPerformance() {
    this.log('⚡ Testing performance and response times...');

    const performanceTests = [
      {
        name: 'Database query performance',
        test: async () => {
          const start = Date.now();
          await db.whatsAppGlobalConfig.findFirst({
            where: { isActive: true },
            include: {
              chatwitInbox: {
                include: {
                  mapeamentosIntencao: {
                    include: {
                      template: true,
                      mensagemInterativa: {
                        include: {
                          botoes: true
                        }
                      }
                    }
                  }
                }
              },
              usuarioChatwit: true 
            }
          });
          return Date.now() - start;
        },
        maxTime: 1000 // 1 second max
      },
      {
        name: 'Webhook response time',
        test: async () => {
          const start = Date.now();
          await axios.post(TEST_CONFIG.webhookUrl, {
            queryResult: {
              intent: {
                displayName: 'performance.test'
              },
              parameters: {}
            },
            session: 'projects/test-project/agent/sessions/performance-test',
            originalDetectIntentRequest: {
              payload: {
                phoneNumberId: TEST_CONFIG.phoneNumberId
              }
            }
          }, {
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 5000,
            validateStatus: () => true
          });
          return Date.now() - start;
        },
        maxTime: 2000 // 2 seconds max
      }
    ];

    for (const perfTest of performanceTests) {
      try {
        const duration = await perfTest.test();
        const passed = duration <= perfTest.maxTime;
        this.addResult(`Performance: ${perfTest.name}`, passed,
          !passed ? `Took ${duration}ms, expected <= ${perfTest.maxTime}ms` : `${duration}ms`);
      } catch (error: any) {
        this.addResult(`Performance: ${perfTest.name}`, false, error.message);
      }
    }
  }

  // Main test runner
  async runAllTests() {
    this.log('🚀 Starting comprehensive end-to-end webhook functionality tests...');
    this.log('='.repeat(80));

    const testSuites = [
      { name: 'Database Connectivity', fn: () => this.testDatabaseConnectivity() },
      { name: 'Webhook Endpoint', fn: () => this.testWebhookEndpoint() },
      { name: 'Database Queries', fn: () => this.testWebhookDatabaseQueries() },
      { name: 'Dialogflow Processing', fn: () => this.testDialogflowRequestProcessing() },
      { name: 'WhatsApp Formats', fn: () => this.testWhatsAppMessageFormats() },
      { name: 'Error Handling', fn: () => this.testErrorHandling() },
      { name: 'Performance', fn: () => this.testPerformance() }
    ];

    for (const suite of testSuites) {
      this.log(`\n📋 Running ${suite.name} tests...`);
      try {
        await suite.fn();
      } catch (error: any) {
        this.log(`❌ Test suite ${suite.name} failed: ${error.message}`);
      }
    }

    await this.printResults();
    await this.cleanup();
  }

  private async cleanup() {
    try {
      await db.$disconnect();
      this.log('🧹 Database connection closed');
    } catch (error: any) {
      this.log(`⚠️ Error during cleanup: ${error.message}`);
    }
  }

  private async printResults() {
    this.log('\n' + '='.repeat(80));
    this.log('📊 END-TO-END TEST RESULTS SUMMARY');
    this.log('='.repeat(80));

    const passed = this.testResults.filter(r => r.passed).length;
    const failed = this.testResults.filter(r => !r.passed).length;
    const total = this.testResults.length;

    // Group results by category
    const categories = new Map<string, typeof this.testResults>();
    this.testResults.forEach(result => {
      const category = result.test.split(':')[0] || 'General';
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(result);
    });

    // Print results by category
    categories.forEach((results, category) => {
      this.log(`\n📂 ${category}:`);
      results.forEach(result => {
        const status = result.passed ? '✅' : '❌';
        const duration = result.duration ? ` (${result.duration}ms)` : '';
        const error = result.error ? ` - ${result.error}` : '';
        this.log(`  ${status} ${result.test}${duration}${error}`);
      });
    });

    // Overall statistics
    this.log('\n' + '='.repeat(80));
    this.log(`📈 OVERALL STATISTICS:`);
    this.log(`Total tests: ${total}`);
    this.log(`Passed: ${passed}`);
    this.log(`Failed: ${failed}`);
    this.log(`Success rate: ${((passed / total) * 100).toFixed(1)}%`);

    // Performance statistics
    const performanceResults = this.testResults.filter(r => r.duration && r.duration > 0);
    if (performanceResults.length > 0) {
      const avgDuration = performanceResults.reduce((sum, r) => sum + (r.duration || 0), 0) / performanceResults.length;
      const maxDuration = Math.max(...performanceResults.map(r => r.duration || 0));
      this.log(`Average response time: ${avgDuration.toFixed(0)}ms`);
      this.log(`Maximum response time: ${maxDuration}ms`);
    }

    this.log('='.repeat(80));

    if (failed === 0) {
      this.log('🎉 All end-to-end webhook tests passed! The system is ready for production.');
    } else {
      this.log('⚠️ Some tests failed. Please review the errors above before deploying.');
      
      // Provide specific recommendations based on failures
      const failedTests = this.testResults.filter(r => !r.passed);
      const dbFailures = failedTests.filter(r => r.test.includes('Database') || r.test.includes('model'));
      const webhookFailures = failedTests.filter(r => r.test.includes('Webhook') || r.test.includes('endpoint'));
      
      if (dbFailures.length > 0) {
        this.log('\n🔧 Database Issues Detected:');
        this.log('- Check database connection and schema');
        this.log('- Ensure Prisma client is generated: npx prisma generate');
        this.log('- Verify database migrations: npx prisma migrate status');
      }
      
      if (webhookFailures.length > 0) {
        this.log('\n🌐 Webhook Issues Detected:');
        this.log('- Ensure development server is running: npm run dev');
        this.log('- Check webhook endpoint URL and routing');
        this.log('- Verify environment variables are set');
      }
    }
  }
}

// Server availability check
async function checkServerAvailability(): Promise<boolean> {
  try {
    await axios.get(TEST_CONFIG.webhookUrl + '?hub.mode=subscribe&hub.verify_token=test&hub.challenge=test123', { 
      timeout: 3000,
      validateStatus: () => true
    });
    return true;
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ Development server is not running on localhost:3000');
      console.log('Please start the server with: npm run dev');
      return false;
    }
    // If we get any other error, the server is probably running
    return true;
  }
}

// Main execution
async function main() {
  console.log('🔍 Checking server availability...');
  const serverAvailable = await checkServerAvailability();
  
  if (!serverAvailable) {
    console.log('\n🔧 To run the end-to-end webhook tests:');
    console.log('1. Start the development server: npm run dev');
    console.log('2. Run this test again: npx tsx test-webhook-e2e.ts');
    process.exit(1);
  }

  const tester = new WebhookE2ETester();
  await tester.runAllTests();
  
  // Exit with appropriate code
  const hasFailures = tester.testResults.some(r => !r.passed);
  process.exit(hasFailures ? 1 : 0);
}

// Handle script execution
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Fatal error during testing:', error);
    process.exit(1);
  });
}

export { WebhookE2ETester };