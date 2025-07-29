/**
 * Unit tests for Instagram Conversion Pipeline
 */

import {
  convertTemplateToInstagram,
  convertMultipleTemplatesToInstagram,
  getConversionStatistics,
} from '../conversion-pipeline';
import type { PrismaTemplate, CompleteMessageMapping } from '../template-adapter';

describe('Conversion Pipeline', () => {
  describe('convertTemplateToInstagram', () => {
    it('should convert PrismaTemplate to Instagram Generic Template', () => {
      const prismaTemplate: PrismaTemplate = {
        id: '1',
        name: 'Test Template',
        type: 'INTERACTIVE_MESSAGE',
        interactiveContent: {
          id: 'content-1',
          body: {
            text: 'Short message', // 13 chars - Generic Template
          },
          header: {
            type: 'image',
            content: 'https://example.com/image.jpg',
          },
          footer: {
            text: 'Footer text',
          },
          actionReplyButton: {
            buttons: [
              { id: '1', title: 'Button 1', type: 'postback', payload: 'payload1' },
            ],
          },
        },
      };

      const result = convertTemplateToInstagram(prismaTemplate);

      expect(result.success).toBe(true);
      expect(result.instagramTemplate?.type).toBe('generic');
      
      const payload = result.instagramTemplate?.payload as any;
      expect(payload.template_type).toBe('generic');
      expect(payload.elements[0].title).toBe('Short message');
      expect(payload.elements[0].subtitle).toBe('Footer text');
      expect(payload.elements[0].image_url).toBe('https://example.com/image.jpg');
      expect(payload.elements[0].buttons).toHaveLength(1);
    });

    it('should convert PrismaTemplate to Instagram Button Template', () => {
      const longText = 'A'.repeat(120); // 120 chars - Button Template
      const prismaTemplate: PrismaTemplate = {
        id: '1',
        name: 'Test Template',
        type: 'INTERACTIVE_MESSAGE',
        interactiveContent: {
          id: 'content-1',
          body: {
            text: longText,
          },
          header: {
            type: 'image',
            content: 'https://example.com/image.jpg',
          },
          footer: {
            text: 'Footer text',
          },
        },
      };

      const result = convertTemplateToInstagram(prismaTemplate);

      expect(result.success).toBe(true);
      expect(result.instagramTemplate?.type).toBe('button');
      expect(result.warnings).toContain('Header discarded in Button Template format');
      expect(result.warnings).toContain('Footer discarded in Button Template format');
      
      const payload = result.instagramTemplate?.payload as any;
      expect(payload.template_type).toBe('button');
      expect(payload.text).toBe(longText);
    });

    it('should convert CompleteMessageMapping to Instagram format', () => {
      const mapping: CompleteMessageMapping = {
        unifiedTemplate: {
          id: '1',
          name: 'Test Template',
          type: 'INTERACTIVE_MESSAGE',
          interactiveContent: {
            body: {
              text: 'Hello from mapping',
            },
            header: {
              type: 'text',
              content: 'Header text',
            },
          },
        },
      };

      const result = convertTemplateToInstagram(mapping);

      expect(result.success).toBe(true);
      expect(result.instagramTemplate?.type).toBe('generic');
      
      const payload = result.instagramTemplate?.payload as any;
      expect(payload.elements[0].title).toBe('Hello from mapping');
    });

    it('should skip template without interactive content', () => {
      const prismaTemplate: PrismaTemplate = {
        id: '1',
        name: 'Test Template',
        type: 'AUTOMATION_REPLY',
      };

      const result = convertTemplateToInstagram(prismaTemplate);

      expect(result.success).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('Template does not contain interactive content suitable for conversion');
    });

    it('should skip template with empty body text', () => {
      const prismaTemplate: PrismaTemplate = {
        id: '1',
        name: 'Test Template',
        type: 'INTERACTIVE_MESSAGE',
        interactiveContent: {
          id: 'content-1',
          body: {
            text: '',
          },
        },
      };

      const result = convertTemplateToInstagram(prismaTemplate);

      expect(result.success).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('Template cannot be converted to Instagram format (empty text or exceeds 640 characters)');
    });

    it('should skip template exceeding 640 characters', () => {
      const longText = 'A'.repeat(641); // 641 chars
      const prismaTemplate: PrismaTemplate = {
        id: '1',
        name: 'Test Template',
        type: 'INTERACTIVE_MESSAGE',
        interactiveContent: {
          id: 'content-1',
          body: {
            text: longText,
          },
        },
      };

      const result = convertTemplateToInstagram(prismaTemplate);

      expect(result.success).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('Template cannot be converted to Instagram format (empty text or exceeds 640 characters)');
    });

    it('should handle conversion errors gracefully', () => {
      // Create a template that will cause an error during conversion
      const prismaTemplate: PrismaTemplate = {
        id: '1',
        name: 'Test Template',
        type: 'INTERACTIVE_MESSAGE',
        interactiveContent: {
          id: 'content-1',
          body: {
            text: null as any, // This will cause an error
          },
        },
      };

      const result = convertTemplateToInstagram(prismaTemplate);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Template body text must be a string');
    });

    it('should handle pipeline errors gracefully', () => {
      // Pass invalid input to trigger pipeline error
      const result = convertTemplateToInstagram(null as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Conversion pipeline failed:');
    });
  });

  describe('convertMultipleTemplatesToInstagram', () => {
    it('should convert multiple templates', () => {
      const templates: PrismaTemplate[] = [
        {
          id: '1',
          name: 'Template 1',
          type: 'INTERACTIVE_MESSAGE',
          interactiveContent: {
            id: 'content-1',
            body: { text: 'Short message 1' },
          },
        },
        {
          id: '2',
          name: 'Template 2',
          type: 'INTERACTIVE_MESSAGE',
          interactiveContent: {
            id: 'content-2',
            body: { text: 'A'.repeat(120) }, // Button Template
          },
        },
        {
          id: '3',
          name: 'Template 3',
          type: 'AUTOMATION_REPLY', // Will be skipped
        },
      ];

      const results = convertMultipleTemplatesToInstagram(templates);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[0].instagramTemplate?.type).toBe('generic');
      expect(results[1].success).toBe(true);
      expect(results[1].instagramTemplate?.type).toBe('button');
      expect(results[2].success).toBe(false);
      expect(results[2].skipped).toBe(true);
    });

    it('should handle empty array', () => {
      const results = convertMultipleTemplatesToInstagram([]);

      expect(results).toHaveLength(0);
    });
  });

  describe('getConversionStatistics', () => {
    it('should calculate statistics correctly', () => {
      const results = [
        { success: true }, // successful
        { success: true }, // successful
        { success: false, skipped: true }, // skipped
        { success: false, error: 'Error' }, // failed
        { success: false, skipped: true }, // skipped
      ] as any[];

      const stats = getConversionStatistics(results);

      expect(stats.total).toBe(5);
      expect(stats.successful).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.skipped).toBe(2);
      expect(stats.successRate).toBe(40);
      expect(stats.skipRate).toBe(40);
      expect(stats.failureRate).toBe(20);
    });

    it('should handle empty results', () => {
      const stats = getConversionStatistics([]);

      expect(stats.total).toBe(0);
      expect(stats.successful).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.skipped).toBe(0);
      expect(stats.successRate).toBe(0);
      expect(stats.skipRate).toBe(0);
      expect(stats.failureRate).toBe(0);
    });

    it('should handle all successful results', () => {
      const results = [
        { success: true },
        { success: true },
        { success: true },
      ] as any[];

      const stats = getConversionStatistics(results);

      expect(stats.total).toBe(3);
      expect(stats.successful).toBe(3);
      expect(stats.failed).toBe(0);
      expect(stats.skipped).toBe(0);
      expect(stats.successRate).toBe(100);
      expect(stats.skipRate).toBe(0);
      expect(stats.failureRate).toBe(0);
    });
  });
});