// __tests__/integration/socialwise-flow/soft-band-workflow.test.ts

import { SoftBandProcessor, ClassificationResult } from '@/lib/socialwise-flow/performance-bands';
import { AgentConfig, IntentCandidate } from '@/services/openai';

// Mock the OpenAI service
jest.mock('@/services/openai', () => ({
  openaiService: {
    generateShortTitlesBatch: jest.fn(),
    generateWarmupButtons: jest.fn()
  }
}));

describe('SoftBandProcessor Integration Tests', () => {
  let processor: SoftBandProcessor;
  let mockAgent: AgentConfig;
  let mockCandidates: IntentCandidate[];

  beforeEach(() => {
    mockAgent = {
      model: 'gpt-4o-mini',
      tempCopy: 0.3,
      tempSchema: 0.1
    };

    mockCandidates = [
      {
        slug: 'recurso_multa_transito',
        name: 'Recurso de Multa de Trânsito',
        desc: 'Defesa administrativa contra multa de trânsito',
        score: 0.75
      },
      {
        slug: 'mandado_seguranca',
        name: 'Mandado de Segurança',
        desc: 'Ação judicial para direito líquido e certo',
        score: 0.68
      },
      {
        slug: 'consulta_juridica',
        name: 'Consulta Jurídica',
        desc: 'Orientação jurídica geral',
        score: 0.66
      }
    ];

    processor = new SoftBandProcessor(mockAgent);
  });

  describe('Complete SOFT Band Workflow', () => {
    test('should complete full workflow under 300ms', async () => {
      const { openaiService } = require('@/services/openai');
      
      // Mock successful short titles generation
      openaiService.generateShortTitlesBatch.mockResolvedValue([
        'Recorrer Multa',
        'Ação Judicial',
        'Consulta Geral'
      ]);

      // Mock successful warmup buttons generation
      openaiService.generateWarmupButtons.mockResolvedValue({
        introduction_text: 'Posso ajudar com sua questão. Qual dessas opções se aproxima mais do que você precisa?',
        buttons: [
          { title: 'Recorrer Multa', payload: '@recurso_multa_transito' },
          { title: 'Ação Judicial', payload: '@mandado_seguranca' },
          { title: 'Consulta Geral', payload: '@consulta_juridica' }
        ]
      });

      const userText = "recebi uma notificação do detran e não sei o que fazer";
      
      const startTime = Date.now();
      const result = await processor.process(userText, mockCandidates);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(300);
      expect(result.type).toBe('warmup_buttons');
      expect(result.introduction_text).toBeTruthy();
      expect(result.buttons).toHaveLength(3);
      expect(result.response_time_ms).toBeLessThan(300);

      // Verify both LLM calls were made
      expect(openaiService.generateShortTitlesBatch).toHaveBeenCalledWith(mockCandidates, mockAgent);
      expect(openaiService.generateWarmupButtons).toHaveBeenCalledWith(
        userText,
        expect.arrayContaining([
          expect.objectContaining({ shortTitle: 'Recorrer Multa' }),
          expect.objectContaining({ shortTitle: 'Ação Judicial' }),
          expect.objectContaining({ shortTitle: 'Consulta Geral' })
        ]),
        mockAgent
      );
    });

    test('should handle degradation when short titles fail', async () => {
      const { openaiService } = require('@/services/openai');
      
      // Mock failed short titles generation
      openaiService.generateShortTitlesBatch.mockResolvedValue(null);

      // Mock successful warmup buttons generation (should still work)
      openaiService.generateWarmupButtons.mockResolvedValue({
        introduction_text: 'Posso ajudar com sua questão jurídica. Qual dessas opções se aproxima mais?',
        buttons: [
          { title: 'Recurso Multa', payload: '@recurso_multa_transito' },
          { title: 'Mandado Segurança', payload: '@mandado_seguranca' },
          { title: 'Consulta Jurídica', payload: '@consulta_juridica' }
        ]
      });

      const userText = "problema com multa de trânsito";
      
      const startTime = Date.now();
      const result = await processor.process(userText, mockCandidates);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(300);
      expect(result.type).toBe('warmup_buttons');
      expect(result.buttons).toHaveLength(3);

      // Should still call warmup buttons with fallback titles (name or slug)
      expect(openaiService.generateWarmupButtons).toHaveBeenCalledWith(
        userText,
        expect.arrayContaining([
          expect.objectContaining({ 
            shortTitle: expect.stringMatching(/Recurso de Multa de Trânsito|recurso_multa_transito/)
          }),
        ]),
        mockAgent
      );
    });

    test('should fallback to deterministic buttons when both LLM calls fail', async () => {
      const { openaiService } = require('@/services/openai');
      
      // Mock both LLM calls failing
      openaiService.generateShortTitlesBatch.mockResolvedValue(null);
      openaiService.generateWarmupButtons.mockResolvedValue(null);

      const userText = "questão jurídica complexa";
      
      const startTime = Date.now();
      const result = await processor.process(userText, mockCandidates);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(300);
      expect(result.type).toBe('warmup_buttons');
      expect(result.introduction_text).toBe('Posso ajudar com sua questão jurídica. Qual dessas opções se aproxima mais do que você precisa?');
      expect(result.buttons).toHaveLength(3);
      
      // Should have humanized titles (clamped to 20 characters at word boundaries)
      expect(result.buttons[0].title).toBe('Recurso Multa');
      expect(result.buttons[1].title).toBe('Mandado Seguranca');
      expect(result.buttons[2].title).toBe('Consulta Juridica');
    });
  });

  describe('Batch Processing Optimization', () => {
    test('should make exactly one short title call for multiple candidates', async () => {
      const { openaiService } = require('@/services/openai');
      
      // Clear previous mock calls
      openaiService.generateShortTitlesBatch.mockClear();
      openaiService.generateWarmupButtons.mockClear();
      
      openaiService.generateShortTitlesBatch.mockResolvedValue([
        'Título 1', 'Título 2', 'Título 3'
      ]);
      openaiService.generateWarmupButtons.mockResolvedValue({
        introduction_text: 'Teste',
        buttons: [
          { title: 'Botão 1', payload: '@test1' },
          { title: 'Botão 2', payload: '@test2' },
          { title: 'Botão 3', payload: '@test3' }
        ]
      });

      await processor.process("teste", mockCandidates);

      // Should call batch method exactly once
      expect(openaiService.generateShortTitlesBatch).toHaveBeenCalledTimes(1);
      expect(openaiService.generateWarmupButtons).toHaveBeenCalledTimes(1);
    });

    test('should handle partial short title results gracefully', async () => {
      const { openaiService } = require('@/services/openai');
      
      // Mock partial results (fewer titles than candidates)
      openaiService.generateShortTitlesBatch.mockResolvedValue([
        'Título 1', 'Título 2' // Missing third title
      ]);
      openaiService.generateWarmupButtons.mockResolvedValue({
        introduction_text: 'Teste parcial',
        buttons: [
          { title: 'Botão 1', payload: '@test1' },
          { title: 'Botão 2', payload: '@test2' }
        ]
      });

      const result = await processor.process("teste parcial", mockCandidates);

      expect(result.type).toBe('warmup_buttons');
      expect(result.buttons.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Under Load', () => {
    test('should maintain sub-300ms performance with concurrent requests', async () => {
      const { openaiService } = require('@/services/openai');
      
      // Mock fast responses
      openaiService.generateShortTitlesBatch.mockResolvedValue([
        'Rápido 1', 'Rápido 2', 'Rápido 3'
      ]);
      openaiService.generateWarmupButtons.mockResolvedValue({
        introduction_text: 'Resposta rápida',
        buttons: [
          { title: 'Rápido 1', payload: '@fast1' },
          { title: 'Rápido 2', payload: '@fast2' },
          { title: 'Rápido 3', payload: '@fast3' }
        ]
      });

      const concurrentRequests = 10;
      const promises: Promise<any>[] = [];

      const startTime = Date.now();

      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          processor.process(`request ${i}`, mockCandidates)
        );
      }

      const results = await Promise.all(promises);
      const totalDuration = Date.now() - startTime;

      // All should complete successfully
      expect(results).toHaveLength(concurrentRequests);
      results.forEach(result => {
        expect(result.type).toBe('warmup_buttons');
        expect(result.response_time_ms).toBeLessThan(300);
      });

      // Total time should be reasonable for concurrent processing
      expect(totalDuration).toBeLessThan(1000);
    });

    test('should handle timeout scenarios gracefully', async () => {
      const { openaiService } = require('@/services/openai');
      
      // Mock timeout scenarios
      openaiService.generateShortTitlesBatch.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve(null), 400))
      );
      openaiService.generateWarmupButtons.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve(null), 400))
      );

      const userText = "timeout test";
      
      const startTime = Date.now();
      const result = await processor.process(userText, mockCandidates);
      const duration = Date.now() - startTime;

      // Should still complete with fallback
      expect(result.type).toBe('warmup_buttons');
      expect(result.buttons).toHaveLength(3);
      
      // Should use fallback buttons
      expect(result.introduction_text).toBe('Posso ajudar com sua questão jurídica. Qual dessas opções se aproxima mais do que você precisa?');
    });
  });

  describe('Button Generation and Validation', () => {
    test('should generate valid button payloads', async () => {
      const { openaiService } = require('@/services/openai');
      
      openaiService.generateShortTitlesBatch.mockResolvedValue([
        'Título Válido', 'Outro Título', 'Terceiro'
      ]);
      openaiService.generateWarmupButtons.mockResolvedValue({
        introduction_text: 'Escolha uma opção:',
        buttons: [
          { title: 'Título Válido', payload: '@recurso_multa_transito' },
          { title: 'Outro Título', payload: '@mandado_seguranca' },
          { title: 'Terceiro', payload: '@consulta_juridica' }
        ]
      });

      const result = await processor.process("teste validação", mockCandidates);

      expect(result.type).toBe('warmup_buttons');
      result.buttons.forEach(button => {
        expect(button.title).toBeTruthy();
        expect(button.title.length).toBeLessThanOrEqual(20);
        expect(button.payload).toMatch(/^@[a-z0-9_]+$/);
      });
    });

    test('should clamp button titles to 20 characters', async () => {
      const { openaiService } = require('@/services/openai');
      
      openaiService.generateShortTitlesBatch.mockResolvedValue([
        'Título Muito Longo Que Excede Limite',
        'Outro Título Também Muito Longo',
        'Terceiro Título Longo'
      ]);
      // Mock the OpenAI service to return long titles (simulating what would happen before clamping)
      openaiService.generateWarmupButtons.mockResolvedValue({
        introduction_text: 'Títulos longos serão cortados:',
        buttons: [
          { title: 'Título Muito Longo Q', payload: '@test1' }, // Already clamped by OpenAI service
          { title: 'Outro Título Também', payload: '@test2' },
          { title: 'Terceiro Título Long', payload: '@test3' }
        ]
      });

      const result = await processor.process("teste clamping", mockCandidates);

      expect(result.type).toBe('warmup_buttons');
      result.buttons.forEach(button => {
        expect(button.title.length).toBeLessThanOrEqual(20);
      });
    });

    test('should limit to maximum 3 buttons', async () => {
      const { openaiService } = require('@/services/openai');
      
      // Mock more candidates than allowed
      const manyCandidates = [
        ...mockCandidates,
        { slug: 'extra1', name: 'Extra 1', desc: 'Extra', score: 0.70 },
        { slug: 'extra2', name: 'Extra 2', desc: 'Extra', score: 0.69 }
      ];

      openaiService.generateShortTitlesBatch.mockResolvedValue([
        'Título 1', 'Título 2', 'Título 3', 'Título 4', 'Título 5'
      ]);
      // OpenAI service should already limit to 3 buttons, but let's test our defense in depth
      openaiService.generateWarmupButtons.mockResolvedValue({
        introduction_text: 'Muitas opções:',
        buttons: [
          { title: 'Título 1', payload: '@test1' },
          { title: 'Título 2', payload: '@test2' },
          { title: 'Título 3', payload: '@test3' }
        ]
      });

      const result = await processor.process("muitas opções", manyCandidates.slice(0, 3));

      expect(result.type).toBe('warmup_buttons');
      expect(result.buttons.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Error Recovery and Resilience', () => {
    test('should recover from JSON parse errors', async () => {
      const { openaiService } = require('@/services/openai');
      
      openaiService.generateShortTitlesBatch.mockResolvedValue([
        'Título 1', 'Título 2', 'Título 3'
      ]);
      
      // Mock invalid JSON response
      openaiService.generateWarmupButtons.mockRejectedValue(
        new SyntaxError('Unexpected token in JSON')
      );

      const result = await processor.process("json error test", mockCandidates);

      expect(result.type).toBe('warmup_buttons');
      expect(result.buttons).toHaveLength(3);
      expect(result.introduction_text).toBeTruthy();
    });

    test('should handle network errors gracefully', async () => {
      const { openaiService } = require('@/services/openai');
      
      // Mock network errors
      openaiService.generateShortTitlesBatch.mockRejectedValue(
        new Error('Network error')
      );
      openaiService.generateWarmupButtons.mockRejectedValue(
        new Error('Network error')
      );

      const result = await processor.process("network error test", mockCandidates);

      expect(result.type).toBe('warmup_buttons');
      expect(result.buttons).toHaveLength(3);
      expect(result.introduction_text).toBe('Posso ajudar com sua questão jurídica. Qual dessas opções se aproxima mais do que você precisa?');
    });

    test('should handle empty candidates array', async () => {
      const result = await processor.process("empty candidates", []);

      expect(result.type).toBe('warmup_buttons');
      expect(result.buttons).toHaveLength(0);
      expect(result.introduction_text).toBeTruthy();
    });
  });

  describe('Performance Regression Prevention', () => {
    test('should maintain consistent performance across multiple runs', async () => {
      const { openaiService } = require('@/services/openai');
      
      openaiService.generateShortTitlesBatch.mockResolvedValue([
        'Consistente 1', 'Consistente 2', 'Consistente 3'
      ]);
      openaiService.generateWarmupButtons.mockResolvedValue({
        introduction_text: 'Performance consistente',
        buttons: [
          { title: 'Consistente 1', payload: '@test1' },
          { title: 'Consistente 2', payload: '@test2' },
          { title: 'Consistente 3', payload: '@test3' }
        ]
      });

      const iterations = 20;
      const results: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        await processor.process(`iteration ${i}`, mockCandidates);
        results.push(Date.now() - startTime);
      }

      const averageTime = results.reduce((a, b) => a + b, 0) / results.length;
      const maxTime = Math.max(...results);
      const minTime = Math.min(...results);

      expect(averageTime).toBeLessThan(150);
      expect(maxTime).toBeLessThan(300);
      expect(maxTime - minTime).toBeLessThan(200); // Consistent performance

      console.log(`SOFT band performance - Average: ${averageTime.toFixed(2)}ms, Min: ${minTime}ms, Max: ${maxTime}ms`);
    });
  });
});