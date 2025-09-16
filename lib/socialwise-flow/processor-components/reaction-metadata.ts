/**
 * SocialWise Flow Reaction Metadata Application
 * Handles applying reaction metadata to responses for different channels
 */

import { createLogger } from '@/lib/utils/logger';
import { ChannelResponse } from '../channel-formatting';
import { ButtonReactionMeta } from './button-reactions';
import { isWhatsAppChannel, isInstagramChannel } from './utils';

const reactionLogger = createLogger('SocialWise-Processor-ReactionMetadata');

/**
 * Apply WhatsApp reaction metadata to the response
 * Creates a modified response for WhatsApp reactions (emoji reactions + text responses)
 */
export function applyWhatsAppReactionMeta(response: ChannelResponse, reactionMeta: ButtonReactionMeta): any {
  // For text reactions, return a simple text response
  if (reactionMeta.textReaction && reactionMeta.textReaction.trim()) {
    reactionLogger.info('Applied text reaction to WhatsApp response', {
      textReaction: reactionMeta.textReaction,
      originalText: response.text
    });

    // Return a simple text response for WhatsApp
    return {
      fulfillmentMessages: [
        {
          text: {
            text: [reactionMeta.textReaction]
          }
        }
      ]
    };
  }

  // For emoji reactions, return the standard response format with WhatsApp metadata
  if (reactionMeta.reaction && reactionMeta.replyToMessageId) {
    reactionLogger.info('Applied WhatsApp reaction meta to response', {
      reaction: reactionMeta.reaction,
      emoji: reactionMeta.reactionEmoji,
      replyToMessageId: reactionMeta.replyToMessageId
    });

    // Create response with WhatsApp reaction metadata
    const responseText = response.text ||
                        ((response.whatsapp as any)?.interactive?.body?.text) ||
                        '👍';

    return {
      fulfillmentMessages: [
        {
          payload: {
            socialwiseResponse: {
              message_format: 'REACTION',
              payload: {
                text: responseText,
                emoji: reactionMeta.reactionEmoji,
                message_id: reactionMeta.replyToMessageId
              }
            },
            meta: {
              whatsapp: {
                reply_to_message_id: reactionMeta.replyToMessageId,
                sender_action: {
                  type: 'react',
                  emoji: reactionMeta.reactionEmoji
                }
              }
            }
          }
        }
      ]
    };
  }

  // If no reaction metadata, return the original response
  return response;
}

/**
 * Apply Instagram reaction metadata to the response
 * Creates a modified response for Instagram reactions (emoji reactions + text responses)
 */
export function applyInstagramReactionMeta(response: ChannelResponse, reactionMeta: ButtonReactionMeta): any {
  // For text reactions, return a simple text response
  if (reactionMeta.textReaction && reactionMeta.textReaction.trim()) {
    reactionLogger.info('Applied text reaction to Instagram response', {
      textReaction: reactionMeta.textReaction,
      originalText: response.text
    });

    // Return a simple text response for Instagram
    return {
      fulfillmentMessages: [
        {
          text: {
            text: [reactionMeta.textReaction]
          }
        }
      ]
    };
  }

  // For emoji reactions, return the standard response format with Instagram metadata
  if (reactionMeta.reaction && reactionMeta.replyToMessageId) {
    reactionLogger.info('Applied Instagram reaction meta to response', {
      reaction: reactionMeta.reaction,
      emoji: reactionMeta.reactionEmoji,
      replyToMessageId: reactionMeta.replyToMessageId
    });

    // Create response with Instagram reaction metadata
    const responseText = response.text ||
                        ((response.instagram as any)?.text) ||
                        '👍';

    return {
      fulfillmentMessages: [
        {
          payload: {
            socialwiseResponse: {
              message_format: 'TEXT',
              payload: {
                text: responseText
              }
            },
            meta: {
              instagram: {
                reply_to_message_id: reactionMeta.replyToMessageId,
                sender_action: {
                  type: 'react',
                  reaction: reactionMeta.reaction,
                  emoji: reactionMeta.reactionEmoji
                }
              }
            }
          }
        }
      ]
    };
  }

  // If no reaction metadata, return the original response
  return response;
}

/**
 * Apply reaction metadata based on channel type
 */
export function applyReactionMetadata(
  response: ChannelResponse,
  reactionMeta: ButtonReactionMeta,
  channelType: string
): any {
  if (isInstagramChannel(channelType)) {
    return applyInstagramReactionMeta(response, reactionMeta);
  } else if (isWhatsAppChannel(channelType)) {
    return applyWhatsAppReactionMeta(response, reactionMeta);
  }

  // For unsupported channels, return original response
  return response;
}