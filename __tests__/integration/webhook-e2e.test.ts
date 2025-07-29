/**
 * Integration Tests for End-to-End Webhook Flow
 * Tests the complete flow from webhook dispatcher through refactored workers
 * Requirements: 7.1, 7.2, 7.3, 8.1, 8.2
 */

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/admin/mtf-diamante/dialogflow/webhook/route';
import { respostaRapidaQueue } from '@/lib/queue/resposta-rapida.queue';
import { persistenciaCredenciaisQueue } from '@/lib/queue/persistencia-credenciais.queue';
import { prisma } from '@/lib/prisma';
import { credentialsCache } from '@/lib/cache/credentials-cache';

// Mock external dependencies
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
    markCredentialsUpdated: jest.fn(),
    isCredentialsUpdated: jest.fn(),
  },
  cacheInvalidationManager: {
    invalidateRelatedCaches: jest.fn(),
  },
}));

// Mock WhatsApp API
jest.mock('@/lib/whatsapp-messages', () => ({
  sendWhatsAppMessage: jest.fn(),
}));

// Mock Redis connection
jest.mock('@/lib/redis', () => ({
  connection: {
    host: 'localhost',
    port: 6379,
  },
}));

describe('End-to-End Webhook Flow Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up queues after each test
    await respostaRapidaQueue.obliterate({ force: true });
    await persistenciaCredenciaisQueue.obliterate({ force: true });
  });

  describe('Intent Processing Flow', () => {
    it('should process complete intent webhook flow with 202 response', async () => {
      // Arrange
      const webhookPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.test123',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: 'test-phone-id',
            business_id: 'test-business-id',
            contact_source: 'webhook',
            message_id: 123,
            account_id: 456,
            account_name: 'Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'welcome',
          },
        },
      };

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/dialogflow/webhook', {
        method: 'POST',
        body: JSON.stringify(webhookPayload),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Mock database responses
      (prisma.mapeamentoIntencao.findFirst as jest.Mock).mockResolvedValue({
        id: 'mapping-123',
        template: {
          id: 'template-123',
          name: 'Welcome Template',
          type: 'AUTOMATION_REPLY',
          simpleReplyText: 'Olá! Bem-vindo ao nosso atendimento.',
        },
      });

      (prisma.chatwitInbox.findFirst as jest.Mock).mockResolvedValue({
        id: 'inbox-123',
        inboxId: '4',
        whatsappApiKey: null,
        phoneNumberId: null,
        whatsappBusinessAccountId: null,
      });

      (credentialsCache.isCredentialsUpdated as jest.Mock).mockResolvedValue(false);

      // Act
      const response = await POST(request);
      const responseData = await response.json();

      // Assert - Webhook Response
      expect(response.status).toBe(202);
      expect(responseData).toHaveProperty('correlationId');
      expect(responseData.correlationId).toMatch(/^\d+-[a-z0-9]+$/);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('X-Correlation-ID')).toBe(responseData.correlationId);

      // Wait for async job processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert - High Priority Queue
      const highPriorityJobs = await respostaRapidaQueue.getJobs(['waiting', 'active', 'completed']);
      expect(highPriorityJobs.length).toBeGreaterThan(0);
      
      const intentJob = highPriorityJobs.find(job => 
        job.data.type === 'processarResposta' && 
        job.data.data.interactionType === 'intent'
      );
      expect(intentJob).toBeDefined();
      expect(intentJob?.data.data.intentName).toBe('welcome');
      expect(intentJob?.data.data.correlationId).toBe(responseData.correlationId);

      // Assert - Low Priority Queue
      const lowPriorityJobs = await persistenciaCredenciaisQueue.getJobs(['waiting', 'active', 'completed']);
      expect(lowPriorityJobs.length).toBeGreaterThan(0);
      
      const credentialsJob = lowPriorityJobs.find(job => 
        job.data.type === 'atualizarCredenciais'
      );
      expect(credentialsJob).toBeDefined();
      expect(credentialsJob?.data.data.inboxId).toBe('4');
      expect(credentialsJob?.data.data.correlationId).toBe(responseData.correlationId);
    });

    it('should handle intent processing with template mapping', async () => {
      // Arrange
      const webhookPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.test123',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: 'test-phone-id',
            business_id: 'test-business-id',
            contact_source: 'webhook',
            message_id: 123,
            account_id: 456,
            account_name: 'Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'product_info',
          },
        },
      };

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/dialogflow/webhook', {
        method: 'POST',
        body: JSON.stringify(webhookPayload),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Mock template with interactive content
      (prisma.mapeamentoIntencao.findFirst as jest.Mock).mockResolvedValue({
        id: 'mapping-456',
        template: {
          id: 'template-456',
          name: 'Product Info Template',
          type: 'INTERACTIVE_MESSAGE',
          interactiveContent: {
            body: { text: 'Escolha uma categoria de produto:' },
            actionReplyButton: [
              { id: 'btn-electronics', title: 'Eletrônicos' },
              { id: 'btn-clothing', title: 'Roupas' },
            ],
          },
        },
      });

      // Act
      const response = await POST(request);
      const responseData = await response.json();

      // Assert
      expect(response.status).toBe(202);
      expect(responseData.correlationId).toBeDefined();

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify job was created with correct template data
      const jobs = await respostaRapidaQueue.getJobs(['waiting', 'active', 'completed']);
      const intentJob = jobs.find(job => 
        job.data.data.intentName === 'product_info'
      );
      
      expect(intentJob).toBeDefined();
      expect(intentJob?.data.data.interactionType).toBe('intent');
    });
  });

  describe('Button Click Processing Flow', () => {
    it('should process complete button click webhook flow', async () => {
      // Arrange
      const webhookPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'button_reply',
            button_id: 'btn-confirm',
            wamid: 'wamid.test456',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: 'test-phone-id',
            business_id: 'test-business-id',
            contact_source: 'webhook',
            message_id: 789,
            account_id: 456,
            account_name: 'Test Account',
            interactive: {
              type: 'button_reply',
              button_reply: {
                id: 'btn-confirm',
                title: 'Confirmar',
              },
            },
          },
        },
        queryResult: {
          intent: {
            displayName: 'Default Fallback Intent',
          },
        },
      };

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/dialogflow/webhook', {
        method: 'POST',
        body: JSON.stringify(webhookPayload),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Mock button action mapping
      (prisma.mapeamentoBotao.findFirst as jest.Mock).mockResolvedValue({
        id: 'button-mapping-123',
        buttonId: 'btn-confirm',
        actionType: 'SEND_TEMPLATE',
        actionPayload: {
          templateName: 'confirmation_template',
          parameters: [],
        },
      });

      // Act
      const response = await POST(request);
      const responseData = await response.json();

      // Assert
      expect(response.status).toBe(202);
      expect(responseData.correlationId).toBeDefined();

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify button job was created
      const jobs = await respostaRapidaQueue.getJobs(['waiting', 'active', 'completed']);
      const buttonJob = jobs.find(job => 
        job.data.data.interactionType === 'button_reply'
      );
      
      expect(buttonJob).toBeDefined();
      expect(buttonJob?.data.data.buttonId).toBe('btn-confirm');
      expect(buttonJob?.data.data.correlationId).toBe(responseData.correlationId);
    });

    it('should handle button click with emoji reaction fallback', async () => {
      // Arrange
      const webhookPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'button_reply',
            button_id: 'btn-like',
            wamid: 'wamid.test789',
            whatsapp_api_key: 'test-api-key',
            phone_number_id: 'test-phone-id',
            business_id: 'test-business-id',
            contact_source: 'webhook',
            message_id: 999,
            account_id: 456,
            account_name: 'Test Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'Default Fallback Intent',
          },
        },
      };

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/dialogflow/webhook', {
        method: 'POST',
        body: JSON.stringify(webhookPayload),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Mock no button mapping found (will trigger emoji fallback)
      (prisma.mapeamentoBotao.findFirst as jest.Mock).mockResolvedValue(null);

      // Act
      const response = await POST(request);
      const responseData = await response.json();

      // Assert
      expect(response.status).toBe(202);
      expect(responseData.correlationId).toBeDefined();

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify job was still created (will handle fallback in worker)
      const jobs = await respostaRapidaQueue.getJobs(['waiting', 'active', 'completed']);
      const buttonJob = jobs.find(job => 
        job.data.data.buttonId === 'btn-like'
      );
      
      expect(buttonJob).toBeDefined();
    });
  });

  describe('Data Persistence Flow', () => {
    it('should update credentials and create lead in low priority queue', async () => {
      // Arrange
      const webhookPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '5',
            contact_phone: '+5511888888888',
            interaction_type: 'intent',
            wamid: 'wamid.persistence123',
            whatsapp_api_key: 'new-api-key',
            phone_number_id: 'new-phone-id',
            business_id: 'new-business-id',
            contact_source: 'webhook',
            message_id: 555,
            account_id: 777,
            account_name: 'New Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'contact_info',
          },
        },
      };

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/dialogflow/webhook', {
        method: 'POST',
        body: JSON.stringify(webhookPayload),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Mock credentials not recently updated
      (credentialsCache.isCredentialsUpdated as jest.Mock).mockResolvedValue(false);
      
      // Mock lead not found (will create new)
      (prisma.lead.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.lead.create as jest.Mock).mockResolvedValue({
        id: 'lead-new-123',
        phone: '+5511888888888',
        source: 'CHATWIT_OAB',
      });

      // Act
      const response = await POST(request);
      const responseData = await response.json();

      // Assert
      expect(response.status).toBe(202);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify persistence job was created
      const persistenceJobs = await persistenciaCredenciaisQueue.getJobs(['waiting', 'active', 'completed']);
      const credentialsJob = persistenceJobs.find(job => 
        job.data.type === 'atualizarCredenciais'
      );
      
      expect(credentialsJob).toBeDefined();
      expect(credentialsJob?.data.data.inboxId).toBe('5');
      expect(credentialsJob?.data.data.whatsappApiKey).toBe('new-api-key');
      expect(credentialsJob?.data.data.phoneNumberId).toBe('new-phone-id');
      expect(credentialsJob?.data.data.businessId).toBe('new-business-id');
      expect(credentialsJob?.data.data.leadData.contactPhone).toBe('+5511888888888');
    });

    it('should skip credentials update when recently updated (cache hit)', async () => {
      // Arrange
      const webhookPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.cached123',
            whatsapp_api_key: 'cached-api-key',
            phone_number_id: 'cached-phone-id',
            business_id: 'cached-business-id',
            contact_source: 'webhook',
            message_id: 111,
            account_id: 222,
            account_name: 'Cached Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'cached_intent',
          },
        },
      };

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/dialogflow/webhook', {
        method: 'POST',
        body: JSON.stringify(webhookPayload),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Mock credentials recently updated (cache hit)
      (credentialsCache.isCredentialsUpdated as jest.Mock).mockResolvedValue(true);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(202);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify persistence job was still created (but will skip DB update)
      const persistenceJobs = await persistenciaCredenciaisQueue.getJobs(['waiting', 'active', 'completed']);
      expect(persistenceJobs.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should return 202 even when database queries fail', async () => {
      // Arrange
      const webhookPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.error123',
            whatsapp_api_key: 'error-api-key',
            phone_number_id: 'error-phone-id',
            business_id: 'error-business-id',
            contact_source: 'webhook',
            message_id: 999,
            account_id: 888,
            account_name: 'Error Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'error_intent',
          },
        },
      };

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/dialogflow/webhook', {
        method: 'POST',
        body: JSON.stringify(webhookPayload),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Mock database error
      (prisma.mapeamentoIntencao.findFirst as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      // Act
      const response = await POST(request);
      const responseData = await response.json();

      // Assert - Should still return 202 to prevent Dialogflow retries
      expect(response.status).toBe(202);
      expect(responseData.correlationId).toBeDefined();
    });

    it('should handle malformed webhook payload gracefully', async () => {
      // Arrange
      const malformedPayload = {
        // Missing required fields
        invalidData: 'test',
      };

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/dialogflow/webhook', {
        method: 'POST',
        body: JSON.stringify(malformedPayload),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Act
      const response = await POST(request);
      const responseData = await response.json();

      // Assert - Should still return 202 with error indication
      expect(response.status).toBe(202);
      expect(responseData.correlationId).toBeDefined();
      expect(responseData).toHaveProperty('error');
    });

    it('should handle queue connection failures gracefully', async () => {
      // Arrange
      const webhookPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.queue_error123',
            whatsapp_api_key: 'queue-error-api-key',
            phone_number_id: 'queue-error-phone-id',
            business_id: 'queue-error-business-id',
            contact_source: 'webhook',
            message_id: 777,
            account_id: 666,
            account_name: 'Queue Error Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'queue_error_intent',
          },
        },
      };

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/dialogflow/webhook', {
        method: 'POST',
        body: JSON.stringify(webhookPayload),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Mock queue add failure
      jest.spyOn(respostaRapidaQueue, 'add').mockRejectedValue(
        new Error('Redis connection failed')
      );

      // Act
      const response = await POST(request);
      const responseData = await response.json();

      // Assert - Should still return 202
      expect(response.status).toBe(202);
      expect(responseData.correlationId).toBeDefined();
    });
  });

  describe('Performance Requirements', () => {
    it('should respond within 100ms requirement', async () => {
      // Arrange
      const webhookPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.perf123',
            whatsapp_api_key: 'perf-api-key',
            phone_number_id: 'perf-phone-id',
            business_id: 'perf-business-id',
            contact_source: 'webhook',
            message_id: 123,
            account_id: 456,
            account_name: 'Perf Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'performance_test',
          },
        },
      };

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/dialogflow/webhook', {
        method: 'POST',
        body: JSON.stringify(webhookPayload),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Act
      const startTime = Date.now();
      const response = await POST(request);
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Assert
      expect(response.status).toBe(202);
      expect(responseTime).toBeLessThan(100); // Should respond within 100ms
    });

    it('should handle concurrent requests efficiently', async () => {
      // Arrange
      const createRequest = (id: number) => {
        const webhookPayload = {
          originalDetectIntentRequest: {
            payload: {
              inbox_id: '4',
              contact_phone: `+551199999${id.toString().padStart(4, '0')}`,
              interaction_type: 'intent',
              wamid: `wamid.concurrent${id}`,
              whatsapp_api_key: 'concurrent-api-key',
              phone_number_id: 'concurrent-phone-id',
              business_id: 'concurrent-business-id',
              contact_source: 'webhook',
              message_id: id,
              account_id: 456,
              account_name: 'Concurrent Account',
            },
          },
          queryResult: {
            intent: {
              displayName: `concurrent_intent_${id}`,
            },
          },
        };

        return new NextRequest('http://localhost:3000/api/admin/mtf-diamante/dialogflow/webhook', {
          method: 'POST',
          body: JSON.stringify(webhookPayload),
          headers: {
            'Content-Type': 'application/json',
          },
        });
      };

      // Create 10 concurrent requests
      const requests = Array.from({ length: 10 }, (_, i) => createRequest(i + 1));

      // Act
      const startTime = Date.now();
      const responses = await Promise.all(requests.map(req => POST(req)));
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Assert
      expect(responses).toHaveLength(10);
      responses.forEach(response => {
        expect(response.status).toBe(202);
      });
      
      // Should handle 10 concurrent requests in reasonable time
      expect(totalTime).toBeLessThan(1000); // Less than 1 second for 10 requests
    });
  });

  describe('Correlation ID Tracking', () => {
    it('should maintain correlation ID throughout the entire flow', async () => {
      // Arrange
      const webhookPayload = {
        originalDetectIntentRequest: {
          payload: {
            inbox_id: '4',
            contact_phone: '+5511999999999',
            interaction_type: 'intent',
            wamid: 'wamid.correlation123',
            whatsapp_api_key: 'correlation-api-key',
            phone_number_id: 'correlation-phone-id',
            business_id: 'correlation-business-id',
            contact_source: 'webhook',
            message_id: 123,
            account_id: 456,
            account_name: 'Correlation Account',
          },
        },
        queryResult: {
          intent: {
            displayName: 'correlation_test',
          },
        },
      };

      const request = new NextRequest('http://localhost:3000/api/admin/mtf-diamante/dialogflow/webhook', {
        method: 'POST',
        body: JSON.stringify(webhookPayload),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Act
      const response = await POST(request);
      const responseData = await response.json();

      // Assert
      const correlationId = responseData.correlationId;
      expect(correlationId).toBeDefined();
      expect(correlationId).toMatch(/^\d+-[a-z0-9]+$/);
      expect(response.headers.get('X-Correlation-ID')).toBe(correlationId);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify correlation ID is present in all jobs
      const highPriorityJobs = await respostaRapidaQueue.getJobs(['waiting', 'active', 'completed']);
      const lowPriorityJobs = await persistenciaCredenciaisQueue.getJobs(['waiting', 'active', 'completed']);

      const allJobs = [...highPriorityJobs, ...lowPriorityJobs];
      allJobs.forEach(job => {
        expect(job.data.data.correlationId).toBe(correlationId);
      });
    });
  });
});