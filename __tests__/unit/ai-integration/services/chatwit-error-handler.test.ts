/**
 * Unit tests for Chatwit error handler
 * Tests error classification and retry logic
 */

import { ChatwitErrorHandler } from '@/lib/ai-integration/services/chatwit-error-handler';

describe('ChatwitErrorHandler', () => {
  let errorHandler: ChatwitErrorHandler;

  beforeEach(() => {
    errorHandler = new ChatwitErrorHandler();
  });

  describe('handleError', () => {
    const mockContext = {
      conversationId: 123,
      accountId: 456,
      channel: 'whatsapp' as const,
      traceId: 'test-trace-123',
      attemptCount: 1,
      originalContent: 'Test message'
    };

    it('should handle 400 errors as dlq', () => {
      const error = {
        response: {
          status: 400,
          data: { message: 'Invalid request format' },
        },
        isAxiosError: true,
        message: 'Bad Request'
      };

      const result = errorHandler.handleError(error as any, mockContext);

      expect(result.action).toBe('dlq');
      expect(result.reason).toContain('Bad request');
    });

    it('should handle 401 errors as dlq', () => {
      const error = {
        response: {
          status: 401,
          data: { message: 'Invalid access token' },
        },
        isAxiosError: true,
        message: 'Unauthorized'
      };

      const result = errorHandler.handleError(error as any, mockContext);

      expect(result.action).toBe('dlq');
      expect(result.reason).toContain('Authentication failed');
    });

    it('should handle 429 errors with retry', () => {
      const error = {
        response: {
          status: 429,
          headers: { 'retry-after': '5' },
        },
        isAxiosError: true,
        message: 'Too Many Requests'
      };

      const result = errorHandler.handleError(error as any, mockContext);

      expect(result.action).toBe('retry');
      expect(result.reason).toContain('Rate limited');
    });

    it('should handle 500 errors with retry', () => {
      const error = {
        response: {
          status: 500,
          data: { message: 'Internal Server Error' },
        },
        isAxiosError: true,
        message: 'Internal Server Error'
      };

      const result = errorHandler.handleError(error as any, mockContext);

      expect(result.action).toBe('retry');
      expect(result.reason).toContain('Server error');
    });

    it('should handle network errors with retry', () => {
      const error = new Error('ECONNREFUSED: Connection refused');

      const result = errorHandler.handleError(error, mockContext);

      expect(result.action).toBe('retry');
      expect(result.reason).toContain('Network error');
    });

    it('should handle validation errors with fallback', () => {
      const error = new Error('validation error: Invalid format');

      const result = errorHandler.handleError(error, mockContext);

      expect(result.action).toBe('fallback');
      expect(result.reason).toContain('Validation error');
    });

    it('should handle unknown errors as dlq', () => {
      const error = new Error('Unknown error occurred');

      const result = errorHandler.handleError(error, mockContext);

      expect(result.action).toBe('dlq');
      expect(result.reason).toContain('Unknown error');
    });

    it('should handle errors without data', () => {
      const error = {
        response: {
          status: 503,
        },
        isAxiosError: true,
        message: 'Service Unavailable'
      };

      const result = errorHandler.handleError(error as any, mockContext);

      expect(result.action).toBe('retry');
      expect(result.reason).toContain('Server error');
    });
  });

  describe('createHandoffPayload', () => {
    const mockContext = {
      conversationId: 123,
      accountId: 456,
      channel: 'whatsapp' as const,
      traceId: 'test-trace-123',
      attemptCount: 1,
      originalContent: 'Test message'
    };

    it('should create handoff payload with correct structure', () => {
      const payload = errorHandler.createHandoffPayload(mockContext, 'API error');

      expect(payload.content).toBe('Acionei um atendente humano');
      expect(payload.additionalAttributes.provider).toBe('meta');
      expect(payload.additionalAttributes.channel).toBe('whatsapp');
      expect(payload.additionalAttributes.trace_id).toBe('test-trace-123');
      expect(payload.additionalAttributes.handoff_reason).toBe('API error');
    });
  });

  describe('createSimpleTextFallback', () => {
    const mockContext = {
      conversationId: 123,
      accountId: 456,
      channel: 'whatsapp' as const,
      traceId: 'test-trace-123',
      attemptCount: 1,
      originalContent: '**Bold text** and *italic text*'
    };

    it('should create simple text fallback', () => {
      const payload = errorHandler.createSimpleTextFallback(mockContext);

      expect(payload.content).toBe('Bold text and italic text');
      expect(payload.additionalAttributes.fallback_reason).toBe('interactive_content_failed');
    });

    it('should handle empty content', () => {
      const contextWithEmptyContent = {
        ...mockContext,
        originalContent: ''
      };

      const payload = errorHandler.createSimpleTextFallback(contextWithEmptyContent);

      expect(payload.content).toBe('Como posso ajudar?');
    });
  });

  describe('shouldAlert', () => {
    it('should return true for dlq errors with error level', () => {
      const action = {
        action: 'dlq' as const,
        reason: 'Test error',
        alertLevel: 'error' as const
      };

      expect(errorHandler.shouldAlert(action)).toBe(true);
    });

    it('should return true for dlq errors with critical level', () => {
      const action = {
        action: 'dlq' as const,
        reason: 'Test error',
        alertLevel: 'critical' as const
      };

      expect(errorHandler.shouldAlert(action)).toBe(true);
    });

    it('should return false for dlq errors with warning level', () => {
      const action = {
        action: 'dlq' as const,
        reason: 'Test error',
        alertLevel: 'warning' as const
      };

      expect(errorHandler.shouldAlert(action)).toBe(false);
    });

    it('should return false for non-dlq actions', () => {
      const action = {
        action: 'retry' as const,
        delay: 1000,
        reason: 'Test retry'
      };

      expect(errorHandler.shouldAlert(action)).toBe(false);
    });
  });

  describe('getAlertSeverity', () => {
    it('should return correct severity levels', () => {
      const warningAction = {
        action: 'dlq' as const,
        reason: 'Test warning',
        alertLevel: 'warning' as const
      };

      const errorAction = {
        action: 'dlq' as const,
        reason: 'Test error',
        alertLevel: 'error' as const
      };

      const criticalAction = {
        action: 'dlq' as const,
        reason: 'Test critical',
        alertLevel: 'critical' as const
      };

      expect(errorHandler.getAlertSeverity(warningAction)).toBe('low');
      expect(errorHandler.getAlertSeverity(errorAction)).toBe('medium');
      expect(errorHandler.getAlertSeverity(criticalAction)).toBe('critical');
    });

    it('should return low for non-dlq actions', () => {
      const action = {
        action: 'retry' as const,
        delay: 1000,
        reason: 'Test retry'
      };

      expect(errorHandler.getAlertSeverity(action)).toBe('low');
    });
  });
});