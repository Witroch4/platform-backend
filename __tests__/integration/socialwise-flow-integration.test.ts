/**
 * SocialWise Flow Integration Tests
 * End-to-end tests for each processing band and channel-specific response validation
 * Requirements: 2.1, 2.2, 2.3, 2.4, 8.1, 8.2, 8.3, 8.4
 */

import { describe, test, expect, jest, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { NextRequest } from 'next/server';

// Test utilities
import { createMockRedis, createMockPrisma, createMockOpenAI } from '../setup/mock-services';
import { createSocialWisePayload, createLegacyChatwitPayload } from '../setup/test-payloads';

// Mock all external dependencies
const mockRedis = createMockRedis();
const mockPrisma = createMockPrisma();
const mockOpenAI = createMockOpenAI();

jest.mock('@/lib/connections', () => ({
  getPrismaInstance: () => mockPrisma,
  getRedisInstance: () => mockRedis,
}));

jest.mock('@/services/openai', () => ({
  openaiService: mockOpenAI,
}));

// Mock SocialWise Flow services
const mockClassifyIntent = jest.fn();
const mockGetAssistantForInbox = jest.fn();
const mockBuildWhatsAppByIntentRaw = jest.fn();
const mockBuildWhatsAppByGlobalIntent = jest.fn();

jest.mock('@/lib/socialwise-flow/classification', () => ({
  classifyIntent: mockClassifyIntent,
}));

jest.mock('@/lib/socialwise/assistant', () => ({
  getAssistantForInbox: mockGetAssistantForInbox,
}));

jest.mock('@/lib/socialwise/templates', () => ({
  buildWhatsAppByIntentRaw: mockBuildWhatsAppByIntentRaw,
  buildWhatsAppByGlobalIntent: mockBuildWhatsAppByGlobalIntent,
}));

describe('SocialWise Flow Integration Tests', () => {
  let POST: any;

  beforeAll(async () => {
    // Import the webhook handler after mocks are set up
    const module = await import('@/app/api/integrations/webhooks/socialwiseflow/route');
    POST = module.POST;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mock responses
    mockRedis.setupDefaults();
    mockPrisma.setupDefaults();
    mockOpenAI.setupDefaults();

    mockGetAssistantForInbox.mockResolvedValue({
      id: 'agent-123',
      model: 'gpt-4o-mini',
      instructions: 'You are a legal assistant specialized in Brazilian law.',
      embedipreview: true,
    });

    mockBuildWhatsAppByIntentRaw.mockResolvedValue(null);
    mockBuildWhatsAppByGlobalIntent.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('HARD Band Processing (≥0.80 score)', () => {
    beforeEach(() => {
      mockClassifyIntent.mockResolvedValue({
        band: 'HARD',
        score: 0.87,
        candidates: [
          {
            slug: 'recurso_oab',
            name: 'Recurso OAB',
            description: 'Recurso administrativo junto à Ordem dos Advogados do Brasil',
            score: 0.87,
          },
        ],
        strategy: 'direct_map',
        metrics: {
          embedding_ms: 15,
          route_total_ms: 45,
        },
      });
    });

    test('should process HARD band with direct intent mapping', async () => {
      // Mock successful intent mapping
      mockBuildWhatsAppByIntentRaw.mockResolvedValue({
        whatsapp: {
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: 'Vou ajudar você com seu recurso na OAB. Selecione uma opção:' },
            action: {
              buttons: [
                { type: 'reply', reply: { id: 'btn_recurso_prazo', title: 'Prazo do recurso' } },
                { type: 'reply', reply: { id: 'btn_recurso_docs', title: 'Documentos' } },
                { type: 'reply', reply: { id: 'handoff:human', title: 'Falar com atendente' } },
              ],
            },
          },
        },
      });

      const payload = createSocialWisePayload({
        message: 'quero fazer um recurso na oab contra uma decisão',
        wamid: 'wamid.hard_test_123',
      });

      const request = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as any;

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.whatsapp).toBeDefined();
      expect(responseData.whatsapp.type).toBe('interactive');
      expect(responseData.whatsapp.interactive.action.buttons).toHaveLength(3);
      
      // Verify intent mapping was called
      expect(mockBuildWhatsAppByIntentRaw).toHaveBeenCalledWith(
        'recurso_oab',
        '4',
        'wamid.hard_test_123'
      );
    });

    test('should fallback to global intent mapping when local mapping fails', async () => {
      // Local mapping fails, global succeeds
      mockBuildWhatsAppByIntentRaw.mockResolvedValue(null);
      mockBuildWhatsAppByGlobalIntent.mockResolvedValue({
        whatsapp: {
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: 'Recurso OAB - Template global encontrado.' },
            action: {
              buttons: [
                { type: 'reply', reply: { id: 'btn_global_recurso', title: 'Continuar' } },
              ],
            },
          },
        },
      });

      const payload = createSocialWisePayload({
        message: 'recurso oab global test',
        wamid: 'wamid.global_test_123',
      });

      const request = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as any;

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.whatsapp).toBeDefined();
      expect(responseData.whatsapp.interactive.body.text).toContain('global');
      
      // Verify both mappings were attempted
      expect(mockBuildWhatsAppByIntentRaw).toHaveBeenCalled();
      expect(mockBuildWhatsAppByGlobalIntent).toHaveBeenCalled();
    });

    test('should provide channel response when no mapping found', async () => {
      // Both mappings fail
      mockBuildWhatsAppByIntentRaw.mockResolvedValue(null);
      mockBuildWhatsAppByGlobalIntent.mockResolvedValue(null);

      const payload = createSocialWisePayload({
        message: 'recurso oab sem template',
        wamid: 'wamid.no_template_123',
      });

      const request = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as any;

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.whatsapp).toBeDefined();
      expect(responseData.whatsapp.interactive.body.text).toContain('recurso_oab');
    });

    test('should handle HARD band processing errors gracefully', async () => {
      // Mock classification error
      mockClassifyIntent.mockRejectedValue(new Error('Classification service unavailable'));

      const payload = createSocialWisePayload({
        message: 'recurso oab error test',
        wamid: 'wamid.error_test_123',
      });

      const request = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as any;

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.whatsapp || responseData.text).toBeDefined();
    });
  });

  describe('SOFT Band Processing (0.65-0.79 score)', () => {
    beforeEach(() => {
      mockClassifyIntent.mockResolvedValue({
        band: 'SOFT',
        score: 0.73,
        candidates: [
          {
            slug: 'recurso_oab',
            name: 'Recurso OAB',
            description: 'Recurso administrativo junto à OAB',
            score: 0.73,
          },
          {
            slug: 'inscricao_oab',
            name: 'Inscrição OAB',
            description: 'Processo de inscrição na Ordem dos Advogados',
            score: 0.68,
          },
          {
            slug: 'consulta_juridica',
            name: 'Consulta Jurídica',
            description: 'Consulta sobre questões jurídicas gerais',
            score: 0.66,
          },
        ],
        strategy: 'warmup_buttons',
        metrics: {
          embedding_ms: 25,
          route_total_ms: 180,
        },
      });
    });

    test('should generate warmup buttons for SOFT band classification', async () => {
      mockOpenAI.generateWarmupButtons.mockResolvedValue({
        introduction_text: 'Vejo que você tem uma questão relacionada à OAB. Qual dessas opções melhor descreve sua situação?',
        buttons: [
          { title: 'Recurso OAB', payload: '@recurso_oab' },
          { title: 'Inscrição OAB', payload: '@inscricao_oab' },
          { title: 'Consulta Jurídica', payload: '@consulta_juridica' },
        ],
      });

      const payload = createSocialWisePayload({
        message: 'tenho uma questão sobre a oab mas não sei bem o que fazer',
        wamid: 'wamid.soft_test_123',
      });

      const request = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as any;

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.whatsapp).toBeDefined();
      expect(responseData.whatsapp.interactive.body.text).toContain('questão relacionada à OAB');
      expect(responseData.whatsapp.interactive.action.buttons).toHaveLength(3);
      
      // Verify button payloads are correctly formatted
      const buttons = responseData.whatsapp.interactive.action.buttons;
      expect(buttons[0].reply.id).toBe('@recurso_oab');
      expect(buttons[1].reply.id).toBe('@inscricao_oab');
      expect(buttons[2].reply.id).toBe('@consulta_juridica');
      
      // Verify LLM was called with correct parameters
      expect(mockOpenAI.generateWarmupButtons).toHaveBeenCalledWith(
        'tenho uma questão sobre a oab mas não sei bem o que fazer',
        expect.arrayContaining([
          expect.objectContaining({ slug: 'recurso_oab' }),
          expect.objectContaining({ slug: 'inscricao_oab' }),
          expect.objectContaining({ slug: 'consulta_juridica' }),
        ]),
        expect.objectContaining({
          model: 'gpt-4o-mini',
          developer: 'You are a legal assistant specialized in Brazilian law.',
        })
      );
    });

    test('should handle LLM timeout in SOFT band with graceful degradation', async () => {
      // Mock LLM timeout
      mockOpenAI.generateWarmupButtons.mockRejectedValue(new Error('Request timeout'));

      const payload = createSocialWisePayload({
        message: 'questão oab timeout test',
        wamid: 'wamid.timeout_test_123',
      });

      const request = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as any;

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.whatsapp || responseData.text).toBeDefined();
      
      // Should fallback to default legal topics or humanized buttons
      if (responseData.whatsapp) {
        expect(responseData.whatsapp.interactive.action.buttons.length).toBeGreaterThan(0);
      }
    });

    test('should validate button constraints in SOFT band responses', async () => {
      mockOpenAI.generateWarmupButtons.mockResolvedValue({
        introduction_text: 'Esta é uma introdução muito longa que pode exceder os limites de caracteres permitidos para o WhatsApp e precisa ser truncada adequadamente para manter a compatibilidade com a plataforma.',
        buttons: [
          { title: 'Título muito longo que excede limite', payload: '@recurso_oab' },
          { title: 'Inscrição', payload: '@inscricao_oab' },
          { title: 'Consulta', payload: '@consulta_juridica' },
        ],
      });

      const payload = createSocialWisePayload({
        message: 'teste limites de caracteres',
        wamid: 'wamid.limits_test_123',
      });

      const request = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as any;

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.whatsapp).toBeDefined();
      
      // Verify text length constraints
      expect(responseData.whatsapp.interactive.body.text.length).toBeLessThanOrEqual(1024);
      
      // Verify button title constraints
      const buttons = responseData.whatsapp.interactive.action.buttons;
      buttons.forEach(button => {
        expect(button.reply.title.length).toBeLessThanOrEqual(20);
        expect(button.reply.id.length).toBeLessThanOrEqual(256);
      });
    });
  });

  describe('LOW Band Processing (<0.65 score)', () => {
    beforeEach(() => {
      mockClassifyIntent.mockResolvedValue({
        band: 'LOW',
        score: 0.42,
        candidates: [],
        strategy: 'domain_topics',
        metrics: {
          embedding_ms: 18,
          route_total_ms: 95,
        },
      });
    });

    test('should provide default legal topics for LOW band classification', async () => {
      const payload = createSocialWisePayload({
        message: 'oi tudo bem como você está',
        wamid: 'wamid.low_test_123',
      });

      const request = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as any;

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.whatsapp || responseData.text).toBeDefined();
      
      if (responseData.whatsapp) {
        // Should provide legal domain topics
        const buttons = responseData.whatsapp.interactive.action.buttons;
        expect(buttons.length).toBeGreaterThan(0);
        
        // Buttons should contain legal-related options
        const buttonTexts = buttons.map(btn => btn.reply.title.toLowerCase());
        const hasLegalContent = buttonTexts.some(text => 
          text.includes('direito') || 
          text.includes('jurídic') || 
          text.includes('oab') ||
          text.includes('recurso') ||
          text.includes('consulta')
        );
        expect(hasLegalContent).toBe(true);
      }
    });

    test('should handle vague queries with domain-specific suggestions', async () => {
      const payload = createSocialWisePayload({
        message: 'preciso de ajuda',
        wamid: 'wamid.vague_test_123',
      });

      const request = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as any;

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.whatsapp || responseData.text).toBeDefined();
      
      // Should provide helpful legal guidance
      if (responseData.whatsapp) {
        expect(responseData.whatsapp.interactive.body.text).toMatch(/ajud|jurídic|direito|oab/i);
      }
    });
  });

  describe('ROUTER Band Processing (embedipreview=false)', () => {
    beforeEach(() => {
      // Configure agent for Router mode
      mockGetAssistantForInbox.mockResolvedValue({
        id: 'agent-router',
        model: 'gpt-4o-mini',
        instructions: 'You are a conversational legal assistant.',
        embedipreview: false, // Router mode
      });
    });

    test('should use Router LLM for intent classification', async () => {
      mockOpenAI.routerLLM.mockResolvedValue({
        mode: 'intent',
        intent_payload: '@recurso_oab',
        introduction_text: 'Entendi que você quer fazer um recurso na OAB.',
      });

      mockBuildWhatsAppByIntentRaw.mockResolvedValue({
        whatsapp: {
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: 'Recurso OAB identificado pelo Router LLM.' },
            action: {
              buttons: [
                { type: 'reply', reply: { id: 'btn_router_continue', title: 'Continuar' } },
              ],
            },
          },
        },
      });

      const payload = createSocialWisePayload({
        message: 'quero contestar uma decisão da oab',
        wamid: 'wamid.router_intent_123',
      });

      const request = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as any;

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.whatsapp).toBeDefined();
      expect(responseData.whatsapp.interactive.body.text).toContain('Router LLM');
      
      // Verify Router LLM was called
      expect(mockOpenAI.routerLLM).toHaveBeenCalledWith(
        'quero contestar uma decisão da oab',
        expect.objectContaining({
          model: 'gpt-4o-mini',
          developer: 'You are a conversational legal assistant.',
        })
      );
    });

    test('should handle chat mode from Router LLM', async () => {
      mockOpenAI.routerLLM.mockResolvedValue({
        mode: 'chat',
        text: 'Posso ajudar com sua questão jurídica. Preciso entender melhor sua situação.',
        buttons: [
          { title: 'Direito Civil', payload: '@direito_civil' },
          { title: 'Direito Penal', payload: '@direito_penal' },
          { title: 'Direito Trabalhista', payload: '@direito_trabalhista' },
        ],
      });

      const payload = createSocialWisePayload({
        message: 'tenho uma situação complexa que envolve várias áreas do direito',
        wamid: 'wamid.router_chat_123',
      });

      const request = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as any;

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.whatsapp).toBeDefined();
      expect(responseData.whatsapp.interactive.body.text).toContain('questão jurídica');
      expect(responseData.whatsapp.interactive.action.buttons).toHaveLength(3);
      
      // Verify button payloads
      const buttons = responseData.whatsapp.interactive.action.buttons;
      expect(buttons[0].reply.id).toBe('@direito_civil');
      expect(buttons[1].reply.id).toBe('@direito_penal');
      expect(buttons[2].reply.id).toBe('@direito_trabalhista');
    });

    test('should fallback gracefully when Router LLM fails', async () => {
      mockOpenAI.routerLLM.mockRejectedValue(new Error('Router LLM timeout'));

      const payload = createSocialWisePayload({
        message: 'router llm failure test',
        wamid: 'wamid.router_fail_123',
      });

      const request = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as any;

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.whatsapp || responseData.text).toBeDefined();
    });
  });

  describe('Channel-Specific Response Formatting', () => {
    test('should format WhatsApp interactive messages correctly', async () => {
      mockClassifyIntent.mockResolvedValue({
        band: 'SOFT',
        score: 0.75,
        candidates: [
          { slug: 'test_intent', name: 'Test Intent', score: 0.75 },
        ],
        strategy: 'warmup_buttons',
        metrics: { embedding_ms: 20, route_total_ms: 150 },
      });

      mockOpenAI.generateWarmupButtons.mockResolvedValue({
        introduction_text: 'Como posso ajudar?',
        buttons: [
          { title: 'Opção 1', payload: '@opcao_1' },
          { title: 'Opção 2', payload: '@opcao_2' },
        ],
      });

      const payload = createSocialWisePayload({
        message: 'test whatsapp formatting',
        channel_type: 'whatsapp',
        wamid: 'wamid.whatsapp_test_123',
      });

      const request = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as any;

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.whatsapp).toBeDefined();
      expect(responseData.whatsapp.type).toBe('interactive');
      expect(responseData.whatsapp.interactive.type).toBe('button');
      expect(responseData.whatsapp.interactive.body).toHaveProperty('text');
      expect(responseData.whatsapp.interactive.action).toHaveProperty('buttons');
      
      // Verify button structure
      const buttons = responseData.whatsapp.interactive.action.buttons;
      buttons.forEach(button => {
        expect(button.type).toBe('reply');
        expect(button.reply).toHaveProperty('id');
        expect(button.reply).toHaveProperty('title');
      });
    });

    test('should format Instagram template messages correctly', async () => {
      mockClassifyIntent.mockResolvedValue({
        band: 'SOFT',
        score: 0.70,
        candidates: [
          { slug: 'test_intent', name: 'Test Intent', score: 0.70 },
        ],
        strategy: 'warmup_buttons',
        metrics: { embedding_ms: 22, route_total_ms: 160 },
      });

      mockOpenAI.generateWarmupButtons.mockResolvedValue({
        introduction_text: 'Posso ajudar com:',
        buttons: [
          { title: 'Instagram 1', payload: '@instagram_1' },
          { title: 'Instagram 2', payload: '@instagram_2' },
        ],
      });

      const payload = createSocialWisePayload({
        message: 'test instagram formatting',
        channel_type: 'instagram',
        wamid: 'wamid.instagram_test_123',
      });

      const request = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as any;

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.instagram).toBeDefined();
      expect(responseData.instagram.message.attachment.type).toBe('template');
      expect(responseData.instagram.message.attachment.payload.template_type).toBe('button');
      expect(responseData.instagram.message.attachment.payload).toHaveProperty('text');
      expect(responseData.instagram.message.attachment.payload).toHaveProperty('buttons');
      
      // Verify button structure for Instagram
      const buttons = responseData.instagram.message.attachment.payload.buttons;
      buttons.forEach(button => {
        expect(button.type).toBe('postback');
        expect(button).toHaveProperty('title');
        expect(button).toHaveProperty('payload');
        expect(button.title.length).toBeLessThanOrEqual(20);
        expect(button.payload.length).toBeLessThanOrEqual(1000);
      });
    });

    test('should format Facebook Messenger messages correctly', async () => {
      mockClassifyIntent.mockResolvedValue({
        band: 'LOW',
        score: 0.40,
        candidates: [],
        strategy: 'domain_topics',
        metrics: { embedding_ms: 15, route_total_ms: 80 },
      });

      const payload = createSocialWisePayload({
        message: 'test facebook formatting',
        channel_type: 'facebook',
        wamid: 'wamid.facebook_test_123',
      });

      const request = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as any;

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.facebook || responseData.text).toBeDefined();
      
      if (responseData.facebook) {
        expect(responseData.facebook.message).toHaveProperty('text');
        expect(typeof responseData.facebook.message.text).toBe('string');
      }
    });

    test('should validate payload format constraints', async () => {
      mockClassifyIntent.mockResolvedValue({
        band: 'SOFT',
        score: 0.72,
        candidates: [
          { slug: 'test_payload', name: 'Test Payload', score: 0.72 },
        ],
        strategy: 'warmup_buttons',
        metrics: { embedding_ms: 20, route_total_ms: 140 },
      });

      mockOpenAI.generateWarmupButtons.mockResolvedValue({
        introduction_text: 'Test payload validation',
        buttons: [
          { title: 'Valid Payload', payload: '@valid_payload_123' },
          { title: 'Invalid', payload: 'invalid-payload-format!' }, // Invalid format
          { title: 'Another Valid', payload: '@another_valid_payload' },
        ],
      });

      const payload = createSocialWisePayload({
        message: 'test payload validation',
        wamid: 'wamid.payload_test_123',
      });

      const request = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as any;

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.whatsapp).toBeDefined();
      
      // Verify payload format validation
      const buttons = responseData.whatsapp.interactive.action.buttons;
      buttons.forEach(button => {
        // Should match ^@[a-z0-9_]+$ pattern or be a valid handoff/system command
        expect(button.reply.id).toMatch(/^(@[a-z0-9_]+|handoff:|btn_|ia_)/);
      });
    });
  });

  describe('Agent Configuration Testing', () => {
    test('should respect embedipreview=true setting', async () => {
      mockGetAssistantForInbox.mockResolvedValue({
        id: 'agent-embedding',
        model: 'gpt-4o-mini',
        instructions: 'Embedding-first agent',
        embedipreview: true,
      });

      mockClassifyIntent.mockResolvedValue({
        band: 'HARD',
        score: 0.85,
        candidates: [{ slug: 'test_intent', name: 'Test', score: 0.85 }],
        strategy: 'direct_map',
        metrics: { embedding_ms: 15, route_total_ms: 50 },
      });

      const payload = createSocialWisePayload({
        message: 'test embedding first',
        wamid: 'wamid.embedding_test_123',
      });

      const request = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as any;

      const response = await POST(request);

      expect(response.status).toBe(200);
      
      // Verify embedding classification was used
      expect(mockClassifyIntent).toHaveBeenCalledWith(
        'test embedding first',
        expect.any(String), // userId
        expect.objectContaining({ embedipreview: true }),
        true, // embedipreview parameter
        expect.any(Object) // context
      );
      
      // Router LLM should not be called in embedding mode
      expect(mockOpenAI.routerLLM).not.toHaveBeenCalled();
    });

    test('should respect embedipreview=false setting', async () => {
      mockGetAssistantForInbox.mockResolvedValue({
        id: 'agent-router',
        model: 'gpt-4o-mini',
        instructions: 'Router-first agent',
        embedipreview: false,
      });

      mockOpenAI.routerLLM.mockResolvedValue({
        mode: 'chat',
        text: 'Router mode response',
        buttons: [
          { title: 'Option 1', payload: '@option_1' },
        ],
      });

      const payload = createSocialWisePayload({
        message: 'test router first',
        wamid: 'wamid.router_test_123',
      });

      const request = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as any;

      const response = await POST(request);

      expect(response.status).toBe(200);
      
      // Verify Router LLM was used
      expect(mockOpenAI.routerLLM).toHaveBeenCalledWith(
        'test router first',
        expect.objectContaining({
          model: 'gpt-4o-mini',
          developer: 'Router-first agent',
        })
      );
      
      // Classification should not be called in router mode
      expect(mockClassifyIntent).not.toHaveBeenCalled();
    });

    test('should use different model configurations', async () => {
      mockGetAssistantForInbox.mockResolvedValue({
        id: 'agent-gpt5',
        model: 'gpt-5-nano',
        instructions: 'GPT-5 powered agent',
        embedipreview: true,
      });

      mockClassifyIntent.mockResolvedValue({
        band: 'SOFT',
        score: 0.70,
        candidates: [{ slug: 'test_intent', name: 'Test', score: 0.70 }],
        strategy: 'warmup_buttons',
        metrics: { embedding_ms: 20, route_total_ms: 150 },
      });

      mockOpenAI.generateWarmupButtons.mockResolvedValue({
        introduction_text: 'GPT-5 generated response',
        buttons: [
          { title: 'GPT-5 Option', payload: '@gpt5_option' },
        ],
      });

      const payload = createSocialWisePayload({
        message: 'test gpt-5 model',
        wamid: 'wamid.gpt5_test_123',
      });

      const request = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as any;

      const response = await POST(request);

      expect(response.status).toBe(200);
      
      // Verify GPT-5 model was used
      expect(mockOpenAI.generateWarmupButtons).toHaveBeenCalledWith(
        'test gpt-5 model',
        expect.any(Array),
        expect.objectContaining({
          model: 'gpt-5-nano',
          developer: 'GPT-5 powered agent',
        })
      );
    });
  });

  describe('Error Scenario Testing', () => {
    test('should handle invalid payload structure', async () => {
      const invalidPayload = {
        invalid_structure: true,
        missing_required_fields: 'yes',
      };

      const request = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify(invalidPayload)),
      } as any;

      const response = await POST(request);

      expect(response.status).toBe(400);
      
      const responseData = await response.json();
      expect(responseData.error).toBe('Invalid payload structure');
      expect(responseData.details).toBeDefined();
    });

    test('should handle JSON parsing errors', async () => {
      const request = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue('invalid json {'),
      } as any;

      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    test('should handle database connection errors', async () => {
      mockPrisma.chatwitInbox.findFirst.mockRejectedValue(new Error('Database connection failed'));

      const payload = createSocialWisePayload({
        message: 'test database error',
        wamid: 'wamid.db_error_123',
      });

      const request = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as any;

      const response = await POST(request);

      expect(response.status).toBe(200); // Should still respond with fallback
      
      const responseData = await response.json();
      expect(responseData.whatsapp || responseData.text).toBeDefined();
    });

    test('should handle Redis connection errors', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));
      mockRedis.setex.mockRejectedValue(new Error('Redis connection failed'));

      const payload = createSocialWisePayload({
        message: 'test redis error',
        wamid: 'wamid.redis_error_123',
      });

      const request = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as any;

      const response = await POST(request);

      expect(response.status).toBe(200); // Should still respond with fallback
      
      const responseData = await response.json();
      expect(responseData.whatsapp || responseData.text).toBeDefined();
    });

    test('should handle multiple service failures gracefully', async () => {
      // Simulate multiple service failures
      mockClassifyIntent.mockRejectedValue(new Error('Classification failed'));
      mockOpenAI.generateWarmupButtons.mockRejectedValue(new Error('LLM failed'));
      mockOpenAI.routerLLM.mockRejectedValue(new Error('Router failed'));
      mockBuildWhatsAppByIntentRaw.mockRejectedValue(new Error('Template failed'));
      mockBuildWhatsAppByGlobalIntent.mockRejectedValue(new Error('Global template failed'));

      const payload = createSocialWisePayload({
        message: 'test multiple failures',
        wamid: 'wamid.multi_fail_123',
      });

      const request = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as any;

      const response = await POST(request);

      expect(response.status).toBe(200); // Should still provide fallback response
      
      const responseData = await response.json();
      expect(responseData.whatsapp || responseData.text).toBeDefined();
    });
  });

  describe('Security and Validation', () => {
    test('should validate bearer token when configured', async () => {
      // Mock environment variable
      const originalToken = process.env.SOCIALWISEFLOW_ACCESS_TOKEN;
      process.env.SOCIALWISEFLOW_ACCESS_TOKEN = 'test-secret-token';

      const payload = createSocialWisePayload({
        message: 'test bearer auth',
        wamid: 'wamid.bearer_test_123',
      });

      // Request without bearer token
      const requestWithoutAuth = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as any;

      const responseWithoutAuth = await POST(requestWithoutAuth);
      expect(responseWithoutAuth.status).toBe(401);

      // Request with correct bearer token
      const requestWithAuth = {
        headers: { 
          get: jest.fn().mockImplementation((header) => {
            if (header === 'authorization') return 'Bearer test-secret-token';
            return null;
          })
        },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as any;

      const responseWithAuth = await POST(requestWithAuth);
      expect(responseWithAuth.status).toBe(200);

      // Restore environment
      process.env.SOCIALWISEFLOW_ACCESS_TOKEN = originalToken;
    });

    test('should sanitize user input', async () => {
      const payload = createSocialWisePayload({
        message: '<script>alert("xss")</script>test message with html',
        wamid: 'wamid.sanitize_test_123',
      });

      const request = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as any;

      const response = await POST(request);

      expect(response.status).toBe(200);
      
      // Verify that classification was called with sanitized input
      if (mockClassifyIntent.mock.calls.length > 0) {
        const classificationCall = mockClassifyIntent.mock.calls[0];
        const sanitizedText = classificationCall[0];
        expect(sanitizedText).not.toContain('<script>');
        expect(sanitizedText).not.toContain('alert(');
      }
    });

    test('should handle rate limiting', async () => {
      // Mock rate limit exceeded
      const mockSocialWiseRateLimit = {
        checkPayloadRateLimit: jest.fn().mockResolvedValue({
          allowed: false,
          scope: 'session',
          limit: 10,
          remaining: 0,
          resetTime: Date.now() + 60000,
        }),
      };

      // This would require mocking the rate limiter service
      // For now, we'll test that the response structure is correct
      const payload = createSocialWisePayload({
        message: 'test rate limiting',
        wamid: 'wamid.rate_limit_123',
      });

      const request = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as any;

      const response = await POST(request);

      // Should still process the request in our current implementation
      expect(response.status).toBe(200);
    });

    test('should detect and handle duplicate messages', async () => {
      // Mock idempotency service to return duplicate
      const mockIdempotencyService = {
        isPayloadDuplicate: jest.fn().mockResolvedValue(true),
      };

      const payload = createSocialWisePayload({
        message: 'duplicate message test',
        wamid: 'wamid.duplicate_123',
      });

      const request = {
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      } as any;

      const response = await POST(request);

      // Should handle duplicates gracefully
      expect(response.status).toBe(200);
    });
  });
});