// __tests__/unit/socialwise-flow/hard-band-performance.test.ts

import { HardBandProcessor, ClassificationResult } from '@/lib/socialwise-flow/performance-bands';
import { AgentConfig, IntentCandidate } from '@/services/openai';

// Mock the OpenAI service
jest.mock('@/services/openai', () => ({
  openaiService: {
    createChatCompletion: jest.fn()
  }
}));

describe('HardBandProcessor Performance Tests', () => {
  let processor: HardBandProcessor;
  let mockAgent: AgentConfig;
  let mockCandidate: IntentCandidate;

  beforeEach(() => {
    mockAgent = {
      model: 'gpt-4o-mini',
      tempCopy: 0.3,
      tempSchema: 0.1
    };

    mockCandidate = {
      slug: 'recurso_multa_transito',
      name: 'Recurso de Multa de Trânsito',
      desc: 'Defesa administrativa contra multa de trânsito',
      score: 0.85
    };

    processor = new HardBandProcessor(mockAgent);
  });

  describe('Direct Mapping Performance', () => {
    test('should complete direct mapping under 120ms', async () => {
      const userText = "recebi uma multa de trânsito e quero recorrer";
      
      const startTime = Date.now();
      const result = await processor.process(userText, mockCandidate, false); // Disable microcopy for pure speed test
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(120);
      expect(result.type).toBe('direct_map');
      expect(result.intent_slug).toBe('recurso_multa_transito');
      expect(result.response_time_ms).toBeLessThan(120);
    });

    test('should return immediate response without waiting for microcopy', async () => {
      const userText = "preciso recorrer de uma multa";
      
      const startTime = Date.now();
      const result = await processor.process(userText, mockCandidate, true); // Enable microcopy
      const duration = Date.now() - startTime;

      // Should return immediately, not wait for microcopy
      expect(duration).toBeLessThan(50);
      expect(result.type).toBe('direct_map');
      expect(result.intent_slug).toBe('recurso_multa_transito');
      
      // Microcopy should be undefined initially (non-blocking)
      expect(result.microcopy).toBeUndefined();
    });

    test('should handle multiple concurrent direct mappings efficiently', async () => {
      const userTexts = [
        "recebi uma multa de trânsito",
        "quero recorrer da multa",
        "preciso de ajuda com multa de velocidade",
        "como recorrer de multa do detran",
        "multa indevida preciso contestar"
      ];

      const startTime = Date.now();
      
      const promises = userTexts.map(text => 
        processor.process(text, mockCandidate, false)
      );
      
      const results = await Promise.all(promises);
      const totalDuration = Date.now() - startTime;

      // All should complete quickly
      expect(totalDuration).toBeLessThan(200);
      
      // Each result should be valid
      results.forEach(result => {
        expect(result.type).toBe('direct_map');
        expect(result.intent_slug).toBe('recurso_multa_transito');
        expect(result.response_time_ms).toBeLessThan(120);
      });
    });
  });

  describe('Microcopy Enhancement (Non-blocking)', () => {
    test('should not block response when microcopy is enabled', async () => {
      const { openaiService } = require('@/services/openai');
      
      // Mock slow microcopy response
      openaiService.createChatCompletion.mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({
            choices: [{
              message: {
                content: JSON.stringify({
                  text: "Entendi que você precisa recorrer de uma multa de trânsito. Posso te orientar sobre isso.",
                  buttons: [
                    { title: "Confirmar", payload: "@recurso_multa_transito" },
                    { title: "Esclarecer", payload: "@consulta_juridica" }
                  ]
                })
              }
            }]
          }), 500) // 500ms delay
        )
      );

      const userText = "recebi uma multa injusta";
      
      const startTime = Date.now();
      const result = await processor.process(userText, mockCandidate, true);
      const duration = Date.now() - startTime;

      // Should return immediately despite slow microcopy
      expect(duration).toBeLessThan(50);
      expect(result.type).toBe('direct_map');
      expect(result.intent_slug).toBe('recurso_multa_transito');
      
      // Wait a bit to see if microcopy gets enhanced asynchronously
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // Microcopy should eventually be enhanced (but we don't wait for it)
      expect(openaiService.createChatCompletion).toHaveBeenCalled();
    });

    test('should handle microcopy failures gracefully', async () => {
      const { openaiService } = require('@/services/openai');
      
      // Mock microcopy failure
      openaiService.createChatCompletion.mockRejectedValue(new Error('LLM timeout'));

      const userText = "multa de trânsito indevida";
      
      const startTime = Date.now();
      const result = await processor.process(userText, mockCandidate, true);
      const duration = Date.now() - startTime;

      // Should still return quickly despite microcopy failure
      expect(duration).toBeLessThan(50);
      expect(result.type).toBe('direct_map');
      expect(result.intent_slug).toBe('recurso_multa_transito');
    });
  });

  describe('Performance Regression Tests', () => {
    test('should maintain sub-120ms performance under load', async () => {
      const iterations = 50;
      const results: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        await processor.process(
          `multa de trânsito número ${i}`, 
          mockCandidate, 
          false
        );
        results.push(Date.now() - startTime);
      }

      const averageTime = results.reduce((a, b) => a + b, 0) / results.length;
      const p95Time = results.sort((a, b) => a - b)[Math.floor(results.length * 0.95)];

      expect(averageTime).toBeLessThan(50);
      expect(p95Time).toBeLessThan(120);
      
      console.log(`HARD band performance - Average: ${averageTime.toFixed(2)}ms, P95: ${p95Time}ms`);
    });

    test('should handle edge cases within performance bounds', async () => {
      const edgeCases = [
        "", // Empty text
        "a", // Single character
        "x".repeat(1000), // Very long text
        "🚗💨🚓", // Emojis only
        "MULTA MULTA MULTA", // Repeated words
      ];

      for (const userText of edgeCases) {
        const startTime = Date.now();
        const result = await processor.process(userText, mockCandidate, false);
        const duration = Date.now() - startTime;

        expect(duration).toBeLessThan(120);
        expect(result.type).toBe('direct_map');
        expect(result.intent_slug).toBe('recurso_multa_transito');
      }
    });
  });

  describe('Memory and Resource Usage', () => {
    test('should not leak memory during repeated processing', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Process many requests
      for (let i = 0; i < 100; i++) {
        await processor.process(
          `test message ${i}`, 
          mockCandidate, 
          false
        );
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be minimal (less than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });

    test('should handle concurrent requests without resource exhaustion', async () => {
      const concurrentRequests = 20;
      const promises: Promise<any>[] = [];

      const startTime = Date.now();

      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          processor.process(
            `concurrent request ${i}`, 
            mockCandidate, 
            false
          )
        );
      }

      const results = await Promise.all(promises);
      const totalDuration = Date.now() - startTime;

      // All requests should complete successfully
      expect(results).toHaveLength(concurrentRequests);
      results.forEach(result => {
        expect(result.type).toBe('direct_map');
        expect(result.response_time_ms).toBeLessThan(120);
      });

      // Total time should be reasonable for concurrent processing
      expect(totalDuration).toBeLessThan(500);
    });
  });

  describe('Abort and Timeout Handling', () => {
    test('should handle aborted microcopy requests gracefully', async () => {
      const { openaiService } = require('@/services/openai');
      
      // Mock aborted request
      openaiService.createChatCompletion.mockRejectedValue(
        Object.assign(new Error('Request aborted'), { name: 'AbortError' })
      );

      const userText = "multa de trânsito";
      
      const startTime = Date.now();
      const result = await processor.process(userText, mockCandidate, true);
      const duration = Date.now() - startTime;

      // Should still return quickly
      expect(duration).toBeLessThan(50);
      expect(result.type).toBe('direct_map');
      expect(result.intent_slug).toBe('recurso_multa_transito');
    });
  });
});