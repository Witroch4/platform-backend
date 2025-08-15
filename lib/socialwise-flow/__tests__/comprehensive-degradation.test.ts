/**
 * Comprehensive Degradation Test Suite for SocialWise Flow
 * Validates all degradation strategies and fallback mechanisms
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

import { 
  selectDegradationStrategy,
  shouldDegrade,
  determineFailurePoint,
  generateHumanizedTitles,
  getContextualLegalTopics,
  getDefaultLegalTopics,
  DegradationContext
} from '../degradation-strategies';
import { getConcurrencyManager } from '../concurrency-manager';
import { processSocialWiseFlow, ProcessorContext } from '../processor';
import { classifyIntent } from '../classification';
import { buildChannelResponse } from '../channel-formatting';
import { IntentCandidate } from '@/services/openai';
import { createLogger } from '@/lib/utils/logger';

// Mock dependencies
jest.mock('@/lib/connections');
jest.mock('@/services/openai');
jest.mock('@/lib/socialwise/assistant');
jest.mock('@/lib/socialwise/templates');

const comprehensiveLogger = createLogger('ComprehensiveDegradationTest');

describe('Comprehensive SocialWise Flow Degradation Tests', () => {
  const baseContext: DegradationContext = {
    userText: 'Preciso de ajuda com questões jurídicas',
    channelType: 'whatsapp',
    inboxId: 'test-inbox-123',
    traceId: 'comprehensive-test',
    failurePoint: 'unknown_error'
  };

  const mockCandidates: IntentCandidate[] = [
    { slug: 'recurso_multa_transito', name: 'Recurso de Multa de Trânsito', score: 0.75 },
    { slug: 'divorcio_consensual', name: 'Divórcio Consensual', score: 0.68 },
    { slug: 'rescisao_trabalhista', name: 'Rescisão Trabalhista', score: 0.62 }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Embedding Timeout Degradation', () => {
    it('should handle embedding service complete unavailability', () => {
      const context: DegradationContext = {
        ...baseContext,
        userText: 'Recebi uma multa do DETRAN e quero recorrer',
        failurePoint: 'embedding_timeout',
        originalError: new Error('Embedding service unavailable')
      };

      const result = selectDegradationStrategy(context);

      expect(result.response).toBeDefined();
      expect(result.strategy).toBe('embedding_timeout_contextual');
      expect(result.fallbackLevel).toBe('primary');
      expect(result.degradationMs).toBeGreaterThanOrEqual(0);

      // Should provide traffic-related options based on context
      if (result.response.whatsapp) {
        const buttons = result.response.whatsapp.interactive.action.buttons;
        expect(buttons.some(btn => 
          btn.reply.title.toLowerCase().includes('multa') ||
          btn.reply.title.toLowerCase().includes('recurso')
        )).toBe(true);
      }
    });

    it('should handle embedding timeout with network issues', () => {
      const context: DegradationContext = {
        ...baseContext,
        failurePoint: 'embedding_timeout',
        originalError: new Error('ETIMEDOUT: Connection timed out')
      };

      const result = selectDegradationStrategy(context);

      expect(result.response).toBeDefined();
      expect(result.strategy).toBe('embedding_timeout_contextual');
      expect(result.degradationMs).toBeLessThan(100); // Should be fast
    });
  });

  describe('LLM Timeout Degradation', () => {
    it('should handle LLM timeout with available candidates', () => {
      const context: DegradationContext = {
        ...baseContext,
        userText: 'Quero me divorciar do meu marido',
        failurePoint: 'llm_timeout',
        candidates: mockCandidates,
        originalError: new Error('LLM request timed out after 5000ms')
      };

      const result = selectDegradationStrategy(context);

      expect(result.response).toBeDefined();
      expect(result.strategy).toBe('llm_timeout_candidates');
      expect(result.fallbackLevel).toBe('primary');

      // Should use humanized titles from candidates
      if (result.response.whatsapp) {
        const buttons = result.response.whatsapp.interactive.action.buttons;
        expect(buttons.length).toBeGreaterThan(0);
        expect(buttons.length).toBeLessThanOrEqual(3);
        
        // Should include divorce-related option
        expect(buttons.some(btn => 
          btn.reply.title.toLowerCase().includes('divórcio')
        )).toBe(true);
      }
    });

    it('should handle LLM timeout without candidates', () => {
      const context: DegradationContext = {
        ...baseContext,
        userText: 'Fui demitido sem justa causa',
        failurePoint: 'llm_timeout'
      };

      const result = selectDegradationStrategy(context);

      expect(result.response).toBeDefined();
      expect(result.strategy).toBe('llm_timeout_contextual');
      expect(result.fallbackLevel).toBe('secondary');

      // Should provide labor law related options
      if (result.response.whatsapp) {
        const buttons = result.response.whatsapp.interactive.action.buttons;
        expect(buttons.some(btn => 
          btn.reply.title.toLowerCase().includes('trabalh') ||
          btn.reply.title.toLowerCase().includes('rescisão')
        )).toBe(true);
      }
    });

    it('should handle OpenAI API rate limiting', () => {
      const context: DegradationContext = {
        ...baseContext,
        failurePoint: 'llm_timeout',
        originalError: new Error('Rate limit exceeded. Please try again later.')
      };

      const result = selectDegradationStrategy(context);

      expect(result.response).toBeDefined();
      expect(['llm_timeout_contextual', 'llm_timeout_candidates']).toContain(result.strategy);
    });
  });

  describe('JSON Parse Failure Degradation', () => {
    it('should handle malformed JSON from LLM', () => {
      const context: DegradationContext = {
        ...baseContext,
        failurePoint: 'json_parse_failure',
        originalError: new Error('Unexpected token } in JSON at position 45')
      };

      const result = selectDegradationStrategy(context);

      expect(result.response).toBeDefined();
      expect(result.strategy).toBe('json_parse_failure');
      expect(result.fallbackLevel).toBe('secondary');

      // Should provide default legal topics
      if (result.response.whatsapp) {
        const buttons = result.response.whatsapp.interactive.action.buttons;
        expect(buttons.length).toBeGreaterThan(0);
        expect(buttons.every(btn => btn.reply.title.length <= 20)).toBe(true);
      }
    });

    it('should handle incomplete JSON responses', () => {
      const context: DegradationContext = {
        ...baseContext,
        failurePoint: 'json_parse_failure',
        originalError: new Error('Unexpected end of JSON input')
      };

      const result = selectDegradationStrategy(context);

      expect(result.response).toBeDefined();
      expect(result.strategy).toBe('json_parse_failure');
    });

    it('should handle invalid JSON structure', () => {
      const context: DegradationContext = {
        ...baseContext,
        failurePoint: 'json_parse_failure',
        originalError: new Error('JSON.parse: unexpected character at line 1 column 1')
      };

      const result = selectDegradationStrategy(context);

      expect(result.response).toBeDefined();
      expect(result.degradationMs).toBeLessThan(50); // Should be very fast
    });
  });

  describe('Concurrency Limit Degradation', () => {
    it('should handle inbox concurrency limit exceeded', () => {
      const context: DegradationContext = {
        ...baseContext,
        userText: 'Preciso de orientação sobre contratos',
        failurePoint: 'concurrency_limit'
      };

      const result = selectDegradationStrategy(context);

      expect(result.response).toBeDefined();
      expect(result.strategy).toBe('concurrency_limit_degradation');
      expect(result.fallbackLevel).toBe('primary');

      // Should indicate system is busy
      if (result.response.whatsapp) {
        const bodyText = result.response.whatsapp.interactive.body.text;
        expect(bodyText.toLowerCase()).toContain('ocupado');
      }
    });

    it('should provide contextual options even when throttled', () => {
      const context: DegradationContext = {
        ...baseContext,
        userText: 'Comprei um produto com defeito e a loja não quer trocar',
        failurePoint: 'concurrency_limit'
      };

      const result = selectDegradationStrategy(context);

      expect(result.response).toBeDefined();
      
      // Should provide consumer law related options
      if (result.response.whatsapp) {
        const buttons = result.response.whatsapp.interactive.action.buttons;
        expect(buttons.some(btn => 
          btn.reply.title.toLowerCase().includes('consumidor') ||
          btn.reply.title.toLowerCase().includes('produto')
        )).toBe(true);
      }
    });

    it('should handle global concurrency limit exceeded', () => {
      const context: DegradationContext = {
        ...baseContext,
        failurePoint: 'concurrency_limit',
        originalError: new Error('Global concurrency limit exceeded')
      };

      const result = selectDegradationStrategy(context);

      expect(result.response).toBeDefined();
      expect(result.strategy).toBe('concurrency_limit_degradation');
    });
  });

  describe('Network Error Degradation', () => {
    it('should handle connection reset errors', () => {
      const context: DegradationContext = {
        ...baseContext,
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
        ...baseContext,
        failurePoint: 'network_error',
        originalError: new Error('ENOTFOUND: getaddrinfo ENOTFOUND api.openai.com')
      };

      const result = selectDegradationStrategy(context);

      expect(result.response).toBeDefined();
      expect(result.strategy).toBe('ultimate_fallback');
    });

    it('should handle SSL/TLS errors', () => {
      const context: DegradationContext = {
        ...baseContext,
        failurePoint: 'network_error',
        originalError: new Error('UNABLE_TO_VERIFY_LEAF_SIGNATURE')
      };

      const result = selectDegradationStrategy(context);

      expect(result.response).toBeDefined();
      expect(result.response.text).toContain('dificuldades técnicas');
    });
  });

  describe('Humanized Title Generation', () => {
    it('should generate appropriate titles for legal intents', () => {
      const legalCandidates: IntentCandidate[] = [
        { slug: 'recurso_oab', name: 'Recurso OAB', score: 0.8 },
        { slug: 'mandado_seguranca', name: 'Mandado de Segurança', score: 0.75 },
        { slug: 'usucapiao', name: 'Usucapião', score: 0.7 },
        { slug: 'inventario', name: 'Inventário', score: 0.65 },
        { slug: 'pensao_alimenticia', name: 'Pensão Alimentícia', score: 0.6 }
      ];

      const titles = generateHumanizedTitles(legalCandidates);

      expect(titles).toHaveLength(legalCandidates.length);
      expect(titles[0]).toBe('Recurso OAB');
      expect(titles[1]).toBe('Mandado');
      expect(titles[2]).toBe('Usucapião');
      expect(titles[3]).toBe('Inventário');
      expect(titles[4]).toBe('Pensão');

      // All titles should respect button limits
      expect(titles.every(title => title.length <= 20)).toBe(true);
    });

    it('should handle unknown intent slugs gracefully', () => {
      const unknownCandidates: IntentCandidate[] = [
        { slug: 'completely_unknown_intent', score: 0.5 },
        { slug: 'another_weird_slug_name', name: 'Some Name', score: 0.4 },
        { slug: 'x_y_z', score: 0.3 }
      ];

      const titles = generateHumanizedTitles(unknownCandidates);

      expect(titles).toHaveLength(unknownCandidates.length);
      expect(titles[0]).toBe('Completely Unknown'); // Humanized slug
      expect(titles[1]).toBe('Some Name'); // Uses provided name
      expect(titles[2]).toBe('X Y Z'); // Humanized short slug
    });

    it('should handle empty or null candidates', () => {
      const emptyTitles = generateHumanizedTitles([]);
      expect(emptyTitles).toEqual([]);

      const nullCandidate: IntentCandidate[] = [
        { slug: '', score: 0 },
        { slug: null as any, score: 0 }
      ];

      const titles = generateHumanizedTitles(nullCandidate);
      expect(titles).toHaveLength(2);
      expect(titles.every(title => typeof title === 'string')).toBe(true);
    });
  });

  describe('Contextual Legal Topics', () => {
    it('should provide traffic law topics for traffic queries', () => {
      const trafficQueries = [
        'Recebi uma multa do DETRAN',
        'Minha CNH foi suspensa',
        'Quero recorrer de uma multa de trânsito',
        'Problema com licenciamento do veículo'
      ];

      trafficQueries.forEach(query => {
        const topics = getContextualLegalTopics(query);
        expect(topics.length).toBeGreaterThan(0);
        expect(topics.some(topic => 
          topic.title.toLowerCase().includes('multa') ||
          topic.title.toLowerCase().includes('trânsito') ||
          topic.title.toLowerCase().includes('cnh')
        )).toBe(true);
      });
    });

    it('should provide family law topics for family queries', () => {
      const familyQueries = [
        'Quero me divorciar',
        'Preciso de pensão alimentícia',
        'Questão de guarda dos filhos',
        'Separação de bens'
      ];

      familyQueries.forEach(query => {
        const topics = getContextualLegalTopics(query);
        expect(topics.length).toBeGreaterThan(0);
        expect(topics.some(topic => 
          topic.title.toLowerCase().includes('divórcio') ||
          topic.title.toLowerCase().includes('pensão') ||
          topic.title.toLowerCase().includes('família')
        )).toBe(true);
      });
    });

    it('should provide labor law topics for work queries', () => {
      const laborQueries = [
        'Fui demitido sem justa causa',
        'Não recebi o FGTS',
        'Problema com rescisão trabalhista',
        'Horas extras não pagas'
      ];

      laborQueries.forEach(query => {
        const topics = getContextualLegalTopics(query);
        expect(topics.length).toBeGreaterThan(0);
        expect(topics.some(topic => 
          topic.title.toLowerCase().includes('trabalh') ||
          topic.title.toLowerCase().includes('rescisão')
        )).toBe(true);
      });
    });

    it('should provide consumer law topics for consumer queries', () => {
      const consumerQueries = [
        'Comprei um produto com defeito',
        'A loja não quer fazer a troca',
        'Problema com garantia',
        'Cobrança indevida no cartão'
      ];

      consumerQueries.forEach(query => {
        const topics = getContextualLegalTopics(query);
        expect(topics.length).toBeGreaterThan(0);
        expect(topics.some(topic => 
          topic.title.toLowerCase().includes('consumidor') ||
          topic.title.toLowerCase().includes('produto') ||
          topic.title.toLowerCase().includes('defeito')
        )).toBe(true);
      });
    });

    it('should provide default topics for generic queries', () => {
      const genericQueries = [
        'Preciso de ajuda jurídica',
        'Tenho uma dúvida legal',
        'Questão de direito',
        ''
      ];

      genericQueries.forEach(query => {
        const topics = getContextualLegalTopics(query);
        expect(topics.length).toBeGreaterThan(0);
        expect(topics.length).toBeLessThanOrEqual(3);
        
        // Should be default legal areas
        const defaultTopics = getDefaultLegalTopics();
        expect(topics.every(topic => 
          defaultTopics.some(defaultTopic => defaultTopic.title === topic.title)
        )).toBe(true);
      });
    });
  });

  describe('Error Detection and Classification', () => {
    it('should correctly identify all timeout error types', () => {
      const timeoutErrors = [
        { error: new Error('Operation timed out'), name: 'AbortError' },
        { error: new Error('Request timeout'), name: 'TimeoutError' },
        { error: new Error('Connection timed out after 5000ms'), name: 'Error' },
        { error: new Error('Embedding generation aborted'), name: 'AbortError' }
      ];

      timeoutErrors.forEach(({ error, name }) => {
        error.name = name;
        expect(shouldDegrade(error)).toBe(true);
        
        const failurePoint = determineFailurePoint(error);
        expect(['embedding_timeout', 'llm_timeout', 'unknown_error']).toContain(failurePoint);
      });
    });

    it('should correctly identify JSON parsing errors', () => {
      const jsonErrors = [
        new Error('Unexpected token } in JSON at position 45'),
        new Error('Unexpected end of JSON input'),
        new Error('JSON.parse: unexpected character'),
        new Error('Invalid JSON structure in response')
      ];

      jsonErrors.forEach(error => {
        expect(shouldDegrade(error)).toBe(true);
        expect(determineFailurePoint(error)).toBe('json_parse_failure');
      });
    });

    it('should correctly identify network errors', () => {
      const networkErrors = [
        new Error('ECONNRESET: Connection reset by peer'),
        new Error('ENOTFOUND: getaddrinfo ENOTFOUND api.openai.com'),
        new Error('ETIMEDOUT: Connection timed out'),
        new Error('Network request failed')
      ];

      networkErrors.forEach(error => {
        expect(shouldDegrade(error)).toBe(true);
        expect(determineFailurePoint(error)).toBe('network_error');
      });
    });

    it('should correctly identify concurrency errors', () => {
      const concurrencyErrors = [
        new Error('Concurrency limit exceeded for inbox'),
        new Error('Too many concurrent requests'),
        new Error('Rate limit exceeded'),
        new Error('Quota exceeded')
      ];

      concurrencyErrors.forEach(error => {
        expect(shouldDegrade(error)).toBe(true);
        expect(determineFailurePoint(error)).toBe('concurrency_limit');
      });
    });

    it('should not degrade for business logic errors', () => {
      const businessErrors = [
        new Error('Invalid user input'),
        new Error('Missing required parameter'),
        new Error('Validation failed'),
        new Error('Unauthorized access')
      ];

      businessErrors.forEach(error => {
        expect(shouldDegrade(error)).toBe(false);
      });
    });
  });

  describe('Channel-Specific Degradation Responses', () => {
    it('should format WhatsApp degradation responses correctly', () => {
      const context: DegradationContext = {
        ...baseContext,
        channelType: 'whatsapp',
        failurePoint: 'llm_timeout'
      };

      const result = selectDegradationStrategy(context);

      expect(result.response.whatsapp).toBeDefined();
      expect(result.response.whatsapp!.type).toBe('interactive');
      expect(result.response.whatsapp!.interactive.type).toBe('button');

      const buttons = result.response.whatsapp!.interactive.action.buttons;
      expect(buttons.length).toBeGreaterThan(0);
      expect(buttons.length).toBeLessThanOrEqual(3);

      // Validate WhatsApp constraints
      buttons.forEach(button => {
        expect(button.reply.title.length).toBeLessThanOrEqual(20);
        expect(button.reply.id.length).toBeLessThanOrEqual(256);
        expect(button.reply.id).toMatch(/^@[a-z0-9_]+$/);
      });

      const bodyText = result.response.whatsapp!.interactive.body.text;
      expect(bodyText.length).toBeLessThanOrEqual(1024);
    });

    it('should format Instagram degradation responses correctly', () => {
      const context: DegradationContext = {
        ...baseContext,
        channelType: 'instagram',
        failurePoint: 'embedding_timeout'
      };

      const result = selectDegradationStrategy(context);

      expect(result.response.instagram).toBeDefined();
      expect(result.response.instagram!.message.attachment.type).toBe('template');
      expect(result.response.instagram!.message.attachment.payload.template_type).toBe('button');

      const buttons = result.response.instagram!.message.attachment.payload.buttons;
      expect(buttons.length).toBeGreaterThan(0);
      expect(buttons.length).toBeLessThanOrEqual(3);

      // Validate Instagram constraints
      buttons.forEach(button => {
        expect(button.title.length).toBeLessThanOrEqual(20);
        expect(button.payload.length).toBeLessThanOrEqual(1000);
      });

      const text = result.response.instagram!.message.attachment.payload.text;
      expect(text.length).toBeLessThanOrEqual(640);
    });

    it('should format Facebook Messenger degradation responses correctly', () => {
      const context: DegradationContext = {
        ...baseContext,
        channelType: 'facebook',
        failurePoint: 'json_parse_failure'
      };

      const result = selectDegradationStrategy(context);

      expect(result.response.facebook).toBeDefined();
      expect(result.response.facebook!.message.text).toBeDefined();
      expect(result.response.facebook!.message.text.length).toBeLessThanOrEqual(2000);
    });

    it('should provide generic text fallback for unknown channels', () => {
      const context: DegradationContext = {
        ...baseContext,
        channelType: 'unknown-channel',
        failurePoint: 'concurrency_limit'
      };

      const result = selectDegradationStrategy(context);

      expect(result.response.text).toBeDefined();
      expect(typeof result.response.text).toBe('string');
      expect(result.response.text!.length).toBeGreaterThan(0);
    });
  });

  describe('Performance and Resource Management', () => {
    it('should maintain fast degradation response times', () => {
      const testCases = [
        { failurePoint: 'embedding_timeout' as const },
        { failurePoint: 'llm_timeout' as const },
        { failurePoint: 'json_parse_failure' as const },
        { failurePoint: 'concurrency_limit' as const },
        { failurePoint: 'network_error' as const }
      ];

      testCases.forEach(testCase => {
        const startTime = Date.now();
        
        const context: DegradationContext = {
          ...baseContext,
          failurePoint: testCase.failurePoint
        };

        const result = selectDegradationStrategy(context);
        const duration = Date.now() - startTime;

        expect(result.response).toBeDefined();
        expect(duration).toBeLessThan(100); // Should be very fast
        expect(result.degradationMs).toBeLessThan(50);
      });
    });

    it('should handle memory efficiently during repeated degradation', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Simulate many degradation scenarios
      for (let i = 0; i < 500; i++) {
        const context: DegradationContext = {
          ...baseContext,
          userText: `Test query ${i} with legal keywords`,
          failurePoint: ['embedding_timeout', 'llm_timeout', 'json_parse_failure'][i % 3] as any,
          traceId: `memory-test-${i}`
        };

        selectDegradationStrategy(context);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 15MB for 500 operations)
      expect(memoryIncrease).toBeLessThan(15 * 1024 * 1024);

      comprehensiveLogger.info('Memory efficiency test passed', {
        operations: 500,
        memoryIncreaseMB: Math.round(memoryIncrease / 1024 / 1024)
      });
    });

    it('should handle concurrent degradation requests efficiently', () => {
      const startTime = Date.now();

      const requests = Array.from({ length: 50 }, (_, i) => {
        const context: DegradationContext = {
          ...baseContext,
          userText: `Concurrent test ${i}`,
          failurePoint: ['embedding_timeout', 'llm_timeout', 'concurrency_limit'][i % 3] as any,
          traceId: `concurrent-degradation-${i}`
        };

        return selectDegradationStrategy(context);
      });

      const duration = Date.now() - startTime;

      expect(requests).toHaveLength(50);
      expect(requests.every(r => r.response !== undefined)).toBe(true);
      expect(duration).toBeLessThan(500); // Should handle 50 requests quickly

      comprehensiveLogger.info('Concurrent degradation test passed', {
        requests: requests.length,
        durationMs: duration,
        avgMs: duration / requests.length
      });
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle null or undefined contexts gracefully', () => {
      const edgeCases = [
        { userText: '', channelType: '', inboxId: '', failurePoint: 'unknown_error' as const },
        { userText: null as any, channelType: null as any, inboxId: null as any, failurePoint: 'llm_timeout' as const },
        { userText: undefined as any, channelType: undefined as any, inboxId: undefined as any, failurePoint: 'embedding_timeout' as const }
      ];

      edgeCases.forEach(context => {
        const result = selectDegradationStrategy(context);
        expect(result.response).toBeDefined();
        expect(result.strategy).toBeDefined();
        expect(result.fallbackLevel).toBeDefined();
      });
    });

    it('should handle very long user text gracefully', () => {
      const longText = 'A'.repeat(10000); // 10KB of text
      
      const context: DegradationContext = {
        ...baseContext,
        userText: longText,
        failurePoint: 'llm_timeout'
      };

      const result = selectDegradationStrategy(context);

      expect(result.response).toBeDefined();
      expect(result.degradationMs).toBeLessThan(100); // Should still be fast
    });

    it('should handle special characters and emojis in user text', () => {
      const specialTexts = [
        'Preciso de ajuda com 🚗 multa de trânsito 😢',
        'Divórcio com acentuação e çedilha',
        'Text with "quotes" and \'apostrophes\'',
        'Mixed language: legal help por favor'
      ];

      specialTexts.forEach(userText => {
        const context: DegradationContext = {
          ...baseContext,
          userText,
          failurePoint: 'embedding_timeout'
        };

        const result = selectDegradationStrategy(context);
        expect(result.response).toBeDefined();
      });
    });

    it('should handle unknown failure points gracefully', () => {
      const context: DegradationContext = {
        ...baseContext,
        failurePoint: 'completely_unknown_failure' as any
      };

      const result = selectDegradationStrategy(context);

      expect(result.response).toBeDefined();
      expect(result.strategy).toBe('ultimate_fallback');
      expect(result.fallbackLevel).toBe('tertiary');
    });
  });
});