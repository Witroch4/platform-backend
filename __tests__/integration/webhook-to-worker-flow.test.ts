/**
 * Integration Tests for Webhook to Worker Flow
 * Tests the flow from webhook receiving request to task being placed in queue
 * Tests the flow from task being picked up by worker to correct API call
 * Requirements: 2.1, 2.2, 2.3
 */

import { NextRequest } from 'next/server';
import { Job } from 'bullmq';
import { POST } from '../../app/api/admin/mtf-diamante/whatsapp/webhook/route';
import { processMtfDiamanteWebhookTask } from '../../worker/WebhookWorkerTasks/mtf-diamante-webhook.task';

// Mock external dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    webhookMessage: { create: jest.fn() },
    caixaEntrada: { findFirst: jest.fn() },
    whatsAppConfig: { upsert: jest.fn() },
    dialogflowIntent: { create: jest.fn() },
    mapeamentoIntencao: { findUnique: jest.fn() },
    buttonReactionMapping: { findUnique: jest.fn() }
  }
}));

jest.mock('@/lib/whatsapp-messages', () => ({
  sendTemplateMessage: jest.fn(),
  sendInteractiveMessage: jest.fn()
}));

jest.mock('@/lib/whatsapp-reactions', () => ({
  sendReactionMessage: jest.fn(),
  logReactionAttempt: jest.fn()
}));

jest.mock('@/lib/dialogflow-database-queries', () => ({
  findCompleteMessageMappingByIntent: jest.fn(),
  findReactionByButtonId: jest.fn()
}));

// Mock Redis connection for queue
jest.mock('@/lib/redis', () => ({
  connection: {
    host: 'localhost',
    port: 6379
  }
}));

// Import mocked modules
import { sendTemplateMessage, sendInteractiveMessage } from '@/lib/whatsapp-messages';
import { sendReactionMessage, logReactionAttempt } from '@/lib/whatsapp-reactions';
import {
  findCompleteMessageMappingByIntent,
  findReactionByButtonId
} from '@/lib/dialogflow-database-queries';

// Mock queue implementation for integration testing
class MockQueue {
  private tasks: any[] = [];
  
  async add(name: string, data: any, options?: any) {
    const job = {
      id: `job-${Date.now()}-${Math.random()}`,
      name,
      data,
      options
    };
    this.tasks.push(job);
    return job;
  }
  
  getTasks() {
    return this.tasks;
  }
  
  clearTasks() {
    this.tasks = [];
  }
  
  async processNextTask() {
    const task = this.tasks.shift();
    if (task) {
      const mockJob = {
        id: task.id,
        data: task.data
      } as Job<any>;
      
      return await processMtfDiamanteWebhookTask(mockJob);
    }
    return null;
  }
}

// Replace the actual queue with mock
const mockAsyncQueue = new MockQueue();
const mockLegacyQueue = new MockQueue();

jest.mock('@/lib/queue/mtf-diamante-webhook.queue', () => {
  const originalModule = jest.requireActual('@/lib/queue/mtf-diamante-webhook.queue');
  
  return {
    ...originalModule,
    asyncWebhookQueue: mockAsyncQueue,
    mtfDiamanteWebhookQueue: mockLegacyQueue,
    addSendMessageTask: jest.fn(async (data) => {
      return mockAsyncQueue.add('sendMessage', data);
    }),
    addSendReactionTask: jest.fn(async (data) => {
      return mockAsyncQueue.add('sendReaction', data);
    }),
    addStoreMessageTask: jest.fn(async (data) => {
      return mockLegacyQueue.add('store_message', { type: 'store_message', ...data });
    }),
    addUpdateApiKeyTask: jest.fn(async (data) => {
      return mockLegacyQueue.add('update_api_key', { type: 'update_api_key', ...data });
    }),
    addProcessIntentTask: jest.fn(async (data) => {
      return mockLegacyQueue.add('process_intent', { type: 'process_intent', ...data });
    })
  };
});

