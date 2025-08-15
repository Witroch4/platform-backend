/**
 * Chaos tests for SocialWise Flow degradation strategies
 * Tests all failure scenarios and degradation responses
 */

import { 
  selectDegradationStrategy,
  buildEmbeddingTimeoutFallback,
  buildLlmTimeoutFallback,
  buildJsonParseFallback,
  buildConcurrencyLimitFallback,
  buildUltimateFallback,
  shouldDegrade,
  determineFailurePoint,
  generateHumanizedTitles,
  getContextualLegalTopics,
  DegradationContext
} from '../degradation-strategies';
import { IntentCandidate } from '@/services/openai';
import { createLogger } from '@/lib/utils/logger';

const chaosLogger = createLogger('DegradationChaosTest');

describe('SocialWise Flow Degradation Chaos Tests', () => {
  const mockContext: DegradationContext = {
    userText: 'Preciso de ajuda com uma multa de trânsito',
    channelType: 'whatsapp',
    inboxId: 'test-inbox-123',
    traceId: 'chaos-test-trace',
    failurePoint: 'unknown_error'
  };

  const mockCandidates: IntentCandidate[] = [
    { slug: 'recurso_multa_transito', name: 'Recurso de Multa de Trânsito', score: 0.75 },
    { slug: 'mandado_seguranca', name: 'Mandado de Segurança', score: 0.68 },
    { slug: 'defesa_administrativa', name: 'Defesa Administrativa', score: 0.62 }
  ];

  describe('Embedding timeout scenarios', () => {
    it('should handle embedding service timeout gracefully', () => {
      const context: DegradationContext = {
        ...mockContext,
        failurePoint: 'embedding_timeout'
      };

      const result = buildEmbeddingTimeoutFallback(context);

      expect(result.response).toBeDefined();
      expect(result.strategy).toBe('embedding_timeout_contextual');
      expect(result.fallbackLevel).toBe('primary');
      expect(result.degradationMs).toBeGreaterThan(0);

      // Should provide contextual legal topics based on user text
      if (result.response.whatsapp) {
        const buttons = result.response.whatsapp.interactive.action.buttons;
        expect(buttons.length).toBeGreaterThan(0);
        expect(buttons.some(btn => btn.reply.title.includes('Multa') || btn.reply.title.includes('Trânsito'))).toBe(true);
      }

      chaosLogger.info('Embedding timeout test passed', { strategy: result.strategy });
    });

    it('should handle embedding service complete failure', () => {
      const context: DegradationContext = {
        ...mockContext,
        failurePoint: 'embedding_timeout',
        originalError: new Error('Embedding service unavailable')
      };

      const result = selectDegradationStrategy(context);

      expect(result.response).toBeDefined();
      expect(result.strategy).toBe('embedding_timeout_contextual');
      expect(result.fallbackLevel).toBe('primary');
    });
  });

  describe('LLM timeout scenarios', () => {
    it('should handle LLM timeout with candidates available', () => {
      const context: DegradationContext = {
        ...mockContext,
        failurePoint: 'llm_timeout',
        candidates: mockCandidates
      };

      const result = buildLlmTimeoutFallback(context);

      expect(result.response).toBeDefined();
      expect(result.strategy).toBe('llm_timeout_candidates');
      expect(result.fallbackLevel).toBe('primary');

      // Should use humanized titles from candidates
      if (result.response.whatsapp) {
        const buttons = result.response.whatsapp.interactive.action.buttons;
        expect(buttons.length).toBeGreaterThan(0);
        expect(buttons.length).toBeLessThanOrEqual(3);
      }

      chaosLogger.info('LLM timeout with candidates test passed', { 
        strategy: result.strategy,
        candidatesUsed: mockCandidates.length 
      });
    });

    it('should handle LLM timeout without candidates', () => {
      const context: DegradationContext = {
        ...mockContext,
        failurePoint: 'llm_timeout'
      };

      const result = buildLlmTimeoutFallback(context);

      expect(result.response).toBeDefined();
      expect(result.strategy).toBe('llm_timeout_contextual');
      expect(result.fallbackLevel).toBe('secondary');

      // Should provide contextual topics based on user text
      if (result.response.whatsapp) {
        const buttons = result.response.whatsapp.interactive.action.buttons;
        expect(buttons.length).toBeGreaterThan(0);
      }
    });

    it('should handle complete LLM service failure', () => {
      const context: DegradationContext = {
        ...mockContext,
        failurePoint: 'llm_timeout',
        originalError: new Error('LLM service timeout after 5000ms')
      };

      const result = selectDegradationStrategy(context);

      expect(result.response).toBeDefined();
      expect(['llm_timeout_contextual', 'llm_timeout_candidates']).toContain(result.strategy);
    });
  });

  describe('JSON parse failure scenarios', () => {
    it('should handle malformed JSON responses', () => {
      const context: DegradationContext = {
        ...mockContext,
        failurePoint: 'json_parse_failure',
        originalError: new Error('Unexpected token } in JSON at position 45')
      };

      const result = buildJsonParseFallback(context);

      expect(result.response).toBeDefined();
      expect(result.strategy).toBe('json_parse_failure');
      expect(result.fallbackLevel).toBe('secondary');

      // Should provide default legal topics
      if (result.response.whatsapp) {
        const buttons = result.response.whatsapp.interactive.action.buttons;
        expect(buttons.length).toBeGreaterThan(0);
      }

      chaosLogger.info('JSON parse failure test passed', { strategy: result.strategy });
    });

    it('should handle incomplete JSON responses', () => {
      const context: DegradationContext = {
        ...mockContext,
        failurePoint: 'json_parse_failure',
        originalError: new Error('Unexpected end of JSON input')
      };

      const result = selectDegradationStrategy(context);

      expect(result.response).toBeDefined();
      expect(result.strategy).toBe('json_parse_failure');
    });
  });

  describe('Concurrency limit scenarios', () => {
    it('should handle concurrency limits gracefully', () => {
      const context: DegradationContext = {
        ...mockContext,
        failurePoint: 'concurrency_limit'
      };

      const result = buildConcurrencyLimitFallback(context);

      expect(result.response).toBeDefined();
      expect(result.strategy).toBe('concurrency_limit_degradation');
      expect(result.fallbackLevel).toBe('primary');

      // Should indicate system is busy but still provide options
      if (result.response.whatsapp) {
        const bodyText = result.response.whatsapp.interactive.body.text;
        expect(bodyText.toLowerCase()).toContain('ocupado');
      }

      chaosLogger.info('Concurrency limit test passed', { strategy: result.strategy });
    });

    it('should provide contextual options even when throttled', () => {
      const context: DegradationContext = {
        ...mockContext,
        userText: 'Quero fazer um divórcio consensual',
        failurePoint: 'concurrency_limit'
      };

      const result = selectDegradationStrategy(context);

      expect(result.response).toBeDefined();
      
      // Should provide family law related options
      if (result.response.whatsapp) {
        const buttons = result.response.whatsapp.interactive.action.buttons;
        expect(buttons.some(btn => 
          btn.reply.title.toLowerCase().includes('divórcio') || 
          btn.reply.title.toLowerCase().includes('família')
        )).toBe(true);
      }
    });
  });

  describe('Network error scenarios', () => {
    it('should handle network connectivity issues', () => {
      const context: DegradationContext = {
        ...mockContext,
        failurePoint: 'network_error',
        originalError: new Error('ECONNRESET: Connection reset by peer')
      };

      const result = selectDegradationStrategy(context);

      expect(result.response).toBeDefined();
      expect(result.strategy).toBe('ultimate_fallback');
      expect(result.fallbackLevel).toBe('tertiary');
    });

    it('should handle DNS resolution failures', () => {
      const context: DegradationContext = {
        ...mockContext,
        failurePoint: 'network_error',
        originalError: new Error('ENOTFOUND: getaddrinfo ENOTFOUND api.openai.com')
      };

      const result = selectDegradationStrategy(context);

      expect(result.response).toBeDefined();
      expect(result.strategy).toBe('ultimate_fallback');
    });
  });

  describe('Ultimate fallback scenarios', () => {
    it('should provide ultimate fallback for unknown errors', () => {
      const context: DegradationContext = {
        ...mockContext,
        failurePoint: 'unknown_error',
        originalError: new Error('Completely unexpected error')
      };

      const result = buildUltimateFallback(context);

      expect(result.response).toBeDefined();
      expect(result.strategy).toBe('ultimate_fallback');
      expect(result.fallbackLevel).toBe('tertiary');

      // Should provide a generic helpful message
      expect(result.response.text).toContain('dificuldades técnicas');

      chaosLogger.info('Ultimate fallback test passed', { strategy: result.strategy });
    });

    it('should handle null/undefined contexts gracefully', () => {
      const context: DegradationContext = {
        userText: '',
        channelType: '',
        inboxId: '',
        failurePoint: 'unknown_error'
      };

      const result = selectDegradationStrategy(context);

      expect(result.response).toBeDefined();
      expect(result.strategy).toBe('ultimate_fallback');
    });
  });

  describe('Channel-specific degradation', () => {
    it('should provide WhatsApp-specific degradation responses', () => {
      const context: DegradationContext = {
        ...mockContext,
        channelType: 'whatsapp',
        failurePoint: 'llm_timeout'
      };

      const result = selectDegradationStrategy(context);

      expect(result.response.whatsapp).toBeDefined();
      expect(result.response.whatsapp!.type).toBe('interactive');
      expect(result.response.whatsapp!.interactive.type).toBe('button');
    });

    it('should provide Instagram-specific degradation responses', () => {
      const context: DegradationContext = {
        ...mockContext,
        channelType: 'instagram',
        failurePoint: 'embedding_timeout'
      };

      const result = selectDegradationStrategy(context);

      expect(result.response.instagram).toBeDefined();
      expect(result.response.instagram!.message.attachment.type).toBe('template');
      expect(result.response.instagram!.message.attachment.payload.template_type).toBe('button');
    });

    it('should provide Facebook Messenger fallback responses', () => {
      const context: DegradationContext = {
        ...mockContext,
        channelType: 'facebook',
        failurePoint: 'json_parse_failure'
      };

      const result = selectDegradationStrategy(context);

      expect(result.response.facebook).toBeDefined();
      expect(result.response.facebook!.message.text).toBeDefined();
    });

    it('should provide generic text fallback for unknown channels', () => {
      const context: DegradationContext = {
        ...mockContext,
        channelType: 'unknown-channel',
        failurePoint: 'concurrency_limit'
      };

      const result = selectDegradationStrategy(context);

      expect(result.response.text).toBeDefined();
    });
  });

  describe('Error detection and classification', () => {
    it('should correctly identify timeout errors', () => {
      const timeoutError = new Error('Operation timed out after 5000ms');
      timeoutError.name = 'AbortError';

      expect(shouldDegrade(timeoutError)).toBe(true);
      expect(determineFailurePoint(timeoutError)).toBe('llm_timeout');
    });

    it('should correctly identify JSON parse errors', () => {
      const jsonError = new Error('Unexpected token } in JSON at position 45');

      expect(shouldDegrade(jsonError)).toBe(true);
      expect(determineFailurePoint(jsonError)).toBe('json_parse_failure');
    });

    it('should correctly identify network errors', () => {
      const networkError = new Error('ECONNRESET: Connection reset by peer');

      expect(shouldDegrade(networkError)).toBe(true);
      expect(determineFailurePoint(networkError)).toBe('network_error');
    });

    it('should correctly identify concurrency errors', () => {
      const concurrencyError = new Error('Concurrency limit exceeded for inbox');

      expect(shouldDegrade(concurrencyError)).toBe(true);
      expect(determineFailurePoint(concurrencyError)).toBe('concurrency_limit');
    });

    it('should not degrade for non-degradable errors', () => {
      const validationError = new Error('Invalid input parameter');

      expect(shouldDegrade(validationError)).toBe(false);
    });
  });

  describe('Humanized title generation', () => {
    it('should generate human-readable titles from intent slugs', () => {
      const titles = generateHumanizedTitles(mockCandidates);

      expect(titles).toHaveLength(mockCandidates.length);
      expect(titles[0]).toBe('Multa Trânsito'); // Should map recurso_multa_transito
      expect(titles[1]).toBe('Mandado'); // Should map mandado_seguranca
      expect(titles.every(title => title.length <= 20)).toBe(true); // Respect button limits
    });

    it('should handle unknown intent slugs gracefully', () => {
      const unknownCandidates: IntentCandidate[] = [
        { slug: 'unknown_intent_slug', name: 'Unknown Intent', score: 0.5 },
        { slug: 'another_unknown', score: 0.4 }
      ];

      const titles = generateHumanizedTitles(unknownCandidates);

      expect(titles).toHaveLength(unknownCandidates.length);
      expect(titles[0]).toBe('Unknown Intent'); // Should use name when available
      expect(titles[1]).toBe('Another Unknown'); // Should humanize slug
    });
  });

  describe('Contextual legal topics', () => {
    it('should provide traffic-related topics for traffic queries', () => {
      const topics = getContextualLegalTopics('Recebi uma multa do DETRAN e quero recorrer');

      expect(topics.length).toBeGreaterThan(0);
      expect(topics.some(topic => 
        topic.title.toLowerCase().includes('multa') || 
        topic.title.toLowerCase().includes('recurso')
      )).toBe(true);
    });

    it('should provide family law topics for family queries', () => {
      const topics = getContextualLegalTopics('Quero me divorciar do meu marido');

      expect(topics.length).toBeGreaterThan(0);
      expect(topics.some(topic => 
        topic.title.toLowerCase().includes('divórcio') || 
        topic.title.toLowerCase().includes('família')
      )).toBe(true);
    });

    it('should provide labor law topics for work-related queries', () => {
      const topics = getContextualLegalTopics('Fui demitido sem justa causa e não recebi o FGTS');

      expect(topics.length).toBeGreaterThan(0);
      expect(topics.some(topic => 
        topic.title.toLowerCase().includes('trabalh') || 
        topic.title.toLowerCase().includes('rescisão')
      )).toBe(true);
    });

    it('should provide default topics for generic queries', () => {
      const topics = getContextualLegalTopics('Preciso de ajuda jurídica');

      expect(topics.length).toBeGreaterThan(0);
      expect(topics.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Performance under chaos', () => {
    it('should maintain fast response times even during degradation', () => {
      const startTime = Date.now();

      const context: DegradationContext = {
        ...mockContext,
        failurePoint: 'llm_timeout',
        candidates: mockCandidates
      };

      const result = selectDegradationStrategy(context);
      const duration = Date.now() - startTime;

      expect(result.response).toBeDefined();
      expect(duration).toBeLessThan(100); // Should be very fast
      expect(result.degradationMs).toBeLessThan(50);

      chaosLogger.info('Degradation performance test passed', { 
        durationMs: duration,
        degradationMs: result.degradationMs 
      });
    });

    it('should handle rapid successive degradation requests', () => {
      const results = [];
      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        const context: DegradationContext = {
          ...mockContext,
          failurePoint: 'concurrency_limit',
          traceId: `chaos-rapid-${i}`
        };

        const result = selectDegradationStrategy(context);
        results.push(result);
      }

      const duration = Date.now() - startTime;

      expect(results).toHaveLength(100);
      expect(results.every(r => r.response !== undefined)).toBe(true);
      expect(duration).toBeLessThan(1000); // Should handle 100 requests in under 1 second

      chaosLogger.info('Rapid degradation test passed', { 
        requests: results.length,
        durationMs: duration,
        avgMs: duration / results.length
      });
    });
  });

  describe('Memory and resource management', () => {
    it('should not leak memory during repeated degradation', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Simulate many degradation scenarios
      for (let i = 0; i < 1000; i++) {
        const context: DegradationContext = {
          ...mockContext,
          userText: `Test query ${i} with various keywords like multa, divórcio, trabalho`,
          failurePoint: ['embedding_timeout', 'llm_timeout', 'json_parse_failure', 'concurrency_limit'][i % 4] as any,
          traceId: `memory-test-${i}`
        };

        selectDegradationStrategy(context);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 10MB for 1000 operations)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);

      chaosLogger.info('Memory management test passed', { 
        initialMemoryMB: Math.round(initialMemory / 1024 / 1024),
        finalMemoryMB: Math.round(finalMemory / 1024 / 1024),
        increaseMB: Math.round(memoryIncrease / 1024 / 1024)
      });
    });
  });
});