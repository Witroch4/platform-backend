/**
 * Tests for Chatwit Integration Services
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ChatwitApiClient } from '@/lib/ai-integration/services/chatwit-api-client';
import { MessageFormatter } from '@/lib/ai-integration/services/message-formatter';
import { ChatwitErrorHandler } from '@/lib/ai-integration/services/chatwit-error-handler';
import { OutboundIdempotencyService } from '@/lib/ai-integration/services/outbound-idempotency';
import { RetryClassifier } from '@/lib/ai-integration/services/retry-classifier';
import { ChatwitMessagePayload } from '@/lib/ai-integration/types/chatwit-api';
import { WhatsAppInteractiveMessage } from '@/lib/ai-integration/types/channels';

// Mock Redis
jest.mock('@/lib/redis', () => ({
  redis: {
    get: jest.fn(),
    setex: jest.fn(),
    exists: jest.fn(),
    keys: jest.fn(),
    pipeline: jest.fn(() => ({
      get: jest.fn(),
      del: jest.fn(),
      exec: jest.fn()
    })),
    ttl: jest.fn()
  }
}));

// Mock log
jest.mock('@/lib/log', () => ({
  log: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('Chatwit API Client', () => {
  let client: ChatwitApiClient;

  beforeEach(() => {
    client = new ChatwitApiClient({
      baseUrl: 'http://localhost:3000',
      accessToken: 'test-token',
      timeout: 10000,
      retryConfig: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 8000,
        retryableStatuses: [429, 500, 502, 503, 504],
        nonRetryableStatuses: [400, 401, 403, 409]
      }
    });
  });

  it('should create client with proper configuration', () => {
    expect(client).toBeDefined();
  });

  it('should build message payload correctly', () => {
    const params = {
      accountId: 1,
      conversationId: 123,
      content: 'Test message',
      channel: 'whatsapp' as const,
      traceId: 'trace-123'
    };

    // Access private method for testing
    const payload = (client as any).buildMessagePayload(params);

    expect(payload).toEqual({
      content: 'Test message',
      message_type: 'outgoing',
      additional_attributes: {
        provider: 'meta',
        channel: 'whatsapp',
        schema_version: '1.0.0',
        trace_id: 'trace-123'
      }
    });
  });
});

describe('Message Formatter', () => {
  let formatter: MessageFormatter;

  beforeEach(() => {
    formatter = new MessageFormatter();
  });

  it('should format simple text message', () => {
    const result = formatter.formatTextMessage({
      content: 'Hello world',
      channel: 'whatsapp',
      traceId: 'trace-123'
    });

    expect(result).toEqual({
      content: 'Hello world',
      additionalAttributes: {
        provider: 'meta',
        channel: 'whatsapp',
        schema_version: '1.0.0',
        trace_id: 'trace-123'
      }
    });
  });

  it('should format WhatsApp interactive message', () => {
    const interactiveData: WhatsAppInteractiveMessage = {
      body: 'Choose an option',
      buttons: [
        { title: 'Option 1', id: 'opt1' },
        { title: 'Option 2', id: 'opt2' }
      ]
    };

    const result = formatter.formatMessage({
      content: 'Choose an option',
      channel: 'whatsapp',
      interactiveData,
      traceId: 'trace-123',
      accountId: 1,
      conversationId: 123
    });

    expect(result.contentAttributes).toEqual({
      interactive: {
        type: 'button',
        body: { text: 'Choose an option' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'opt1', title: 'Option 1' } },
            { type: 'reply', reply: { id: 'opt2', title: 'Option 2' } }
          ]
        }
      }
    });
  });

  it('should validate formatted message', () => {
    const validMessage = {
      content: 'Test',
      additionalAttributes: {
        provider: 'meta' as const,
        channel: 'whatsapp' as const,
        schema_version: '1.0.0',
        trace_id: 'trace-123'
      }
    };

    expect(formatter.validateFormattedMessage(validMessage)).toBe(true);

    const invalidMessage = {
      content: 'Test',
      additionalAttributes: {
        provider: 'meta' as const,
        channel: 'whatsapp' as const,
        schema_version: '2.0.0', // Invalid version
        trace_id: 'trace-123'
      }
    };

    expect(formatter.validateFormattedMessage(invalidMessage)).toBe(false);
  });
});

describe('Outbound Idempotency Service', () => {
  let service: OutboundIdempotencyService;

  beforeEach(() => {
    service = new OutboundIdempotencyService();
  });

  it('should generate consistent keys for same payload', () => {
    const payload: ChatwitMessagePayload = {
      content: 'Test message',
      message_type: 'outgoing',
      additional_attributes: {
        provider: 'meta',
        channel: 'whatsapp',
        schema_version: '1.0.0',
        trace_id: 'trace-123'
      }
    };

    const key1 = service.generateKey(123, payload);
    const key2 = service.generateKey(123, payload);

    expect(key1.payloadHash).toBe(key2.payloadHash);
    expect(key1.fullKey).toBe(key2.fullKey);
  });

  it('should generate different keys for different payloads', () => {
    const payload1: ChatwitMessagePayload = {
      content: 'Test message 1',
      message_type: 'outgoing',
      additional_attributes: {
        provider: 'meta',
        channel: 'whatsapp',
        schema_version: '1.0.0'
      }
    };

    const payload2: ChatwitMessagePayload = {
      content: 'Test message 2',
      message_type: 'outgoing',
      additional_attributes: {
        provider: 'meta',
        channel: 'whatsapp',
        schema_version: '1.0.0'
      }
    };

    const key1 = service.generateKey(123, payload1);
    const key2 = service.generateKey(123, payload2);

    expect(key1.payloadHash).not.toBe(key2.payloadHash);
    expect(key1.fullKey).not.toBe(key2.fullKey);
  });

  it('should exclude trace_id from hash', () => {
    const payload1: ChatwitMessagePayload = {
      content: 'Test message',
      message_type: 'outgoing',
      additional_attributes: {
        provider: 'meta',
        channel: 'whatsapp',
        schema_version: '1.0.0',
        trace_id: 'trace-123'
      }
    };

    const payload2: ChatwitMessagePayload = {
      content: 'Test message',
      message_type: 'outgoing',
      additional_attributes: {
        provider: 'meta',
        channel: 'whatsapp',
        schema_version: '1.0.0',
        trace_id: 'trace-456'
      }
    };

    const key1 = service.generateKey(123, payload1);
    const key2 = service.generateKey(123, payload2);

    // Should be the same hash since trace_id is excluded
    expect(key1.payloadHash).toBe(key2.payloadHash);
  });
});

describe('Retry Classifier', () => {
  let classifier: RetryClassifier;

  beforeEach(() => {
    classifier = new RetryClassifier();
  });

  it('should classify 400 errors as no retry', () => {
    const error = new Error('Bad Request') as any;
    error.isAxiosError = true;
    error.response = { status: 400 };

    const context = classifier.createRetryContext({
      conversationId: 123,
      accountId: 1,
      traceId: 'trace-123',
      currentAttempt: 0,
      originalError: error,
      startTime: Date.now()
    });

    const decision = classifier.classifyAndDecide(context);

    expect(decision.shouldRetry).toBe(false);
    expect(decision.classification).toBe('no_retry');
    expect(decision.reason).toContain('Non-retryable client error: 400');
  });

  it('should classify 429 errors as rate limit with retry', () => {
    const error = new Error('Rate Limited') as any;
    error.isAxiosError = true;
    error.response = { 
      status: 429,
      headers: { 'retry-after': '5' }
    };

    const context = classifier.createRetryContext({
      conversationId: 123,
      accountId: 1,
      traceId: 'trace-123',
      currentAttempt: 0,
      originalError: error,
      startTime: Date.now()
    });

    const decision = classifier.classifyAndDecide(context);

    expect(decision.shouldRetry).toBe(true);
    expect(decision.classification).toBe('rate_limit');
    expect(decision.delay).toBe(5000); // 5 seconds
  });

  it('should classify 500 errors as server error with exponential backoff', () => {
    const error = new Error('Internal Server Error') as any;
    error.isAxiosError = true;
    error.response = { status: 500 };

    const context = classifier.createRetryContext({
      conversationId: 123,
      accountId: 1,
      traceId: 'trace-123',
      currentAttempt: 1, // Second attempt
      originalError: error,
      startTime: Date.now()
    });

    const decision = classifier.classifyAndDecide(context);

    expect(decision.shouldRetry).toBe(true);
    expect(decision.classification).toBe('server_error');
    expect(decision.delay).toBe(2000); // 1s * 2^1 = 2s
  });

  it('should stop retrying after max attempts', () => {
    const error = new Error('Internal Server Error') as any;
    error.isAxiosError = true;
    error.response = { status: 500 };

    const context = classifier.createRetryContext({
      conversationId: 123,
      accountId: 1,
      traceId: 'trace-123',
      currentAttempt: 3, // Fourth attempt (0-indexed)
      originalError: error,
      startTime: Date.now()
    });

    const decision = classifier.classifyAndDecide(context);

    expect(decision.shouldRetry).toBe(false);
    expect(decision.reason).toContain('retries exhausted');
  });

  it('should validate configuration', () => {
    expect(classifier.validateConfig()).toBe(true);
  });
});

describe('Error Handler', () => {
  let handler: ChatwitErrorHandler;

  beforeEach(() => {
    handler = new ChatwitErrorHandler();
  });

  it('should handle HTTP errors correctly', () => {
    const error = new Error('Unauthorized') as any;
    error.isAxiosError = true;
    error.response = { 
      status: 401,
      data: { message: 'Invalid token' }
    };

    const context = {
      conversationId: 123,
      accountId: 1,
      channel: 'whatsapp' as const,
      traceId: 'trace-123',
      attemptCount: 0,
      originalContent: 'Test message'
    };

    const action = handler.handleError(error, context);

    expect(action.action).toBe('dlq');
    expect(action.reason).toContain('Authentication failed');
    expect('alertLevel' in action && action.alertLevel).toBe('critical');
  });

  it('should create handoff payload', () => {
    const context = {
      conversationId: 123,
      accountId: 1,
      channel: 'whatsapp' as const,
      traceId: 'trace-123',
      attemptCount: 0,
      originalContent: 'Test message'
    };

    const payload = handler.createHandoffPayload(context, 'API error');

    expect(payload.content).toBe('Acionei um atendente humano');
    expect(payload.additionalAttributes.handoff_reason).toBe('API error');
    expect(payload.additionalAttributes.assign_to_team).toBe('support');
    expect(payload.additionalAttributes.conversation_tags).toContain('ai_handoff');
  });

  it('should create simple text fallback', () => {
    const context = {
      conversationId: 123,
      accountId: 1,
      channel: 'whatsapp' as const,
      traceId: 'trace-123',
      attemptCount: 0,
      originalContent: 'This is a **bold** message with [link](http://example.com)'
    };

    const fallback = handler.createSimpleTextFallback(context);

    expect(fallback.content).toBe('This is a bold message with link');
    expect(fallback.additionalAttributes.fallback_reason).toBe('interactive_content_failed');
  });
});