/**
 * Tests for Small-talk Cache
 */

import { SmallTalkCache, createSmallTalkCache } from '../../../lib/ai-integration/services/small-talk-cache';

describe('SmallTalkCache', () => {
  let cache: SmallTalkCache;

  beforeEach(() => {
    cache = new SmallTalkCache({
      ttlMs: 30000, // 30 seconds for testing
      maxEntries: 10,
      enabled: true,
    });
  });

  describe('isSmallTalk', () => {
    it('should identify greeting messages as small-talk', () => {
      const greetings = ['oi', 'olá', 'hello', 'hi', 'hey'];
      
      for (const greeting of greetings) {
        expect(cache.isSmallTalk(greeting)).toBe(true);
        expect(cache.isSmallTalk(greeting.toUpperCase())).toBe(true);
        expect(cache.isSmallTalk(greeting + '!')).toBe(true);
      }
    });

    it('should identify time-based greetings as small-talk', () => {
      const timeGreetings = ['bom dia', 'boa tarde', 'boa noite'];
      
      for (const greeting of timeGreetings) {
        expect(cache.isSmallTalk(greeting)).toBe(true);
        expect(cache.isSmallTalk(greeting + '!')).toBe(true);
      }
    });

    it('should identify thanks messages as small-talk', () => {
      const thanks = ['obrigado', 'obrigada', 'valeu', 'thanks'];
      
      for (const thank of thanks) {
        expect(cache.isSmallTalk(thank)).toBe(true);
      }
    });

    it('should identify simple confirmations as small-talk', () => {
      const confirmations = ['ok', 'okay', 'beleza', 'certo', 'sim', 'não'];
      
      for (const confirmation of confirmations) {
        expect(cache.isSmallTalk(confirmation)).toBe(true);
      }
    });

    it('should not identify complex messages as small-talk', () => {
      const complexMessages = [
        'Preciso de ajuda com meu pedido número 12345',
        'Como faço para cancelar minha assinatura?',
        'Qual é o prazo de entrega para São Paulo?',
        'Meu produto chegou com defeito',
      ];
      
      for (const message of complexMessages) {
        expect(cache.isSmallTalk(message)).toBe(false);
      }
    });
  });

  describe('caching functionality', () => {
    it('should cache and retrieve small-talk responses', () => {
      const message = 'oi';
      const channel = 'whatsapp';
      const accountId = 123;
      const response = {
        text: 'Olá! Como posso ajudar?',
        buttons: [{ title: 'Ajuda', id: 'help' }],
      };

      // Cache the response
      cache.cacheResponse(message, channel, accountId, response);

      // Retrieve cached response
      const cached = cache.getCachedResponse(message, channel, accountId);
      
      expect(cached).not.toBeNull();
      expect(cached!.text).toBe(response.text);
      expect(cached!.buttons).toEqual(response.buttons);
      expect(cached!.hitCount).toBe(1); // Should increment on retrieval
    });

    it('should return null for non-small-talk messages', () => {
      const message = 'Preciso de ajuda com meu pedido';
      const channel = 'whatsapp';
      const accountId = 123;

      const cached = cache.getCachedResponse(message, channel, accountId);
      expect(cached).toBeNull();
    });

    it('should return null for expired cache entries', (done) => {
      const shortTtlCache = new SmallTalkCache({
        ttlMs: 100, // 100ms
        maxEntries: 10,
        enabled: true,
      });

      const message = 'oi';
      const response = { text: 'Olá!' };

      shortTtlCache.cacheResponse(message, 'whatsapp', 123, response);

      // Should be cached immediately
      expect(shortTtlCache.getCachedResponse(message, 'whatsapp', 123)).not.toBeNull();

      // Should be expired after TTL
      setTimeout(() => {
        expect(shortTtlCache.getCachedResponse(message, 'whatsapp', 123)).toBeNull();
        done();
      }, 150);
    });

    it('should handle cache size limits', () => {
      const smallCache = new SmallTalkCache({
        ttlMs: 30000,
        maxEntries: 2,
        enabled: true,
      });

      // Fill cache to limit
      smallCache.cacheResponse('oi', 'whatsapp', 1, { text: 'Response 1' });
      smallCache.cacheResponse('olá', 'whatsapp', 1, { text: 'Response 2' });

      // Both should be cached
      expect(smallCache.getCachedResponse('oi', 'whatsapp', 1)).not.toBeNull();
      expect(smallCache.getCachedResponse('olá', 'whatsapp', 1)).not.toBeNull();

      // Add one more (should evict oldest)
      smallCache.cacheResponse('hey', 'whatsapp', 1, { text: 'Response 3' });

      // First entry should be evicted
      expect(smallCache.getCachedResponse('oi', 'whatsapp', 1)).toBeNull();
      expect(smallCache.getCachedResponse('olá', 'whatsapp', 1)).not.toBeNull();
      expect(smallCache.getCachedResponse('hey', 'whatsapp', 1)).not.toBeNull();
    });

    it('should generate different cache keys for different contexts', () => {
      const message = 'oi';
      const response = { text: 'Olá!' };

      cache.cacheResponse(message, 'whatsapp', 123, response);
      cache.cacheResponse(message, 'instagram', 123, response);
      cache.cacheResponse(message, 'whatsapp', 456, response);

      // All should be cached separately
      expect(cache.getCachedResponse(message, 'whatsapp', 123)).not.toBeNull();
      expect(cache.getCachedResponse(message, 'instagram', 123)).not.toBeNull();
      expect(cache.getCachedResponse(message, 'whatsapp', 456)).not.toBeNull();

      // Cross-context retrieval should return null
      expect(cache.getCachedResponse(message, 'whatsapp', 789)).toBeNull();
    });
  });

  describe('predefined responses', () => {
    it('should provide appropriate responses for greetings', () => {
      const response = cache.getSmallTalkResponses('oi', 'whatsapp');
      
      expect(response.text).toContain('Olá');
      expect(response.buttons).toBeDefined();
      expect(response.buttons!.length).toBeGreaterThan(0);
    });

    it('should provide time-specific responses', () => {
      const morningResponse = cache.getSmallTalkResponses('bom dia', 'whatsapp');
      const afternoonResponse = cache.getSmallTalkResponses('boa tarde', 'whatsapp');
      const eveningResponse = cache.getSmallTalkResponses('boa noite', 'whatsapp');

      expect(morningResponse.text).toContain('Bom dia');
      expect(afternoonResponse.text).toContain('Boa tarde');
      expect(eveningResponse.text).toContain('Boa noite');
    });

    it('should provide thank you responses', () => {
      const response = cache.getSmallTalkResponses('obrigado', 'whatsapp');
      
      expect(response.text).toContain('De nada');
      expect(response.buttons).toBeDefined();
    });

    it('should provide goodbye responses', () => {
      const response = cache.getSmallTalkResponses('tchau', 'whatsapp');
      
      expect(response.text).toContain('Até logo');
    });
  });

  describe('statistics and management', () => {
    it('should provide cache statistics', () => {
      cache.cacheResponse('oi', 'whatsapp', 123, { text: 'Response' });
      cache.getCachedResponse('oi', 'whatsapp', 123); // Increment hit count

      const stats = cache.getStats();
      
      expect(stats.size).toBe(1);
      expect(stats.totalHits).toBe(1);
      expect(stats.enabled).toBe(true);
    });

    it('should clear cache', () => {
      cache.cacheResponse('oi', 'whatsapp', 123, { text: 'Response' });
      expect(cache.getStats().size).toBe(1);

      cache.clear();
      expect(cache.getStats().size).toBe(0);
    });

    it('should update configuration', () => {
      cache.updateConfig({ enabled: false });
      
      expect(cache.isSmallTalk('oi')).toBe(false);
      expect(cache.getCachedResponse('oi', 'whatsapp', 123)).toBeNull();
    });
  });

  describe('createSmallTalkCache', () => {
    it('should create cache with default config', () => {
      const cache = createSmallTalkCache();
      expect(cache).toBeInstanceOf(SmallTalkCache);
    });

    it('should create cache with custom config', () => {
      const cache = createSmallTalkCache({
        ttlMs: 60000,
        maxEntries: 500,
        enabled: false,
      });
      
      expect(cache).toBeInstanceOf(SmallTalkCache);
      expect(cache.getStats().enabled).toBe(false);
    });
  });
});