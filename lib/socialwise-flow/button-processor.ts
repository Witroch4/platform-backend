/**
 * SocialWise Flow Button Processor
 * Centralized button detection, processing and response generation
 * Respects webhook-only pattern (no direct API calls)
 */

import { createLogger } from '@/lib/utils/logger';
import { getReactionByButtonId, formatReactionData } from '@/lib/button-reaction-queries';
import { getPrismaInstance } from '@/lib/connections';

const logger = createLogger('SocialWiseButtonProcessor');

export interface ButtonDetectionResult {
  isButtonClick: boolean;
  buttonId: string | null;
  buttonTitle: string | null;
  detectionSource: string;
}

export interface ButtonProcessingContext {
  channelType: string;
  userId: string | undefined;
  traceId: string;
  validPayload: any;
}

export interface ButtonReactionResponse {
  action_type: 'button_reaction';
  buttonId: string;
  processed: boolean;
  mappingFound: boolean;
  emoji?: string;
  text?: string;
  action?: string; // "handoff", "end_conversation", etc.
  whatsapp?: {
    message_id: string;
    reaction_emoji?: string;
    response_text?: string;
  };
  instagram?: {
    message_id: string;
    reaction_emoji?: string;
    response_text?: string;
  };
  error?: string;
}

/**
 * Detectar cliques de botão de forma robusta para múltiplos canais
 * Usa fallbacks dos campos padrão do context quando socialwise-chatwit não existe
 */
export function detectButtonClick(validPayload: any, channelType: string): ButtonDetectionResult {
  const ca = validPayload.context.message?.content_attributes || {};
  const context = validPayload.context;
  
  // Dados socialwise-chatwit (opcionais)
  const socialwiseData = context['socialwise-chatwit'];
  const swInteractive = socialwiseData?.message_data?.interactive_data || {};
  const swInstagram = socialwiseData?.message_data?.instagram_data || {};

  let isButtonClick = false;
  let buttonId: string | null = null;
  let buttonTitle: string | null = null;
  let detectionSource = '';

  // Meta Platforms (Instagram + Facebook): detectar postback_payload e quick_reply_payload
  if (channelType.toLowerCase().includes('instagram') || channelType.toLowerCase().includes('facebook')) {
    const interactionType = context?.interaction_type || swInstagram?.interaction_type;
    const platformName = channelType.toLowerCase().includes('instagram') ? 'instagram' : 'facebook';
    
    // Meta Postback (botões template)
    if (interactionType === 'postback') {
      const postbackPayload = ca?.postback_payload || 
                             context?.postback_payload || 
                             swInstagram?.postback_payload;
      
      if (postbackPayload) {
        isButtonClick = true;
        buttonId = postbackPayload;
        buttonTitle = validPayload.message; // O texto do botão sempre está em message
        detectionSource = `${platformName}_postback`;
      }
    }
    
    // Meta Quick Reply (respostas rápidas)
    if (interactionType === 'quick_reply') {
      const quickReplyPayload = ca?.quick_reply_payload || 
                               context?.quick_reply_payload ||
                               swInstagram?.quick_reply_payload;
      
      if (quickReplyPayload) {
        isButtonClick = true;
        buttonId = quickReplyPayload;
        buttonTitle = validPayload.message; // O texto do botão sempre está em message
        detectionSource = `${platformName}_quick_reply`;
      }
    }
  }

  // WhatsApp: detectar button_reply
  if (channelType.toLowerCase().includes('whatsapp')) {
    // Priority: content_attributes.button_reply > socialwise-chatwit
    const buttonReply = ca?.button_reply;
    const interactionType = ca?.interaction_type || context?.interaction_type;
    
    if (buttonReply?.id && interactionType === 'button_reply') {
      isButtonClick = true;
      buttonId = buttonReply.id;
      buttonTitle = buttonReply.title || validPayload.message; // Fallback para message
      detectionSource = 'whatsapp_button_reply';
    }
  }

  // Fallback detection para outros formatos ou legacy
  if (!isButtonClick) {
    // Tentar detectar pelos campos do context
    const fallbackButtonId = context?.button_id || 
                            context?.postback_payload ||
                            swInteractive?.button_id || 
                            ca?.interactive_payload?.button_reply?.id;
    
    if (fallbackButtonId) {
      isButtonClick = true;
      buttonId = fallbackButtonId;
      buttonTitle = context?.button_title || 
                   swInteractive?.button_title || 
                   ca?.interactive_payload?.button_reply?.title || 
                   validPayload.message; // Sempre usar message como fallback
      detectionSource = 'fallback_detection';
    }
  }

  return {
    isButtonClick,
    buttonId,
    buttonTitle,
    detectionSource
  };
}

