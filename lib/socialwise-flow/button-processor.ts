/**
 * SocialWise Flow Button Processor
 * Centralized button detection, processing and response generation
 * Respects webhook-only pattern (no direct API calls)
 */

import { createLogger } from '@/lib/utils/logger';
import { getReactionByButtonId, formatReactionData } from '@/lib/button-reaction-queries';
import { METAPayloadBuilder } from '@/lib/socialwise-flow/meta-payload-builder';
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
  facebook?: {
    message_id: string;
    reaction_emoji?: string;
    response_text?: string;
  };
  error?: string;
  mapped?: {
    whatsapp?: any;
    instagram?: any;
    facebook?: any;
  };
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
  const { channelType, userId, traceId, validPayload } = context;

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

      // Base response com reações emoji/text/action
      const response = formatReactionData(buttonReaction, channelType, wamid) as ButtonReactionResponse;

      // Se houver ação send_*, anexar payload mapeado mantendo as reações
      const actionStr = (buttonReaction.actionPayload as any)?.action as string | undefined;
      const parsed = parseActionCommand(actionStr);
      if (parsed) {
        const mapped = await buildActionSendPayload(parsed, channelType, wamid, validPayload, traceId, buttonId);
        if (mapped) {
          response.mapped = { ...(response.mapped || {}), ...mapped };
          logger.info('📦 Built send payload from action (merged with reactions)', { kind: parsed.kind, id: parsed.id, channelType, traceId });
        }
      }

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
 * Parse action commands like: send_template:<id> or send_interactive:<id>
 */
function parseActionCommand(action?: string): { kind: 'send_template' | 'send_interactive'; id: string } | null {
  if (!action || typeof action !== 'string') return null;
  const s = action.trim();
  if (s.startsWith('send_template:')) {
    return { kind: 'send_template', id: s.slice('send_template:'.length) };
  }
  if (s.startsWith('send_interactive:')) {
    return { kind: 'send_interactive', id: s.slice('send_interactive:'.length) };
  }
  return null;
}

/**
 * Build channel-specific payload for send_* actions
 */
