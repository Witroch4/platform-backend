/**
 * Economic Mode Service Tests
 * Based on requirements 15.1, 15.2, 15.3
 */

import { EconomicModeService } from '@/lib/ai-integration/services/economic-mode';
import { LlmPromptContext, DynamicGenerationResult } from '@/lib/ai-integration/types/llm';

// Mock log module
jest.mock('@/lib/log', () => ({
  log: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock Redis
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  keys: jest.fn()
};

describe('EconomicModeService', () => {
  let economicMode: EconomicModeService;

  beforeEach(() => {
    jest.clearAllMocks();
    economicMode = new EconomicModeService(mockRedis as any);
    
    // Mock environment variables
    process.env.ECONOMIC_MODE_ENABLED = 'true';
    process.env.ECONOMIC_MAX_RESPONSE_LENGTH = '200';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('shouldUseEconomicMode', () => {
    it('should return true when economic flag is set', async () => {
      // Set environment variable to enable economic mode
      process.env.ECONOMIC_MODE_ENABLED = 'true';
      economicMode = new EconomicModeService(mockRedis as any);
      
      mockRedis.get.mockResolvedValue('1');

      const result = await economicMode.shouldUseEconomicMode(123);

      expect(result).toBe(true);
      expect(mockRedis.get).toHaveBeenCalledWith('economic:123');
    });

    it('should return false when economic flag is not set', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await economicMode.shouldUseEconomicMode(123);

      expect(result).toBe(false);
    });

    it('should return false when economic mode is disabled', async () => {
      process.env.ECONOMIC_MODE_ENABLED = 'false';
      economicMode = new EconomicModeService(mockRedis);

      const result = await economicMode.shouldUseEconomicMode(123);

      expect(result).toBe(false);
    });
  });

  describe('applyEconomicConstraints', () => {
    it('should not modify context when economic mode is off', () => {
      const context: LlmPromptContext = {
        userMessage: 'Hello, I need help with my order',
        conversationHistory: ['msg1', 'msg2', 'msg3', 'msg4'],
        channel: 'whatsapp',
        accountId: 123,
        conversationId: 456,
        economicMode: false
      };

      const result = economicMode.applyEconomicConstraints(context);

      expect(result).toEqual(context);
    });

    it('should apply constraints when economic mode is on', () => {
      const longMessage = 'Hello, I need help with my order and I want to know about shipping and delivery times and many other details about my purchase';
      const context: LlmPromptContext = {
        userMessage: longMessage,
        conversationHistory: ['msg1', 'msg2', 'msg3', 'msg4'],
        channel: 'whatsapp',
        accountId: 123,
        conversationId: 456,
        economicMode: true
      };

      const result = economicMode.applyEconomicConstraints(context);

      expect(result.conversationHistory).toHaveLength(2);
      expect(result.userMessage.length).toBeLessThanOrEqual(100);
      if (longMessage.length > 100) {
        expect(result.userMessage).toContain('...');
      }
    });
  });

  describe('applyResponseConstraints', () => {
    it('should not modify response when economic mode is off', () => {
      const response: DynamicGenerationResult = {
        text: 'This is a long response with detailed information about your order',
        buttons: [
          { type: 'reply', title: 'Track', id: 'track' },
          { type: 'reply', title: 'Cancel', id: 'cancel' },
          { type: 'reply', title: 'Support', id: 'support' }
        ],
        header: { type: 'text', text: 'Order Status' },
        footer: 'Company Name'
      };

      const result = economicMode.applyResponseConstraints(response, false);

      expect(result).toEqual(response);
    });

    it('should apply constraints when economic mode is on', () => {
      const longText = 'This is a very long response with detailed information about your order and shipping details and many other things that exceed the economic mode limit';
      const response: DynamicGenerationResult = {
        text: longText,
        buttons: [
          { type: 'reply', title: 'Track', id: 'track' },
          { type: 'reply', title: 'Cancel', id: 'cancel' },
          { type: 'reply', title: 'Support', id: 'support' }
        ],
        header: { type: 'text', text: 'Order Status' },
        footer: 'Company Name'
      };

      const result = economicMode.applyResponseConstraints(response, true);

      expect(result.text.length).toBeLessThanOrEqual(200);
      expect(result.buttons).toHaveLength(2);
      expect(result.header).toBeUndefined();
      expect(result.footer).toBe('Company Name');
    });
  });

  describe('getCachedResponse', () => {
    it('should return null when caching is disabled', async () => {
      const service = new EconomicModeService(mockRedis);
      // Disable caching
      (service as any).config.skipLlmForCachedResponses = false;

      const result = await service.getCachedResponse('hello', 'whatsapp', 123);

      expect(result).toBeNull();
    });

    it('should return cached response when available', async () => {
      const cacheEntry = {
        key: 'test-key',
        response: { text: 'Cached response' },
        tokensUsed: 50,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 1800000),
        hitCount: 0
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cacheEntry));
      mockRedis.setex.mockResolvedValue('OK');

      const result = await economicMode.getCachedResponse('hello', 'whatsapp', 123);

      expect(result).toBeTruthy();
      expect(result?.response.text).toBe('Cached response');
      expect(result?.hitCount).toBe(1);
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should return null and delete expired cache', async () => {
      const expiredEntry = {
        key: 'test-key',
        response: { text: 'Expired response' },
        tokensUsed: 50,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() - 1000), // Expired
        hitCount: 0
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(expiredEntry));
      mockRedis.del.mockResolvedValue(1);

      const result = await economicMode.getCachedResponse('hello', 'whatsapp', 123);

      expect(result).toBeNull();
      expect(mockRedis.del).toHaveBeenCalled();
    });
  });

  describe('cacheResponse', () => {
    it('should cache LLM response', async () => {
      const response: DynamicGenerationResult = {
        text: 'Test response',
        buttons: [{ type: 'reply', title: 'OK', id: 'ok' }]
      };

      mockRedis.setex.mockResolvedValue('OK');

      await economicMode.cacheResponse('hello', 'whatsapp', 123, response, 50);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringMatching(/^llm_cache:/),
        1800,
        expect.stringContaining('Test response')
      );
    });
  });

  describe('shouldFallbackToTemplate', () => {
    it('should not fallback when economic mode is off', () => {
      const result = economicMode.shouldFallbackToTemplate('hello', false);

      expect(result.shouldFallback).toBe(false);
    });

    it('should fallback for greeting patterns', () => {
      const result = economicMode.shouldFallbackToTemplate('oi', true);

      expect(result.shouldFallback).toBe(true);
      expect(result.templateType).toBe('greeting');
    });

    it('should fallback for thanks patterns', () => {
      const result = economicMode.shouldFallbackToTemplate('obrigado', true);

      expect(result.shouldFallback).toBe(true);
      expect(result.templateType).toBe('thanks');
    });

    it('should fallback for goodbye patterns', () => {
      const result = economicMode.shouldFallbackToTemplate('tchau', true);

      expect(result.shouldFallback).toBe(true);
      expect(result.templateType).toBe('goodbye');
    });

    it('should fallback for help patterns', () => {
      const result = economicMode.shouldFallbackToTemplate('preciso de ajuda', true);

      expect(result.shouldFallback).toBe(true);
      expect(result.templateType).toBe('help');
    });

    it('should not fallback for unmatched patterns', () => {
      const result = economicMode.shouldFallbackToTemplate('complex business question', true);

      expect(result.shouldFallback).toBe(false);
    });
  });

  describe('getTemplateResponse', () => {
    it('should return greeting template', () => {
      const result = economicMode.getTemplateResponse('greeting', 'whatsapp');

      expect(result.text).toContain('Olá');
      expect(result.buttons).toBeDefined();
      expect(result.buttons?.length).toBeGreaterThan(0);
    });

    it('should return thanks template', () => {
      const result = economicMode.getTemplateResponse('thanks', 'whatsapp');

      expect(result.text).toContain('De nada');
      expect(result.buttons).toBeDefined();
    });

    it('should return help template for unknown types', () => {
      const result = economicMode.getTemplateResponse('unknown', 'whatsapp');

      expect(result.text).toContain('ajudar');
      expect(result.buttons).toBeDefined();
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', async () => {
      const cacheEntries = [
        {
          key: 'key1',
          response: { text: 'Response 1' },
          tokensUsed: 50,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 1800000),
          hitCount: 3
        },
        {
          key: 'key2',
          response: { text: 'Response 2' },
          tokensUsed: 75,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 1800000),
          hitCount: 1
        }
      ];

      mockRedis.keys.mockResolvedValue(['key1', 'key2']);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(cacheEntries[0]))
        .mockResolvedValueOnce(JSON.stringify(cacheEntries[1]));

      const stats = await economicMode.getCacheStats(123);

      expect(stats.totalEntries).toBe(2);
      expect(stats.hitRate).toBe(2); // (3+1)/2
      expect(stats.avgTokensSaved).toBe(112.5); // (50*3 + 75*1)/2
    });
  });
});