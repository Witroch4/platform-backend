/**
 * Channel-specific schemas for structured output
 * Implements requirements 4.1, 4.2, 4.3, 5.1, 5.2, 5.3
 */

import { z } from 'zod';

/**
 * WhatsApp Interactive Button Schema
 * Based on WhatsApp Cloud API Reply Buttons format
 */
export const WhatsAppInteractiveSchema = z.object({
  header: z.object({
    type: z.enum(['text', 'image', 'video', 'document']),
    text: z.string().max(60).optional(),
    link: z.string().url().optional(),
  }).optional(),
  body: z.string().min(1).max(1024),
  footer: z.string().max(60).optional(),
  buttons: z.array(
    z.object({
      type: z.literal('reply'),
      title: z.string().min(1).max(20),
      id: z.string().min(1).max(256),
    })
  ).min(1).max(3),
});

export type WhatsAppInteractiveMessage = z.infer<typeof WhatsAppInteractiveSchema>;

/**
 * Instagram Quick Reply Schema
 * Based on Instagram Messaging API Quick Replies format
 */
export const InstagramQuickReplySchema = z.object({
  text: z.string().min(1).max(1000),
  quick_replies: z.array(
    z.object({
      content_type: z.literal('text'),
      title: z.string().min(1).max(20),
      payload: z.string().min(1).max(1000),
    })
  ).min(1).max(13), // Instagram allows up to 13, but we'll cap at 3 for UX
});

export type InstagramQuickReplyMessage = z.infer<typeof InstagramQuickReplySchema>;

/**
 * Instagram Button Template Schema
 * Based on Instagram Messaging API Button Template format
 */
export const InstagramButtonTemplateSchema = z.object({
  text: z.string().min(1).max(640),
  buttons: z.array(
    z.discriminatedUnion('type', [
      z.object({
        type: z.literal('postback'),
        title: z.string().min(1).max(20),
        payload: z.string().min(1).max(1000),
      }),
      z.object({
        type: z.literal('web_url'),
        title: z.string().min(1).max(20),
        url: z.string().url().refine(
          (url) => url.startsWith('https://'),
          { message: 'Instagram web_url buttons must use HTTPS' }
        ),
      }),
    ])
  ).min(1).max(3),
});

export type InstagramButtonTemplateMessage = z.infer<typeof InstagramButtonTemplateSchema>;

/**
 * Generic Dynamic Response Schema
 * Used for LLM generation before channel-specific transformation
 */
export const DynamicResponseSchema = z.object({
  text: z.string().min(1).max(1024),
  buttons: z.array(
    z.object({
      title: z.string().min(1).max(20),
      id: z.string().min(1).max(256),
      type: z.enum(['intent', 'flow', 'help', 'url']).optional(),
      url: z.string().url().optional(),
    })
  ).min(0).max(3).optional(),
  header: z.object({
    type: z.enum(['text', 'image', 'video', 'document']),
    text: z.string().max(60).optional(),
    link: z.string().url().optional(),
  }).optional(),
  footer: z.string().max(60).optional(),
});

export type DynamicResponse = z.infer<typeof DynamicResponseSchema>;

/**
 * Channel-specific schema selector
 */
export function getChannelSchema(channel: 'whatsapp' | 'instagram', messageType?: 'quick_reply' | 'button_template') {
  switch (channel) {
    case 'whatsapp':
      return WhatsAppInteractiveSchema;
    case 'instagram':
      if (messageType === 'button_template') {
        return InstagramButtonTemplateSchema;
      }
      return InstagramQuickReplySchema;
    default:
      throw new Error(`Unsupported channel: ${channel}`);
  }
}

/**
 * Validation and sanitization utilities
 */
