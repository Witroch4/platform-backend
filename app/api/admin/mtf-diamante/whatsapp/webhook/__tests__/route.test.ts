/**
 * Unit Tests for MTF Diamante Webhook Route
 * Tests webhook request parsing and correct task creation logic
 * Requirements: 1.1, 1.3, 3.1, 3.2
 */

import { NextRequest } from 'next/server';
import { POST } from '../route';

// Mock dependencies
jest.mock('@/lib/queue/mtf-diamante-webhook.queue', () => ({
  addStoreMessageTask: jest.fn(),
  addUpdateApiKeyTask: jest.fn(),
  addProcessIntentTask: jest.fn(),
  addSendMessageTask: jest.fn(),
  addSendReactionTask: jest.fn(),
  generateCorrelationId: jest.fn(() => 'test-correlation-id'),
  createTemplateMessageTask: jest.fn((data) => ({
    type: 'sendMessage',
    ...data,
    messageData: { type: 'template', ...data }
  })),
  createInteractiveMessageTask: jest.fn((data) => ({
    type: 'sendMessage',
    ...data,
    messageData: { type: 'interactive', ...data }
  })),
  createReactionTask: jest.fn((data) => ({
    type: 'sendReaction',
    ...data
  }))
}));

jest.mock('@/lib/webhook-utils', () => ({
  extractWebhookData: jest.fn(),
  validateWebhookData: jest.fn(),
  hasValidApiKey: jest.fn(),
  logWebhookData: jest.fn()
}));

jest.mock('@/lib/dialogflow-database-queries', () => ({
  findCompleteMessageMappingByIntent: jest.fn(),
  findReactionByButtonId: jest.fn()
}));

// Import mocked modules
import {
  addStoreMessageTask,
  addUpdateApiKeyTask,
  addProcessIntentTask,
  addSendMessageTask,
  addSendReactionTask,
  generateCorrelationId,
  createTemplateMessageTask,
  createInteractiveMessageTask,
  createReactionTask
} from '@/lib/queue/mtf-diamante-webhook.queue';

import {
  extractWebhookData,
  validateWebhookData,
  hasValidApiKey,
  logWebhookData
} from '@/lib/webhook-utils';

import {
  findCompleteMessageMappingByIntent,
  findReactionByButtonId
} from '@/lib/dialogflow-database-queries';

