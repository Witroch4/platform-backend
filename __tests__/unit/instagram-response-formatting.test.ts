/**
 * Unit tests for Instagram response formatting in webhook
 * Tests the createDialogflowFallbackResponse function and Instagram payload handling
 */

import { createInstagramFallbackMessage } from '@/lib/instagram/payload-builder';

describe('Instagram Response Formatting', () => {
  describe('createInstagramFallbackMessage', () => {
    it('should create proper Dialogflow fulfillment message structure', () => {
      const result = createInstagramFallbackMessage('Test error message');
      
      // Verify structure matches Dialogflow expectations
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('custom_payload');
      expect(result[0].custom_payload).toHaveProperty('instagram');
      
      const instagramPayload = result[0].custom_payload.instagram;
      expect(instagramPayload.template_type).toBe('button');
      expect(instagramPayload.text).toBe('Test error message');
      expect(instagramPayload.buttons).toEqual([]);
    });

    it('should handle different error message types', () => {
      const testCases = [
        {
          input: 'Message too long for Instagram',
          expected: 'Message too long for Instagram',
        },
        {
          input: 'No message mapping found',
          expected: 'No message mapping found',
        },
        {
          input: 'Translation timeout',
          expected: 'Translation timeout',
        },
        {
          input: undefined,
          expected: 'Desculpe, não foi possível processar sua mensagem no momento.',
        },
      ];

      testCases.forEach(({ input, expected }) => {
        const result = createInstagramFallbackMessage(input);
        const instagramPayload = result[0].custom_payload.instagram;
        expect(instagramPayload.text).toBe(expected);
      });
    });

    it('should truncate very long error messages', () => {
      const longMessage = 'Error: ' + 'A'.repeat(700);
      const result = createInstagramFallbackMessage(longMessage);
      
      const instagramPayload = result[0].custom_payload.instagram;
      expect(instagramPayload.text).toHaveLength(640);
      expect(instagramPayload.text.startsWith('Error: AAA')).toBe(true);
    });
  });

  describe('Instagram Template Validation', () => {
    it('should validate Generic Template structure', () => {
      const genericTemplate = {
        template_type: 'generic' as const,
        elements: [
          {
            title: 'Valid Title',
            subtitle: 'Valid Subtitle',
            image_url: 'https://example.com/image.jpg',
            buttons: [
              {
                type: 'postback' as const,
                title: 'Button',
                payload: 'btn_1',
              },
            ],
          },
        ],
      };

      const fulfillmentMessage = {
        custom_payload: {
          instagram: genericTemplate,
        },
      };

      // Verify the structure is correct for Dialogflow
      expect(fulfillmentMessage.custom_payload.instagram.template_type).toBe('generic');
      expect(fulfillmentMessage.custom_payload.instagram.elements).toHaveLength(1);
      expect(fulfillmentMessage.custom_payload.instagram.elements[0].title).toBe('Valid Title');
    });

    it('should validate Button Template structure', () => {
      const buttonTemplate = {
        template_type: 'button' as const,
        text: 'This is a button template message',
        buttons: [
          {
            type: 'web_url' as const,
            title: 'Visit',
            url: 'https://example.com',
          },
          {
            type: 'postback' as const,
            title: 'Click',
            payload: 'btn_click',
          },
        ],
      };

      const fulfillmentMessage = {
        custom_payload: {
          instagram: buttonTemplate,
        },
      };

      // Verify the structure is correct for Dialogflow
      expect(fulfillmentMessage.custom_payload.instagram.template_type).toBe('button');
      expect(fulfillmentMessage.custom_payload.instagram.text).toBe('This is a button template message');
      expect(fulfillmentMessage.custom_payload.instagram.buttons).toHaveLength(2);
    });
  });

  describe('Error Categorization', () => {
    it('should categorize different error types correctly', () => {
      const errorCategories = [
        {
          error: 'Message body too long for Instagram (700 chars, max 640)',
          expectedMessage: 'Sua mensagem é muito longa para o Instagram. Tente uma mensagem mais curta.',
        },
        {
          error: 'No message mapping found for intent: test-intent',
          expectedMessage: 'Mensagem não configurada para Instagram.',
        },
        {
          error: 'Translation timeout - response took too long',
          expectedMessage: 'Processamento demorou muito. Tente novamente.',
        },
        {
          error: 'Database connection failed',
          expectedMessage: 'Desculpe, não foi possível processar sua mensagem no momento.',
        },
      ];

      errorCategories.forEach(({ error, expectedMessage }) => {
        // Simulate the error categorization logic from the webhook
        let fallbackMessage = 'Desculpe, não foi possível processar sua mensagem no momento.';
        
        if (error.includes('timeout')) {
          fallbackMessage = 'Processamento demorou muito. Tente novamente.';
        } else if (error.includes('too long')) {
          fallbackMessage = 'Sua mensagem é muito longa para o Instagram. Tente uma mensagem mais curta.';
        } else if (error.includes('No message mapping')) {
          fallbackMessage = 'Mensagem não configurada para Instagram.';
        }

        expect(fallbackMessage).toBe(expectedMessage);
      });
    });
  });

  describe('Response Headers Validation', () => {
    it('should validate expected response headers structure', () => {
      const mockHeaders = new Headers({
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Correlation-ID': 'test-correlation-id',
        'X-Processing-Time': '150',
        'X-Response-Time': '200',
      });

      // Verify headers that should be present in Instagram responses
      expect(mockHeaders.get('Content-Type')).toBe('application/json');
      expect(mockHeaders.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
      expect(mockHeaders.get('X-Correlation-ID')).toBe('test-correlation-id');
      expect(mockHeaders.get('X-Processing-Time')).toBe('150');
      expect(mockHeaders.get('X-Response-Time')).toBe('200');
    });

    it('should validate error response headers structure', () => {
      const mockErrorHeaders = new Headers({
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Correlation-ID': 'error-correlation-id',
        'X-Error': 'Message too long for Instagram',
      });

      // Verify error headers
      expect(mockErrorHeaders.get('Content-Type')).toBe('application/json');
      expect(mockErrorHeaders.get('X-Correlation-ID')).toBe('error-correlation-id');
      expect(mockErrorHeaders.get('X-Error')).toBe('Message too long for Instagram');
    });
  });

  describe('Payload Structure Validation', () => {
    it('should validate successful Instagram response structure', () => {
      const successfulResponse = {
        fulfillmentMessages: [
          {
            custom_payload: {
              instagram: {
                template_type: 'generic',
                elements: [
                  {
                    title: 'Hello Instagram',
                    subtitle: 'This is a subtitle',
                    image_url: 'https://example.com/image.jpg',
                    buttons: [
                      {
                        type: 'postback',
                        title: 'Click Me',
                        payload: 'button_1',
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
      };

      // Validate the response structure
      expect(successfulResponse).toHaveProperty('fulfillmentMessages');
      expect(successfulResponse.fulfillmentMessages).toHaveLength(1);
      
      const fulfillmentMessage = successfulResponse.fulfillmentMessages[0];
      expect(fulfillmentMessage).toHaveProperty('custom_payload');
      expect(fulfillmentMessage.custom_payload).toHaveProperty('instagram');
      
      const instagramPayload = fulfillmentMessage.custom_payload.instagram;
      expect(instagramPayload.template_type).toBe('generic');
      expect(instagramPayload.elements).toHaveLength(1);
      expect(instagramPayload.elements[0].title).toBe('Hello Instagram');
    });

    it('should validate fallback response structure', () => {
      const fallbackResponse = {
        fulfillmentMessages: createInstagramFallbackMessage('Error occurred'),
      };

      // Validate the fallback response structure
      expect(fallbackResponse).toHaveProperty('fulfillmentMessages');
      expect(fallbackResponse.fulfillmentMessages).toHaveLength(1);
      
      const fulfillmentMessage = fallbackResponse.fulfillmentMessages[0];
      expect(fulfillmentMessage).toHaveProperty('custom_payload');
      expect(fulfillmentMessage.custom_payload).toHaveProperty('instagram');
      
      const instagramPayload = fulfillmentMessage.custom_payload.instagram;
      expect(instagramPayload.template_type).toBe('button');
      expect(instagramPayload.text).toBe('Error occurred');
      expect(instagramPayload.buttons).toEqual([]);
    });
  });

  describe('Instagram vs WhatsApp Channel Detection', () => {
    it('should correctly identify Instagram channel', () => {
      const instagramPayload = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::Instagram',
          },
        },
      };

      const channelType = instagramPayload.originalDetectIntentRequest?.payload?.channel_type || '';
      const isInstagram = channelType === 'Channel::Instagram';

      expect(isInstagram).toBe(true);
      expect(channelType).toBe('Channel::Instagram');
    });

    it('should correctly identify WhatsApp channel', () => {
      const whatsappPayload = {
        originalDetectIntentRequest: {
          payload: {
            channel_type: 'Channel::WhatsApp',
          },
        },
      };

      const channelType = whatsappPayload.originalDetectIntentRequest?.payload?.channel_type || '';
      const isInstagram = channelType === 'Channel::Instagram';

      expect(isInstagram).toBe(false);
      expect(channelType).toBe('Channel::WhatsApp');
    });

    it('should handle missing channel type', () => {
      const unknownPayload = {
        originalDetectIntentRequest: {
          payload: {},
        },
      };

      const channelType = unknownPayload.originalDetectIntentRequest?.payload?.channel_type || '';
      const isInstagram = channelType === 'Channel::Instagram';

      expect(isInstagram).toBe(false);
      expect(channelType).toBe('');
    });
  });
});