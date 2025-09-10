/**
 * Channel-Specific Response Formatting for SocialWise Flow
 * Usa formatadores especializados centralizados (lib/socialwise) com validação e fallbacks robustos.
 * Este arquivo é a camada de integração entre o processador e os formatadores específicos por canal.
 */

import { createLogger } from '@/lib/utils/logger';
import {
  buildInstagramButtons as buildInstagramButtonsSpecialized,
  buildInstagramTextFallback,
  validateInstagramMessage,
  type InstagramButtonOptions,
  type InstagramMessage,
} from '@/lib/socialwise/instagram-formatter';
import {
  buildButtons as buildWhatsAppButtonsSpecialized,
  buildNumberedTextFallback,
  validateWhatsAppMessage,
  type WhatsAppButtonOptions,
  type WhatsAppMessage,
} from '@/lib/socialwise/whatsapp-formatter';
import {
  clampBody as clampBodyCentralized,
  CHANNEL_LIMITS,
} from '@/lib/socialwise/clamps';

const formattingLogger = createLogger('SocialWise-Formatting');

export interface ButtonOption {
  title: string;
  payload: string;
}

export interface ChannelResponse {
  whatsapp?: WhatsAppMessage;
  instagram?: InstagramMessage;
  facebook?: InstagramMessage | { message: { text: string } }; // Suporta estrutura complexa como Instagram OU simples
  text?: string;
  action?: 'handoff';
}

/**
 * Limites específicos por plataforma (proxy de CHANNEL_LIMITS)
 */
export const PLATFORM_LIMITS = {
  WHATSAPP_BODY: CHANNEL_LIMITS.whatsapp.bodyText,
  WHATSAPP_BUTTON_TITLE: CHANNEL_LIMITS.whatsapp.buttonTitle,
  INSTAGRAM_TEXT: CHANNEL_LIMITS.instagram.bodyText,
  INSTAGRAM_BUTTON_TITLE: CHANNEL_LIMITS.instagram.buttonTitle,
  FACEBOOK_TEXT: CHANNEL_LIMITS.facebook.bodyText,
  FACEBOOK_BUTTON_TITLE: CHANNEL_LIMITS.facebook.buttonTitle,
  DEFAULT_BUTTON_TITLE: 20,
  DEFAULT_BODY: CHANNEL_LIMITS.instagram.bodyText, // Instagram como padrão (mais restritivo)
} as const;

/**
 * Clamp de body com canal apropriado
 */
export function clampBody(
  text: string,
  maxLength: number = PLATFORM_LIMITS.DEFAULT_BODY
): string {
  if (maxLength === CHANNEL_LIMITS.whatsapp.bodyText) {
    return clampBodyCentralized(text, 'whatsapp');
  } else if (maxLength === CHANNEL_LIMITS.instagram.bodyText) {
    return clampBodyCentralized(text, 'instagram');
  } else if (maxLength === CHANNEL_LIMITS.facebook.bodyText) {
    return clampBodyCentralized(text, 'facebook');
  } else {
    // Fallback para Instagram (padrão mais restritivo)
    return clampBodyCentralized(text, 'instagram');
  }
}

/**
 * Monta mensagem interativa de WhatsApp usando o formatter especializado
 */
