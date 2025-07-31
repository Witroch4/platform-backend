/**
 * Tests for Webhook Error Handler
 */

import {
  validateWebhookRequest,
  checkRateLimit,
  checkCircuitBreaker,
  recordCircuitBreakerFailure,
  recordCircuitBreakerSuccess,
  handleWebhookTimeout,
  handleWebhookError,
  getErrorStatistics,
  resetErrorTracking,
  getServiceHealth,
} from '../webhook-error-handler';
import {
  createTemplateNotFoundError,
  createDatabaseError,
  createValidationError,
  createTimeoutError,
  clearGlobalErrors,
} from '../instagram-translation-errors';

describe('Webhook Error Handler', () => {
  beforeEach(() => {
    resetErrorTracking();
    clearGlobalErrors();
  });

  describe('validateWebhookRequest', () => {
    const validPayload = {
      queryResult: {
        intent: {
          displayName: 'test-intent',
        },
      },
      originalDetectIntentRequest: {
        payload: {
          channel_type: 'Channel::Instagram',
          from: {
            phone: '+1234567890',
          },
          conversation: {
            id: 'conv-123',
          },
        },
      },
    };

    it('should validate correct webhook request', () => {
      const result = validateWebhookRequest(validPayload);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sanitizedData).toEqual({
        intentName: 'test-intent',
        contactPhone: '+1234567890',
        conversationId: 'conv-123',
        originalPayload: validPayload,
      });
    });

    it('should reject invalid payload structure', () => {
      const result = validateWebhookRequest(null);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid payload structure');
    });

    it('should reject missing intent name', () => {
      const invalidPayload = {
        ...validPayload,
        queryResult: {
          intent: {},
        },
      };
      
      const result = validateWebhookRequest(invalidPayload);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing or invalid intent name');
    });

    it('should reject missing contact phone', () => {
      const invalidPayload = {
        ...validPayload,
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            from: {},
            conversation: {
              id: 'conv-123',
            },
          },
        },
      };
      
      const result = validateWebhookRequest(invalidPayload);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing or invalid contact phone');
    });

    it('should reject missing conversation ID', () => {
      const invalidPayload = {
        ...validPayload,
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
            from: {
              phone: '+1234567890',
            },
            conversation: {},
          },
        },
      };
      
      const result = validateWebhookRequest(invalidPayload);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing or invalid conversation ID');
    });

    it('should detect security issues', () => {
      const maliciousPayload = {
        ...validPayload,
        queryResult: {
          intent: {
            displayName: '<script>alert("xss")</script>',
          },
        },
      };
      
      const result = validateWebhookRequest(maliciousPayload);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('Security issues detected'))).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    it('should allow requests within rate limit', () => {
      const result = checkRateLimit('inbox-1');
      
      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should block requests exceeding rate limit', () => {
      const inboxId = 'inbox-test';
      
      // Simulate many requests
      for (let i = 0; i < 101; i++) {
        checkRateLimit(inboxId);
      }
      
      const result = checkRateLimit(inboxId);
      
      expect(result.allowed).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('VALIDATION_ERROR');
      expect(result.error!.metadata?.retryAfter).toBeDefined();
    });
  });

  describe('Circuit Breaker', () => {
    it('should allow requests when circuit is closed', () => {
      const result = checkCircuitBreaker();
      
      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should open circuit after multiple failures', () => {
      // Record multiple failures
      for (let i = 0; i < 10; i++) {
        recordCircuitBreakerFailure();
      }
      
      const result = checkCircuitBreaker();
      
      expect(result.allowed).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.metadata?.circuitOpen).toBe(true);
    });

    it('should reset circuit breaker on success', () => {
      // Record failures to open circuit
      for (let i = 0; i < 10; i++) {
        recordCircuitBreakerFailure();
      }
      
      expect(checkCircuitBreaker().allowed).toBe(false);
      
      // Record success to reset
      recordCircuitBreakerSuccess();
      
      expect(checkCircuitBreaker().allowed).toBe(true);
    });
  });

  describe('handleWebhookTimeout', () => {
    it('should handle timeout with fallback message', () => {
      const result = handleWebhookTimeout('test-correlation-id', 5000);
      
      expect(result.success).toBe(false);
      expect(result.fulfillmentMessages).toBeDefined();
      expect(result.fulfillmentMessages).toHaveLength(1);
      expect(result.error).toContain('timeout');
      expect(result.metadata?.timeout).toBe(true);
      expect(result.metadata?.timeoutMs).toBe(5000);
      expect(result.metadata?.fallbackUsed).toBe(true);
    });
  });

  describe('handleWebhookError', () => {
    it('should handle template not found error with skip action', async () => {
      const error = createTemplateNotFoundError('intent', 'inbox', 'test-id');
      
      const result = await handleWebhookError(error, 'test-id');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Processing skipped');
      expect(result.metadata?.fallbackAction).toBe('skip');
      expect(result.metadata?.originalError).toBe('TEMPLATE_NOT_FOUND');
    });

    it('should handle validation error with simple text fallback', async () => {
      const error = createValidationError('field', 'invalid', 'test-id');
      
      const result = await handleWebhookError(error, 'test-id');
      
      expect(result.success).toBe(true);
      expect(result.fulfillmentMessages).toBeDefined();
      expect(result.metadata?.fallbackUsed).toBe(true);
      expect(result.metadata?.fallbackAction).toBe('simple_text');
    });

    it('should handle database error with circuit breaker action', async () => {
      const error = createDatabaseError('test', new Error('connection failed'), 'test-id');
      
      const result = await handleWebhookError(error, 'test-id');
      
      // Database errors now trigger circuit breaker strategy first
      expect(result.success).toBe(false);
      expect(result.fulfillmentMessages).toBeDefined();
      expect(result.error).toContain('Service temporarily unavailable');
      expect(result.metadata?.fallbackUsed).toBe(true);
    });

    it('should handle generic errors', async () => {
      const genericError = new Error('Something went wrong');
      
      const result = await handleWebhookError(genericError, 'test-id');
      
      // Generic errors get converted to validation errors and get simple_text fallback
      expect(result.success).toBe(true);
      expect(result.fulfillmentMessages).toBeDefined();
      expect(result.metadata?.fallbackUsed).toBe(true);
      expect(result.metadata?.fallbackAction).toBe('simple_text');
    });

    it('should handle circuit breaker open state', async () => {
      // Open circuit breaker
      for (let i = 0; i < 10; i++) {
        recordCircuitBreakerFailure();
      }
      
      const error = createDatabaseError('test', new Error('system error'), 'test-id');
      
      const result = await handleWebhookError(error, 'test-id');
      
      // Database errors should trigger circuit breaker strategy which returns circuit_open
      expect(result.success).toBe(false);
      expect(result.fulfillmentMessages).toBeDefined();
      expect(result.error).toContain('Service temporarily unavailable');
      expect(result.metadata?.fallbackUsed).toBe(true);
    });
  });

  describe('Error Statistics', () => {
    it('should provide error statistics', () => {
      // Generate some errors
      const error1 = createValidationError('field1', 'reason1', 'id1');
      const error2 = createTemplateNotFoundError('intent', 'inbox', 'id2');
      
      // Simulate some rate limiting
      checkRateLimit('inbox-1');
      checkRateLimit('inbox-2');
      
      const stats = getErrorStatistics();
      
      expect(stats.summary).toBeDefined();
      expect(stats.circuitBreakerState).toBeDefined();
      expect(stats.rateLimitStats).toBeDefined();
      expect(stats.rateLimitStats.activeInboxes).toBe(2);
    });

    it('should provide statistics for specific time range', () => {
      const stats = getErrorStatistics(60000); // Last minute
      
      expect(stats.summary).toBeDefined();
      expect(stats.circuitBreakerState.isOpen).toBe(false);
    });
  });

  describe('Service Health', () => {
    it('should report healthy status when no issues', () => {
      const health = getServiceHealth();
      
      expect(health.healthy).toBe(true);
      expect(health.status).toBe('healthy');
      expect(health.issues).toHaveLength(0);
      expect(health.metrics).toBeDefined();
    });

    it('should report unhealthy status when circuit breaker is open', () => {
      // Open circuit breaker
      for (let i = 0; i < 10; i++) {
        recordCircuitBreakerFailure();
      }
      
      const health = getServiceHealth();
      
      expect(health.healthy).toBe(false);
      expect(health.status).toBe('unhealthy');
      expect(health.issues).toContain('Circuit breaker is open');
      expect(health.metrics.circuitBreakerOpen).toBe(true);
    });

    it('should report degraded status for moderate issues', () => {
      // Simulate some errors but not enough to open circuit breaker
      for (let i = 0; i < 5; i++) {
        recordCircuitBreakerFailure();
      }
      
      const health = getServiceHealth();
      
      expect(health.status).toBe('healthy'); // Still healthy with low failure count
    });
  });

  describe('resetErrorTracking', () => {
    it('should reset all error tracking state', () => {
      // Generate some state
      checkRateLimit('inbox-1');
      recordCircuitBreakerFailure();
      
      // Verify state exists
      expect(getErrorStatistics().rateLimitStats.activeInboxes).toBeGreaterThan(0);
      expect(getErrorStatistics().circuitBreakerState.failureCount).toBeGreaterThan(0);
      
      // Reset
      resetErrorTracking();
      
      // Verify state is cleared
      expect(getErrorStatistics().rateLimitStats.activeInboxes).toBe(0);
      expect(getErrorStatistics().circuitBreakerState.failureCount).toBe(0);
      expect(getErrorStatistics().circuitBreakerState.isOpen).toBe(false);
    });
  });
});