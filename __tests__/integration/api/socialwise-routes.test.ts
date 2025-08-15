import { jest } from '@jest/globals';
import { NextRequest } from 'next/server';

// Mock auth
jest.mock('@/auth', () => ({
  auth: jest.fn().mockResolvedValue({
    user: { id: 'test-user-id' }
  })
}));

// Mock OpenAI service
jest.mock('@/services/openai', () => ({
  openaiService: {
    generateShortTitlesBatch: jest.fn(),
    generateWarmupButtons: jest.fn(),
    routerLLM: jest.fn(),
  }
}));

import { POST as shortTitlesPost } from '@/app/api/chatwitia/socialwise/short-titles/route';
import { POST as warmupButtonsPost } from '@/app/api/chatwitia/socialwise/warmup-buttons/route';
import { POST as routerPost } from '@/app/api/chatwitia/socialwise/router/route';
import { openaiService } from '@/services/openai';

const mockOpenaiService = openaiService as jest.Mocked<typeof openaiService>;

describe('SocialWise API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('/api/chatwitia/socialwise/short-titles', () => {
    it('should generate short titles successfully', async () => {
      const mockTitles = ['Título 1', 'Título 2'];
      mockOpenaiService.generateShortTitlesBatch.mockResolvedValue(mockTitles);

      const request = new NextRequest('http://localhost:3000/api/chatwitia/socialwise/short-titles', {
        method: 'POST',
        body: JSON.stringify({
          intents: [
            { slug: 'test_intent', desc: 'Test intent description' }
          ],
          agent: { model: 'gpt-4o' }
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await shortTitlesPost(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.titles).toEqual(mockTitles);
      expect(mockOpenaiService.generateShortTitlesBatch).toHaveBeenCalledWith(
        [{ slug: 'test_intent', desc: 'Test intent description' }],
        { model: 'gpt-4o' }
      );
    });

    it('should return 400 for invalid parameters', async () => {
      const request = new NextRequest('http://localhost:3000/api/chatwitia/socialwise/short-titles', {
        method: 'POST',
        body: JSON.stringify({
          intents: 'invalid', // Should be array
          agent: { model: 'gpt-4o' }
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await shortTitlesPost(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Parâmetros inválidos');
    });
  });

  describe('/api/chatwitia/socialwise/warmup-buttons', () => {
    it('should generate warmup buttons successfully', async () => {
      const mockResponse = {
        introduction_text: 'Como posso ajudar?',
        buttons: [
          { title: 'Opção 1', payload: '@option1' },
          { title: 'Opção 2', payload: '@option2' }
        ]
      };
      mockOpenaiService.generateWarmupButtons.mockResolvedValue(mockResponse);

      const request = new NextRequest('http://localhost:3000/api/chatwitia/socialwise/warmup-buttons', {
        method: 'POST',
        body: JSON.stringify({
          userText: 'Preciso de ajuda jurídica',
          candidates: [
            { slug: 'legal_help', desc: 'Ajuda jurídica geral' }
          ],
          agent: { model: 'gpt-4o' }
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await warmupButtonsPost(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockResponse);
      expect(mockOpenaiService.generateWarmupButtons).toHaveBeenCalledWith(
        'Preciso de ajuda jurídica',
        [{ slug: 'legal_help', desc: 'Ajuda jurídica geral' }],
        { model: 'gpt-4o' }
      );
    });

    it('should return 400 for missing parameters', async () => {
      const request = new NextRequest('http://localhost:3000/api/chatwitia/socialwise/warmup-buttons', {
        method: 'POST',
        body: JSON.stringify({
          userText: 'test',
          // Missing candidates and agent
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await warmupButtonsPost(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Parâmetros inválidos');
    });
  });

  describe('/api/chatwitia/socialwise/router', () => {
    it('should route to intent mode successfully', async () => {
      const mockResponse = {
        mode: 'intent' as const,
        intent_payload: '@legal_consultation',
        introduction_text: 'Vou ajudar com sua consulta jurídica'
      };
      mockOpenaiService.routerLLM.mockResolvedValue(mockResponse);

      const request = new NextRequest('http://localhost:3000/api/chatwitia/socialwise/router', {
        method: 'POST',
        body: JSON.stringify({
          userText: 'Preciso de uma consulta jurídica',
          agent: { model: 'gpt-4o' }
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await routerPost(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockResponse);
      expect(mockOpenaiService.routerLLM).toHaveBeenCalledWith(
        'Preciso de uma consulta jurídica',
        { model: 'gpt-4o' }
      );
    });

    it('should route to chat mode successfully', async () => {
      const mockResponse = {
        mode: 'chat' as const,
        text: 'Olá! Como posso ajudar você hoje?'
      };
      mockOpenaiService.routerLLM.mockResolvedValue(mockResponse);

      const request = new NextRequest('http://localhost:3000/api/chatwitia/socialwise/router', {
        method: 'POST',
        body: JSON.stringify({
          userText: 'Oi',
          agent: { model: 'gpt-4o' }
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await routerPost(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockResponse);
    });

    it('should return 400 for missing userText', async () => {
      const request = new NextRequest('http://localhost:3000/api/chatwitia/socialwise/router', {
        method: 'POST',
        body: JSON.stringify({
          agent: { model: 'gpt-4o' }
          // Missing userText
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await routerPost(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Parâmetros inválidos');
    });
  });

  describe('Authentication', () => {
    it('should return 401 for unauthenticated requests', async () => {
      // Mock auth to return null
      const { auth } = await import('@/auth');
      (auth as jest.MockedFunction<typeof auth>).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/chatwitia/socialwise/short-titles', {
        method: 'POST',
        body: JSON.stringify({
          intents: [],
          agent: { model: 'gpt-4o' }
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await shortTitlesPost(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Usuário não autenticado.');
    });
  });
});