describe('MTF Diamante Webhook Route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock implementations
    (extractWebhookData as jest.Mock).mockReturnValue({
      whatsappApiKey: 'test-api-key',
      messageId: 'test-message-id',
      conversationId: 'test-conversation-id',
      contactPhone: '5511999999999',
      inboxId: 'test-inbox-id',
      intentName: 'test-intent'
    });
    
    (validateWebhookData as jest.Mock).mockReturnValue(true);
    (hasValidApiKey as jest.Mock).mockReturnValue(true);
    (logWebhookData as jest.Mock).mockImplementation(() => {});
  });

  describe('Request Parsing', () => {
    it('should parse intent request correctly', async () => {
      const intentPayload = {
        queryResult: {
          intent: { displayName: 'welcome' },
          parameters: { name: 'João' }
        },
        originalDetectIntentRequest: {
          payload: {
            sender: { id: '5511999999999' },
            whatsapp_api_key: 'test-api-key',
            inbox_id: 'test-inbox-id'
          }
        }
      };

      const request = new NextRequest('http://localhost/webhook', {
        method: 'POST',
        body: JSON.stringify(intentPayload)
      });

      (findCompleteMessageMappingByIntent as jest.Mock).mockResolvedValue({
        messageType: 'template',
        template: {
          templateId: 'test-template-id',
          name: 'test-template'
        },
        whatsappConfig: {
          whatsappToken: 'test-token'
        }
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.fulfillmentMessages).toBeDefined();
      expect(addSendMessageTask).toHaveBeenCalled();
    });

    it('should parse button click request correctly', async () => {
      const buttonClickPayload = {
        originalDetectIntentRequest: {
          payload: {
            interactive: {
              type: 'button_reply',
              button_reply: { id: 'accept_proposal' }
            },
            context: { id: 'wamid.123456' },
            sender: { id: '5511999999999' },
            whatsapp_api_key: 'test-api-key'
          }
        }
      };

      const request = new NextRequest('http://localhost/webhook', {
        method: 'POST',
        body: JSON.stringify(buttonClickPayload)
      });

      (findReactionByButtonId as jest.Mock).mockResolvedValue({
        buttonId: 'accept_proposal',
        emoji: '👍',
        isActive: true
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.fulfillmentMessages).toBeDefined();
      expect(addSendReactionTask).toHaveBeenCalled();
    });

    it('should handle malformed request gracefully', async () => {
      const malformedPayload = {
        invalid: 'data'
      };

      const request = new NextRequest('http://localhost/webhook', {
        method: 'POST',
        body: JSON.stringify(malformedPayload)
      });

      const response = await POST(request);
      const responseData = await response.json();

      // Should still return 200 OK to prevent Dialogflow retries
      expect(response.status).toBe(200);
      expect(responseData.fulfillmentMessages).toBeDefined();
    });
  });

  describe('Task Creation', () => {
    it('should create template message task with complete data', async () => {
      const intentPayload = {
        queryResult: {
          intent: { displayName: 'welcome' },
          parameters: { name: 'João', phone: '11999999999' }
        },
        originalDetectIntentRequest: {
          payload: {
            sender: { id: '5511999999999' },
            whatsapp_api_key: 'test-api-key',
            inbox_id: 'test-inbox-id'
          }
        }
      };

      const request = new NextRequest('http://localhost/webhook', {
        method: 'POST',
        body: JSON.stringify(intentPayload)
      });

      const mockMapping = {
        messageType: 'template',
        template: {
          templateId: 'test-template-id',
          name: 'welcome_template'
        },
        whatsappConfig: {
          whatsappToken: 'test-token'
        }
      };

      (findCompleteMessageMappingByIntent as jest.Mock).mockResolvedValue(mockMapping);

      await POST(request);

      expect(createTemplateMessageTask).toHaveBeenCalledWith({
        recipientPhone: '5511999999999',
        whatsappApiKey: 'test-token',
        templateId: 'test-template-id',
        templateName: 'welcome_template',
        variables: expect.objectContaining({
          name: 'João',
          nome: 'João',
          phone: '11999999999',
          telefone: '11999999999'
        }),
        correlationId: 'test-correlation-id',
        metadata: expect.objectContaining({
          intentName: 'welcome',
          originalPayload: intentPayload
        })
      });

      expect(addSendMessageTask).toHaveBeenCalled();
    });

    it('should create interactive message task with complete data', async () => {
      const intentPayload = {
        queryResult: {
          intent: { displayName: 'menu' }
        },
        originalDetectIntentRequest: {
          payload: {
            sender: { id: '5511999999999' },
            whatsapp_api_key: 'test-api-key',
            inbox_id: 'test-inbox-id'
          }
        }
      };

      const request = new NextRequest('http://localhost/webhook', {
        method: 'POST',
        body: JSON.stringify(intentPayload)
      });

      const mockMapping = {
        messageType: 'interactive',
        interactiveMessage: {
          texto: 'Escolha uma opção:',
          rodape: 'Powered by ChatWit',
          botoes: [
            { id: 'option1', titulo: 'Opção 1', ordem: 1 },
            { id: 'option2', titulo: 'Opção 2', ordem: 2 }
          ]
        },
        whatsappConfig: {
          whatsappToken: 'test-token'
        }
      };

      (findCompleteMessageMappingByIntent as jest.Mock).mockResolvedValue(mockMapping);

      await POST(request);

      expect(createInteractiveMessageTask).toHaveBeenCalledWith({
        recipientPhone: '5511999999999',
        whatsappApiKey: 'test-token',
        interactiveContent: {
          header: undefined,
          body: 'Escolha uma opção:',
          footer: 'Powered by ChatWit',
          buttons: [
            { id: 'option1', title: 'Opção 1', type: 'reply' },
            { id: 'option2', title: 'Opção 2', type: 'reply' }
          ]
        },
        correlationId: 'test-correlation-id',
        metadata: expect.objectContaining({
          intentName: 'menu',
          originalPayload: intentPayload
        })
      });

      expect(addSendMessageTask).toHaveBeenCalled();
    });

    it('should create reaction task with complete data', async () => {
      const buttonClickPayload = {
        originalDetectIntentRequest: {
          payload: {
            interactive: {
              type: 'button_reply',
              button_reply: { id: 'like_button' }
            },
            context: { id: 'wamid.123456789' },
            sender: { id: '5511999999999' },
            whatsapp_api_key: 'test-api-key'
          }
        }
      };

      const request = new NextRequest('http://localhost/webhook', {
        method: 'POST',
        body: JSON.stringify(buttonClickPayload)
      });

      const mockReaction = {
        buttonId: 'like_button',
        emoji: '❤️',
        isActive: true
      };

      (findReactionByButtonId as jest.Mock).mockResolvedValue(mockReaction);

      await POST(request);

      expect(createReactionTask).toHaveBeenCalledWith({
        recipientPhone: '5511999999999',
        messageId: 'wamid.123456789',
        emoji: '❤️',
        whatsappApiKey: 'test-api-key',
        correlationId: 'test-correlation-id',
        metadata: {
          buttonId: 'like_button',
          originalPayload: buttonClickPayload
        }
      });

      expect(addSendReactionTask).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle database query failures gracefully', async () => {
      const intentPayload = {
        queryResult: {
          intent: { displayName: 'welcome' }
        },
        originalDetectIntentRequest: {
          payload: {
            sender: { id: '5511999999999' },
            whatsapp_api_key: 'test-api-key'
          }
        }
      };

      const request = new NextRequest('http://localhost/webhook', {
        method: 'POST',
        body: JSON.stringify(intentPayload)
      });

      // Simulate database error
      (findCompleteMessageMappingByIntent as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await POST(request);
      const responseData = await response.json();

      // Should still return 200 OK to prevent Dialogflow retries
      expect(response.status).toBe(200);
      expect(responseData.fulfillmentMessages).toBeDefined();
    });

    it('should handle queue failures gracefully', async () => {
      const intentPayload = {
        queryResult: {
          intent: { displayName: 'welcome' }
        },
        originalDetectIntentRequest: {
          payload: {
            sender: { id: '5511999999999' },
            whatsapp_api_key: 'test-api-key'
          }
        }
      };

      const request = new NextRequest('http://localhost/webhook', {
        method: 'POST',
        body: JSON.stringify(intentPayload)
      });

      (findCompleteMessageMappingByIntent as jest.Mock).mockResolvedValue({
        messageType: 'template',
        template: { templateId: 'test', name: 'test' },
        whatsappConfig: { whatsappToken: 'test' }
      });

      // Simulate queue error
      (addSendMessageTask as jest.Mock).mockRejectedValue(
        new Error('Queue connection failed')
      );

      const response = await POST(request);
      const responseData = await response.json();

      // Should still return 200 OK to prevent Dialogflow retries
      expect(response.status).toBe(200);
      expect(responseData.fulfillmentMessages).toBeDefined();
    });

    it('should handle missing required data gracefully', async () => {
      const incompletePayload = {
        queryResult: {
          intent: { displayName: 'welcome' }
        }
        // Missing originalDetectIntentRequest
      };

      const request = new NextRequest('http://localhost/webhook', {
        method: 'POST',
        body: JSON.stringify(incompletePayload)
      });

      const response = await POST(request);
      const responseData = await response.json();

      // Should still return 200 OK
      expect(response.status).toBe(200);
      expect(responseData.fulfillmentMessages).toBeDefined();
    });
  });

  describe('Response Time Requirements', () => {
    it('should respond within 2 seconds', async () => {
      const intentPayload = {
        queryResult: {
          intent: { displayName: 'welcome' }
        },
        originalDetectIntentRequest: {
          payload: {
            sender: { id: '5511999999999' },
            whatsapp_api_key: 'test-api-key'
          }
        }
      };

      const request = new NextRequest('http://localhost/webhook', {
        method: 'POST',
        body: JSON.stringify(intentPayload)
      });

      (findCompleteMessageMappingByIntent as jest.Mock).mockResolvedValue(null);

      const startTime = Date.now();
      const response = await POST(request);
      const endTime = Date.now();

      const responseTime = endTime - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(2000); // Less than 2 seconds
    });
  });

  describe('Legacy Task Compatibility', () => {
    it('should queue legacy tasks for backward compatibility', async () => {
      const intentPayload = {
        queryResult: {
          intent: { displayName: 'welcome' }
        },
        originalDetectIntentRequest: {
          payload: {
            sender: { id: '5511999999999' },
            whatsapp_api_key: 'test-api-key',
            inbox_id: 'test-inbox-id',
            message_id: 'test-message-id',
            conversation_id: 'test-conversation-id'
          }
        }
      };

      const request = new NextRequest('http://localhost/webhook', {
        method: 'POST',
        body: JSON.stringify(intentPayload)
      });

      (findCompleteMessageMappingByIntent as jest.Mock).mockResolvedValue(null);

      await POST(request);

      // Verify legacy tasks are queued
      expect(addStoreMessageTask).toHaveBeenCalled();
      expect(addUpdateApiKeyTask).toHaveBeenCalled();
      expect(addProcessIntentTask).toHaveBeenCalled();
    });
  });
});