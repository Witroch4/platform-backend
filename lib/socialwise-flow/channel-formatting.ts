/**
 * Channel-Specific Response Formatting for SocialWise Flow
 * Uses centralized specialized formatters from lib/socialwise for robust validation and fallbacks
 * This file acts as an integration layer between the processor and the specialized formatters
 */

import { createLogger } from '@/lib/utils/logger';
import { 
  buildInstagramButtons as buildInstagramButtonsSpecialized,
  buildFacebookTextFallback,
  validateInstagramMessage,
  type InstagramButtonOptions,
  type InstagramMessage
} from '@/lib/socialwise/instagram-formatter';
import { 
  buildButtons as buildWhatsAppButtonsSpecialized,
  buildNumberedTextFallback,
  validateWhatsAppMessage,
  type WhatsAppButtonOptions,
  type WhatsAppMessage
} from '@/lib/socialwise/whatsapp-formatter';
import { 
  clampBody as clampBodyCentralized,
  CHANNEL_LIMITS 
} from '@/lib/socialwise/clamps';

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
 * Platform-specific text limits for different channels
 * Using centralized CHANNEL_LIMITS from socialwise/clamps
 */
export const PLATFORM_LIMITS = {
  WHATSAPP_BODY: CHANNEL_LIMITS.whatsapp.bodyText,
  WHATSAPP_BUTTON_TITLE: CHANNEL_LIMITS.whatsapp.buttonTitle,
  INSTAGRAM_TEXT: CHANNEL_LIMITS.instagram.bodyText,
  INSTAGRAM_BUTTON_TITLE: CHANNEL_LIMITS.instagram.buttonTitle,
  FACEBOOK_TEXT: CHANNEL_LIMITS.facebook.bodyText,
  FACEBOOK_BUTTON_TITLE: CHANNEL_LIMITS.facebook.buttonTitle,
  DEFAULT_BUTTON_TITLE: 20,
  DEFAULT_BODY: CHANNEL_LIMITS.instagram.bodyText // Instagram limit as default (most restrictive)
} as const;

/**
 * Clamp body text to platform-specific limits using centralized function
 */
export function clampBody(text: string, maxLength: number = PLATFORM_LIMITS.DEFAULT_BODY): string {
  // Use centralized clampBody function with appropriate channel type
  if (maxLength === CHANNEL_LIMITS.whatsapp.bodyText) {
    return clampBodyCentralized(text, 'whatsapp');
  } else if (maxLength === CHANNEL_LIMITS.instagram.bodyText) {
    return clampBodyCentralized(text, 'instagram');
  } else if (maxLength === CHANNEL_LIMITS.facebook.bodyText) {
    return clampBodyCentralized(text, 'facebook');
  } else {
    // Fallback to Instagram limits for custom lengths
    return clampBodyCentralized(text, 'instagram');
  }
}

/**
 * Build WhatsApp interactive message with buttons using centralized specialized formatter
 * Integrates with lib/socialwise/whatsapp-formatter.ts for consistent formatting and validation
 */
export function buildWhatsAppButtons(
  bodyText: string,
  buttons: ButtonOption[]
): any {
  // Convert ButtonOption to WhatsAppButtonOptions
  const whatsappButtons: WhatsAppButtonOptions[] = buttons.map(btn => ({
    title: btn.title,
    payload: btn.payload
  }));

  try {
    const result = buildWhatsAppButtonsSpecialized(bodyText, whatsappButtons);
    
    // Validate the result
    const validation = validateWhatsAppMessage(result);
    if (!validation.isValid) {
      formattingLogger.warn('WhatsApp message validation failed, using fallback', {
        violations: validation.violations
      });
      return buildNumberedTextFallback(bodyText, whatsappButtons);
    }

    return result;
  } catch (error) {
    formattingLogger.error('WhatsApp formatter failed, using fallback', { error });
    return buildNumberedTextFallback(bodyText, whatsappButtons);
  }
}