describe('Webhook to Worker Integration Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAsyncQueue.clearTasks();
    mockLegacyQueue.clearTasks();
  });

  describe('Intent Message Flow', () => {
    it('should complete full flow from webhook to worker for template message', async () => {
      // Setup test data
      const intentPayload = {
        queryResult: {
          intent: { displayName: 'welcome' },
          parameters: { name: 'João', phone: '11999999999' }
        },
        originalDetectIntentRequest: {
          payload: {
            sender: { id: '5511999999999' },
            whatsapp_api_key: 'test-api-key',
            inbox_id: 'test-inbox-id',
            message_id: 'test-message-id',
            conversation_id: 'test-conversation-id'
          }
        }
      };

      const mockMapping = {
        messageType: 'template',
        template: {
          templateId: 'welcome_template',
          name: 'welcome'
        },
        whatsappConfig: {
          whatsappToken: 'test-token'
        }
      };

      // Mock database response
      (findCompleteMessageMappingByIntent as jest.Mock).mockResolvedValue(mockMapping);

      // Mock WhatsApp API success
      (sendTemplateMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.sent123'
      });

      // Step 1: Send request to webhook
      const request = new NextRequest('http://localhost/webhook', {
        method: 'POST',
        body: JSON.stringify(intentPayload)
      });

      const webhookResponse = await POST(request);
      const webhookData = await webhookResponse.json();

      // Verify webhook response
      expect(webhookResponse.status).toBe(200);
      expect(webhookData.fulfillmentMessages).toBeDefined();

      // Step 2: Verify task was queued
      const queuedTasks = mockAsyncQueue.getTasks();
      expect(queuedTasks).toHaveLength(1);
      
      const queuedTask = queuedTasks[0];
      expect(queuedTask.data.type).toBe('sendMessage');
      expect(queuedTask.data.recipientPhone).toBe('5511999999999');
      expect(queuedTask.data.messageData.type).toBe('template');
      expect(queuedTask.data.messageData.templateId).toBe('welcome_template');

      // Step 3: Process task with worker
      const workerResult = await mockAsyncQueue.processNextTask();

      // Verify worker processed task successfully
      expect(workerResult).toEqual({
        success: true,
        type: 'sendMessage'
      });

      // Verify WhatsApp API was called correctly
      expect(sendTemplateMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientPhone: '5511999999999',
          templateId: 'welcome_template',
          templateName: 'welcome',
          whatsappApiKey: 'test-token',
          variables: expect.objectContaining({
            name: 'João',
            nome: 'João',
            phone: '11999999999',
            telefone: '11999999999'
          })
        }),
        [] // Empty template components for this test
      );
    });

    it('should complete full flow for interactive message', async () => {
      const intentPayload = {
        queryResult: {
          intent: { displayName: 'menu' }
        },
        originalDetectIntentRequest: {
          payload: {
            sender: { id: '5511999999999' },
            whatsapp_api_key: 'test-api-key',
            inbox_id: 'test-inbox-id'
          }
        }
      };

      const mockMapping = {
        messageType: 'interactive',
        interactiveMessage: {
          texto: 'Escolha uma opção:',
          rodape: 'Powered by ChatWit',
          botoes: [
            { id: 'option1', titulo: 'Opção 1', ordem: 1 },
            { id: 'option2', titulo: 'Opção 2', ordem: 2 }
          ]
        },
        whatsappConfig: {
          whatsappToken: 'test-token'
        }
      };

      (findCompleteMessageMappingByIntent as jest.Mock).mockResolvedValue(mockMapping);
      (sendInteractiveMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.interactive123'
      });

      // Webhook request
      const request = new NextRequest('http://localhost/webhook', {
        method: 'POST',
        body: JSON.stringify(intentPayload)
      });

      await POST(request);

      // Verify task queued
      const queuedTasks = mockAsyncQueue.getTasks();
      expect(queuedTasks).toHaveLength(1);
      expect(queuedTasks[0].data.messageData.type).toBe('interactive');

      // Process with worker
      const workerResult = await mockAsyncQueue.processNextTask();

      expect(workerResult.success).toBe(true);
      expect(sendInteractiveMessage).toHaveBeenCalledWith({
        recipientPhone: '5511999999999',
        whatsappApiKey: 'test-token',
        header: undefined,
        body: 'Escolha uma opção:',
        footer: 'Powered by ChatWit',
        action: {
          type: 'buttons',
          data: {
            buttons: [
              { id: 'option1', title: 'Opção 1', type: 'reply' },
              { id: 'option2', title: 'Opção 2', type: 'reply' }
            ]
          }
        }
      });
    });
  });

  describe('Button Reaction Flow', () => {
    it('should complete full flow from webhook to worker for button reaction', async () => {
      const buttonClickPayload = {
        originalDetectIntentRequest: {
          payload: {
            interactive: {
              type: 'button_reply',
              button_reply: { id: 'like_button' }
            },
            context: { id: 'wamid.original123' },
            sender: { id: '5511999999999' },
            whatsapp_api_key: 'test-api-key'
          }
        }
      };

      const mockReaction = {
        buttonId: 'like_button',
        emoji: '👍',
        isActive: true
      };

      (findReactionByButtonId as jest.Mock).mockResolvedValue(mockReaction);
      (sendReactionMessage as jest.Mock).mockResolvedValue({
        success: true,
        messageId: 'wamid.reaction123'
      });
      (logReactionAttempt as jest.Mock).mockResolvedValue(undefined);

      // Webhook request
      const request = new NextRequest('http://localhost/webhook', {
        method: 'POST',
        body: JSON.stringify(buttonClickPayload)
      });

      await POST(request);

      // Verify reaction task queued
      const queuedTasks = mockAsyncQueue.getTasks();
      expect(queuedTasks).toHaveLength(1);
      
      const reactionTask = queuedTasks[0];
      expect(reactionTask.data.type).toBe('sendReaction');
      expect(reactionTask.data.emoji).toBe('👍');
      expect(reactionTask.data.messageId).toBe('wamid.original123');

      // Process with worker
      const workerResult = await mockAsyncQueue.processNextTask();

      expect(workerResult.success).toBe(true);
      expect(sendReactionMessage).toHaveBeenCalledWith({
        recipientPhone: '5511999999999',
        messageId: 'wamid.original123',
        emoji: '👍',
        whatsappApiKey: 'test-api-key'
      });

      expect(logReactionAttempt).toHaveBeenCalledWith({
        recipientPhone: '5511999999999',
        messageId: 'wamid.original123',
        emoji: '👍',
        buttonId: 'like_button',
        success: true,
        error: undefined
      });
    });
  });

  describe('Error Handling Scenarios', () => {
    it('should handle database query failures gracefully', async () => {
      const intentPayload = {
        queryResult: {
          intent: { displayName: 'test' }
        },
        originalDetectIntentRequest: {
          payload: {
            sender: { id: '5511999999999' },
            whatsapp_api_key: 'test-api-key'
          }
        }
      };

      // Simulate database error
      (findCompleteMessageMappingByIntent as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = new NextRequest('http://localhost/webhook', {
        method: 'POST',
        body: JSON.stringify(intentPayload)
      });

      const response = await POST(request);

      // Webhook should still return 200 OK
      expect(response.status).toBe(200);

      // No async tasks should be queued due to error
      const asyncTasks = mockAsyncQueue.getTasks();
      expect(asyncTasks).toHaveLength(0);

      // Legacy tasks should still be queued
      const legacyTasks = mockLegacyQueue.getTasks();
      expect(legacyTasks.length).toBeGreaterThan(0);
    });

    it('should handle WhatsApp API failures with retry mechanism', async () => {
      const templateTask = {
        type: 'sendMessage',
        recipientPhone: '5511999999999',
        whatsappApiKey: 'test-api-key',
        messageData: {
          type: 'template',
          templateId: 'test_template',
          templateName: 'test'
        }
      };

      // Mock WhatsApp API failure
      (sendTemplateMessage as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Template not found'
      });

      // Create mock job
      const mockJob = {
        id: 'test-job',
        data: templateTask
      } as Job<any>;

      // Worker should throw error to trigger retry
      await expect(processMtfDiamanteWebhookTask(mockJob)).rejects.toThrow(
        'Message sending failed: Template not found'
      );
    });

    it('should handle queue connection failures', async () => {
      const intentPayload = {
        queryResult: {
          intent: { displayName: 'test' }
        },
        originalDetectIntentRequest: {
          payload: {
            sender: { id: '5511999999999' },
            whatsapp_api_key: 'test-api-key'
          }
        }
      };

      (findCompleteMessageMappingByIntent as jest.Mock).mockResolvedValue({
        messageType: 'template',
        template: { templateId: 'test', name: 'test' },
        whatsappConfig: { whatsappToken: 'test' }
      });

      // Mock queue failure
      const { addSendMessageTask } = require('@/lib/queue/mtf-diamante-webhook.queue');
      (addSendMessageTask as jest.Mock).mockRejectedValue(
        new Error('Queue connection failed')
      );

      const request = new NextRequest('http://localhost/webhook', {
        method: 'POST',
        body: JSON.stringify(intentPayload)
      });

      const response = await POST(request);

      // Webhook should still return 200 OK even with queue failure
      expect(response.status).toBe(200);
    });
  });

  describe('Recovery Mechanisms', () => {
    it('should retry failed tasks according to configuration', async () => {
      const reactionTask = {
        type: 'sendReaction',
        recipientPhone: '5511999999999',
        messageId: 'wamid.test',
        emoji: '👍',
        whatsappApiKey: 'test-api-key'
      };

      // Mock temporary failure followed by success
      (sendReactionMessage as jest.Mock)
        .mockResolvedValueOnce({
          success: false,
          error: 'Network timeout'
        })
        .mockResolvedValueOnce({
          success: true,
          messageId: 'wamid.reaction123'
        });

      (logReactionAttempt as jest.Mock).mockResolvedValue(undefined);

      const mockJob = {
        id: 'retry-test-job',
        data: reactionTask
      } as Job<any>;

      // First attempt should fail
      await expect(processMtfDiamanteWebhookTask(mockJob)).rejects.toThrow(
        'Reaction sending failed: Network timeout'
      );

      // Second attempt should succeed
      const result = await processMtfDiamanteWebhookTask(mockJob);
      expect(result.success).toBe(true);

      // Verify both attempts were logged
      expect(logReactionAttempt).toHaveBeenCalledTimes(2);
      expect(logReactionAttempt).toHaveBeenNthCalledWith(1, expect.objectContaining({
        success: false,
        error: 'Network timeout'
      }));
      expect(logReactionAttempt).toHaveBeenNthCalledWith(2, expect.objectContaining({
        success: true
      }));
    });

    it('should handle partial system failures gracefully', async () => {
      const intentPayload = {
        queryResult: {
          intent: { displayName: 'test' }
        },
        originalDetectIntentRequest: {
          payload: {
            sender: { id: '5511999999999' },
            whatsapp_api_key: 'test-api-key',
            inbox_id: 'test-inbox-id'
          }
        }
      };

      // Mock successful async processing but failed legacy processing
      (findCompleteMessageMappingByIntent as jest.Mock).mockResolvedValue({
        messageType: 'template',
        template: { templateId: 'test', name: 'test' },
        whatsappConfig: { whatsappToken: 'test' }
      });

      const { addStoreMessageTask } = require('@/lib/queue/mtf-diamante-webhook.queue');
      (addStoreMessageTask as jest.Mock).mockRejectedValue(
        new Error('Legacy queue failed')
      );

      const request = new NextRequest('http://localhost/webhook', {
        method: 'POST',
        body: JSON.stringify(intentPayload)
      });

      const response = await POST(request);

      // Webhook should still return 200 OK
      expect(response.status).toBe(200);

      // Async task should still be queued despite legacy failure
      const asyncTasks = mockAsyncQueue.getTasks();
      expect(asyncTasks).toHaveLength(1);
    });
  });

  describe('Performance and Timing', () => {
    it('should process webhook request within 2 seconds', async () => {
      const intentPayload = {
        queryResult: {
          intent: { displayName: 'performance_test' }
        },
        originalDetectIntentRequest: {
          payload: {
            sender: { id: '5511999999999' },
            whatsapp_api_key: 'test-api-key'
          }
        }
      };

      (findCompleteMessageMappingByIntent as jest.Mock).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/webhook', {
        method: 'POST',
        body: JSON.stringify(intentPayload)
      });

      const startTime = Date.now();
      const response = await POST(request);
      const endTime = Date.now();

      const processingTime = endTime - startTime;

      expect(response.status).toBe(200);
      expect(processingTime).toBeLessThan(2000); // Less than 2 seconds
    });

    it('should handle concurrent requests efficiently', async () => {
      const createRequest = (intentName: string) => ({
        queryResult: {
          intent: { displayName: intentName }
        },
        originalDetectIntentRequest: {
          payload: {
            sender: { id: '5511999999999' },
            whatsapp_api_key: 'test-api-key'
          }
        }
      });

      (findCompleteMessageMappingByIntent as jest.Mock).mockResolvedValue(null);

      // Create multiple concurrent requests
      const requests = Array.from({ length: 5 }, (_, i) => 
        new NextRequest('http://localhost/webhook', {
          method: 'POST',
          body: JSON.stringify(createRequest(`intent_${i}`))
        })
      );

      const startTime = Date.now();
      const responses = await Promise.all(requests.map(req => POST(req)));
      const endTime = Date.now();

      const totalTime = endTime - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Total time should be reasonable for concurrent processing
      expect(totalTime).toBeLessThan(5000); // Less than 5 seconds for 5 concurrent requests
    });
  });
});