async function buildActionSendPayload(
  parsed: { kind: 'send_template' | 'send_interactive'; id: string },
  channelType: string,
  wamid: string,
  validPayload: any,
  traceId: string,
  originalButtonId: string
): Promise<{ whatsapp?: any; instagram?: any; facebook?: any } | null> {
  const inboxId = extractInboxIdFromPayload(validPayload);
  if (!inboxId) {
    logger.warn('No inboxId resolved from payload; cannot build variables context', { traceId });
  }

  try {
    const prisma = getPrismaInstance();
    // Try resolve template by id or metaTemplateId
    const template = await prisma.template.findFirst({
      where: parsed.kind === 'send_template'
        ? {
            OR: [
              { id: parsed.id },
              { whatsappOfficialInfo: { is: { metaTemplateId: parsed.id } } },
            ],
          }
        : { id: parsed.id },
      include: {
        whatsappOfficialInfo: true,
        interactiveContent: {
          include: {
            header: true,
            body: true,
            footer: true,
            actionCtaUrl: true,
            actionReplyButton: true,
            actionList: true,
            actionFlow: true,
            actionLocationRequest: true,
          },
        },
      },
    });

    if (!template) {
      logger.warn('Template not found for action send', { parsed, traceId });
      return null;
    }

    const builder = new METAPayloadBuilder();

    // Extract webhook context for variable resolution
    const webhookContext = {
      contactPhone: validPayload?.context?.contact_phone || validPayload?.context?.contact_source,
      contactName: validPayload?.context?.contact_name,
      wamid: validPayload?.context?.wamid,
    };

    if (inboxId) {
      await builder.setVariablesFromInboxId(String(inboxId), webhookContext);
    }
    builder.setChannelType(channelType);

    const lower = (channelType || '').toLowerCase();

    if (lower.includes('whatsapp')) {
      // Build WhatsApp payloads
      if (parsed.kind === 'send_template' && template.whatsappOfficialInfo) {
        const wi: any = template.whatsappOfficialInfo as any;
        const language: string = (wi && typeof wi.language === 'string') ? wi.language : 'pt_BR';
        const components: any[] = Array.isArray(wi?.components) ? wi.components : [];
        const metaTemplateId: string | undefined = typeof wi?.metaTemplateId === 'string' ? wi.metaTemplateId : undefined;
        const payload = await builder.buildTemplatePayload(
          template.name || 'default',
          language,
          components,
          metaTemplateId
        );
        return { whatsapp: payload } as any;
      }
      if (parsed.kind === 'send_interactive' && template.interactiveContent) {
        const interactive = await builder.buildInteractiveMessagePayload(template.interactiveContent);
        return { whatsapp: { type: 'interactive', interactive } } as any;
      }
    } else if (lower.includes('instagram') || lower.includes('facebook')) {
      // Build full Instagram/Facebook payload according to type
      if (parsed.kind === 'send_interactive' && template.interactiveContent) {
        const ic: any = template.interactiveContent;
        const bodyText = String(ic?.body?.text || '');
        const explicit = String(ic?.interactiveType || '').toLowerCase();
        const rawButtons: any[] = Array.isArray(ic?.actionReplyButton?.buttons) ? ic.actionReplyButton.buttons : [];
        const hasImage = ic?.header?.type === 'image' && !!ic?.header?.content;
        const hasCarousel = ic?.actionCarousel || (explicit === 'carousel');

        // Handle carousel type
        if (hasCarousel && ic?.actionCarousel?.elements) {
          const elements = Array.isArray(ic.actionCarousel.elements) ? ic.actionCarousel.elements.slice(0, 10) : [];
          const carouselElements = elements.map((element: any) => {
            const mappedElement: any = {
              title: String(element.title || '').slice(0, 80),
            };

            if (element.subtitle) {
              mappedElement.subtitle = String(element.subtitle).slice(0, 80);
            }

            if (element.image_url) {
              mappedElement.image_url = String(element.image_url);
            }

            if (element.default_action?.url) {
              mappedElement.default_action = {
                type: 'web_url',
                url: String(element.default_action.url),
              };
            }

            if (element.buttons && Array.isArray(element.buttons)) {
              mappedElement.buttons = element.buttons.slice(0, 3).map((btn: any) => {
                const title = String(btn.title || '').slice(0, 20);
                if ((btn?.type === 'url' || btn?.type === 'web_url') && btn?.url) {
                  return { type: 'web_url', title, url: btn.url };
                }
                return { type: 'postback', title, payload: btn.id || btn.payload || title };
              });
            }

            return mappedElement;
          });

          const full = {
            message_format: 'GENERIC_TEMPLATE',
            template_type: 'generic',
            elements: carouselElements,
          };
          return lower.includes('instagram') ? { instagram: full } : { facebook: full };
        }

        // Detect IG type
        const hasQuickReplyShape = rawButtons.some((b: any) => String(b?.content_type || '').toLowerCase() === 'text');
        let igType: 'QUICK_REPLIES' | 'BUTTON_TEMPLATE' | 'GENERIC_TEMPLATE' = 'BUTTON_TEMPLATE';
        if (explicit === 'quick_replies') igType = 'QUICK_REPLIES';
        else if (explicit === 'generic') igType = 'GENERIC_TEMPLATE';
        else if (hasQuickReplyShape) igType = 'QUICK_REPLIES';
        else if (hasImage && rawButtons.length > 2) igType = 'GENERIC_TEMPLATE';

        if (igType === 'QUICK_REPLIES') {
          const quickReplies = rawButtons.slice(0, 13).map((b: any) => {
            const title = String(b?.title || b?.reply?.title || '').slice(0, 20);
            const payload = String(b?.payload || b?.id || b?.reply?.id || '').replace(/\s+/g, '_').toLowerCase();
            return { content_type: 'text', title, payload: payload ? (payload.startsWith('@') ? payload : `@${payload}`) : '@opcao' };
          });
          const full = { message_format: 'QUICK_REPLIES', text: bodyText, quick_replies: quickReplies };
          return lower.includes('instagram') ? { instagram: full } : { facebook: full };
        }

        // Map to Button Template-like shape
        const mappedButtons = rawButtons.slice(0, 3).map((b: any) => {
          const title = String(b?.title || b?.reply?.title || '').slice(0, 20);
          const id = b?.id || b?.reply?.id || b?.payload || title;
          if ((b?.type === 'url' || b?.type === 'web_url') && b?.url) {
            return { type: 'web_url', title, url: b.url };
          }
          return { type: 'postback', title, payload: id };
        });

        if (igType === 'GENERIC_TEMPLATE') {
          const full = {
            message_format: 'GENERIC_TEMPLATE',
            title: bodyText.slice(0, 80),
            image_url: hasImage ? ic?.header?.content : undefined,
            buttons: mappedButtons,
          };
          return lower.includes('instagram') ? { instagram: full } : { facebook: full };
        }

        const full = {
          message_format: 'BUTTON_TEMPLATE',
          template_type: 'button',
          text: bodyText,
          buttons: mappedButtons,
        };
        return lower.includes('instagram') ? { instagram: full } : { facebook: full };
      }
      if (parsed.kind === 'send_template') {
        const info = { message_format: 'TEMPLATE_INFO', name: template.name || 'Template' };
        return lower.includes('instagram') ? { instagram: info } : { facebook: info };
      }
    }

    return null;
  } catch (e) {
    logger.error('Failed to build action payload', { error: e instanceof Error ? e.message : String(e), traceId });
    return null;
  }
}

/**
 * Extract Chatwit inbox external id from payload
 */
function extractInboxIdFromPayload(validPayload: any): string | null {
  try {
    const context = validPayload?.context || {};
    const socialwise = context['socialwise-chatwit'] || {};
    const id = socialwise?.inbox_data?.id || context?.inbox?.id;
    return id ? String(id) : null;
  } catch {
    return null;
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
