/**
 * Unit tests for batch short title generation functionality
 */

import { UXWritingService } from '@/lib/socialwise-flow/ux-writing-service';
import { getHumanizedTitle } from '@/lib/socialwise-flow/ux-writing';
import { IOpenAIService, IntentCandidate, AgentConfig } from '@/services/openai';

// Mock OpenAI Service
class MockOpenAIService implements Partial<IOpenAIService> {
  generateShortTitlesBatch = jest.fn();
  
  // Add other required methods as no-ops for interface compliance
  createChatCompletion = jest.fn();
  generateImage = jest.fn();
  generateImageWithResponses = jest.fn();
  transcribeAudio = jest.fn();
  getEmbeddings = jest.fn();
  moderateContent = jest.fn();
  listModels = jest.fn();
  uploadFile = jest.fn();
  uploadFileFromPath = jest.fn();
  listFiles = jest.fn();
  retrieveFile = jest.fn();
  retrieveFileContent = jest.fn();
  deleteFile = jest.fn();
  createImageEdit = jest.fn();
  createImageVariation = jest.fn();
  checkApiConnection = jest.fn();
  extractPdfWithAssistant = jest.fn();
  askAboutPdf = jest.fn();
  generateWarmupButtons = jest.fn();
  routerLLM = jest.fn();
}

