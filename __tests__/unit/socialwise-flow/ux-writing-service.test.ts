/**
 * Unit tests for SocialWise Flow UX Writing Service
 */

import { UXWritingService } from '@/lib/socialwise-flow/ux-writing-service';
import { IOpenAIService, IntentCandidate, AgentConfig, WarmupButtonsResponse, RouterDecision } from '@/services/openai';

// Mock OpenAI Service
class MockOpenAIService implements Partial<IOpenAIService> {
  generateWarmupButtons = jest.fn();
  generateShortTitlesBatch = jest.fn();
  routerLLM = jest.fn();
  
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
}

describe('UXWritingService', () => {
  let mockOpenAI: MockOpenAIService;
  let service: UXWritingService;
  
  const sampleAgent: AgentConfig = {
    model: 'gpt-4o',
    developer: 'Legal Assistant',
    reasoningEffort: 'minimal',
    verbosity: 'low'
  };

  const sampleCandidates: IntentCandidate[] = [
    { slug: 'recurso_multa_transito', name: 'Recurso Multa', desc: 'Recurso administrativo contra multa de trânsito' },
    { slug: 'mandado_seguranca', name: 'Mandado Segurança', desc: 'Ação judicial para direito líquido e certo' },
    { slug: 'consulta_juridica', name: 'Consulta', desc: 'Consulta jurídica geral' }
  ];

  beforeEach(() => {
    mockOpenAI = new MockOpenAIService();
    service = new UXWritingService(mockOpenAI as IOpenAIService);
    jest.clearAllMocks();
  });

  describe('generateWarmupButtons', () => {
    it('should generate warmup buttons using OpenAI service', async () => {
      const mockResponse: WarmupButtonsResponse = {
        response_text: 'Posso ajudar com sua questão de trânsito. Qual opção se aproxima mais?',
        buttons: [
          { title: 'Recorrer Multa', payload: '@recurso_multa_transito' },
          { title: 'Ação Judicial', payload: '@mandado_seguranca' }
        ]
      };

      mockOpenAI.generateWarmupButtons!.mockResolvedValue(mockResponse);

      const result = await service.generateWarmupButtons(
        'recebi uma multa do detran',
        sampleCandidates,
        sampleAgent
      );

      expect(mockOpenAI.generateWarmupButtons).toHaveBeenCalledWith(
        'recebi uma multa do detran',
        sampleCandidates,
        sampleAgent
      );
      expect(result).toBeDefined();
      expect(result!.buttons).toHaveLength(2);
      expect(result!.response_text).toContain('trânsito');
    });

    it('should enhance buttons with legal context', async () => {
      const mockResponse: WarmupButtonsResponse = {
        response_text: 'Como posso ajudar?',
        buttons: [
          { title: 'Recorrer Multa', payload: '@recurso_multa_transito' }
        ]
      };

      mockOpenAI.generateWarmupButtons!.mockResolvedValue(mockResponse);

      const result = await service.generateWarmupButtons(
        'recebi uma multa do detran e quero recorrer',
        sampleCandidates,
        sampleAgent
      );

      expect(result!.response_text).toContain('trânsito');
    });

    it('should fallback to deterministic buttons when LLM fails', async () => {
      mockOpenAI.generateWarmupButtons!.mockResolvedValue(null);

      const result = await service.generateWarmupButtons(
        'recebi uma multa do detran',
        sampleCandidates,
        sampleAgent
      );

      expect(result).toBeDefined();
      expect(result!.buttons).toHaveLength(3);
      expect(result!.buttons[0].title).toBe('Recorrer Multa');
      expect(result!.buttons[0].payload).toBe('@recurso_multa_transito');
    });

    it('should generate fallback for empty candidates', async () => {
      const result = await service.generateWarmupButtons(
        'preciso de ajuda legal',
        [],
        sampleAgent
      );

      expect(result).toBeDefined();
      expect(result!.buttons).toHaveLength(3);
      expect(result!.buttons[0].title).toBe('Consulta Jurídica');
    });

    it('should handle traffic-specific fallbacks', async () => {
      mockOpenAI.generateWarmupButtons!.mockResolvedValue(null);

      const result = await service.generateWarmupButtons(
        'multa detran cnh',
        [],
        sampleAgent
      );

      expect(result!.buttons[0].title).toBe('Recorrer Multa');
      expect(result!.buttons[1].title).toBe('Defesa Admin');
      expect(result!.buttons[2].title).toBe('Consulta CNH');
    });

    it('should handle civil law fallbacks', async () => {
      mockOpenAI.generateWarmupButtons!.mockResolvedValue(null);

      const result = await service.generateWarmupButtons(
        'contrato danos morais cobrança',
        [],
        sampleAgent
      );

      expect(result!.buttons[0].title).toBe('Cobrar Dívida');
      expect(result!.buttons[1].title).toBe('Danos Morais');
      expect(result!.buttons[2].title).toBe('Consulta Civil');
    });

    it('should validate and fix invalid buttons from LLM', async () => {
      const mockResponse: WarmupButtonsResponse = {
        response_text: 'Como posso ajudar?',
        buttons: [
          { title: 'Este título é muito longo para um botão', payload: 'invalid-payload' }
        ]
      };

      mockOpenAI.generateWarmupButtons!.mockResolvedValue(mockResponse);

      const result = await service.generateWarmupButtons(
        'questão legal',
        sampleCandidates,
        sampleAgent
      );

      expect(result!.buttons[0].title).toBe('Recorrer Multa'); // Fallback to candidate
      expect(result!.buttons[0].payload).toBe('@recurso_multa_transito');
    });
  });

  describe('generateShortTitlesBatch', () => {
    it('should generate short titles using OpenAI service', async () => {
      const mockTitles = ['Recorrer Multa', 'Ação Judicial', 'Consulta'];
      mockOpenAI.generateShortTitlesBatch!.mockResolvedValue(mockTitles);

      const result = await service.generateShortTitlesBatch(sampleCandidates, sampleAgent);

      expect(mockOpenAI.generateShortTitlesBatch).toHaveBeenCalledWith(sampleCandidates, sampleAgent);
      expect(result).toEqual(mockTitles);
    });

    it('should clamp and validate generated titles', async () => {
      const mockTitles = [
        'Este título é muito longo e precisa ser cortado',
        'Ação Judicial',
        'Consulta'
      ];
      mockOpenAI.generateShortTitlesBatch!.mockResolvedValue(mockTitles);

      const result = await service.generateShortTitlesBatch(sampleCandidates, sampleAgent);

      expect(result![0].length).toBeLessThanOrEqual(20);
      expect(result![0].split(' ')).toHaveLength(4);
    });

    it('should fallback to humanized titles when LLM fails', async () => {
      mockOpenAI.generateShortTitlesBatch!.mockResolvedValue(null);

      const result = await service.generateShortTitlesBatch(sampleCandidates, sampleAgent);

      expect(result).toEqual(['Recorrer Multa', 'Consulta', 'Consulta']);
    });

    it('should handle mismatched array length from LLM', async () => {
      const mockTitles = ['Recorrer Multa']; // Only 1 title for 3 intents
      mockOpenAI.generateShortTitlesBatch!.mockResolvedValue(mockTitles);

      const result = await service.generateShortTitlesBatch(sampleCandidates, sampleAgent);

      expect(result).toEqual(['Recorrer Multa', 'Consulta', 'Consulta']);
    });

    it('should return empty array for empty input', async () => {
      const result = await service.generateShortTitlesBatch([], sampleAgent);

      expect(result).toEqual([]);
      expect(mockOpenAI.generateShortTitlesBatch).not.toHaveBeenCalled();
    });

    it('should use humanized fallback for empty titles', async () => {
      const mockTitles = ['', 'Ação Judicial', null as any];
      mockOpenAI.generateShortTitlesBatch!.mockResolvedValue(mockTitles);

      const result = await service.generateShortTitlesBatch(sampleCandidates, sampleAgent);

      expect(result![0]).toBe('Recorrer Multa'); // Fallback for empty title
      expect(result![1]).toBe('Ação Judicial'); // Preserved valid title
      expect(result![2]).toBe('Consulta'); // Fallback for null title
    });
  });

  describe('generateDomainTopics', () => {
    it('should generate domain topics using router LLM', async () => {
      const mockRouterResponse: RouterDecision = {
        mode: 'intent',
        response_text: 'Posso ajudar com diversas questões jurídicas.',
        buttons: [
          { title: 'Direito Trânsito', payload: '@direito_transito' },
          { title: 'Direito Civil', payload: '@direito_civil' }
        ]
      };

      mockOpenAI.routerLLM!.mockResolvedValue(mockRouterResponse);

      const result = await service.generateDomainTopics('preciso de ajuda legal', sampleAgent);

      expect(mockOpenAI.routerLLM).toHaveBeenCalledWith('preciso de ajuda legal', sampleAgent);
      expect(result.buttons).toHaveLength(2);
      expect(result.buttons[0].title).toBe('Direito Trânsito');
    });

    it('should fallback to deterministic topics when LLM fails', async () => {
      mockOpenAI.routerLLM!.mockResolvedValue(null);

      const result = await service.generateDomainTopics('questão legal', sampleAgent);

      expect(result.buttons).toHaveLength(3);
      expect(result.buttons[0].title).toBe('Direito Civil');
      expect(result.buttons[1].title).toBe('Direito Trânsito');
      expect(result.buttons[2].title).toBe('Direito Família');
    });

    it('should use traffic-specific fallback for traffic context', async () => {
      mockOpenAI.routerLLM!.mockResolvedValue(null);

      const result = await service.generateDomainTopics('multa detran', sampleAgent);

      expect(result.buttons[0].title).toBe('Direito Trânsito');
      expect(result.buttons[1].title).toBe('Direito Civil');
      expect(result.buttons[2].title).toBe('Consulta Geral');
    });

    it('should use civil law fallback for civil context', async () => {
      mockOpenAI.routerLLM!.mockResolvedValue(null);

      const result = await service.generateDomainTopics('contrato danos morais', sampleAgent);

      expect(result.buttons[0].title).toBe('Direito Civil');
      expect(result.buttons[1].title).toBe('Direito Família');
      expect(result.buttons[2].title).toBe('Direito Consumidor');
    });

    it('should handle router LLM chat mode response', async () => {
      const mockRouterResponse: RouterDecision = {
        mode: 'chat',
        text: 'Posso ajudar com sua questão. Pode me dar mais detalhes?'
      };

      mockOpenAI.routerLLM!.mockResolvedValue(mockRouterResponse);

      const result = await service.generateDomainTopics('ajuda', sampleAgent);

      // Should fallback to deterministic topics
      expect(result.buttons).toHaveLength(3);
      expect(result.response_text).toContain('diversas questões jurídicas');
    });
  });

  describe('formatChannelResponse', () => {
    const sampleButtons = [
      { title: 'Recorrer Multa', payload: '@recurso_multa_transito' },
      { title: 'Consulta', payload: '@consulta_juridica' }
    ];

    it('should format WhatsApp response correctly', () => {
      const result = service.formatChannelResponse(
        'whatsapp',
        'Como posso ajudar?',
        sampleButtons
      );

      expect(result.type).toBe('interactive');
      expect(result.interactive.body.text).toBe('Como posso ajudar?');
      expect(result.interactive.action.buttons).toHaveLength(2);
    });

    it('should format Instagram response correctly', () => {
      const result = service.formatChannelResponse(
        'instagram',
        'Como posso ajudar?',
        sampleButtons
      );

      expect(result.message.attachment.type).toBe('template');
      expect(result.message.attachment.payload.text).toBe('Como posso ajudar?');
      expect(result.message.attachment.payload.buttons).toHaveLength(2);
    });

    it('should format Facebook response correctly', () => {
      const result = service.formatChannelResponse(
        'facebook',
        'Como posso ajudar?',
        sampleButtons
      );

      expect(result.message.text).toContain('Como posso ajudar?');
      expect(result.message.text).toContain('1. Recorrer Multa');
      expect(result.message.text).toContain('2. Consulta');
    });

    it('should handle formatting errors gracefully', () => {
      const result = service.formatChannelResponse(
        'whatsapp',
        'A'.repeat(2000), // Very long text
        sampleButtons
      );

      // Should still return a response
      expect(result).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle OpenAI service errors in warmup buttons', async () => {
      mockOpenAI.generateWarmupButtons!.mockRejectedValue(new Error('API Error'));

      const result = await service.generateWarmupButtons(
        'questão legal',
        sampleCandidates,
        sampleAgent
      );

      expect(result).toBeDefined();
      expect(result!.buttons).toHaveLength(3);
    });

    it('should handle OpenAI service errors in short titles', async () => {
      mockOpenAI.generateShortTitlesBatch!.mockRejectedValue(new Error('API Error'));

      const result = await service.generateShortTitlesBatch(sampleCandidates, sampleAgent);

      expect(result).toEqual(['Recorrer Multa', 'Consulta', 'Consulta']);
    });

    it('should handle OpenAI service errors in domain topics', async () => {
      mockOpenAI.routerLLM!.mockRejectedValue(new Error('API Error'));

      const result = await service.generateDomainTopics('questão legal', sampleAgent);

      expect(result).toBeDefined();
      expect(result.buttons).toHaveLength(3);
    });
  });
});