/**
 * Channel-Specific Response Formatting for SocialWise Flow
 * Implements centralized clamps and validation utilities
 */

import { createLogger } from '@/lib/utils/logger';

const formattingLogger = createLogger('SocialWise-Formatting');

export interface ButtonOption {
  title: string;
  payload: string;
}

export interface ChannelResponse {
  whatsapp?: any;
  instagram?: any;
  facebook?: { message: { text: string } };
  text?: string;
  action?: 'handoff';
}

/**
 * Clamp title to maximum length with word boundary respect
 */
export function clampTitle(text: string, maxLength = 20): string {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  
  const cut = clean.slice(0, maxLength + 1);
  const lastSpace = cut.lastIndexOf(' ');
  
  if (lastSpace > 0 && lastSpace >= maxLength - 8) {
    return cut.slice(0, lastSpace).trim();
  }
  
  return clean.slice(0, maxLength).trim();
}

/**
 * Clamp body text to maximum length
 */
export function clampBody(text: string, maxLength = 1024): string {
  const clean = String(text || '').trim();
  return clean.length <= maxLength ? clean : clean.slice(0, maxLength).trimEnd();
}

/**
 * Validate payload format against regex pattern
 */
export function validatePayload(payload: string): boolean {
  const pattern = /^@[a-z0-9_]+$/;
  return pattern.test(payload);
}

/**
 * Sanitize payload to match required format
 */
export function sanitizePayload(payload: string): string {
  let clean = String(payload || '').toLowerCase().trim();
  
  // Remove existing @ prefix if present
  if (clean.startsWith('@')) {
    clean = clean.slice(1);
  }
  
  // Replace invalid characters with underscores
  clean = clean.replace(/[^a-z0-9_]/g, '_');
  
  // Remove multiple consecutive underscores
  clean = clean.replace(/_+/g, '_');
  
  // Remove leading/trailing underscores
  clean = clean.replace(/^_+|_+$/g, '');
  
  // Ensure it's not empty
  if (!clean) {
    clean = 'unknown';
  }
  
  return `@${clean}`;
}

/**
 * Build WhatsApp interactive message with buttons
 */
export function buildWhatsAppButtons(
  bodyText: string,
  buttons: ButtonOption[]
): any {
  const clampedBody = clampBody(bodyText, 1024);
  const validButtons = buttons.slice(0, 3).map(btn => ({
    type: 'reply',
    reply: {
      id: clampTitle(sanitizePayload(btn.payload), 256),
      title: clampTitle(btn.title, 20)
    }
  }));

  return {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: clampedBody },
      action: { buttons: validButtons }
    }
  };
}

/**
 * Build Instagram button template
 */
export function buildInstagramButtons(
  text: string,
  buttons: ButtonOption[]
): any {
  const clampedText = clampBody(text, 640);
  const validButtons = buttons.slice(0, 3).map(btn => ({
    type: 'postback',
    title: clampTitle(btn.title, 20),
    payload: clampTitle(sanitizePayload(btn.payload), 1000)
  }));

  return {
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text: clampedText,
          buttons: validButtons
        }
      }
    }
  };
}

/**
 * Build channel-specific response based on channel type
 */
export function buildChannelResponse(
  channelType: string,
  text: string,
  buttons?: ButtonOption[]
): ChannelResponse {
  const lowerChannelType = (channelType || '').toLowerCase();
  
  // Handle handoff keywords
  const lowerText = (text || '').toLowerCase();
  if (lowerText.includes('atendente') || lowerText.includes('humano') || lowerText.includes('falar')) {
    return { action: 'handoff' };
  }

  // If no buttons, return simple text response
  if (!buttons || buttons.length === 0) {
    if (lowerChannelType.includes('whatsapp')) {
      return { whatsapp: { type: 'text', text: { body: clampBody(text, 1024) } } };
    } else if (lowerChannelType.includes('instagram')) {
      return { instagram: { message: { text: clampBody(text, 640) } } };
    } else if (lowerChannelType.includes('facebook') || lowerChannelType.includes('messenger')) {
      return { facebook: { message: { text: clampBody(text, 2000) } } };
    } else {
      return { text: clampBody(text, 2000) };
    }
  }

  // Build interactive responses with buttons
  if (lowerChannelType.includes('whatsapp')) {
    return { whatsapp: buildWhatsAppButtons(text, buttons) };
  } else if (lowerChannelType.includes('instagram')) {
    return { instagram: buildInstagramButtons(text, buttons) };
  } else if (lowerChannelType.includes('facebook') || lowerChannelType.includes('messenger')) {
    // Facebook Messenger fallback to plain text with options
    const optionsText = buttons.map(btn => `• ${btn.title}`).join('\n');
    const fullText = `${text}\n\n${optionsText}`;
    return { facebook: { message: { text: clampBody(fullText, 2000) } } };
  } else {
    // Generic text fallback
    const optionsText = buttons.map(btn => `• ${btn.title}`).join('\n');
    const fullText = `${text}\n\n${optionsText}`;
    return { text: clampBody(fullText, 2000) };
  }
}

/**
 * Build default legal domain topics for LOW band
 */
export function buildDefaultLegalTopics(channelType: string): ChannelResponse {
  const defaultButtons: ButtonOption[] = [
    { title: 'Direito Civil', payload: '@direito_civil' },
    { title: 'Direito Trabalhista', payload: '@direito_trabalhista' },
    { title: 'Outros assuntos', payload: '@outros_assuntos' }
  ];

  return buildChannelResponse(
    channelType,
    'Posso ajudar com qual área do direito?',
    defaultButtons
  );
}

/**
 * Build graceful degradation response when LLM fails
 */
export function buildFallbackResponse(
  channelType: string,
  userText: string
): ChannelResponse {
  const fallbackButtons: ButtonOption[] = [
    { title: 'Consulta jurídica', payload: '@consulta_juridica' },
    { title: 'Documentos', payload: '@documentos' },
    { title: 'Falar com atendente', payload: '@handoff_human' }
  ];

  return buildChannelResponse(
    channelType,
    'Como posso ajudar você hoje?',
    fallbackButtons
  );
}

/**
 * Log response formatting for debugging
 */
export function logChannelResponse(
  response: ChannelResponse,
  context: { channelType: string; strategy: string }
): void {
  try {
    formattingLogger.info('Channel response formatted', {
      channelType: context.channelType,
      strategy: context.strategy,
      hasWhatsApp: !!response.whatsapp,
      hasInstagram: !!response.instagram,
      hasFacebook: !!response.facebook,
      hasText: !!response.text,
      hasAction: !!response.action
    });
  } catch (error) {
    // Ignore logging errors
  }
}