/**
 * Build Instagram button template using centralized specialized formatter
 * Integrates with lib/socialwise/instagram-formatter.ts for consistent formatting and validation
 */
export function buildInstagramButtons(
  text: string,
  buttons: ButtonOption[]
): any {
  // Convert ButtonOption to InstagramButtonOptions
  const instagramButtons: InstagramButtonOptions[] = buttons.map(btn => ({
    title: btn.title,
    payload: btn.payload
  }));

  try {
    const result = buildInstagramButtonsSpecialized(text, instagramButtons);
    
    // Validate the result
    const validation = validateInstagramMessage(result);
    if (!validation.isValid) {
      formattingLogger.warn('Instagram message validation failed, using fallback', {
        violations: validation.violations
      });
      return buildFacebookTextFallback(text, instagramButtons);
    }

    return result;
  } catch (error) {
    formattingLogger.error('Instagram formatter failed, using fallback', { error });
    return buildFacebookTextFallback(text, instagramButtons);
  }
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
      return { whatsapp: { type: 'text', text: { body: clampBodyCentralized(text, 'whatsapp') } } };
    } else if (lowerChannelType.includes('instagram')) {
      return { instagram: { message: { text: clampBodyCentralized(text, 'instagram') } } };
    } else if (lowerChannelType.includes('facebook') || lowerChannelType.includes('messenger')) {
      return { facebook: { message: { text: clampBodyCentralized(text, 'facebook') } } };
    } else {
      return { text: clampBodyCentralized(text, 'facebook') }; // Use Facebook limits as default
    }
  }

  // Build interactive responses with buttons using specialized formatters
  if (lowerChannelType.includes('whatsapp')) {
    const result = buildWhatsAppButtons(text, buttons);
    formattingLogger.info('WhatsApp response built with specialized formatter', {
      hasInteractive: !!result.interactive,
      hasText: !!result.text,
      buttonCount: result.interactive?.action?.buttons?.length || 0
    });
    return { whatsapp: result };
  } else if (lowerChannelType.includes('instagram')) {
    const result = buildInstagramButtons(text, buttons);
    formattingLogger.info('Instagram response built with specialized formatter', {
      hasAttachment: !!result.message?.attachment,
      hasText: !!result.message?.text,
      buttonCount: result.message?.attachment?.payload?.buttons?.length || 0
    });
    return { instagram: result };
  } else if (lowerChannelType.includes('facebook') || lowerChannelType.includes('messenger')) {
    // Facebook Messenger fallback to plain text with options
    const optionsText = buttons.map(btn => `• ${btn.title}`).join('\n');
    const fullText = `${text}\n\n${optionsText}`;
    return { facebook: { message: { text: clampBodyCentralized(fullText, 'facebook') } } };
  } else {
    // Generic text fallback
    const optionsText = buttons.map(btn => `• ${btn.title}`).join('\n');
    const fullText = `${text}\n\n${optionsText}`;
    return { text: clampBodyCentralized(fullText, 'facebook') }; // Use Facebook limits as default
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
    formattingLogger.info('Channel response formatted with specialized formatters', {
      channelType: context.channelType,
      strategy: context.strategy,
      hasWhatsApp: !!response.whatsapp,
      hasInstagram: !!response.instagram,
      hasFacebook: !!response.facebook,
      hasText: !!response.text,
      hasAction: !!response.action,
      formatterType: 'specialized'
    });
  } catch (error) {
    // Ignore logging errors
  }
}

// Re-export specialized formatter functions for direct access if needed
export { 
  buildInstagramButtons as buildInstagramButtonsDirect,
  validateInstagramMessage
} from '@/lib/socialwise/instagram-formatter';
export { 
  buildButtons as buildWhatsAppButtonsDirect,
  validateWhatsAppMessage
} from '@/lib/socialwise/whatsapp-formatter';