// __tests__/unit/socialwise-flow/router-band-processing.test.ts

import { RouterBandProcessor } from '@/lib/socialwise-flow/performance-bands';
import { AgentConfig } from '@/services/openai';

// Mock the OpenAI service
jest.mock('@/services/openai', () => ({
  openaiService: {
    createChatCompletion: jest.fn()
  }
}));

describe('RouterBandProcessor Unit Tests', () => {
  let processor: RouterBandProcessor;
  let mockAgent: AgentConfig;

  beforeEach(() => {
    mockAgent = {
      model: 'gpt-4o-mini',
      tempSchema: 0.1,
      tempCopy: 0.3
    };

    processor = new RouterBandProcessor(mockAgent);
  });

  describe('Domain Topic Generation', () => {
    test('should complete processing under 200ms', async () => {
      const userText = "preciso de ajuda com uma questão";
      
      const startTime = Date.now();
      const result = await processor.process(userText);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(200);
      expect(result.type).toBe('domain_topics');
      expect(result.response_text).toBeTruthy();
      expect(result.buttons).toHaveLength(3);
      expect(result.response_time_ms).toBeLessThan(200);
    });

    test('should generate legal domain topics with LLM when available', async () => {
      const { openaiService } = require('@/services/openai');
      
      // Mock successful LLM response
      openaiService.createChatCompletion.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              response_text: "Posso ajudar com sua questão jurídica. Qual área melhor se relaciona com sua situação?",
              buttons: [
                { title: "Direito Civil", payload: "@consulta_direito_civil" },
                { title: "Direito Consumidor", payload: "@consulta_direito_consumidor" },
                { title: "Direito Família", payload: "@consulta_direito_familia" }
              ]
            })
          }
        }]
      });

      const userText = "tenho um problema jurídico";
      
      const result = await processor.process(userText);

      expect(result.type).toBe('domain_topics');
      expect(result.response_text).toBe("Posso ajudar com sua questão jurídica. Qual área melhor se relaciona com sua situação?");
      expect(result.buttons).toHaveLength(3);
      expect(result.buttons[0].title).toBe("Direito Civil");
      expect(result.buttons[0].payload).toBe("@consulta_direito_civil");
      
      // Verify LLM was called
      expect(openaiService.createChatCompletion).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: "user",
            content: expect.stringContaining("tenho um problema jurídico")
          })
        ]),
        expect.objectContaining({
          model: mockAgent.model,
          temperature: mockAgent.tempSchema,
          max_tokens: 300
        })
      );
    });

    test('should fallback to deterministic topics when LLM fails', async () => {
      const { openaiService } = require('@/services/openai');
      
      // Mock LLM failure
      openaiService.createChatCompletion.mockRejectedValue(new Error('LLM timeout'));

      const userText = "questão legal complexa";
      
      const startTime = Date.now();
      const result = await processor.process(userText);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(200);
      expect(result.type).toBe('domain_topics');
      expect(result.response_text).toBe("Posso ajudar com sua questão jurídica. Qual área melhor se relaciona com sua situação?");
      expect(result.buttons).toHaveLength(3);
      
      // Should have deterministic fallback topics
      expect(result.buttons[0].title).toBe("Direito Civil");
      expect(result.buttons[0].payload).toBe("@consulta_direito_civil");
      expect(result.buttons[1].title).toBe("Direito Consumidor");
      expect(result.buttons[1].payload).toBe("@consulta_direito_consumidor");
      expect(result.buttons[2].title).toBe("Direito Família");
      expect(result.buttons[2].payload).toBe("@consulta_direito_familia");
    });

    test('should handle JSON parse errors gracefully', async () => {
      const { openaiService } = require('@/services/openai');
      
      // Mock invalid JSON response
      openaiService.createChatCompletion.mockResolvedValue({
        choices: [{
          message: {
            content: "Invalid JSON response"
          }
        }]
      });

      const userText = "problema jurídico";
      
      const result = await processor.process(userText);

      expect(result.type).toBe('domain_topics');
      expect(result.response_text).toBeTruthy();
      expect(result.buttons).toHaveLength(3);
      
      // Should fallback to deterministic topics
      expect(result.buttons[0].title).toBe("Direito Civil");
    });

    test('should handle empty LLM response gracefully', async () => {
      const { openaiService } = require('@/services/openai');
      
      // Mock empty response
      openaiService.createChatCompletion.mockResolvedValue({
        choices: [{
          message: {
            content: ""
          }
        }]
      });

      const userText = "ajuda legal";
      
      const result = await processor.process(userText);

      expect(result.type).toBe('domain_topics');
      expect(result.buttons).toHaveLength(3);
      
      // Should use fallback
      expect(result.buttons[0].payload).toBe("@consulta_direito_civil");
    });
  });

  describe('Response Validation and Clamping', () => {
    test('should clamp introduction text to 180 characters', async () => {
      const { openaiService } = require('@/services/openai');
      
      const longIntroduction = "Esta é uma introdução muito longa que excede o limite de 180 caracteres e precisa ser cortada para garantir que não cause problemas na interface do usuário e mantenha a experiência otimizada para todos os canais de comunicação disponíveis no sistema.";
      
      openaiService.createChatCompletion.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              response_text: longIntroduction,
              buttons: [
                { title: "Direito Civil", payload: "@direito_civil" },
                { title: "Direito Penal", payload: "@direito_penal" },
                { title: "Direito Trabalhista", payload: "@direito_trabalhista" }
              ]
            })
          }
        }]
      });

      const result = await processor.process("texto longo");

      expect(result.response_text.length).toBeLessThanOrEqual(180);
      expect(result.response_text).toBe(longIntroduction.slice(0, 180).trim());
    });

    test('should clamp button titles to 20 characters', async () => {
      const { openaiService } = require('@/services/openai');
      
      openaiService.createChatCompletion.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              response_text: "Escolha uma área:",
              buttons: [
                { title: "Direito Civil e Empresarial Muito Longo", payload: "@direito_civil" },
                { title: "Direito do Consumidor e Relações", payload: "@direito_consumidor" },
                { title: "Direito de Família e Sucessões", payload: "@direito_familia" }
              ]
            })
          }
        }]
      });

      const result = await processor.process("títulos longos");

      result.buttons.forEach(button => {
        expect(button.title.length).toBeLessThanOrEqual(20);
      });
      
      expect(result.buttons[0].title).toBe("Direito Civil e Empr");
      expect(result.buttons[1].title).toBe("Direito do Consumido");
      expect(result.buttons[2].title).toBe("Direito de Família e");
    });

    test('should validate and fix button payloads', async () => {
      const { openaiService } = require('@/services/openai');
      
      // Clear any previous mocks to ensure this test runs with LLM
      openaiService.createChatCompletion.mockClear();
      
      openaiService.createChatCompletion.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              response_text: "Escolha:",
              buttons: [
                { title: "Civil", payload: "invalid-payload" },
                { title: "Penal", payload: "@valid_payload" },
                { title: "Trabalhista", payload: "INVALID PAYLOAD WITH SPACES" }
              ]
            })
          }
        }]
      });

      const result = await processor.process("payloads inválidos");

      result.buttons.forEach(button => {
        expect(button.payload).toMatch(/^@[a-z0-9_]+$/);
      });
      
      expect(result.buttons[0].payload).toBe("@invalid_payload");
      expect(result.buttons[1].payload).toBe("@valid_payload");
      expect(result.buttons[2].payload).toBe("@invalid_payload_with_spaces");
    });

    test('should limit to maximum 3 buttons', async () => {
      const { openaiService } = require('@/services/openai');
      
      openaiService.createChatCompletion.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              response_text: "Muitas opções:",
              buttons: [
                { title: "Civil", payload: "@civil" },
                { title: "Penal", payload: "@penal" },
                { title: "Trabalhista", payload: "@trabalhista" },
                { title: "Consumidor", payload: "@consumidor" },
                { title: "Família", payload: "@familia" }
              ]
            })
          }
        }]
      });

      const result = await processor.process("muitas opções");

      expect(result.buttons.length).toBeLessThanOrEqual(3);
      expect(result.buttons).toHaveLength(3);
    });
  });

  describe('Performance Requirements', () => {
    test('should maintain sub-200ms performance under load', async () => {
      const iterations = 20;
      const results: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        await processor.process(`questão jurídica ${i}`);
        results.push(Date.now() - startTime);
      }

      const averageTime = results.reduce((a, b) => a + b, 0) / results.length;
      const p95Time = results.sort((a, b) => a - b)[Math.floor(results.length * 0.95)];

      expect(averageTime).toBeLessThan(100);
      expect(p95Time).toBeLessThan(200);
      
      console.log(`ROUTER band performance - Average: ${averageTime.toFixed(2)}ms, P95: ${p95Time}ms`);
    });

    test('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = 10;
      const promises: Promise<any>[] = [];

      const startTime = Date.now();

      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(processor.process(`concurrent request ${i}`));
      }

      const results = await Promise.all(promises);
      const totalDuration = Date.now() - startTime;

      // All should complete successfully
      expect(results).toHaveLength(concurrentRequests);
      results.forEach(result => {
        expect(result.type).toBe('domain_topics');
        expect(result.response_time_ms).toBeLessThan(200);
      });

      // Total time should be reasonable for concurrent processing
      expect(totalDuration).toBeLessThan(500);
    });

    test('should handle edge cases within performance bounds', async () => {
      const edgeCases = [
        "", // Empty text
        "a", // Single character
        "x".repeat(1000), // Very long text
        "🏛️⚖️📋", // Emojis only
        "AJUDA AJUDA AJUDA", // Repeated words
        "Preciso de ajuda com questão muito específica e complexa do direito", // Long legal text
      ];

      for (const userText of edgeCases) {
        const startTime = Date.now();
        const result = await processor.process(userText);
        const duration = Date.now() - startTime;

        expect(duration).toBeLessThan(200);
        expect(result.type).toBe('domain_topics');
        expect(result.buttons).toHaveLength(3);
      }
    });
  });

  describe('Legal Domain Context', () => {
    test('should recognize legal terminology in prompts', async () => {
      const { openaiService } = require('@/services/openai');
      
      openaiService.createChatCompletion.mockImplementation((messages) => {
        const userMessage = messages.find(m => m.role === 'user');
        const content = userMessage.content;
        
        // Verify the prompt includes legal context
        expect(content).toContain('direito brasileiro');
        expect(content).toContain('áreas jurídicas');
        expect(content).toContain('Direito do Consumidor');
        expect(content).toContain('Direito Trabalhista');
        expect(content).toContain('Direito de Família');
        
        return Promise.resolve({
          choices: [{
            message: {
              content: JSON.stringify({
                response_text: "Baseado no contexto legal brasileiro:",
                buttons: [
                  { title: "Direito Civil", payload: "@direito_civil" },
                  { title: "Direito Penal", payload: "@direito_penal" },
                  { title: "Direito Trabalhista", payload: "@direito_trabalhista" }
                ]
              })
            }
          }]
        });
      });

      await processor.process("questão sobre contrato de trabalho");
      
      expect(openaiService.createChatCompletion).toHaveBeenCalled();
    });

    test('should provide contextually appropriate fallback topics', async () => {
      const { openaiService } = require('@/services/openai');
      
      // Force fallback by making LLM fail
      openaiService.createChatCompletion.mockRejectedValue(new Error('LLM failed'));
      
      const result = await processor.process("problema legal");

      expect(result.type).toBe('domain_topics');
      expect(result.buttons).toEqual([
        { title: "Direito Civil", payload: "@consulta_direito_civil" },
        { title: "Direito Consumidor", payload: "@consulta_direito_consumidor" },
        { title: "Direito Família", payload: "@consulta_direito_familia" }
      ]);
      
      // Should be professional but accessible
      expect(result.response_text).toContain("questão jurídica");
      expect(result.response_text).toContain("área");
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle network timeouts gracefully', async () => {
      const { openaiService } = require('@/services/openai');
      
      // Mock network timeout
      openaiService.createChatCompletion.mockImplementation(() =>
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Network timeout')), 100)
        )
      );

      const startTime = Date.now();
      const result = await processor.process("timeout test");
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(200);
      expect(result.type).toBe('domain_topics');
      expect(result.buttons).toHaveLength(3);
    });

    test('should handle malformed LLM responses', async () => {
      const { openaiService } = require('@/services/openai');
      
      const malformedResponses = [
        null,
        undefined,
        { choices: [] },
        { choices: [{ message: null }] },
        { choices: [{ message: { content: null } }] },
        { choices: [{ message: { content: "not json" } }] },
        { choices: [{ message: { content: JSON.stringify({ invalid: "structure" }) } }] }
      ];

      for (const response of malformedResponses) {
        openaiService.createChatCompletion.mockResolvedValue(response);
        
        const result = await processor.process("malformed test");
        
        expect(result.type).toBe('domain_topics');
        expect(result.buttons).toHaveLength(3);
        expect(result.response_text).toBeTruthy();
      }
    });

    test('should not leak memory during repeated processing', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Process many requests
      for (let i = 0; i < 50; i++) {
        await processor.process(`memory test ${i}`);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be minimal (less than 5MB)
      expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024);
    });
  });

  describe('Deterministic Fallback Behavior', () => {
    test('should always return consistent fallback topics', async () => {
      const results: any[] = [];
      
      // Run multiple times to ensure consistency
      for (let i = 0; i < 5; i++) {
        const result = await processor.process("consistent test");
        results.push(result);
      }

      // All results should be identical
      results.forEach(result => {
        expect(result.type).toBe('domain_topics');
        expect(result.response_text).toBe("Posso ajudar com sua questão jurídica. Qual área melhor se relaciona com sua situação?");
        expect(result.buttons).toEqual([
          { title: "Direito Civil", payload: "@consulta_direito_civil" },
          { title: "Direito Consumidor", payload: "@consulta_direito_consumidor" },
          { title: "Direito Família", payload: "@consulta_direito_familia" }
        ]);
      });
    });

    test('should maintain performance even with fallback', async () => {
      const { openaiService } = require('@/services/openai');
      
      // Force fallback by making LLM fail
      openaiService.createChatCompletion.mockRejectedValue(new Error('Forced failure'));

      const iterations = 10;
      const results: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        await processor.process(`fallback performance ${i}`);
        results.push(Date.now() - startTime);
      }

      const averageTime = results.reduce((a, b) => a + b, 0) / results.length;
      
      // Fallback should be very fast
      expect(averageTime).toBeLessThan(50);
      
      console.log(`ROUTER band fallback performance - Average: ${averageTime.toFixed(2)}ms`);
    });
  });
});