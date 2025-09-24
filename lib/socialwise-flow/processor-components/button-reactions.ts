/**
 * SocialWise Flow Button Reaction Processing
 * Handles button click detection and reaction mapping for all supported channels
 */

import { createLogger } from '@/lib/utils/logger';
import { getPrismaInstance } from '@/lib/connections';
import { isWhatsAppChannel, isInstagramChannel, isFacebookChannel, mapEmojiToInstagramReaction } from './utils';

const buttonLogger = createLogger('SocialWise-Processor-ButtonReactions');

export interface ProcessorContext {
  userText: string;
  channelType: string;
  inboxId: string;
  chatwitAccountId?: string;
  userId?: string;
  wamid?: string;
  traceId?: string;
  contactName?: string;
  contactPhone?: string;
  assistantId?: string;
  originalPayload?: any;
  sessionId?: string;
  agentSupplement?: string;
}

export interface ButtonReactionMeta {
  replyToMessageId?: string;
  reaction?: 'love' | 'like' | 'haha' | 'wow' | 'sad' | 'angry';
  reactionEmoji?: string;
  textReaction?: string;
  mappingFound?: boolean;
  shouldContinueProcessing?: boolean;
}

/**
 * Detect and process button reactions for Instagram, Facebook and WhatsApp
 * Based on legacy WhatsApp button processor logic
 */
export async function processButtonReaction(context: ProcessorContext): Promise<ButtonReactionMeta | undefined> {
  if (!context.originalPayload) return undefined;

  const payload = context.originalPayload;

  // Detecta se é clique de botão baseado na estrutura real do Chatwit
  let isButton = false;
  let buttonId: string | undefined;

  if (isWhatsAppChannel(context.channelType)) {
    // WhatsApp: verifica button_reply em content_attributes ou na raiz
    isButton = !!(payload.context?.message?.content_attributes?.button_reply?.id ||
                  payload.button_id);
    buttonId = payload.context?.message?.content_attributes?.button_reply?.id ||
               payload.button_id;
  } else if (isInstagramChannel(context.channelType) || isFacebookChannel(context.channelType)) {
    // Instagram/Facebook: verifica postback_payload em content_attributes ou na raiz
    isButton = !!(payload.context?.message?.content_attributes?.postback_payload ||
                  payload.postback_payload) &&
               (payload.interaction_type === 'postback');
    buttonId = payload.context?.message?.content_attributes?.postback_payload ||
               payload.postback_payload;
  }

  if (!isButton || !buttonId) return undefined;

  // Para reply context, usar source_id da mensagem original
  const replyToMessageId = payload.context?.message?.source_id ||
                          payload.context?.wamid ||
                          payload.wamid;

  if (!context.inboxId) return {
    replyToMessageId,
    mappingFound: false,
    shouldContinueProcessing: true
  };

  try {
    const prisma = getPrismaInstance();

    // Busca mapeamento do botão no banco (usando inboxId interno do ChatwitInbox)
    const mapping = await prisma.mapeamentoBotao.findFirst({
      where: {
        buttonId,
        inbox: {
          inboxId: context.inboxId // inboxId é o campo externo (105, etc)
        }
      },
    });

    // Se não há mapeamento, sinaliza para continuar processamento com LLM
    if (!mapping || !mapping.actionPayload) {
      buttonLogger.info('Button not mapped, continuing to LLM processing', {
        buttonId,
        inboxId: context.inboxId,
        traceId: context.traceId
      });

      return {
        replyToMessageId,
        mappingFound: false,
        shouldContinueProcessing: true
      };
    }

    // Extrai dados de reação do actionPayload
    const actionPayload: any = mapping.actionPayload || {};
    const emoji = typeof actionPayload.emoji === 'string' ? actionPayload.emoji.trim() : '';
    const textReaction = typeof actionPayload.textReaction === 'string' ? actionPayload.textReaction.trim() : '';

    // Mapeia emoji para reação Instagram
    const reaction = mapEmojiToInstagramReaction(emoji);

    buttonLogger.info('Button reaction mapped successfully', {
      buttonId,
      inboxId: context.inboxId,
      channelType: context.channelType,
      emoji,
      textReaction,
      reaction,
      replyToMessageId,
      traceId: context.traceId
    });

    return {
      replyToMessageId,
      reaction: reaction || undefined,
      reactionEmoji: emoji || undefined,
      textReaction: textReaction || undefined,
      mappingFound: true,
      shouldContinueProcessing: false // Não continua processamento quando há mapeamento
    };

  } catch (error) {
    buttonLogger.error('Error processing button reaction', {
      error: error instanceof Error ? error.message : String(error),
      buttonId,
      inboxId: context.inboxId,
      traceId: context.traceId
    });

    // Em caso de erro, continua para LLM
    return {
      replyToMessageId,
      mappingFound: false,
      shouldContinueProcessing: true
    };
  }
}
