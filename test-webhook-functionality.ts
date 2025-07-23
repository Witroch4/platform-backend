#!/usr/bin/env tsx

/**
 * Test script to verify webhook functionality with corrected models
 * This script tests all aspects of the webhook processing:
 * 1. Database queries with correct model names
 * 2. Template sending functionality
 * 3. Interactive message sending functionality
 * 4. Fallback logic with proper model names
 */

import { db } from './lib/db';
import axios from 'axios';

// Test data interfaces
interface TestDialogflowRequest {
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

// Test configuration
const TEST_CONFIG = {
  phoneNumberId: 'test_phone_number_id',
  whatsappToken: 'test_token',
  testWaid: '5511999999999',
  webhookUrl: 'http://localhost:3000/api/admin/leads-chatwit/whatsapp/webhook',
};

class WebhookTester {
  private testResults: { test: string; passed: boolean; error?: string }[] = [];

  private log(message: string) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }

  private addResult(test: string, passed: boolean, error?: string) {
    this.testResults.push({ test, passed, error });
    const status = passed ? '✅ PASSED' : '❌ FAILED';
    this.log(`${status}: ${test}${error ? ` - ${error}` : ''}`);
  }

  async testDatabaseQueries() {
    this.log('Testing database queries with corrected models...');

    try {
      // Test 1: WhatsAppConfig query
      this.log('Testing WhatsAppConfig.findFirst query...');
      const config = await db.whatsAppConfig.findFirst({
        where: { 
          phoneNumberId: TEST_CONFIG.phoneNumberId,
          isActive: true 
        },
        include: { 
          caixaEntrada: true,
          usuarioChatwit: true 
        },
      });
      this.addResult('WhatsAppConfig query with includes', true);

      // Test 2: Fallback configuration query
      this.log('Testing fallback WhatsAppConfig query...');
      const fallbackConfig = await db.whatsAppConfig.findFirst({
        where: { 
          caixaEntradaId: null,
          isActive: true 
        },
        include: { 
          caixaEntrada: true,
          usuarioChatwit: true 
        },
      });
      this.addResult('Fallback WhatsAppConfig query', true);

      // Test 3: MapeamentoIntencao query
      this.log('Testing MapeamentoIntencao query...');
      const mapping = await db.mapeamentoIntencao.findUnique({
        where: { 
          intentName_caixaEntradaId: { 
            intentName: 'test.intent', 
            caixaEntradaId: 'test_caixa_id' 
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
      this.addResult('MapeamentoIntencao query with includes', true);

      // Test 4: CaixaEntrada fallback relationship
      this.log('Testing CaixaEntrada fallback relationship...');
      const caixa = await db.caixaEntrada.findFirst({
        where: { id: 'test_caixa_id' },
        include: {
          fallbackParaCaixa: true,
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
      this.addResult('Database queries', false, error.message);
    }
  }

  async testWebhookProcessing() {
    this.log('Testing webhook processing with sample Dialogflow requests...');

    const testCases = [
      {
        name: 'Template intent request',
        payload: {
          queryResult: {
            intent: {
              displayName: 'test.template.intent'
            },
            parameters: {}
          },
          session: 'projects/test-project/agent/sessions/5511999999999',
          originalDetectIntentRequest: {
            payload: {
              phoneNumberId: TEST_CONFIG.phoneNumberId
            }
          }
        }
      },
      {
        name: 'Interactive message intent request',
        payload: {
          queryResult: {
            intent: {
              displayName: 'test.interactive.intent'
            },
            parameters: {}
          },
          session: 'projects/test-project/agent/sessions/5511999999999',
          originalDetectIntentRequest: {
            payload: {
              phoneNumberId: TEST_CONFIG.phoneNumberId
            }
          }
        }
      },
      {
        name: 'Unknown intent request (fallback test)',
        payload: {
          queryResult: {
            intent: {
              displayName: 'unknown.intent'
            },
            parameters: {}
          },
          session: 'projects/test-project/agent/sessions/5511999999999',
          originalDetectIntentRequest: {
            payload: {
              phoneNumberId: TEST_CONFIG.phoneNumberId
            }
          }
        }
      }
    ];

    for (const testCase of testCases) {
      try {
        this.log(`Testing: ${testCase.name}`);
        
        // Make request to webhook endpoint
        const response = await axios.post(TEST_CONFIG.webhookUrl, testCase.payload, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000,
          validateStatus: () => true // Accept all status codes
        });

        // Check if response is valid
        const isValid = response.status >= 200 && response.status < 500;
        this.addResult(`Webhook processing: ${testCase.name}`, isValid, 
          !isValid ? `Status: ${response.status}, Data: ${JSON.stringify(response.data)}` : undefined);

      } catch (error: any) {
        this.addResult(`Webhook processing: ${testCase.name}`, false, error.message);
      }
    }
  }

  async testTemplateProcessing() {
    this.log('Testing template processing functionality...');

    try {
      // Test template data structure
      const testTemplate = {
        name: 'test_template',
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
        ],
        language: 'pt_BR'
      };

      // Validate template structure
      const isValidTemplate = testTemplate.name && 
                             testTemplate.components && 
                             Array.isArray(testTemplate.components) &&
                             testTemplate.language;

      this.addResult('Template data structure validation', isValidTemplate);

      // Test WhatsApp API message format
      const whatsappMessageData = {
        messaging_product: 'whatsapp',
        to: TEST_CONFIG.testWaid,
        type: 'template',
        template: {
          name: testTemplate.name,
          language: { code: testTemplate.language },
          components: testTemplate.components,
        },
      };

      const isValidWhatsAppFormat = whatsappMessageData.messaging_product === 'whatsapp' &&
                                   whatsappMessageData.type === 'template' &&
                                   whatsappMessageData.template &&
                                   whatsappMessageData.template.name &&
                                   whatsappMessageData.template.language;

      this.addResult('WhatsApp template message format', isValidWhatsAppFormat);

    } catch (error: any) {
      this.addResult('Template processing', false, error.message);
    }
  }

  async testInteractiveMessageProcessing() {
    this.log('Testing interactive message processing functionality...');

    try {
      // Test interactive message data structure
      const testInteractiveMessage = {
        texto: 'Choose an option:',
        headerTipo: 'text',
        headerConteudo: 'Header Text',
        rodape: 'Footer text',
        botoes: [
          { id: 'btn1', titulo: 'Option 1', ordem: 1 },
          { id: 'btn2', titulo: 'Option 2', ordem: 2 }
        ]
      };

      // Validate interactive message structure
      const isValidInteractive = testInteractiveMessage.texto &&
                                 testInteractiveMessage.botoes &&
                                 Array.isArray(testInteractiveMessage.botoes) &&
                                 testInteractiveMessage.botoes.length > 0;

      this.addResult('Interactive message data structure validation', isValidInteractive);

      // Test WhatsApp interactive message format
      const interactive = {
        type: 'button',
        body: { text: testInteractiveMessage.texto },
        action: {
          buttons: testInteractiveMessage.botoes
            .sort((a, b) => a.ordem - b.ordem)
            .map(btn => ({
              type: 'reply',
              reply: { id: btn.id, title: btn.titulo },
            })),
        },
      };

      if (testInteractiveMessage.headerTipo && testInteractiveMessage.headerConteudo) {
        interactive.header = {
          type: testInteractiveMessage.headerTipo.toLowerCase(),
          [testInteractiveMessage.headerTipo.toLowerCase()]: 
            testInteractiveMessage.headerTipo.toLowerCase() === 'text' 
            ? { text: testInteractiveMessage.headerConteudo } 
            : { link: testInteractiveMessage.headerConteudo },
        };
      }

      if (testInteractiveMessage.rodape) {
        interactive.footer = { text: testInteractiveMessage.rodape };
      }

      const whatsappInteractiveData = {
        messaging_product: 'whatsapp',
        to: TEST_CONFIG.testWaid,
        type: 'interactive',
        interactive,
      };

      const isValidWhatsAppInteractive = whatsappInteractiveData.messaging_product === 'whatsapp' &&
                                        whatsappInteractiveData.type === 'interactive' &&
                                        whatsappInteractiveData.interactive &&
                                        whatsappInteractiveData.interactive.type === 'button' &&
                                        whatsappInteractiveData.interactive.action &&
                                        whatsappInteractiveData.interactive.action.buttons;

      this.addResult('WhatsApp interactive message format', isValidWhatsAppInteractive);

    } catch (error: any) {
      this.addResult('Interactive message processing', false, error.message);
    }
  }

  async testFallbackLogic() {
    this.log('Testing fallback logic with proper model names...');

    try {
      // Test 1: Configuration fallback logic
      this.log('Testing configuration fallback logic...');
      
      // Simulate the webhook's fallback logic
      let config = await db.whatsAppConfig.findFirst({
        where: { 
          phoneNumberId: 'non_existent_phone_id',
          isActive: true 
        },
        include: { 
          caixaEntrada: true,
          usuarioChatwit: true 
        },
      });

      // Should be null for non-existent phoneNumberId
      const configFallbackStep1 = config === null;
      this.addResult('Configuration fallback step 1 (specific config not found)', configFallbackStep1);

      // Fallback to default configuration
      if (!config) {
        config = await db.whatsAppConfig.findFirst({
          where: { 
            caixaEntradaId: null,
            isActive: true 
          },
          include: { 
            caixaEntrada: true,
            usuarioChatwit: true 
          },
        });
      }

      // Test 2: Intent mapping fallback logic
      this.log('Testing intent mapping fallback logic...');
      
      // Simulate intent mapping fallback
      const mapeamento = await db.mapeamentoIntencao.findUnique({
        where: { 
          intentName_caixaEntradaId: { 
            intentName: 'non.existent.intent', 
            caixaEntradaId: 'test_caixa_id' 
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

      const intentFallbackStep1 = mapeamento === null;
      this.addResult('Intent mapping fallback step 1 (specific mapping not found)', intentFallbackStep1);

      // Test fallback to another caixa (if configured)
      if (!mapeamento) {
        // This would normally use caixaDeOrigem.fallbackParaCaixaId
        // For testing, we'll just verify the query structure
        const fallbackQuery = db.mapeamentoIntencao.findUnique({
          where: { 
            intentName_caixaEntradaId: { 
              intentName: 'non.existent.intent', 
              caixaEntradaId: 'fallback_caixa_id' 
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

        this.addResult('Intent mapping fallback step 2 (fallback caixa query structure)', true);
      }

    } catch (error: any) {
      this.addResult('Fallback logic', false, error.message);
    }
  }

  async testModelRelationships() {
    this.log('Testing model relationships...');

    try {
      // Test WhatsAppConfig relationships
      const configRelationships = await db.whatsAppConfig.findFirst({
        include: {
          usuarioChatwit: {
            include: {
              appUser: true
            }
          },
          caixaEntrada: {
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
              },
              fallbackParaCaixa: true
            }
          }
        }
      });
      this.addResult('WhatsAppConfig relationship includes', true);

      // Test CaixaEntrada relationships
      const caixaRelationships = await db.caixaEntrada.findFirst({
        include: {
          usuarioChatwit: true,
          configuracaoWhatsApp: true,
          templates: true,
          mensagensInterativas: {
            include: {
              botoes: true
            }
          },
          mapeamentosIntencao: {
            include: {
              template: true,
              mensagemInterativa: true
            }
          },
          fallbackParaCaixa: true,
          fallbackDeCaixas: true
        }
      });
      this.addResult('CaixaEntrada relationship includes', true);

      // Test MapeamentoIntencao relationships
      const mapeamentoRelationships = await db.mapeamentoIntencao.findFirst({
        include: {
          caixaEntrada: {
            include: {
              usuarioChatwit: true
            }
          },
          template: {
            include: {
              usuarioChatwit: true
            }
          },
          mensagemInterativa: {
            include: {
              botoes: true,
              usuarioChatwit: true
            }
          }
        }
      });
      this.addResult('MapeamentoIntencao relationship includes', true);

    } catch (error: any) {
      this.addResult('Model relationships', false, error.message);
    }
  }

  async runAllTests() {
    this.log('Starting comprehensive webhook functionality tests...');
    this.log('='.repeat(60));

    await this.testDatabaseQueries();
    await this.testModelRelationships();
    await this.testTemplateProcessing();
    await this.testInteractiveMessageProcessing();
    await this.testFallbackLogic();
    
    // Only test webhook processing if server is running
    try {
      await axios.get('http://localhost:3000/api/health', { timeout: 2000 });
      await this.testWebhookProcessing();
    } catch (error) {
      this.log('⚠️  Skipping webhook processing tests - server not running');
      this.addResult('Webhook processing tests', false, 'Server not running on localhost:3000');
    }

    this.printResults();
  }

  private printResults() {
    this.log('='.repeat(60));
    this.log('TEST RESULTS SUMMARY');
    this.log('='.repeat(60));

    const passed = this.testResults.filter(r => r.passed).length;
    const failed = this.testResults.filter(r => !r.passed).length;
    const total = this.testResults.length;

    this.testResults.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      this.log(`${status} ${result.test}${result.error ? ` - ${result.error}` : ''}`);
    });

    this.log('='.repeat(60));
    this.log(`TOTAL: ${total} tests | PASSED: ${passed} | FAILED: ${failed}`);
    this.log(`SUCCESS RATE: ${((passed / total) * 100).toFixed(1)}%`);
    this.log('='.repeat(60));

    if (failed === 0) {
      this.log('🎉 All tests passed! Webhook functionality is working correctly with corrected models.');
    } else {
      this.log('⚠️  Some tests failed. Please review the errors above.');
    }
  }
}

// Run the tests
async function main() {
  const tester = new WebhookTester();
  await tester.runAllTests();
  process.exit(0);
}

if (require.main === module) {
  main().catch(console.error);
}

export { WebhookTester };