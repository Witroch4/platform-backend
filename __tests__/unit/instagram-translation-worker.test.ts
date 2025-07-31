/**
 * Unit tests for Instagram Translation Worker
 * Tests the worker's ability to convert WhatsApp templates to Instagram format
 */

import { processInstagramTranslationTask } from '@/worker/WebhookWorkerTasks/instagram-translation.task';
import { findCompleteMessageMappingByIntent } from '@/lib/dialogflow-database-queries';

// Mock dependencies
jest.mock('@/lib/dialogflow-database-queries');
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

const mockFindCompleteMessageMappingByIntent = findCompleteMessageMappingByIntent as jest.MockedFunction<
  typeof findCompleteMessageMappingByIntent
>;

describe('Instagram Translation Worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processInstagramTranslationTask', () => {
    const mockJobData = {
      intentName: 'test-intent',
      inboxId: '123',
      contactPhone: '+1234567890',
      conversationId: 'conv-123',
      originalPayload: {},
      correlationId: 'test-correlation-id',
    };

    const mockJob = {
      data: mockJobData,
    } as any;

    it('should successfully convert interactive message to Generic Template (≤80 chars)', async () => {
      const mockInteractiveMessage = {
        texto: 'Short message', // 13 characters - should use Generic Template
        rodape: 'Footer text',
        headerTipo: 'image',
        headerConteudo: 'https://example.com/image.jpg',
        botoes: [
          { id: 'btn_1', titulo: 'Click Me', tipo: 'postback' },
          { id: 'btn_2', titulo: 'Visit Site', tipo: 'web_url', url: 'https://example.com' },
        ],
      };

      mockFindCompleteMessageMappingByIntent.mockResolvedValue({
        messageType: 'interactive',
        interactiveMessage: mockInteractiveMessage,
      } as any);

      const result = await processInstagramTranslationTask(mockJob);

      expect(result.success).toBe(true);
      expect(result.fulfillmentMessages).toHaveLength(1);
      
      const fulfillmentMessage = result.fulfillmentMessages![0];
      expect(fulfillmentMessage).toHaveProperty('custom_payload');
      expect(fulfillmentMessage.custom_payload).toHaveProperty('instagram');
      
      const instagramPayload = fulfillmentMessage.custom_payload.instagram;
      expect(instagramPayload.template_type).toBe('generic');
      expect(instagramPayload.elements).toHaveLength(1);
      expect(instagramPayload.elements[0].title).toBe('Short message');
      expect(instagramPayload.elements[0].subtitle).toBe('Footer text');
      expect(instagramPayload.elements[0].image_url).toBe('https://example.com/image.jpg');
      expect(instagramPayload.elements[0].buttons).toHaveLength(2);
    });

    it('should successfully convert interactive message to Button Template (81-640 chars)', async () => {
      const longMessage = 'A'.repeat(100); // 100 characters - should use Button Template
      
      const mockInteractiveMessage = {
        texto: longMessage,
        rodape: 'Footer text',
        botoes: [
          { id: 'btn_1', titulo: 'Click Me', tipo: 'postback' },
        ],
      };

      mockFindCompleteMessageMappingByIntent.mockResolvedValue({
        messageType: 'interactive',
        interactiveMessage: mockInteractiveMessage,
      } as any);

      const result = await processInstagramTranslationTask(mockJob);

      expect(result.success).toBe(true);
      expect(result.fulfillmentMessages).toHaveLength(1);
      
      const fulfillmentMessage = result.fulfillmentMessages![0];
      const instagramPayload = fulfillmentMessage.custom_payload.instagram;
      expect(instagramPayload.template_type).toBe('button');
      expect(instagramPayload.text).toBe(longMessage);
      expect(instagramPayload.buttons).toHaveLength(1);
    });

    it('should successfully convert enhanced interactive message to Generic Template', async () => {
      const mockEnhancedMessage = {
        bodyText: 'Enhanced short message', // ≤80 characters
        footerText: 'Enhanced footer',
        headerType: 'image',
        headerContent: 'https://example.com/enhanced.jpg',
        type: 'button',
        actionData: {
          buttons: [
            { id: 'enh_btn_1', title: 'Enhanced Button', type: 'postback' },
            { id: 'enh_btn_2', title: 'Enhanced URL', type: 'url', url: 'https://enhanced.com' },
          ],
        },
      };

      mockFindCompleteMessageMappingByIntent.mockResolvedValue({
        messageType: 'enhanced_interactive',
        enhancedInteractiveMessage: mockEnhancedMessage,
      } as any);

      const result = await processInstagramTranslationTask(mockJob);

      expect(result.success).toBe(true);
      expect(result.fulfillmentMessages).toHaveLength(1);
      
      const fulfillmentMessage = result.fulfillmentMessages![0];
      const instagramPayload = fulfillmentMessage.custom_payload.instagram;
      expect(instagramPayload.template_type).toBe('generic');
      expect(instagramPayload.elements[0].title).toBe('Enhanced short message');
      expect(instagramPayload.elements[0].subtitle).toBe('Enhanced footer');
      expect(instagramPayload.elements[0].image_url).toBe('https://example.com/enhanced.jpg');
      expect(instagramPayload.elements[0].buttons).toHaveLength(2);
      expect(instagramPayload.elements[0].buttons[1].type).toBe('web_url');
    });

    it('should successfully convert enhanced interactive message to Button Template', async () => {
      const longMessage = 'A'.repeat(200); // >80 characters - should use Button Template
      
      const mockEnhancedMessage = {
        bodyText: longMessage,
        footerText: 'Enhanced footer',
        type: 'button',
        actionData: {
          buttons: [
            { id: 'enh_btn_1', title: 'Enhanced Button', type: 'postback' },
          ],
        },
      };

      mockFindCompleteMessageMappingByIntent.mockResolvedValue({
        messageType: 'enhanced_interactive',
        enhancedInteractiveMessage: mockEnhancedMessage,
      } as any);

      const result = await processInstagramTranslationTask(mockJob);

      expect(result.success).toBe(true);
      expect(result.fulfillmentMessages).toHaveLength(1);
      
      const fulfillmentMessage = result.fulfillmentMessages![0];
      const instagramPayload = fulfillmentMessage.custom_payload.instagram;
      expect(instagramPayload.template_type).toBe('button');
      expect(instagramPayload.text).toBe(longMessage);
      expect(instagramPayload.buttons).toHaveLength(1);
    });

    it('should return error for message too long for Instagram (>640 chars)', async () => {
      const tooLongMessage = 'A'.repeat(700); // >640 characters - incompatible
      
      const mockInteractiveMessage = {
        texto: tooLongMessage,
        botoes: [],
      };

      mockFindCompleteMessageMappingByIntent.mockResolvedValue({
        messageType: 'interactive',
        interactiveMessage: mockInteractiveMessage,
      } as any);

      const result = await processInstagramTranslationTask(mockJob);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Message body too long for Instagram');
      expect(result.error).toContain('700 chars, max 640');
    });

    it('should return error when no message mapping found', async () => {
      mockFindCompleteMessageMappingByIntent.mockResolvedValue(null);

      const result = await processInstagramTranslationTask(mockJob);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No message mapping found for intent: test-intent');
    });

    it('should return error for unsupported message type (template)', async () => {
      mockFindCompleteMessageMappingByIntent.mockResolvedValue({
        messageType: 'template',
        template: { name: 'test-template' },
      } as any);

      const result = await processInstagramTranslationTask(mockJob);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Template messages are not supported for Instagram conversion');
    });

    it('should return error for unknown message type', async () => {
      mockFindCompleteMessageMappingByIntent.mockResolvedValue({
        messageType: 'unknown_type',
      } as any);

      const result = await processInstagramTranslationTask(mockJob);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unsupported message type for Instagram: unknown_type');
    });

    it('should handle database errors gracefully', async () => {
      mockFindCompleteMessageMappingByIntent.mockRejectedValue(new Error('Database connection failed'));

      const result = await processInstagramTranslationTask(mockJob);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection failed');
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('should return fallback message when validation fails', async () => {
      // Create a message that will generate invalid Instagram payload
      const mockInteractiveMessage = {
        texto: '', // Empty text should cause validation to fail
        botoes: [],
      };

      mockFindCompleteMessageMappingByIntent.mockResolvedValue({
        messageType: 'interactive',
        interactiveMessage: mockInteractiveMessage,
      } as any);

      const result = await processInstagramTranslationTask(mockJob);

      expect(result.success).toBe(true); // Should succeed with fallback
      expect(result.fulfillmentMessages).toHaveLength(1);
      
      const fulfillmentMessage = result.fulfillmentMessages![0];
      const instagramPayload = fulfillmentMessage.custom_payload.instagram;
      expect(instagramPayload.template_type).toBe('button');
      expect(instagramPayload.text).toBe('Mensagem não compatível com Instagram');
    });

    it('should limit buttons to 3 for Instagram compatibility', async () => {
      const mockInteractiveMessage = {
        texto: 'Message with many buttons',
        botoes: [
          { id: 'btn_1', titulo: 'Button 1', tipo: 'postback' },
          { id: 'btn_2', titulo: 'Button 2', tipo: 'postback' },
          { id: 'btn_3', titulo: 'Button 3', tipo: 'postback' },
          { id: 'btn_4', titulo: 'Button 4', tipo: 'postback' },
          { id: 'btn_5', titulo: 'Button 5', tipo: 'postback' },
        ],
      };

      mockFindCompleteMessageMappingByIntent.mockResolvedValue({
        messageType: 'interactive',
        interactiveMessage: mockInteractiveMessage,
      } as any);

      const result = await processInstagramTranslationTask(mockJob);

      expect(result.success).toBe(true);
      
      const fulfillmentMessage = result.fulfillmentMessages![0];
      const instagramPayload = fulfillmentMessage.custom_payload.instagram;
      expect(instagramPayload.elements[0].buttons).toHaveLength(3);
      expect(instagramPayload.elements[0].buttons[0].title).toBe('Button 1');
      expect(instagramPayload.elements[0].buttons[2].title).toBe('Button 3');
    });

    it('should include processing time in result', async () => {
      const mockInteractiveMessage = {
        texto: 'Test message',
        botoes: [],
      };

      mockFindCompleteMessageMappingByIntent.mockResolvedValue({
        messageType: 'interactive',
        interactiveMessage: mockInteractiveMessage,
      } as any);

      const result = await processInstagramTranslationTask(mockJob);

      expect(result.success).toBe(true);
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
      expect(typeof result.processingTime).toBe('number');
    });
  });
});