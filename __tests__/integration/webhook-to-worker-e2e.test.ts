/**
 * Integration Tests for End-to-End Webhook to Worker Flow
 * 
 * This test suite validates the complete flow from webhook dispatcher
 * through the refactored Parent Worker system to task execution.
 * 
 * Requirements: 7.1, 7.2, 7.3, 8.1, 8.2
 */

import { NextRequest } from 'next/server';
import { Job } from 'bullmq';
import { 
  RespostaRapidaJobData,
  addRespostaRapidaJob,
  createIntentJob,
  createButtonJob,
} from '@/lib/queue/resposta-rapida.queue';
import { 
  PersistenciaCredenciaisJobData,
  addPersistenciaCredenciaisJob,
  createCredentialsUpdateJob,
} from '@/lib/queue/persistencia-credenciais.queue';

// Mock external dependencies
jest.mock('@/lib/redis', () => ({
  connection: {
    host: 'localhost',
    port: 6379,
  },
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    mapeamentoIntencao: {
      findFirst: jest.fn(),
    },
    mapeamentoBotao: {
      findFirst: jest.fn(),
    },
    chatwitInbox: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    lead: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    template: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('@/lib/cache/credentials-cache', () => ({
  credentialsCache: {
    getCredentials: jest.fn(),
    setCredentials: jest.fn(),
    isCredentialsUpdated: jest.fn(),
    markCredentialsUpdated: jest.fn(),
  },
  cacheInvalidationManager: {
    invalidateRelatedCaches: jest.fn(),
  },
}));

jest.mock('@/lib/whatsapp-messages', () => ({
  sendTextMessage: jest.fn(),
  sendTemplateMessage: jest.fn(),
  sendInteractiveMessage: jest.fn(),
}));

jest.mock('@/lib/whatsapp-reactions', () => ({
  sendReactionMessage: jest.fn(),
}));

jest.mock('@/lib/lead-management', () => ({
  UnifiedLeadManager: {
    findOrCreateLead: jest.fn(),
    updateLeadWithMessageMetadata: jest.fn(),
  },
}));

// Mock the queue functions
jest.mock('@/lib/queue/resposta-rapida.queue', () => ({
  ...jest.requireActual('@/lib/queue/resposta-rapida.queue'),
  addRespostaRapidaJob: jest.fn(),
}));

jest.mock('@/lib/queue/persistencia-credenciais.queue', () => ({
  ...jest.requireActual('@/lib/queue/persistencia-credenciais.queue'),
  addPersistenciaCredenciaisJob: jest.fn(),
}));

// Import mocked functions
import { prisma } from '@/lib/prisma';
import { credentialsCache } from '@/lib/cache/credentials-cache';
import { sendTextMessage, sendInteractiveMessage } from '@/lib/whatsapp-messages';
import { sendReactionMessage } from '@/lib/whatsapp-reactions';
import { UnifiedLeadManager } from '@/lib/lead-management';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockCredentialsCache = credentialsCache as jest.Mocked<typeof credentialsCache>;
const mockSendTextMessage = sendTextMessage as jest.MockedFunction<typeof sendTextMessage>;
const mockSendInteractiveMessage = sendInteractiveMessage as jest.MockedFunction<typeof sendInteractiveMessage>;
const mockSendReactionMessage = sendReactionMessage as jest.MockedFunction<typeof sendReactionMessage>;
const mockUnifiedLeadManager = UnifiedLeadManager as jest.Mocked<typeof UnifiedLeadManager>;
const mockAddRespostaRapidaJob = addRespostaRapidaJob as jest.MockedFunction<typeof addRespostaRapidaJob>;
const mockAddPersistenciaCredenciaisJob = addPersistenciaCredenciaisJob as jest.MockedFunction<typeof addPersistenciaCredenciaisJob>;

// Import the webhook handler
import { POST as webhookHandler } from '@/app/api/admin/mtf-diamante/whatsapp/webhook/route';

// Import task processors for direct testing
import { processRespostaRapidaTask } from '@/worker/WebhookWorkerTasks/respostaRapida.worker.task';
import { processPersistenciaTask } from '@/worker/WebhookWorkerTasks/persistencia.worker.task';

describe('Webhook to Worker End-to-End Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete Intent Processing Flow', () => {
    it('should process complete intent workflow: webhook → queue → worker → WhatsApp API', async () => {
      // Arrange: Create realistic webhook payload for intent
      const webhookPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.intent_test_abc123',
            whatsapp_api_key: 'EAAG1234567890...',
            phone_number_id: '987654321',
            business_id: '123456789',
            contact_source: 'whatsapp',
            message_id: 12345,
            account_id: 67890,
            account_name: 'Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'greeting.welcome',
          },
        },
      };

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/whatsapp/webhook', {
        method: 'POST',
        body: JSON.stringify(webhookPayload),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Mock database responses
      mockPrisma.mapeamentoIntencao.findFirst.mockResolvedValueOnce({
        id: 'mapping-intent-123',
        intentName: 'greeting.welcome',
        template: {
          id: 'template-welcome-456',
          name: 'Welcome Template',
          type: 'AUTOMATION_REPLY',
          simpleReplyText: 'Olá! Bem-vindo ao nosso atendimento. Como posso ajudá-lo?',
          interactiveContent: null,
          whatsappOfficialInfo: null,
        },
      });

      // Mock successful WhatsApp API response
      mockSendTextMessage.mockResolvedValueOnce({
        success: true,
        messageId: 'wamid.welcome_response_def456',
        error: null,
      });

      // Mock queue job creation
      let capturedHighPriorityJob: RespostaRapidaJobData | null = null;
      let capturedLowPriorityJob: PersistenciaCredenciaisJobData | null = null;

      mockAddRespostaRapidaJob.mockImplementation(async (jobData) => {
        capturedHighPriorityJob = jobData;
        return { id: 'job-high-priority-123' } as any;
      });

      mockAddPersistenciaCredenciaisJob.mockImplementation(async (jobData) => {
        capturedLowPriorityJob = jobData;
        return { id: 'job-low-priority-456' } as any;
      });

      // Act: Process webhook request
      const webhookResponse = await webhookHandler(request);
      const responseData = await webhookResponse.json();

      // Assert: Webhook response
      expect(webhookResponse.status).toBe(202);
      expect(responseData.correlationId).toBeDefined();
      expect(responseData.correlationId).toMatch(/^\d+-[a-z0-9]+$/);

      // Wait for async job enqueueing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert: High priority job was enqueued
      expect(mockAddRespostaRapidaJob).toHaveBeenCalledTimes(1);
      expect(capturedHighPriorityJob).toBeDefined();
      expect(capturedHighPriorityJob!.type).toBe('processarResposta');
      expect(capturedHighPriorityJob!.data.interactionType).toBe('intent');
      expect(capturedHighPriorityJob!.data.intentName).toBe('greeting.welcome');
      expect(capturedHighPriorityJob!.data.contactPhone).toBe('+5511999999999');
      expect(capturedHighPriorityJob!.data.credentials.token).toBe('EAAG1234567890...');

      // Assert: Low priority job was enqueued
      expect(mockAddPersistenciaCredenciaisJob).toHaveBeenCalledTimes(1);
      expect(capturedLowPriorityJob).toBeDefined();
      expect(capturedLowPriorityJob!.type).toBe('atualizarCredenciais');
      expect(capturedLowPriorityJob!.data.inboxId).toBe('4');
      expect(capturedLowPriorityJob!.data.whatsappApiKey).toBe('EAAG1234567890...');

      // Simulate high priority worker processing
      const mockHighPriorityJob: Job<RespostaRapidaJobData> = {
        id: 'job-high-priority-123',
        name: 'resposta-intent-test',
        data: capturedHighPriorityJob!,
      } as any;

      const highPriorityResult = await processRespostaRapidaTask(mockHighPriorityJob);

      // Assert: High priority processing result
      expect(highPriorityResult.success).toBe(true);
      expect(highPriorityResult.messageId).toBe('wamid.welcome_response_def456');
      expect(highPriorityResult.correlationId).toBe(capturedHighPriorityJob!.data.correlationId);

      // Verify WhatsApp API was called
      expect(mockSendTextMessage).toHaveBeenCalledWith({
        recipientPhone: '+5511999999999',
        text: 'Olá! Bem-vindo ao nosso atendimento. Como posso ajudá-lo?',
        whatsappApiKey: 'EAAG1234567890...',
        phoneNumberId: '987654321',
        correlationId: capturedHighPriorityJob!.data.correlationId,
      });

      // Simulate low priority worker processing
      mockCredentialsCache.isCredentialsUpdated.mockResolvedValueOnce(false);
      mockUnifiedLeadManager.findOrCreateLead.mockResolvedValueOnce({
        lead: { id: 'lead-123', phone: '+5511999999999' },
        created: true,
      });

      const mockLowPriorityJob: Job<PersistenciaCredenciaisJobData> = {
        id: 'job-low-priority-456',
        name: 'persistencia-atualizarCredenciais-test',
        data: capturedLowPriorityJob!,
      } as any;

      const lowPriorityResult = await processPersistenciaTask(mockLowPriorityJob);

      // Assert: Low priority processing result
      expect(lowPriorityResult.credentialsUpdated).toBe(true);
      expect(lowPriorityResult.leadUpdated).toBe(true);

      // Verify database operations
      expect(mockPrisma.chatwitInbox.updateMany).toHaveBeenCalledWith({
        where: { inboxId: '4' },
        data: {
          whatsappApiKey: 'EAAG1234567890...',
          phoneNumberId: '987654321',
          whatsappBusinessAccountId: '123456789',
          updatedAt: expect.any(Date),
        },
      });

      expect(mockUnifiedLeadManager.findOrCreateLead).toHaveBeenCalledWith({
        contactPhone: '+5511999999999',
        contactSource: 'whatsapp',
        messageId: 12345,
        accountId: 67890,
        accountName: 'Test Account',
        wamid: 'wamid.intent_test_abc123',
        inboxId: '4',
      });
    });
  });

  describe('Complete Button Click Processing Flow', () => {
    it('should process complete button workflow: webhook → queue → worker → WhatsApp reaction', async () => {
      // Arrange: Create realistic webhook payload for button click
      const webhookPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511888888888',
            interaction_type: 'button_reply',
            button_id: 'btn-confirm-order',
            wamid: 'wamid.button_test_xyz789',
            whatsapp_api_key: 'EAAG0987654321...',
            phone_number_id: '123456789',
            business_id: '987654321',
            contact_source: 'whatsapp',
            message_id: 54321,
            account_id: 98765,
            account_name: 'Button Test Account',
          },
        },
        entry: [{
          changes: [{
            value: {
              messages: [{
                type: 'interactive',
                interactive: {
                  type: 'button_reply',
                  button_reply: {
                    id: 'btn-confirm-order',
                    title: 'Confirm Order',
                  },
                },
                context: {
                  id: 'wamid.original_message_abc123',
                },
              }],
            },
          }],
        }],
      };

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/whatsapp/webhook', {
        method: 'POST',
        body: JSON.stringify(webhookPayload),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Mock database responses
      mockPrisma.mapeamentoBotao.findFirst.mockResolvedValueOnce({
        id: 'mapping-button-789',
        buttonId: 'btn-confirm-order',
        actionType: 'SEND_TEMPLATE',
        actionPayload: {
          templateId: 'template-confirmation-123',
        },
        inbox: {
          inboxId: '4',
        },
      });

      mockPrisma.template.findUnique.mockResolvedValueOnce({
        id: 'template-confirmation-123',
        name: 'Order Confirmation',
        type: 'AUTOMATION_REPLY',
        simpleReplyText: '✅ Seu pedido foi confirmado! Obrigado pela preferência.',
        interactiveContent: null,
        whatsappOfficialInfo: null,
      });

      // Mock successful WhatsApp API response
      mockSendTextMessage.mockResolvedValueOnce({
        success: true,
        messageId: 'wamid.confirmation_response_ghi789',
        error: null,
      });

      // Mock queue job creation
      let capturedHighPriorityJob: RespostaRapidaJobData | null = null;
      let capturedLowPriorityJob: PersistenciaCredenciaisJobData | null = null;

      mockAddRespostaRapidaJob.mockImplementation(async (jobData) => {
        capturedHighPriorityJob = jobData;
        return { id: 'job-button-high-789' } as any;
      });

      mockAddPersistenciaCredenciaisJob.mockImplementation(async (jobData) => {
        capturedLowPriorityJob = jobData;
        return { id: 'job-button-low-012' } as any;
      });

      // Act: Process webhook request
      const webhookResponse = await webhookHandler(request);
      const responseData = await webhookResponse.json();

      // Assert: Webhook response
      expect(webhookResponse.status).toBe(202);
      expect(responseData.correlationId).toBeDefined();

      // Wait for async job enqueueing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert: High priority job was enqueued
      expect(mockAddRespostaRapidaJob).toHaveBeenCalledTimes(1);
      expect(capturedHighPriorityJob).toBeDefined();
      expect(capturedHighPriorityJob!.type).toBe('processarResposta');
      expect(capturedHighPriorityJob!.data.interactionType).toBe('button_reply');
      expect(capturedHighPriorityJob!.data.buttonId).toBe('btn-confirm-order');
      expect(capturedHighPriorityJob!.data.contactPhone).toBe('+5511888888888');

      // Simulate high priority worker processing
      const mockHighPriorityJob: Job<RespostaRapidaJobData> = {
        id: 'job-button-high-789',
        name: 'resposta-button_reply-test',
        data: capturedHighPriorityJob!,
      } as any;

      const highPriorityResult = await processRespostaRapidaTask(mockHighPriorityJob);

      // Assert: High priority processing result
      expect(highPriorityResult.success).toBe(true);
      expect(highPriorityResult.messageId).toBe('wamid.confirmation_response_ghi789');

      // Verify WhatsApp API was called
      expect(mockSendTextMessage).toHaveBeenCalledWith({
        recipientPhone: '+5511888888888',
        text: '✅ Seu pedido foi confirmado! Obrigado pela preferência.',
        whatsappApiKey: 'EAAG0987654321...',
        phoneNumberId: '123456789',
        correlationId: capturedHighPriorityJob!.data.correlationId,
      });

      // Simulate low priority worker processing
      mockCredentialsCache.isCredentialsUpdated.mockResolvedValueOnce(false);
      mockUnifiedLeadManager.findOrCreateLead.mockResolvedValueOnce({
        lead: { id: 'lead-456', phone: '+5511888888888' },
        created: false,
      });

      const mockLowPriorityJob: Job<PersistenciaCredenciaisJobData> = {
        id: 'job-button-low-012',
        name: 'persistencia-atualizarCredenciais-button-test',
        data: capturedLowPriorityJob!,
      } as any;

      const lowPriorityResult = await processPersistenciaTask(mockLowPriorityJob);

      // Assert: Low priority processing result
      expect(lowPriorityResult.credentialsUpdated).toBe(true);
      expect(lowPriorityResult.leadUpdated).toBe(true);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle webhook processing errors gracefully', async () => {
      // Arrange: Create malformed webhook payload
      const malformedPayload = {
        // Missing required fields
        originalDetectIntentRequest: {
          payload: {
            // Missing inbox_id, contact_phone, etc.
            whatsapp_api_key: 'EAAG_MALFORMED...',
          },
        },
      };

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/whatsapp/webhook', {
        method: 'POST',
        body: JSON.stringify(malformedPayload),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Act: Process malformed webhook request
      const webhookResponse = await webhookHandler(request);
      const responseData = await webhookResponse.json();

      // Assert: Should still return 202 to prevent Dialogflow retries
      expect(webhookResponse.status).toBe(202);
      expect(responseData.correlationId).toBeDefined();

      // Should not enqueue jobs for malformed data
      expect(mockAddRespostaRapidaJob).not.toHaveBeenCalled();
      expect(mockAddPersistenciaCredenciaisJob).not.toHaveBeenCalled();
    });

    it('should handle worker task failures without affecting webhook response', async () => {
      // Arrange: Valid webhook payload
      const webhookPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511777777777',
            interaction_type: 'intent',
            wamid: 'wamid.error_test_123',
            whatsapp_api_key: 'EAAG_ERROR_TEST...',
            phone_number_id: '111111111',
            business_id: '222222222',
            contact_source: 'whatsapp',
            message_id: 99999,
            account_id: 88888,
            account_name: 'Error Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'error.test.intent',
          },
        },
      };

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/whatsapp/webhook', {
        method: 'POST',
        body: JSON.stringify(webhookPayload),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Mock database error
      mockPrisma.mapeamentoIntencao.findFirst.mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      // Mock queue job creation
      let capturedHighPriorityJob: RespostaRapidaJobData | null = null;

      mockAddRespostaRapidaJob.mockImplementation(async (jobData) => {
        capturedHighPriorityJob = jobData;
        return { id: 'job-error-test-123' } as any;
      });

      // Act: Process webhook request
      const webhookResponse = await webhookHandler(request);
      const responseData = await webhookResponse.json();

      // Assert: Webhook should still respond successfully
      expect(webhookResponse.status).toBe(202);
      expect(responseData.correlationId).toBeDefined();

      // Wait for async job enqueueing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Jobs should still be enqueued despite database error
      expect(mockAddRespostaRapidaJob).toHaveBeenCalledTimes(1);
      expect(capturedHighPriorityJob).toBeDefined();

      // Simulate worker processing with database error
      const mockHighPriorityJob: Job<RespostaRapidaJobData> = {
        id: 'job-error-test-123',
        name: 'resposta-intent-error-test',
        data: capturedHighPriorityJob!,
      } as any;

      // Worker should handle the error gracefully
      const highPriorityResult = await processRespostaRapidaTask(mockHighPriorityJob);

      // Assert: Worker should return error result but not crash
      expect(highPriorityResult.success).toBe(false);
      expect(highPriorityResult.error).toContain('Database connection failed');
      expect(highPriorityResult.correlationId).toBe(capturedHighPriorityJob!.data.correlationId);
    });

    it('should handle WhatsApp API failures in worker tasks', async () => {
      // Arrange: Valid webhook payload
      const webhookPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511666666666',
            interaction_type: 'intent',
            wamid: 'wamid.api_error_test_456',
            whatsapp_api_key: 'INVALID_API_KEY',
            phone_number_id: '333333333',
            business_id: '444444444',
            contact_source: 'whatsapp',
            message_id: 77777,
            account_id: 66666,
            account_name: 'API Error Test',
          },
        },
        queryResult: {
          intent: {
            displayName: 'api.error.test',
          },
        },
      };

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/whatsapp/webhook', {
        method: 'POST',
        body: JSON.stringify(webhookPayload),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Mock successful database response
      mockPrisma.mapeamentoIntencao.findFirst.mockResolvedValueOnce({
        id: 'mapping-api-error-123',
        intentName: 'api.error.test',
        template: {
          id: 'template-api-error-456',
          name: 'API Error Template',
          type: 'AUTOMATION_REPLY',
          simpleReplyText: 'Test message for API error',
          interactiveContent: null,
          whatsappOfficialInfo: null,
        },
      });

      // Mock WhatsApp API failure
      mockSendTextMessage.mockResolvedValueOnce({
        success: false,
        messageId: null,
        error: 'Invalid API key',
      });

      // Mock queue job creation
      let capturedHighPriorityJob: RespostaRapidaJobData | null = null;

      mockAddRespostaRapidaJob.mockImplementation(async (jobData) => {
        capturedHighPriorityJob = jobData;
        return { id: 'job-api-error-456' } as any;
      });

      // Act: Process webhook request
      const webhookResponse = await webhookHandler(request);

      // Assert: Webhook should respond successfully
      expect(webhookResponse.status).toBe(202);

      // Wait for async job enqueueing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Simulate worker processing with API error
      const mockHighPriorityJob: Job<RespostaRapidaJobData> = {
        id: 'job-api-error-456',
        name: 'resposta-intent-api-error-test',
        data: capturedHighPriorityJob!,
      } as any;

      const highPriorityResult = await processRespostaRapidaTask(mockHighPriorityJob);

      // Assert: Worker should handle API error gracefully
      expect(highPriorityResult.success).toBe(false);
      expect(highPriorityResult.error).toContain('Invalid API key');

      // Verify WhatsApp API was attempted
      expect(mockSendTextMessage).toHaveBeenCalledWith({
        recipientPhone: '+5511666666666',
        text: 'Test message for API error',
        whatsappApiKey: 'INVALID_API_KEY',
        phoneNumberId: '333333333',
        correlationId: capturedHighPriorityJob!.data.correlationId,
      });
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple concurrent webhook requests efficiently', async () => {
      // Arrange: Multiple webhook requests
      const webhookRequests = Array.from({ length: 5 }, (_, i) => ({
        payload: {
          originalDetectIntentRequest: {
            payload: {
              inbox_id: '4',
              contact_phone: `+551199999${String(i).padStart(4, '0')}`,
              interaction_type: 'intent',
              wamid: `wamid.concurrent_test_${i}`,
              whatsapp_api_key: `EAAG_CONCURRENT_${i}...`,
              phone_number_id: `99999${i}`,
              business_id: `88888${i}`,
              contact_source: 'whatsapp',
              message_id: 10000 + i,
              account_id: 20000 + i,
              account_name: `Concurrent Test ${i}`,
            },
          },
          queryResult: {
            intent: {
              displayName: `concurrent.test.${i}`,
            },
          },
        },
        request: new NextRequest('http://localhost:3000/api/admin/mtf-diamante/whatsapp/webhook', {
          method: 'POST',
          body: JSON.stringify({
            originalDetectIntentRequest: {
              payload: {
                inbox_id: '4',
                contact_phone: `+551199999${String(i).padStart(4, '0')}`,
                interaction_type: 'intent',
                wamid: `wamid.concurrent_test_${i}`,
                whatsapp_api_key: `EAAG_CONCURRENT_${i}...`,
                phone_number_id: `99999${i}`,
                business_id: `88888${i}`,
                contact_source: 'whatsapp',
                message_id: 10000 + i,
                account_id: 20000 + i,
                account_name: `Concurrent Test ${i}`,
              },
            },
            queryResult: {
              intent: {
                displayName: `concurrent.test.${i}`,
              },
            },
          }),
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      }));

      // Mock database responses for all requests
      mockPrisma.mapeamentoIntencao.findFirst.mockImplementation(async ({ where }) => ({
        id: `mapping-concurrent-${where.intentName}`,
        intentName: where.intentName,
        template: {
          id: `template-concurrent-${where.intentName}`,
          name: `Concurrent Template ${where.intentName}`,
          type: 'AUTOMATION_REPLY',
          simpleReplyText: `Response for ${where.intentName}`,
          interactiveContent: null,
          whatsappOfficialInfo: null,
        },
      }));

      // Mock queue job creation
      const capturedJobs: RespostaRapidaJobData[] = [];
      mockAddRespostaRapidaJob.mockImplementation(async (jobData) => {
        capturedJobs.push(jobData);
        return { id: `job-concurrent-${capturedJobs.length}` } as any;
      });

      // Act: Process all webhook requests concurrently
      const startTime = Date.now();
      const responses = await Promise.all(
        webhookRequests.map(({ request }) => webhookHandler(request))
      );
      const totalTime = Date.now() - startTime;

      // Assert: All webhooks should respond quickly
      expect(responses).toHaveLength(5);
      responses.forEach(response => {
        expect(response.status).toBe(202);
      });

      // Should process concurrently (not sequentially)
      expect(totalTime).toBeLessThan(2000); // Should be much faster than 5 * 400ms

      // Wait for async job enqueueing
      await new Promise(resolve => setTimeout(resolve, 200));

      // All jobs should be enqueued
      expect(mockAddRespostaRapidaJob).toHaveBeenCalledTimes(5);
      expect(mockAddPersistenciaCredenciaisJob).toHaveBeenCalledTimes(5);
      expect(capturedJobs).toHaveLength(5);

      // Verify job data
      capturedJobs.forEach((job, index) => {
        expect(job.data.intentName).toBe(`concurrent.test.${index}`);
        expect(job.data.contactPhone).toBe(`+551199999${String(index).padStart(4, '0')}`);
      });
    });

    it('should maintain correlation ID traceability throughout the flow', async () => {
      // Arrange: Webhook payload with specific correlation tracking
      const webhookPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511555555555',
            interaction_type: 'intent',
            wamid: 'wamid.correlation_test_789',
            whatsapp_api_key: 'EAAG_CORRELATION_TEST...',
            phone_number_id: '555555555',
            business_id: '666666666',
            contact_source: 'whatsapp',
            message_id: 55555,
            account_id: 44444,
            account_name: 'Correlation Test',
          },
        },
        queryResult: {
          intent: {
            displayName: 'correlation.test.intent',
          },
        },
      };

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/whatsapp/webhook', {
        method: 'POST',
        body: JSON.stringify(webhookPayload),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Mock database response
      mockPrisma.mapeamentoIntencao.findFirst.mockResolvedValueOnce({
        id: 'mapping-correlation-789',
        intentName: 'correlation.test.intent',
        template: {
          id: 'template-correlation-123',
          name: 'Correlation Test Template',
          type: 'AUTOMATION_REPLY',
          simpleReplyText: 'Correlation test message',
          interactiveContent: null,
          whatsappOfficialInfo: null,
        },
      });

      mockSendTextMessage.mockResolvedValueOnce({
        success: true,
        messageId: 'wamid.correlation_response_456',
        error: null,
      });

      // Mock queue job creation to capture correlation IDs
      let highPriorityCorrelationId: string | null = null;
      let lowPriorityCorrelationId: string | null = null;

      mockAddRespostaRapidaJob.mockImplementation(async (jobData) => {
        highPriorityCorrelationId = jobData.data.correlationId;
        return { id: 'job-correlation-high' } as any;
      });

      mockAddPersistenciaCredenciaisJob.mockImplementation(async (jobData) => {
        lowPriorityCorrelationId = jobData.data.correlationId;
        return { id: 'job-correlation-low' } as any;
      });

      // Act: Process webhook request
      const webhookResponse = await webhookHandler(request);
      const responseData = await webhookResponse.json();

      // Assert: Correlation ID is returned in webhook response
      expect(responseData.correlationId).toBeDefined();
      const webhookCorrelationId = responseData.correlationId;

      // Wait for async job enqueueing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert: Same correlation ID is used in both queues
      expect(highPriorityCorrelationId).toBe(webhookCorrelationId);
      expect(lowPriorityCorrelationId).toBe(webhookCorrelationId);

      // Simulate worker processing to verify correlation ID propagation
      const mockHighPriorityJob: Job<RespostaRapidaJobData> = {
        id: 'job-correlation-high',
        name: 'resposta-intent-correlation-test',
        data: {
          type: 'processarResposta',
          data: {
            inboxId: '4',
            contactPhone: '+5511555555555',
            interactionType: 'intent',
            intentName: 'correlation.test.intent',
            wamid: 'wamid.correlation_test_789',
            credentials: {
              token: 'EAAG_CORRELATION_TEST...',
              phoneNumberId: '555555555',
              businessId: '666666666',
            },
            correlationId: webhookCorrelationId,
          },
        },
      } as any;

      const highPriorityResult = await processRespostaRapidaTask(mockHighPriorityJob);

      // Assert: Correlation ID is maintained in worker result
      expect(highPriorityResult.correlationId).toBe(webhookCorrelationId);

      // Verify correlation ID is passed to WhatsApp API
      expect(mockSendTextMessage).toHaveBeenCalledWith({
        recipientPhone: '+5511555555555',
        text: 'Correlation test message',
        whatsappApiKey: 'EAAG_CORRELATION_TEST...',
        phoneNumberId: '555555555',
        correlationId: webhookCorrelationId,
      });
    });
  });
});

export {};