export function buildWhatsAppButtons(
  bodyText: string,
  buttons: ButtonOption[]
): WhatsAppMessage {
  const whatsappButtons: WhatsAppButtonOptions[] = buttons.map((btn) => ({
    title: btn.title,
    payload: btn.payload,
  }));

  try {
    const result = buildWhatsAppButtonsSpecialized(bodyText, whatsappButtons);

    // Validação
    const validation = validateWhatsAppMessage(result);
    if (!validation.isValid) {
      formattingLogger.warn('WhatsApp message validation failed, using fallback', {
        violations: validation.violations,
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
 * Monta template de botões do Instagram usando o formatter especializado
 */
export function buildInstagramButtons(
  text: string,
  buttons: ButtonOption[]
): InstagramMessage {
  const instagramButtons: InstagramButtonOptions[] = buttons.map((btn) => ({
    title: btn.title,
    payload: btn.payload,
  }));

  try {
    const result = buildInstagramButtonsSpecialized(text, instagramButtons);

    // Validação
    const validation = validateInstagramMessage(result);
    if (!validation.isValid) {
      formattingLogger.warn('Instagram message validation failed, using fallback', {
        violations: validation.violations,
      });
      return buildInstagramTextFallback(text, instagramButtons);
    }

    return result;
  } catch (error) {
    formattingLogger.error('Instagram formatter failed, using fallback', { error });
    return buildInstagramTextFallback(text, instagramButtons);
  }
}

/**
 * Constrói a resposta por canal (texto simples ou interativo com botões)
 */
export function buildChannelResponse(
  channelType: string,
  text: string,
  buttons?: ButtonOption[]
): ChannelResponse {
  const lowerChannelType = (channelType || '').toLowerCase();

  // Palavras-chave para handoff - mas NÃO se há botões válidos
  const lowerText = (text || '').toLowerCase();
  const hasHandoffKeywords = lowerText.includes('atendente') ||
                           lowerText.includes('humano') ||
                           lowerText.includes('falar');
  
  // Se há botões válidos, não fazer handoff automático mesmo com palavras-chave
  if (hasHandoffKeywords && (!buttons || buttons.length === 0)) {
    formattingLogger.info('🚨 HANDOFF AUTOMÁTICO DETECTADO', {
      originalText: text,
      triggerWord: lowerText.includes('atendente') ? 'atendente' : 
                   lowerText.includes('humano') ? 'humano' : 'falar',
      reason: 'Palavras-chave de handoff sem botões alternativos'
    });
    return { action: 'handoff' };
  } else if (hasHandoffKeywords && buttons && buttons.length > 0) {
    formattingLogger.info('⚠️ HANDOFF KEYWORDS IGNORADAS - BOTÕES PRESENTES', {
      originalText: text,
      triggerWord: lowerText.includes('atendente') ? 'atendente' : 
                   lowerText.includes('humano') ? 'humano' : 'falar',
      buttonCount: buttons.length,
      reason: 'Botões válidos previnem handoff automático'
    });
  }

  // Sem botões → texto simples do canal
  if (!buttons || buttons.length === 0) {
    if (lowerChannelType.includes('whatsapp')) {
      return {
        whatsapp: {
          type: 'text',
          text: { body: clampBodyCentralized(text, 'whatsapp') },
        },
      };
    } else if (lowerChannelType.includes('instagram')) {
      return {
        instagram: { message: { text: clampBodyCentralized(text, 'instagram') } },
      };
    } else if (
      lowerChannelType.includes('facebook') ||
      lowerChannelType.includes('messenger')
    ) {
      return { facebook: { message: { text: clampBodyCentralized(text, 'facebook') } } };
    } else {
      // Genérico (usa limite do Facebook por ser mais permissivo)
      return { text: clampBodyCentralized(text, 'facebook') };
    }
  }

  // Com botões → usar formatters especializados
  if (lowerChannelType.includes('whatsapp')) {
    const result = buildWhatsAppButtons(text, buttons);
    formattingLogger.info('WhatsApp response built with specialized formatter', {
      hasInteractive: (result as any)?.interactive != null,
      hasText: (result as any)?.text != null,
      buttonCount: (result as any)?.interactive?.action?.buttons?.length || 0,
    });
    return { whatsapp: result };
  } else if (lowerChannelType.includes('instagram')) {
    const result = buildInstagramButtons(text, buttons);
    formattingLogger.info('Instagram response built with specialized formatter', {
      hasAttachment: (result as any)?.message_format != null,
      hasText: (result as any)?.text != null,
      buttonCount: (result as any)?.buttons?.length || 0,
    });
    return { instagram: result };
  } else if (
    lowerChannelType.includes('facebook') ||
    lowerChannelType.includes('messenger')
  ) {
    // CORREÇÃO: Facebook Page segue as MESMAS regras do Instagram
    const result = buildInstagramButtons(text, buttons);
    formattingLogger.info('Facebook response built with Instagram formatter (same rules)', {
      hasAttachment: (result as any)?.message_format != null,
      hasText: (result as any)?.text != null,
      buttonCount: (result as any)?.buttons?.length || 0,
      channelType: lowerChannelType
    });
    return { facebook: result };
  } else {
    // Genérico (texto com opções)
    const optionsText = buttons.map((btn) => `• ${btn.title}`).join('\n');
    const fullText = `${text}\n\n${optionsText}`;
    return { text: clampBodyCentralized(fullText, 'facebook') };
  }
}

/**
 * Tópicos padrão (LOW band) para domínio jurídico
 */
export function buildDefaultLegalTopics(channelType: string): ChannelResponse {
  const defaultButtons: ButtonOption[] = [
    { title: 'Direito Civil', payload: '@direito_civil' },
    { title: 'Direito Trabalhista', payload: '@direito_trabalhista' },
    { title: 'Outros assuntos', payload: '@outros_assuntos' },
  ];

  return buildChannelResponse(
    channelType,
    'Posso ajudar com qual área do direito?',
    defaultButtons
  );
}

/**
 * Degradação graciosa quando a LLM falha
 */
export function buildFallbackResponse(
  channelType: string,
  userText: string
): ChannelResponse {
  const fallbackButtons: ButtonOption[] = [
    { title: 'Consulta jurídica', payload: '@consulta_juridica' },
    { title: 'Documentos', payload: '@documentos' },
    { title: 'Falar com atendente', payload: '@falar_atendente' },
  ];

  return buildChannelResponse(
    channelType,
    'Como posso ajudar você hoje?',
    fallbackButtons
  );
}

/**
 * Log estruturado da resposta por canal
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
      formatterType: 'specialized',
    });
  } catch {
    // Ignora erros de logging
  }
}

// Re-export dos formatters especializados (caso precise acessar direto)
export {
  buildInstagramButtons as buildInstagramButtonsDirect,
  validateInstagramMessage,
} from '@/lib/socialwise/instagram-formatter';
export {
  buildButtons as buildWhatsAppButtonsDirect,
  validateWhatsAppMessage,
} from '@/lib/socialwise/whatsapp-formatter';
