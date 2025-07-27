/**
 * Unit tests for webhook dispatcher with correlation ID tracking
 * Requirements: 1.1, 1.2, 1.3, 2.2, 2.3, 8.1, 8.2
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/queue/mtf-diamante-webhook.queue');
jest.mock('@/lib/webhook-utils');
jest.mock('@/lib/dialogflow-database-queries');
jest.mock('@/lib/queue/resposta-rapida.queue');
jest.mock('@/lib/queue/persistencia-credenciais.queue');

// Import the webhook handler
import { POST } from '@/app/api/admin/mtf-diamante/whatsapp/webhook/route';
import {
  generateCorrelationId,
  logWithCorrelationId,
} from '@/lib/queue/mtf-diamante-webhook.queue';
import {
  extractUnifiedWebhookData,
  validateUnifiedWebhookData,
  sanitizeWebhookPayload,
  UnifiedWebhookPayload,
} from '@/lib/webhook-utils';

describe('Webhook Dispatcher', () => {
  let mockRequest: NextRequest;
  let mockPayload: any;
  let mockUnifiedData: UnifiedWebhookPayload;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock payload
    mockPayload = {
      originalDetectIntentRequest: {
        payload: {
          inbox_id: '4',
          contact_phone: '+5511999999999',
          interaction_type: 'intent',
          wamid: 'wamid.test123',
          whatsapp_api_key: 'test-api-key',
          phone_number_id: '123456789',
          business_id: 'business123',
          contact_source: 'chatwit',
          message_id: 12345,
          account_id: 1,
          account_name: 'Test Account',
        },
      },
      queryResult: {
        intent: {
          displayName: 'test.intent',
        },
      },
    };

    // Mock unified data
    mockUnifiedData = {
      inboxId: '4',
      contactPhone: '+5511999999999',
      interactionType: 'intent',
      intentName: 'test.intent',
      messageId: 'wamid.test123',
      conversationId: 'conv123',
      credentials: {
        whatsappApiKey: 'test-api-key',
        phoneNumberId: '123456789',
        businessId: 'business123',
      },
      contactSource: 'chatwit',
      originalPayload: mockPayload,
    };

    // Mock request
    mockRequest = {
      json: jest.fn().mockResolvedValue(mockPayload),
    } as any;

    // Mock functions
    (generateCorrelationId as jest.Mock).mockReturnValue('test-correlation-id');
    (extractUnifiedWebhookData as jest.Mock).mockReturnValue(mockUnifiedData);
    (validateUnifiedWebhookData as jest.Mock).mockReturnValue({
      isValid: true,
      errors: [],
    });
    (sanitizeWebhookPayload as jest.Mock).mockReturnValue(mockUnifiedData);
    (logWithCorrelationId as jest.Mock).mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Correlation ID Generation and Tracking', () => {
    test('should generate unique correlation ID for each request', async () => {
      const response = await POST(mockRequest);
      const responseData = await response.json();

      expect(generateCorrelationId).toHaveBeenCalledTimes(1);
      expect(responseData.correlationId).toBe('test-correlation-id');
    });

    test('should include correlation ID in response headers', async () => {
      const response = await POST(mockRequest);

      expect(response.headers.get('X-Correlation-ID')).toBe('test-correlation-id');
    });

    test('should use correlation ID in all log entries', async () => {
      await POST(mockRequest);

      expect(logWithCorrelationId).toHaveBeenCalledWith(
        'info',
        expect.any(String),
        'test-correlation-id',
        expect.any(Object)
      );
    });

    test('should generate fallback correlation ID on error', async () => {
      (mockRequest.json as jest.Mock).mockRejectedValue(new Error('Parse error'));

      const response = await POST(mockRequest);
      const responseData = await response.json();

      expect(responseData.correlationId).toBeDefined();
      expect(response.status).toBe(202);
    });
  });

  describe('Payload Extraction and Validation', () => {
    test('should extract unified webhook data correctly', async () => {
      await POST(mockRequest);

      expect(extractUnifiedWebhookData).toHaveBeenCalledWith(mockPayload);
      expect(validateUnifiedWebhookData).toHaveBeenCalledWith(mockUnifiedData);
      expect(sanitizeWebhookPayload).toHaveBeenCalledWith(mockUnifiedData);
    });

    test('should handle extraction errors gracefully', async () => {
      (extractUnifiedWebhookData as jest.Mock).mockImplementation(() => {
        throw new Error('Extraction failed');
      });

      const response = await POST(mockRequest);

      expect(response.status).toBe(202);
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    test('should validate payload data before processing', async () => {
      (validateUnifiedWebhookData as jest.Mock).mockReturnValue({
        isValid: false,
        errors: ['Missing required field: inbox_id'],
      });

      const response = await POST(mockRequest);

      expect(response.status).toBe(202);
      // Should fallback to legacy processing
    });

    test('should sanitize webhook payload for security', async () => {
      await POST(mockRequest);

      expect(sanitizeWebhookPayload).toHaveBeenCalledWith(mockUnifiedData);
    });
  });

  describe('Response Time Requirements', () => {
    test('should respond within 100ms under normal conditions', async () => {
      const startTime = Date.now();
      const response = await POST(mockRequest);
      const responseTime = Date.now() - startTime;

      expect(responseTime).toBeLessThan(100);
      expect(response.status).toBe(202);
    });

    test('should return 202 Accepted immediately', async () => {
      const response = await POST(mockRequest);

      expect(response.status).toBe(202);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
    });

    test('should use setImmediate for non-blocking job queuing', async () => {
      const setImmediateSpy = jest.spyOn(global, 'setImmediate');

      await POST(mockRequest);

      // Should have 3 setImmediate calls: high priority, low priority, and legacy
      expect(setImmediateSpy).toHaveBeenCalledTimes(3);

      setImmediateSpy.mockRestore();
    });
  });

  describe('Job Queuing', () => {
    test('should queue high priority job for user response', async () => {
      const { addRespostaRapidaJob } = await import('@/lib/queue/resposta-rapida.queue');

      await POST(mockRequest);

      // Wait for setImmediate to execute
      await new Promise(resolve => setImmediate(resolve));

      expect(addRespostaRapidaJob).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'processarResposta',
          data: expect.objectContaining({
            inboxId: '4',
            contactPhone: '+5511999999999',
            interactionType: 'intent',
            intentName: 'test.intent',
            correlationId: 'test-correlation-id',
          }),
        }),
        expect.objectContaining({
          correlationId: 'test-correlation-id',
        })
      );
    });

    test('should queue low priority job for data persistence', async () => {
      const { addPersistenciaCredenciaisJob } = await import('@/lib/queue/persistencia-credenciais.queue');

      await POST(mockRequest);

      // Wait for setImmediate to execute
      await new Promise(resolve => setImmediate(resolve));

      expect(addPersistenciaCredenciaisJob).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'atualizarCredenciais',
          data: expect.objectContaining({
            inboxId: '4',
            whatsappApiKey: 'test-api-key',
            phoneNumberId: '123456789',
            businessId: 'business123',
            correlationId: 'test-correlation-id',
          }),
        })
      );
    });

    test('should handle job queuing errors without affecting response', async () => {
      const { addRespostaRapidaJob } = await import('@/lib/queue/resposta-rapida.queue');
      (addRespostaRapidaJob as jest.Mock).mockRejectedValue(new Error('Queue error'));

      const response = await POST(mockRequest);

      expect(response.status).toBe(202);
      // Error should be logged but not affect response
    });
  });

  describe('Button Click Processing', () => {
    beforeEach(() => {
      mockUnifiedData.interactionType = 'button_reply';
      mockUnifiedData.buttonId = 'btn_test_123';
      delete mockUnifiedData.intentName;

      (extractUnifiedWebhookData as jest.Mock).mockReturnValue(mockUnifiedData);
    });

    test('should process button click interactions', async () => {
      const { addRespostaRapidaJob } = await import('@/lib/queue/resposta-rapida.queue');

      await POST(mockRequest);

      // Wait for setImmediate to execute
      await new Promise(resolve => setImmediate(resolve));

      expect(addRespostaRapidaJob).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'processarResposta',
          data: expect.objectContaining({
            interactionType: 'button_reply',
            buttonId: 'btn_test_123',
            correlationId: 'test-correlation-id',
          }),
        }),
        expect.any(Object)
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle JSON parsing errors gracefully', async () => {
      (mockRequest.json as jest.Mock).mockRejectedValue(new Error('Invalid JSON'));

      const response = await POST(mockRequest);

      expect(response.status).toBe(202);
      expect(response.headers.get('X-Correlation-ID')).toBeDefined();
    });

    test('should handle extraction errors with fallback', async () => {
      (extractUnifiedWebhookData as jest.Mock).mockImplementation(() => {
        throw new Error('Extraction failed');
      });

      const response = await POST(mockRequest);

      expect(response.status).toBe(202);
      // Should fallback to legacy processing
    });

    test('should never throw errors that would cause 500 responses', async () => {
      // Mock all possible error scenarios
      (mockRequest.json as jest.Mock).mockRejectedValue(new Error('Parse error'));
      (extractUnifiedWebhookData as jest.Mock).mockImplementation(() => {
        throw new Error('Extraction error');
      });

      const response = await POST(mockRequest);

      expect(response.status).toBe(202);
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    test('should include error information in response body', async () => {
      (mockRequest.json as jest.Mock).mockRejectedValue(new Error('Parse error'));

      const response = await POST(mockRequest);
      const responseData = await response.json();

      expect(responseData.error).toBe('Internal processing error');
      expect(responseData.correlationId).toBeDefined();
    });
  });

  describe('Legacy Compatibility', () => {
    test('should queue legacy tasks for backward compatibility', async () => {
      const { addStoreMessageTask, addUpdateApiKeyTask, addProcessIntentTask } = 
        await import('@/lib/queue/mtf-diamante-webhook.queue');

      await POST(mockRequest);

      // Wait for setImmediate to execute
      await new Promise(resolve => setImmediate(resolve));

      expect(addStoreMessageTask).toHaveBeenCalled();
      expect(addUpdateApiKeyTask).toHaveBeenCalled();
      expect(addProcessIntentTask).toHaveBeenCalled();
    });

    test('should convert unified data to legacy format', async () => {
      await POST(mockRequest);

      // Wait for setImmediate to execute
      await new Promise(resolve => setImmediate(resolve));

      // Legacy tasks should be called with converted data
      const { addStoreMessageTask } = await import('@/lib/queue/mtf-diamante-webhook.queue');
      expect(addStoreMessageTask).toHaveBeenCalledWith(
        expect.objectContaining({
          whatsappApiKey: 'test-api-key',
          messageId: 'wamid.test123',
          contactPhone: '+5511999999999',
          inboxId: '4',
        })
      );
    });
  });

  describe('Performance Monitoring', () => {
    test('should log processing time', async () => {
      await POST(mockRequest);

      expect(logWithCorrelationId).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('Response sent in'),
        'test-correlation-id'
      );
    });

    test('should log extraction time', async () => {
      await POST(mockRequest);

      // Should log unified webhook data with extraction time
      expect(logWithCorrelationId).toHaveBeenCalledWith(
        'info',
        expect.any(String),
        'test-correlation-id',
        expect.any(Number)
      );
    });
  });
});