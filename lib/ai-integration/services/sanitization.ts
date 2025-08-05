/**
 * Sanitization Service
 * 
 * Sanitizes and validates message content according to channel-specific limits
 * and requirements before formatting for Chatwit API.
 */

import log from '@/lib/log';

// Input interfaces for sanitization
export interface WhatsAppSanitizationInput {
  body: string;
  header?: string;
  footer?: string;
  buttons: Array<{ title: string; id: string }>;
}

export interface InstagramQuickReplySanitizationInput {
  text: string;
  quick_replies: Array<{ title: string; payload: string }>;
}

export interface InstagramButtonTemplateSanitizationInput {
  text: string;
  buttons: Array<{
    type: 'postback' | 'web_url';
    title: string;
    payload?: string;
    url?: string;
  }>;
}

// Output interface for sanitization results
export interface SanitizationResult<T> {
  sanitized: T;
  warnings: string[];
  truncated: boolean;
  buttonsRemoved: number;
}

// Channel limits constants
export const CHANNEL_LIMITS = {
  whatsapp: {
    body: 1024,
    header: 60,
    footer: 60,
    buttons: { min: 1, max: 3 },
    buttonTitle: 20,
    buttonId: 256,
  },
  instagram: {
    quickReply: {
      text: 1000,
      maxItems: 13, // API limit, but we cap at 3 for UX
      title: 20,
      payload: 1000,
    },
    buttonTemplate: {
      text: 640,
      buttons: { min: 1, max: 3 },
      title: 20,
      requireHttps: true,
    },
  },
} as const;

export class SanitizationService {
  /**
   * Sanitize WhatsApp interactive message
   */
  sanitizeWhatsAppMessage(
    input: WhatsAppSanitizationInput
  ): SanitizationResult<WhatsAppSanitizationInput> {
    const warnings: string[] = [];
    let buttonsRemoved = 0;
    let truncated = false;

    // Sanitize body text
    let body = input.body;
    if (body.length > CHANNEL_LIMITS.whatsapp.body) {
      body = this.truncatePreservingWords(body, CHANNEL_LIMITS.whatsapp.body);
      truncated = true;
      warnings.push(`Body truncated from ${input.body.length} to ${body.length} characters`);
    }

    // Sanitize header
    let header = input.header;
    if (header && header.length > CHANNEL_LIMITS.whatsapp.header) {
      header = this.truncatePreservingWords(header, CHANNEL_LIMITS.whatsapp.header);
      truncated = true;
      warnings.push(`Header truncated from ${input.header!.length} to ${header.length} characters`);
    }

    // Sanitize footer
    let footer = input.footer;
    if (footer && footer.length > CHANNEL_LIMITS.whatsapp.footer) {
      footer = this.truncatePreservingWords(footer, CHANNEL_LIMITS.whatsapp.footer);
      truncated = true;
      warnings.push(`Footer truncated from ${input.footer!.length} to ${footer.length} characters`);
    }

    // Sanitize buttons
    let buttons = [...input.buttons];
    
    // Remove duplicates (case-insensitive)
    const uniqueButtons = this.removeDuplicateButtons(buttons);
    buttonsRemoved += buttons.length - uniqueButtons.length;
    buttons = uniqueButtons;

    // Limit to max buttons
    if (buttons.length > CHANNEL_LIMITS.whatsapp.buttons.max) {
      const originalLength = buttons.length;
      buttons = buttons.slice(0, CHANNEL_LIMITS.whatsapp.buttons.max);
      buttonsRemoved += originalLength - buttons.length;
      warnings.push(`Buttons limited to ${CHANNEL_LIMITS.whatsapp.buttons.max} (removed ${originalLength - buttons.length})`);
    }

    // Truncate button titles
    buttons = buttons.map(button => ({
      ...button,
      title: button.title.length > CHANNEL_LIMITS.whatsapp.buttonTitle
        ? this.truncatePreservingWords(button.title, CHANNEL_LIMITS.whatsapp.buttonTitle)
        : button.title,
    }));

    // Add fallback button if no buttons remain
    if (buttons.length === 0) {
      buttons = [{
        title: 'Falar com atendente',
        id: 'human_handoff',
      }];
      warnings.push('Added fallback button as no valid buttons remained');
    }

    return {
      sanitized: {
        body,
        header,
        footer,
        buttons,
      },
      warnings,
      truncated,
      buttonsRemoved,
    };
  }

  /**
   * Sanitize Instagram quick reply message
   */
  sanitizeInstagramQuickReply(
    input: InstagramQuickReplySanitizationInput
  ): SanitizationResult<InstagramQuickReplySanitizationInput> {
    const warnings: string[] = [];
    let buttonsRemoved = 0;
    let truncated = false;

    // Sanitize text
    let text = input.text;
    if (text.length > CHANNEL_LIMITS.instagram.quickReply.text) {
      text = this.truncatePreservingWords(text, CHANNEL_LIMITS.instagram.quickReply.text);
      truncated = true;
      warnings.push(`Text truncated from ${input.text.length} to ${text.length} characters`);
    }

    // Sanitize quick replies - limit to 3 for UX consistency
    let quick_replies = [...input.quick_replies];
    
    // Remove duplicates
    const uniqueReplies = this.removeDuplicateQuickReplies(quick_replies);
    buttonsRemoved += quick_replies.length - uniqueReplies.length;
    quick_replies = uniqueReplies;

    // Limit to 3 for UX consistency (Instagram allows 13 but we cap at 3)
    if (quick_replies.length > 3) {
      const originalLength = quick_replies.length;
      quick_replies = quick_replies.slice(0, 3);
      buttonsRemoved += originalLength - quick_replies.length;
      warnings.push(`Quick replies limited to 3 for UX consistency (removed ${originalLength - 3})`);
    }

    // Truncate titles
    quick_replies = quick_replies.map(reply => ({
      ...reply,
      title: reply.title.length > CHANNEL_LIMITS.instagram.quickReply.title
        ? this.truncatePreservingWords(reply.title, CHANNEL_LIMITS.instagram.quickReply.title)
        : reply.title,
    }));

    return {
      sanitized: {
        text,
        quick_replies,
      },
      warnings,
      truncated,
      buttonsRemoved,
    };
  }