export class ChannelSchemaValidator {
  /**
   * Validate and sanitize WhatsApp interactive message
   */
  static validateWhatsApp(data: any): { valid: boolean; data?: WhatsAppInteractiveMessage; errors?: string[] } {
    try {
      // Pre-sanitization
      const sanitized = this.sanitizeWhatsApp(data);
      const validated = WhatsAppInteractiveSchema.parse(sanitized);
      
      return { valid: true, data: validated };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { 
          valid: false, 
          errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`) 
        };
      }
      return { valid: false, errors: [String(error)] };
    }
  }

  /**
   * Validate and sanitize Instagram quick reply message
   */
  static validateInstagramQuickReply(data: any): { valid: boolean; data?: InstagramQuickReplyMessage; errors?: string[] } {
    try {
      const sanitized = this.sanitizeInstagramQuickReply(data);
      const validated = InstagramQuickReplySchema.parse(sanitized);
      
      return { valid: true, data: validated };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { 
          valid: false, 
          errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`) 
        };
      }
      return { valid: false, errors: [String(error)] };
    }
  }

  /**
   * Validate and sanitize Instagram button template message
   */
  static validateInstagramButtonTemplate(data: any): { valid: boolean; data?: InstagramButtonTemplateMessage; errors?: string[] } {
    try {
      const sanitized = this.sanitizeInstagramButtonTemplate(data);
      const validated = InstagramButtonTemplateSchema.parse(sanitized);
      
      return { valid: true, data: validated };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { 
          valid: false, 
          errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`) 
        };
      }
      return { valid: false, errors: [String(error)] };
    }
  }

  /**
   * Sanitize WhatsApp message data
   */
  private static sanitizeWhatsApp(data: any): any {
    const sanitized = { ...data };

    // Truncate body preserving word boundaries
    if (sanitized.body && sanitized.body.length > 1024) {
      sanitized.body = this.truncatePreservingWords(sanitized.body, 1024);
    }

    // Truncate header text
    if (sanitized.header?.text && sanitized.header.text.length > 60) {
      sanitized.header.text = this.truncatePreservingWords(sanitized.header.text, 60);
    }

    // Truncate footer
    if (sanitized.footer && sanitized.footer.length > 60) {
      sanitized.footer = this.truncatePreservingWords(sanitized.footer, 60);
    }

    // Sanitize buttons
    if (sanitized.buttons) {
      sanitized.buttons = sanitized.buttons
        .slice(0, 3) // Max 3 buttons
        .map((button: any) => ({
          ...button,
          title: this.truncatePreservingWords(button.title || '', 20),
          id: (button.id || '').substring(0, 256),
        }))
        .filter((button: any) => button.title && button.id); // Remove empty buttons

      // Ensure unique titles (case-insensitive)
      sanitized.buttons = this.ensureUniqueTitles(sanitized.buttons);
    }

    return sanitized;
  }

  /**
   * Sanitize Instagram quick reply message data
   */
  private static sanitizeInstagramQuickReply(data: any): any {
    const sanitized = { ...data };

    // Truncate text
    if (sanitized.text && sanitized.text.length > 1000) {
      sanitized.text = this.truncatePreservingWords(sanitized.text, 1000);
    }

    // Sanitize quick replies - cap at 3 for UX consistency
    if (sanitized.quick_replies) {
      sanitized.quick_replies = sanitized.quick_replies
        .slice(0, 3) // Cap at 3 for UX homogeneity
        .map((reply: any) => ({
          content_type: 'text',
          title: this.truncatePreservingWords(reply.title || '', 20),
          payload: (reply.payload || '').substring(0, 1000),
        }))
        .filter((reply: any) => reply.title && reply.payload);

      // Ensure unique titles
      sanitized.quick_replies = this.ensureUniqueTitles(sanitized.quick_replies);
    }

    return sanitized;
  }

  /**
   * Sanitize Instagram button template message data
   */
  private static sanitizeInstagramButtonTemplate(data: any): any {
    const sanitized = { ...data };

    // Truncate text
    if (sanitized.text && sanitized.text.length > 640) {
      sanitized.text = this.truncatePreservingWords(sanitized.text, 640);
    }

    // Sanitize buttons
    if (sanitized.buttons) {
      sanitized.buttons = sanitized.buttons
        .slice(0, 3) // Max 3 buttons
        .map((button: any) => {
          const sanitizedButton: any = {
            type: button.type,
            title: this.truncatePreservingWords(button.title || '', 20),
          };

          if (button.type === 'postback') {
            sanitizedButton.payload = (button.payload || '').substring(0, 1000);
          } else if (button.type === 'web_url') {
            sanitizedButton.url = button.url;
          }

          return sanitizedButton;
        })
        .filter((button: any) => {
          if (button.type === 'postback') {
            return button.title && button.payload;
          } else if (button.type === 'web_url') {
            return button.title && button.url && button.url.startsWith('https://');
          }
          return false;
        });

      // Ensure unique titles
      sanitized.buttons = this.ensureUniqueTitles(sanitized.buttons);
    }

    return sanitized;
  }

  /**
   * Truncate text preserving word boundaries
   */
  private static truncatePreservingWords(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;

    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > maxLength * 0.8) {
      return truncated.substring(0, lastSpace);
    }
    
    return truncated;
  }

  /**
   * Ensure unique titles (case-insensitive)
   */
  private static ensureUniqueTitles<T extends { title: string }>(items: T[]): T[] {
    const seen = new Set<string>();
    const unique: T[] = [];

    for (const item of items) {
      const lowerTitle = item.title.toLowerCase();
      if (!seen.has(lowerTitle)) {
        seen.add(lowerTitle);
        unique.push(item);
      }
    }

    // If no buttons remain after deduplication, add fallback
    if (unique.length === 0 && items.length > 0) {
      unique.push({
        ...items[0],
        title: 'Falar com atendente',
        ...(items[0] as any).type === 'postback' ? { payload: 'human_handoff' } : { id: 'human_handoff' },
      } as T);
    }

    return unique;
  }
}