/**
 * Instagram Translation Worker Task Tests
 * 
 * Unit tests for the Instagram translation worker task
 */

import { Job } from 'bullmq';
import { processInstagramTranslationTask } from '../instagram-translation.task';
import { prisma } from '../../../lib/prisma';
import { messageConverter } from '../../../lib/instagram/message-converter';
import {
  storeJobResult,
  InstagramTranslationErrorCodes,
} from '../../../lib/queue/instagram-translation.queue';

// Mock dependencies
jest.mock('../../../lib/prisma', () => ({
  prisma: {
    mapeamentoIntencao: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('../../../lib/instagram/message-converter', () => ({
  messageConverter: {
    convert: jest.fn(),
  },
}));

jest.mock('../../../lib/queue/instagram-translation.queue', () => ({
  ...jest.requireActual('../../../lib/queue/instagram-translation.queue'),
  storeJobResult: jest.fn(),
}));

jest.mock('../../../lib/validation/instagram-translation-validation', () => ({
  validateChannelType: jest.fn(),
  validateForInstagramConversion: jest.fn(),
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockMessageConverter = messageConverter as jest.Mocked<typeof messageConverter>;
const mockStoreJobResult = storeJobResult as jest.MockedFunction<typeof storeJobResult>;

describe('Instagram Translation Worker Task', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
  });

  const createMockJob = (data: any): Job<any> => ({
    id: 'test-job-id',
    data,
  } as Job<any>);

  const mockJobData = {
    correlationId: 'ig-1234567890123-abc-def456789',
    intentName: 'test.intent',
    inboxId: 'inbox-123',
    contactPhone: '5511999999999',
    conversationId: 'conv-123',
    originalPayload: {
      originalDetectIntentRequest: {
        payload: {
          channel_type: 'Channel::Instagram',
        },
      },
    },
  };

  const mockTemplate = {
    id: 'template-123',
    interactiveContent: {
      header: {
        type: 'image',
        content: 'https://example.com/image.jpg',
      },
      body: {
        text: 'Hello World!',
      },
      footer: {
        text: 'Footer text',
      },
      actionReplyButton: {
        buttons: JSON.stringify([
          {
            id: 'btn1',
            title: 'Button 1',
            type: 'postback',
            payload: 'btn1_payload',
          },
        ]),
      },
    },
  };

  describe('Successful Processing', () => {
    beforeEach(() => {
      // Mock successful validation
      const { validateChannelType, validateForInstagramConversion } = require('../../../lib/validation/instagram-translation-validation');
      validateChannelType.mockReturnValue(true);
      validateForInstagramConversion.mockReturnValue({
        valid: true,
        templateType: 'generic',
        errors: [],
        warnings: [],
      });

      // Mock successful database query
      mockPrisma.mapeamentoIntencao.findUnique.mockResolvedValue({
        template: mockTemplate,
      });

      // Mock successful conversion
      mockMessageConverter.convert.mockReturnValue({
        success: true,
        instagramTemplate: {
          type: 'generic',
          payload: {
            template_type: 'generic',
            elements: [
              {
                title: 'Hello World!',
                image_url: 'https://example.com/image.jpg',
                subtitle: 'Footer text',
                buttons: [
                  {
                    type: 'postback',
                    title: 'Button 1',
                    payload: 'btn1_payload',
                  },
                ],
              },
            ],
          },
        },
        warnings: [],
      });

      mockStoreJobResult.mockResolvedValue();
    });

    it('should process Instagram translation successfully', async () => {
      const job = createMockJob(mockJobData);

      await processInstagramTranslationTask(job);

      // Verify database query was called
      expect(mockPrisma.mapeamentoIntencao.findUnique).toHaveBeenCalledWith({
        where: {
          intentName_inboxId: {
            intentName: 'test.intent',
            inboxId: 'inbox-123',
          },
        },
        include: expect.any(Object),
      });

      // Verify message conversion was called
      expect(mockMessageConverter.convert).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { text: 'Hello World!' },
          header: { type: 'image', content: 'https://example.com/image.jpg' },
          footer: { text: 'Footer text' },
          buttons: expect.any(Array),
        })
      );

      // Verify result was stored
      expect(mockStoreJobResult).toHaveBeenCalledWith(
        mockJobData.correlationId,
        expect.objectContaining({
          success: true,
          fulfillmentMessages: expect.any(Array),
          processingTime: expect.any(Number),
          correlationId: mockJobData.correlationId,
          metadata: expect.objectContaining({
            templateFound: true,
            conversionType: 'generic',
            originalMessageLength: 12,
            buttonsCount: 1,
          }),
        })
      );
    });

    it('should handle conversion warnings', async () => {
      // Mock conversion with warnings
      mockMessageConverter.convert.mockReturnValue({
        success: true,
        instagramTemplate: {
          type: 'button',
          payload: {
            template_type: 'button',
            text: 'Long message text that was converted to button template',
            buttons: [],
          },
        },
        warnings: ['Too many buttons. Only first 3 will be used.'],
      });

      const job = createMockJob(mockJobData);

      await processInstagramTranslationTask(job);

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Conversion completed with warnings'),
        expect.objectContaining({
          warnings: ['Too many buttons. Only first 3 will be used.'],
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid channel type', async () => {
      const { validateChannelType } = require('../../../lib/validation/instagram-translation-validation');
      validateChannelType.mockReturnValue(false);

      const job = createMockJob(mockJobData);

      await processInstagramTranslationTask(job);

      expect(mockStoreJobResult).toHaveBeenCalledWith(
        mockJobData.correlationId,
        expect.objectContaining({
          success: false,
          error: 'Invalid channel type - not Instagram',
          errorCode: InstagramTranslationErrorCodes.INVALID_CHANNEL,
        })
      );
    });

    it('should handle template not found', async () => {
      const { validateChannelType } = require('../../../lib/validation/instagram-translation-validation');
      validateChannelType.mockReturnValue(true);

      mockPrisma.mapeamentoIntencao.findUnique.mockResolvedValue(null);

      const job = createMockJob(mockJobData);

      await processInstagramTranslationTask(job);

      expect(mockStoreJobResult).toHaveBeenCalledWith(
        mockJobData.correlationId,
        expect.objectContaining({
          success: false,
          error: 'Template not found for intent: test.intent in inbox: inbox-123',
          errorCode: InstagramTranslationErrorCodes.TEMPLATE_NOT_FOUND,
        })
      );
    });

    it('should handle validation errors', async () => {
      const { validateChannelType, validateForInstagramConversion } = require('../../../lib/validation/instagram-translation-validation');
      validateChannelType.mockReturnValue(true);
      validateForInstagramConversion.mockReturnValue({
        valid: false,
        templateType: 'incompatible',
        errors: ['Message text too long (700 chars). Instagram supports max 640 characters.'],
        warnings: [],
      });

      mockPrisma.mapeamentoIntencao.findUnique.mockResolvedValue({
        template: mockTemplate,
      });

      const job = createMockJob(mockJobData);

      await processInstagramTranslationTask(job);

      expect(mockStoreJobResult).toHaveBeenCalledWith(
        mockJobData.correlationId,
        expect.objectContaining({
          success: false,
          error: 'Template validation failed: Message text too long (700 chars). Instagram supports max 640 characters.',
          errorCode: InstagramTranslationErrorCodes.MESSAGE_TOO_LONG,
        })
      );
    });

    it('should handle conversion errors', async () => {
      const { validateChannelType, validateForInstagramConversion } = require('../../../lib/validation/instagram-translation-validation');
      validateChannelType.mockReturnValue(true);
      validateForInstagramConversion.mockReturnValue({
        valid: true,
        templateType: 'generic',
        errors: [],
        warnings: [],
      });

      mockPrisma.mapeamentoIntencao.findUnique.mockResolvedValue({
        template: mockTemplate,
      });

      mockMessageConverter.convert.mockReturnValue({
        success: false,
        error: 'Conversion failed: Invalid template structure',
      });

      const job = createMockJob(mockJobData);

      await processInstagramTranslationTask(job);

      expect(mockStoreJobResult).toHaveBeenCalledWith(
        mockJobData.correlationId,
        expect.objectContaining({
          success: false,
          error: 'Message conversion failed: Conversion failed: Invalid template structure',
          errorCode: InstagramTranslationErrorCodes.CONVERSION_FAILED,
        })
      );
    });

    it('should handle database errors', async () => {
      const { validateChannelType } = require('../../../lib/validation/instagram-translation-validation');
      validateChannelType.mockReturnValue(true);

      mockPrisma.mapeamentoIntencao.findUnique.mockRejectedValue(
        new Error('Database connection failed')
      );

      const job = createMockJob(mockJobData);

      await expect(processInstagramTranslationTask(job)).rejects.toThrow(
        'Database query failed: Database connection failed'
      );

      expect(mockStoreJobResult).toHaveBeenCalledWith(
        mockJobData.correlationId,
        expect.objectContaining({
          success: false,
          error: 'Database query failed: Database connection failed',
          errorCode: InstagramTranslationErrorCodes.DATABASE_ERROR,
        })
      );
    });

    it('should handle unexpected errors', async () => {
      const { validateChannelType } = require('../../../lib/validation/instagram-translation-validation');
      validateChannelType.mockImplementation(() => {
        throw new Error('Unexpected validation error');
      });

      const job = createMockJob(mockJobData);

      await expect(processInstagramTranslationTask(job)).rejects.toThrow(
        'Unexpected validation error'
      );

      expect(mockStoreJobResult).toHaveBeenCalledWith(
        mockJobData.correlationId,
        expect.objectContaining({
          success: false,
          error: 'Unexpected validation error',
          errorCode: InstagramTranslationErrorCodes.UNKNOWN_ERROR,
        })
      );
    });
  });

  describe('Template Conversion', () => {
    it('should handle templates without interactive content', async () => {
      const { validateChannelType } = require('../../../lib/validation/instagram-translation-validation');
      validateChannelType.mockReturnValue(true);

      mockPrisma.mapeamentoIntencao.findUnique.mockResolvedValue({
        template: {
          id: 'template-123',
          interactiveContent: null,
        },
      });

      const job = createMockJob(mockJobData);

      await processInstagramTranslationTask(job);

      expect(mockStoreJobResult).toHaveBeenCalledWith(
        mockJobData.correlationId,
        expect.objectContaining({
          success: false,
          error: 'Template not found for intent: test.intent in inbox: inbox-123',
          errorCode: InstagramTranslationErrorCodes.TEMPLATE_NOT_FOUND,
        })
      );
    });

    it('should handle malformed button data', async () => {
      const { validateChannelType, validateForInstagramConversion } = require('../../../lib/validation/instagram-translation-validation');
      validateChannelType.mockReturnValue(true);
      validateForInstagramConversion.mockReturnValue({
        valid: true,
        templateType: 'generic',
        errors: [],
        warnings: [],
      });

      const templateWithMalformedButtons = {
        ...mockTemplate,
        interactiveContent: {
          ...mockTemplate.interactiveContent,
          actionReplyButton: {
            buttons: 'invalid-json-string',
          },
        },
      };

      mockPrisma.mapeamentoIntencao.findUnique.mockResolvedValue({
        template: templateWithMalformedButtons,
      });

      mockMessageConverter.convert.mockReturnValue({
        success: true,
        instagramTemplate: {
          type: 'generic',
          payload: {
            template_type: 'generic',
            elements: [
              {
                title: 'Hello World!',
                buttons: [],
              },
            ],
          },
        },
      });

      const job = createMockJob(mockJobData);

      await processInstagramTranslationTask(job);

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse buttons data'),
        expect.any(Object)
      );
    });
  });
});