describe('Batch Short Title Generation', () => {
  let mockOpenAI: MockOpenAIService;
  let service: UXWritingService;
  
  const sampleAgent: AgentConfig = {
    model: 'gpt-4o',
    developer: 'Legal Assistant',
    reasoningEffort: 'minimal',
    verbosity: 'low'
  };

  const sampleIntents: IntentCandidate[] = [
    { slug: 'recurso_multa_transito', name: 'Recurso Multa', desc: 'Recurso administrativo contra multa de trânsito' },
    { slug: 'acao_cobranca', name: 'Ação Cobrança', desc: 'Ação de cobrança de dívida' },
    { slug: 'consulta_juridica', name: 'Consulta', desc: 'Consulta jurídica geral' }
  ];

  beforeEach(() => {
    mockOpenAI = new MockOpenAIService();
    service = new UXWritingService(mockOpenAI as IOpenAIService);
    jest.clearAllMocks();
  });

  describe('generateShortTitlesBatch', () => {
    it('should process multiple intents in single LLM call', async () => {
      const mockTitles = ['Recorrer Multa', 'Cobrar Dívida', 'Consulta'];
      mockOpenAI.generateShortTitlesBatch!.mockResolvedValue(mockTitles);

      const result = await service.generateShortTitlesBatch(sampleIntents, sampleAgent);

      expect(mockOpenAI.generateShortTitlesBatch).toHaveBeenCalledTimes(1);
      expect(mockOpenAI.generateShortTitlesBatch).toHaveBeenCalledWith(sampleIntents, sampleAgent);
      expect(result).toEqual(mockTitles);
    });

    it('should clamp titles that exceed limits', async () => {
      const mockTitles = [
        'Este título é muito longo e precisa ser cortado adequadamente',
        'Cobrar Dívida',
        'Consulta'
      ];
      mockOpenAI.generateShortTitlesBatch!.mockResolvedValue(mockTitles);

      const result = await service.generateShortTitlesBatch(sampleIntents, sampleAgent);

      expect(result![0].length).toBeLessThanOrEqual(20);
      expect(result![0].split(' ').length).toBeLessThanOrEqual(4);
      expect(result![1]).toBe('Cobrar Dívida');
      expect(result![2]).toBe('Consulta');
    });

    it('should fallback to humanized titles when LLM fails', async () => {
      mockOpenAI.generateShortTitlesBatch!.mockResolvedValue(null);

      const result = await service.generateShortTitlesBatch(sampleIntents, sampleAgent);

      expect(result).toEqual(['Recorrer Multa', 'Cobrar Dívida', 'Consulta']);
    });

    it('should handle mismatched array length from LLM', async () => {
      const mockTitles = ['Recorrer Multa']; // Only 1 title for 3 intents
      mockOpenAI.generateShortTitlesBatch!.mockResolvedValue(mockTitles);

      const result = await service.generateShortTitlesBatch(sampleIntents, sampleAgent);

      // Should fallback to humanized titles
      expect(result).toEqual(['Recorrer Multa', 'Cobrar Dívida', 'Consulta']);
    });

    it('should return empty array for empty input', async () => {
      const result = await service.generateShortTitlesBatch([], sampleAgent);

      expect(result).toEqual([]);
      expect(mockOpenAI.generateShortTitlesBatch).not.toHaveBeenCalled();
    });

    it('should use humanized fallback for empty/null titles', async () => {
      const mockTitles = ['', 'Cobrar Dívida', null as any];
      mockOpenAI.generateShortTitlesBatch!.mockResolvedValue(mockTitles);

      const result = await service.generateShortTitlesBatch(sampleIntents, sampleAgent);

      expect(result![0]).toBe('Recorrer Multa'); // Fallback for empty title
      expect(result![1]).toBe('Cobrar Dívida'); // Preserved valid title
      expect(result![2]).toBe('Consulta'); // Fallback for null title
    });

    it('should handle API errors gracefully', async () => {
      mockOpenAI.generateShortTitlesBatch!.mockRejectedValue(new Error('API Error'));

      const result = await service.generateShortTitlesBatch(sampleIntents, sampleAgent);

      expect(result).toEqual(['Recorrer Multa', 'Cobrar Dívida', 'Consulta']);
    });
  });

  describe('humanization fallback', () => {
    it('should provide humanized titles for common legal intents', () => {
      expect(getHumanizedTitle('recurso_multa_transito')).toBe('Recorrer Multa');
      expect(getHumanizedTitle('acao_cobranca')).toBe('Cobrar Dívida');
      expect(getHumanizedTitle('divorcio_consensual')).toBe('Divórcio');
      expect(getHumanizedTitle('rescisao_trabalhista')).toBe('Rescisão');
    });

    it('should handle unknown intents with generic fallback', () => {
      expect(getHumanizedTitle('intent_desconhecido')).toBe('Consulta');
      expect(getHumanizedTitle('outro_intent_qualquer')).toBe('Consulta');
    });

    it('should handle edge cases', () => {
      expect(getHumanizedTitle('')).toBe('Consulta');
      expect(getHumanizedTitle(null as any)).toBe('Consulta');
      expect(getHumanizedTitle(undefined as any)).toBe('Consulta');
    });

    it('should remove @ prefix when present', () => {
      expect(getHumanizedTitle('@recurso_multa_transito')).toBe('Recorrer Multa');
      expect(getHumanizedTitle('@acao_cobranca')).toBe('Cobrar Dívida');
    });
  });

  describe('optimization requirements', () => {
    it('should make exactly one LLM call per request in SOFT band', async () => {
      const mockTitles = ['Recorrer Multa', 'Cobrar Dívida', 'Consulta'];
      mockOpenAI.generateShortTitlesBatch!.mockResolvedValue(mockTitles);

      await service.generateShortTitlesBatch(sampleIntents, sampleAgent);

      // Verify single LLM call optimization
      expect(mockOpenAI.generateShortTitlesBatch).toHaveBeenCalledTimes(1);
    });

    it('should avoid sequential LLM calls for multiple intents', async () => {
      const largeIntentList = Array.from({ length: 10 }, (_, i) => ({
        slug: `intent_${i}`,
        name: `Intent ${i}`,
        desc: `Description for intent ${i}`
      }));

      const mockTitles = Array.from({ length: 10 }, (_, i) => `Title ${i}`);
      mockOpenAI.generateShortTitlesBatch!.mockResolvedValue(mockTitles);

      await service.generateShortTitlesBatch(largeIntentList, sampleAgent);

      // Should still be only one call regardless of intent count
      expect(mockOpenAI.generateShortTitlesBatch).toHaveBeenCalledTimes(1);
    });

    it('should maintain response quality while reducing call count', async () => {
      const mockTitles = ['Recorrer Multa', 'Cobrar Dívida', 'Consulta'];
      mockOpenAI.generateShortTitlesBatch!.mockResolvedValue(mockTitles);

      const result = await service.generateShortTitlesBatch(sampleIntents, sampleAgent);

      // Verify quality is maintained
      expect(result).toHaveLength(3);
      expect(result![0]).toBe('Recorrer Multa');
      expect(result![1]).toBe('Cobrar Dívida');
      expect(result![2]).toBe('Consulta');
      
      // Verify single call optimization
      expect(mockOpenAI.generateShortTitlesBatch).toHaveBeenCalledTimes(1);
    });
  });
});