/**
 * Processar clique de botão e retornar resposta estruturada
 */
export async function processButtonClick(
  buttonDetection: ButtonDetectionResult,
  context: ButtonProcessingContext,
  wamid: string
): Promise<ButtonReactionResponse | null> {
  const { buttonId } = buttonDetection;
  const { channelType, userId, traceId } = context;

  if (!buttonId) {
    throw new Error('ButtonId is required for processing');
  }

  logger.info('🚀 Processing button click', {
    buttonId,
    buttonTitle: buttonDetection.buttonTitle,
    channelType,
    detectionSource: buttonDetection.detectionSource,
    traceId
  });

  try {
    // ⚡ MAPEAMENTO AUTOMÁTICO: @falar_atendente -> handoff nativo
    if (buttonId === '@falar_atendente') {
      logger.info('🚨 HANDOFF AUTOMÁTICO: @falar_atendente detectado', {
        buttonId,
        channelType,
        traceId
      });
      
      return {
        action_type: 'button_reaction',
        buttonId: buttonId,
        processed: true,
        mappingFound: true,
        action: 'handoff'
      };
    }

    // Buscar reação usando button-reaction-queries
    const buttonReaction = await getReactionByButtonId(buttonId, userId || '');

    if (buttonReaction) {
      logger.info('✅ Button reaction found', {
        buttonId,
        reactionId: buttonReaction.id,
        actionType: buttonReaction.actionType,
        hasEmoji: !!buttonReaction.actionPayload.emoji,
        hasTextReaction: !!buttonReaction.actionPayload.textReaction,
        hasAction: !!buttonReaction.actionPayload.action,
        traceId
      });

      // 🔧 USAR formatReactionData para resposta padronizada
      const response = formatReactionData(buttonReaction, channelType, wamid);

      logger.info('🎯 Button reaction response prepared', {
        buttonId,
        hasEmoji: !!response.emoji,
        hasText: !!response.text,
        hasAction: !!response.action,
        actionType: response.action_type,
        traceId
      });

      return response;

    } else {
      // Sem mapeamento: retorna null para permitir fallback para LLM
      logger.info('⚠️ No button reaction found, continuing to LLM processing', {
        buttonId,
        channelType,
        userId,
        traceId
      });

      return null; // Permite fallback para SocialWise Flow Processor
    }

  } catch (error) {
    logger.error('❌ Error processing button click', {
      error: error instanceof Error ? error.message : String(error),
      buttonId,
      channelType,
      traceId
    });

    // Fallback para erro
    return {
      action_type: 'button_reaction',
      buttonId: buttonId,
      emoji: '👍',
      processed: true,
      mappingFound: false,
      error: 'processing_failed'
    };
  }
}

/**
 * Função principal: detectar e processar clique de botão
 */
export async function handleButtonInteraction(
  validPayload: any,
  channelType: string,
  userId: string | undefined,
  wamid: string,
  traceId: string
): Promise<ButtonReactionResponse | null> {
  // Detectar clique de botão
  const buttonDetection = detectButtonClick(validPayload, channelType);
  
  if (!buttonDetection.isButtonClick || !buttonDetection.buttonId) {
    return null; // Não é um clique de botão
  }

  // Processar clique
  const context: ButtonProcessingContext = {
    channelType,
    userId,
    traceId,
    validPayload
  };

  return await processButtonClick(buttonDetection, context, wamid);
}