  /**
   * Sanitize Instagram button template message
   */
  sanitizeInstagramButtonTemplate(
    input: InstagramButtonTemplateSanitizationInput
  ): SanitizationResult<InstagramButtonTemplateSanitizationInput> {
    const warnings: string[] = [];
    let buttonsRemoved = 0;
    let truncated = false;

    // Sanitize text
    let text = input.text;
    if (text.length > CHANNEL_LIMITS.instagram.buttonTemplate.text) {
      text = this.truncatePreservingWords(text, CHANNEL_LIMITS.instagram.buttonTemplate.text);
      truncated = true;
      warnings.push(`Text truncated from ${input.text.length} to ${text.length} characters`);
    }

    // Sanitize buttons
    let buttons = [...input.buttons];

    // Remove non-HTTPS URLs
    const httpsButtons = buttons.filter(button => {
      if (button.type === 'web_url' && button.url && !button.url.startsWith('https://')) {
        buttonsRemoved++;
        warnings.push(`Removed non-HTTPS URL button: ${button.title}`);
        return false;
      }
      return true;
    });
    buttons = httpsButtons;

    // Remove duplicates
    const uniqueButtons = this.removeDuplicateInstagramButtons(buttons);
    buttonsRemoved += buttons.length - uniqueButtons.length;
    buttons = uniqueButtons;

    // Limit to max buttons
    if (buttons.length > CHANNEL_LIMITS.instagram.buttonTemplate.buttons.max) {
      const originalLength = buttons.length;
      buttons = buttons.slice(0, CHANNEL_LIMITS.instagram.buttonTemplate.buttons.max);
      buttonsRemoved += originalLength - buttons.length;
      warnings.push(`Buttons limited to ${CHANNEL_LIMITS.instagram.buttonTemplate.buttons.max} (removed ${originalLength - buttons.length})`);
    }

    // Truncate button titles
    buttons = buttons.map(button => ({
      ...button,
      title: button.title.length > CHANNEL_LIMITS.instagram.buttonTemplate.title
        ? this.truncatePreservingWords(button.title, CHANNEL_LIMITS.instagram.buttonTemplate.title)
        : button.title,
    }));

    return {
      sanitized: {
        text,
        buttons,
      },
      warnings,
      truncated,
      buttonsRemoved,
    };
  }

  /**
   * Truncate text while preserving word boundaries
   */
  private truncatePreservingWords(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    // Reserve space for ellipsis
    const ellipsis = '...';
    const targetLength = maxLength - ellipsis.length;

    // Find the last space before the limit
    let truncated = text.substring(0, targetLength);
    const lastSpaceIndex = truncated.lastIndexOf(' ');

    if (lastSpaceIndex > 0) {
      // Truncate at the last space to preserve word boundary
      truncated = truncated.substring(0, lastSpaceIndex);
    }

    // Add ellipsis
    return truncated + ellipsis;
  }

  /**
   * Remove duplicate buttons (case-insensitive title comparison)
   */
  private removeDuplicateButtons(
    buttons: Array<{ title: string; id: string }>
  ): Array<{ title: string; id: string }> {
    const seen = new Set<string>();
    return buttons.filter(button => {
      const normalizedTitle = button.title.toLowerCase();
      if (seen.has(normalizedTitle)) {
        return false;
      }
      seen.add(normalizedTitle);
      return true;
    });
  }

  /**
   * Remove duplicate quick replies (case-insensitive title comparison)
   */
  private removeDuplicateQuickReplies(
    replies: Array<{ title: string; payload: string }>
  ): Array<{ title: string; payload: string }> {
    const seen = new Set<string>();
    return replies.filter(reply => {
      const normalizedTitle = reply.title.toLowerCase();
      if (seen.has(normalizedTitle)) {
        return false;
      }
      seen.add(normalizedTitle);
      return true;
    });
  }

  /**
   * Remove duplicate Instagram buttons (case-insensitive title comparison)
   */
  private removeDuplicateInstagramButtons(
    buttons: Array<{
      type: 'postback' | 'web_url';
      title: string;
      payload?: string;
      url?: string;
    }>
  ): Array<{
    type: 'postback' | 'web_url';
    title: string;
    payload?: string;
    url?: string;
  }> {
    const seen = new Set<string>();
    return buttons.filter(button => {
      const normalizedTitle = button.title.toLowerCase();
      if (seen.has(normalizedTitle)) {
        return false;
      }
      seen.add(normalizedTitle);
      return true;
    });
  }
}