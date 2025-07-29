/**
 * Unit tests for Template Adapter
 */

import {
  convertPrismaTemplateToWhatsApp,
  convertCompleteMessageMappingToWhatsApp,
  canConvertToInstagram,
  type PrismaTemplate,
  type CompleteMessageMapping,
} from '../template-adapter';

describe('Template Adapter', () => {
  describe('convertPrismaTemplateToWhatsApp', () => {
    it('should convert basic Prisma template to WhatsApp format', () => {
      const prismaTemplate: PrismaTemplate = {
        id: '1',
        name: 'Test Template',
        type: 'INTERACTIVE_MESSAGE',
        interactiveContent: {
          id: 'content-1',
          body: {
            text: 'Hello, this is a test message',
          },
        },
      };

      const result = convertPrismaTemplateToWhatsApp(prismaTemplate);

      expect(result).toEqual({
        body: {
          text: 'Hello, this is a test message',
        },
      });
    });

    it('should convert Prisma template with header and footer', () => {
      const prismaTemplate: PrismaTemplate = {
        id: '1',
        name: 'Test Template',
        type: 'INTERACTIVE_MESSAGE',
        interactiveContent: {
          id: 'content-1',
          header: {
            type: 'image',
            content: 'https://example.com/image.jpg',
          },
          body: {
            text: 'Hello, this is a test message',
          },
          footer: {
            text: 'Footer text',
          },
        },
      };

      const result = convertPrismaTemplateToWhatsApp(prismaTemplate);

      expect(result).toEqual({
        body: {
          text: 'Hello, this is a test message',
        },
        header: {
          type: 'image',
          content: 'https://example.com/image.jpg',
        },
        footer: {
          text: 'Footer text',
        },
      });
    });

    it('should convert Prisma template with buttons (JSON string)', () => {
      const buttonsJson = JSON.stringify([
        { id: '1', title: 'Button 1', type: 'postback', payload: 'payload1' },
        { id: '2', title: 'Button 2', type: 'web_url', url: 'https://example.com' },
      ]);

      const prismaTemplate: PrismaTemplate = {
        id: '1',
        name: 'Test Template',
        type: 'INTERACTIVE_MESSAGE',
        interactiveContent: {
          id: 'content-1',
          body: {
            text: 'Choose an option',
          },
          actionReplyButton: {
            buttons: buttonsJson,
          },
        },
      };

      const result = convertPrismaTemplateToWhatsApp(prismaTemplate);

      expect(result).toEqual({
        body: {
          text: 'Choose an option',
        },
        buttons: [
          { id: '1', title: 'Button 1', type: 'postback', payload: 'payload1' },
          { id: '2', title: 'Button 2', type: 'web_url', url: 'https://example.com' },
        ],
      });
    });

    it('should convert Prisma template with buttons (object)', () => {
      const buttonsArray = [
        { id: '1', title: 'Button 1', type: 'postback', payload: 'payload1' },
        { id: '2', title: 'Button 2', type: 'web_url', url: 'https://example.com' },
      ];

      const prismaTemplate: PrismaTemplate = {
        id: '1',
        name: 'Test Template',
        type: 'INTERACTIVE_MESSAGE',
        interactiveContent: {
          id: 'content-1',
          body: {
            text: 'Choose an option',
          },
          actionReplyButton: {
            buttons: buttonsArray,
          },
        },
      };

      const result = convertPrismaTemplateToWhatsApp(prismaTemplate);

      expect(result).toEqual({
        body: {
          text: 'Choose an option',
        },
        buttons: [
          { id: '1', title: 'Button 1', type: 'postback', payload: 'payload1' },
          { id: '2', title: 'Button 2', type: 'web_url', url: 'https://example.com' },
        ],
      });
    });

    it('should handle buttons with reply structure', () => {
      const buttonsArray = [
        { reply: { id: 'reply1', title: 'Reply Button' } },
        { id: '2', title: 'Regular Button', type: 'postback' },
      ];

      const prismaTemplate: PrismaTemplate = {
        id: '1',
        name: 'Test Template',
        type: 'INTERACTIVE_MESSAGE',
        interactiveContent: {
          id: 'content-1',
          body: {
            text: 'Choose an option',
          },
          actionReplyButton: {
            buttons: buttonsArray,
          },
        },
      };

      const result = convertPrismaTemplateToWhatsApp(prismaTemplate);

      expect(result?.buttons).toEqual([
        { id: 'reply1', title: 'Reply Button', type: 'postback', payload: 'reply1' },
        { id: '2', title: 'Regular Button', type: 'postback', payload: undefined },
      ]);
    });

    it('should return null for template without interactive content', () => {
      const prismaTemplate: PrismaTemplate = {
        id: '1',
        name: 'Test Template',
        type: 'AUTOMATION_REPLY',
      };

      const result = convertPrismaTemplateToWhatsApp(prismaTemplate);

      expect(result).toBeNull();
    });

    it('should handle invalid button JSON gracefully', () => {
      const prismaTemplate: PrismaTemplate = {
        id: '1',
        name: 'Test Template',
        type: 'INTERACTIVE_MESSAGE',
        interactiveContent: {
          id: 'content-1',
          body: {
            text: 'Choose an option',
          },
          actionReplyButton: {
            buttons: 'invalid json{',
          },
        },
      };

      const result = convertPrismaTemplateToWhatsApp(prismaTemplate);

      expect(result).toEqual({
        body: {
          text: 'Choose an option',
        },
      });
    });
  });

  describe('convertCompleteMessageMappingToWhatsApp', () => {
    it('should convert CompleteMessageMapping to WhatsApp format', () => {
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
            footer: {
              text: 'Footer text',
            },
          },
        },
      };

      const result = convertCompleteMessageMappingToWhatsApp(mapping);

      expect(result).toEqual({
        body: {
          text: 'Hello from mapping',
        },
        header: {
          type: 'text',
          content: 'Header text',
        },
        footer: {
          text: 'Footer text',
        },
      });
    });

    it('should return null for mapping without interactive content', () => {
      const mapping: CompleteMessageMapping = {
        unifiedTemplate: {
          id: '1',
          name: 'Test Template',
          type: 'AUTOMATION_REPLY',
        },
      };

      const result = convertCompleteMessageMappingToWhatsApp(mapping);

      expect(result).toBeNull();
    });

    it('should return null for mapping without unified template', () => {
      const mapping: CompleteMessageMapping = {};

      const result = convertCompleteMessageMappingToWhatsApp(mapping);

      expect(result).toBeNull();
    });
  });

  describe('canConvertToInstagram', () => {
    it('should return true for valid template', () => {
      const template = {
        body: {
          text: 'Valid message',
        },
      };

      const result = canConvertToInstagram(template);

      expect(result).toBe(true);
    });

    it('should return false for template without body text', () => {
      const template = {
        body: {
          text: '',
        },
      };

      const result = canConvertToInstagram(template);

      expect(result).toBe(false);
    });

    it('should return false for template with whitespace-only body', () => {
      const template = {
        body: {
          text: '   \n\t   ',
        },
      };

      const result = canConvertToInstagram(template);

      expect(result).toBe(false);
    });

    it('should return false for template exceeding 640 characters', () => {
      const template = {
        body: {
          text: 'A'.repeat(641),
        },
      };

      const result = canConvertToInstagram(template);

      expect(result).toBe(false);
    });

    it('should return true for template with exactly 640 characters', () => {
      const template = {
        body: {
          text: 'A'.repeat(640),
        },
      };

      const result = canConvertToInstagram(template);

      expect(result).toBe(true);
    });

    it('should return false for template without body', () => {
      const template = {} as any;

      const result = canConvertToInstagram(template);

      expect(result).toBe(false);
    });
  });
});