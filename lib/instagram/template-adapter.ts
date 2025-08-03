/**
 * Template Adapter
 * 
 * Converts Prisma template models to WhatsApp template format
 * for use with the Instagram message converter.
 */

import type { WhatsAppTemplate } from './message-converter';
import type { PrismaTemplate, TemplateWithContent } from '@/types/interactive-messages';

export interface CompleteMessageMapping {
  unifiedTemplate?: {
    id: string;
    name: string;
    type: string;
    interactiveContent?: any;
  };
}

/**
 * Convert Prisma template to WhatsApp template format
 */
export function convertPrismaTemplateToWhatsApp(
  templateWithContent: TemplateWithContent
): WhatsAppTemplate | null {
  if (!templateWithContent.interactiveContent) {
    return null;
  }

  const { interactiveContent } = templateWithContent;

  // Build WhatsApp template structure
  const whatsappTemplate: WhatsAppTemplate = {
    body: {
      text: interactiveContent.body.text,
    },
  };

  // Add header if present
  if (interactiveContent.header) {
    whatsappTemplate.header = {
      type: interactiveContent.header.type,
      content: interactiveContent.header.content,
    };
  }

  // Add footer if present
  if (interactiveContent.footer) {
    whatsappTemplate.footer = {
      text: interactiveContent.footer.text,
    };
  }

  // Note: The current PrismaInteractiveContent structure doesn't include actionReplyButton
  // This would need to be added to the schema or handled differently
  // For now, we'll return the template without buttons

  return whatsappTemplate;
}

/**
 * Convert CompleteMessageMapping to WhatsApp template format
 */
export function convertCompleteMessageMappingToWhatsApp(
  mapping: CompleteMessageMapping
): WhatsAppTemplate | null {
  if (!mapping.unifiedTemplate?.interactiveContent) {
    return null;
  }

  const interactiveContent = mapping.unifiedTemplate.interactiveContent;

  // Build WhatsApp template structure
  const whatsappTemplate: WhatsAppTemplate = {
    body: {
      text: interactiveContent.body?.text || '',
    },
  };

  // Add header if present
  if (interactiveContent.header) {
    whatsappTemplate.header = {
      type: interactiveContent.header.type,
      content: interactiveContent.header.content,
    };
  }

  // Add footer if present
  if (interactiveContent.footer) {
    whatsappTemplate.footer = {
      text: interactiveContent.footer.text,
    };
  }

  // Add buttons if present
  if (interactiveContent.actionReplyButton?.buttons) {
    try {
      const buttonsData = typeof interactiveContent.actionReplyButton.buttons === 'string'
        ? JSON.parse(interactiveContent.actionReplyButton.buttons)
        : interactiveContent.actionReplyButton.buttons;

      if (Array.isArray(buttonsData)) {
        whatsappTemplate.buttons = buttonsData.map((button: any) => ({
          id: button.id || button.reply?.id || '',
          title: button.title || button.reply?.title || '',
          type: button.type || 'postback',
          url: button.url,
          payload: button.payload || button.reply?.id,
        }));
      }
    } catch (error) {
      console.warn('Failed to parse button data:', error);
    }
  }

  return whatsappTemplate;
}

/**
 * Validate that a template can be converted to Instagram format
 */
export function canConvertToInstagram(template: WhatsAppTemplate): boolean {
  // Must have body text
  if (!template.body?.text || template.body.text.trim().length === 0) {
    return false;
  }

  // Must not exceed Instagram's maximum character limit
  if (template.body.text.length > 640) {
    return false;
  }

  return true;
}