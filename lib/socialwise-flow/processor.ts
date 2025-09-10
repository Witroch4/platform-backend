/**
 * SocialWise Flow Enhanced Processor
 * Integrates intelligent classification, structured outputs, performance monitoring,
 * concurrency control, and graceful degradation strategies
 */

import { createLogger } from '@/lib/utils/logger';
import { getPrismaInstance } from '@/lib/connections';
import { openaiService } from '@/services/openai';
import type { ChannelType, IntentCandidate } from '@/services/openai-components/types';
import { classifyIntent, ClassificationResult } from './classification';
import { buildChannelResponse, buildDefaultLegalTopics, buildFallbackResponse, logChannelResponse, ChannelResponse } from './channel-formatting';
import { collectPerformanceMetrics, createPerformanceMetrics } from './metrics';
import { getAssistantForInbox } from '@/lib/socialwise/assistant';
import { buildWhatsAppByIntentRaw, buildWhatsAppByGlobalIntent, buildInstagramByIntentRaw, buildInstagramByGlobalIntent } from '@/lib/socialwise/templates';
import { getConcurrencyManager } from './concurrency-manager';
import { 
  selectDegradationStrategy, 
  shouldDegrade, 
  determineFailurePoint,
  DegradationContext 
} from './degradation-strategies';

const processorLogger = createLogger('SocialWise-Processor');

function isWhatsAppChannel(channelType?: string) {
  return (channelType || '').toLowerCase().includes('whatsapp');
}

function isInstagramChannel(channelType?: string) {
  const normalized = (channelType || '').toLowerCase();
  return normalized.includes('instagram') || normalized.includes('facebookpage');
}

function normalizeChannelType(channelType: string): import('../../services/openai-components/types').ChannelType {
  const normalized = channelType.toLowerCase();
  if (normalized.includes('whatsapp')) return 'whatsapp';
  if (normalized.includes('instagram')) return 'instagram';
  return 'facebook'; // fallback
}

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
  assistantId?: string; // Para playground e casos específicos
  originalPayload?: any; // Para detectar cliques de botão
  sessionId?: string; // Para continuidade conversacional
}

export interface ButtonReactionMeta {
  replyToMessageId?: string;
  reaction?: 'love' | 'like' | 'haha' | 'wow' | 'sad' | 'angry';
  reactionEmoji?: string;
  textReaction?: string;
  mappingFound?: boolean; // Indica se o botão foi mapeado
  shouldContinueProcessing?: boolean; // Indica se deve continuar para LLM
}

/** 
 * Extrai sessionId do payload conforme o canal:
 * - WhatsApp: número do telefone
 * - Instagram: ID da plataforma
 */
export function extractSessionId(payload: any, channelType: string): string | undefined {
  if (!payload) return undefined;

  // Debug log
  console.log('[SessionExtraction] DEBUG: Extracting sessionId', {
    channelType,
    hasPayload: !!payload,
    payloadKeys: Object.keys(payload || {}),
    sessionIdDirect: payload.session_id,
    contactPhone: payload.context?.contact?.phone_number
  });

  // Primeiro, tenta extrair do campo session_id direto (formato Chatwit)
  if (payload.session_id) {
    console.log('[SessionExtraction] INFO: SessionId found directly', { sessionId: payload.session_id });
    return payload.session_id;
  }

  // WhatsApp: sessionId pode estar no contexto do contato
  if (isWhatsAppChannel(channelType)) {
    // Formato Chatwit: context.contact.phone_number
    const phoneFromContext = payload.context?.contact?.phone_number;
    if (phoneFromContext) {
      console.log('[SessionExtraction] INFO: SessionId from contact phone', { sessionId: phoneFromContext });
      return phoneFromContext;
    }

    // Formato Meta: payload direto
    const phoneFromMeta = payload.contacts?.[0]?.wa_id || payload.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id;
    if (phoneFromMeta) {
      console.log('[SessionExtraction] INFO: SessionId from Meta format', { sessionId: phoneFromMeta });
      return phoneFromMeta;
    }
  }

  // Instagram: sessionId pode estar no contexto
  if (isInstagramChannel(channelType)) {
    // Formato Chatwit: context.contact.identifier ou similar
    const instagramId = payload.context?.contact?.identifier || payload.entry?.[0]?.messaging?.[0]?.sender?.id || payload.sender?.id;
    if (instagramId) {
      console.log('[SessionExtraction] INFO: SessionId from Instagram', { sessionId: instagramId });
      return instagramId;
    }
  }

  console.log('[SessionExtraction] WARNING: No sessionId found', { channelType, payloadStructure: Object.keys(payload || {}) });
  return undefined;
}

export interface ProcessorResult {
  response: ChannelResponse;
  metrics: {
    band: 'HARD' | 'SOFT' | 'ROUTER';
    strategy: string;
    routeTotalMs: number;
    embeddingMs?: number;
    llmWarmupMs?: number;
    score?: number;
  };
}



/**
 * Load full assistant configuration including SocialWise Flow deadlines
 * Supports inbox-level inheritance from agent configurations
 */
async function loadAssistantConfiguration(inboxId: string, chatwitAccountId?: string, assistantId?: string) {
  try {
    const prisma = getPrismaInstance();
    
    // Get assistant configuration with full details
    let assistant;
    if (assistantId) {
      // Para playground: usar assistantId diretamente
      assistant = await prisma.aiAssistant.findFirst({
        where: { 
          id: assistantId,
          isActive: true 
        },
        select: { id: true }
      });
    } else {
      // Para produção: usar getAssistantForInbox
      assistant = await getAssistantForInbox(inboxId, chatwitAccountId);
    }
    
    if (!assistant) {
      processorLogger.warn('No assistant found', { inboxId, assistantId });
      return null;
    }

    // Get full assistant configuration from database
    const fullAssistant = await prisma.aiAssistant.findFirst({
      where: { 
        id: assistantId || assistant.id,
        isActive: true 
      },
      select: {
        id: true,
        model: true,
        instructions: true,
        reasoningEffort: true,
        verbosity: true,
        temperature: true,
        topP: true,
        tempSchema: true,
        tempCopy: true,
        maxOutputTokens: true,
        warmupDeadlineMs: true,
        hardDeadlineMs: true,
        softDeadlineMs: true,
        shortTitleLLM: true,
        toolChoice: true,
        embedipreview: true
      }
    });

    if (!fullAssistant) {
      processorLogger.warn('Full assistant configuration not found', { assistantId: assistant.id });
      return null;
    }

    // Get inbox configuration to check inheritance settings
    const inbox = await (prisma as any).chatwitInbox.findFirst({
      where: { inboxId },
      select: {
        socialwiseInheritFromAgent: true,
        socialwiseReasoningEffort: true,
        socialwiseVerbosity: true,
        socialwiseTemperature: true,
        socialwiseTempSchema: true,
        socialwiseWarmupDeadlineMs: true,
        socialwiseHardDeadlineMs: true,
        socialwiseSoftDeadlineMs: true,
        socialwiseShortTitleLLM: true,
        socialwiseToolChoice: true
      }
    });

    // Determine final configuration based on inheritance
    const inheritFromAgent = inbox?.socialwiseInheritFromAgent ?? true;
    
    const finalConfig = {
      model: fullAssistant.model,
      instructions: fullAssistant.instructions || '',
      developer: fullAssistant.instructions || '',
      embedipreview: fullAssistant.embedipreview,
      
      // Use inbox config if not inheriting, otherwise use assistant config
      reasoningEffort: inheritFromAgent 
        ? fullAssistant.reasoningEffort 
        : (inbox?.socialwiseReasoningEffort || fullAssistant.reasoningEffort),
      
      verbosity: inheritFromAgent 
        ? fullAssistant.verbosity 
        : (inbox?.socialwiseVerbosity || fullAssistant.verbosity),
      
      temperature: inheritFromAgent 
        ? fullAssistant.temperature 
        : (inbox?.socialwiseTemperature || fullAssistant.temperature),
      
      tempSchema: inheritFromAgent 
        ? fullAssistant.tempSchema 
        : (inbox?.socialwiseTempSchema || fullAssistant.tempSchema),
      
      tempCopy: fullAssistant.tempCopy,
      
      maxOutputTokens: fullAssistant.maxOutputTokens,
      
      // 🔧 CORREÇÃO: Usar configurações de deadline do assistente/inbox
      warmupDeadlineMs: inheritFromAgent 
        ? fullAssistant.warmupDeadlineMs 
        : (inbox?.socialwiseWarmupDeadlineMs || fullAssistant.warmupDeadlineMs),
      
      hardDeadlineMs: inheritFromAgent 
        ? fullAssistant.hardDeadlineMs 
        : (inbox?.socialwiseHardDeadlineMs || fullAssistant.hardDeadlineMs),
      
      softDeadlineMs: inheritFromAgent 
        ? fullAssistant.softDeadlineMs 
        : (inbox?.socialwiseSoftDeadlineMs || fullAssistant.softDeadlineMs),
      
      shortTitleLLM: inheritFromAgent 
        ? fullAssistant.shortTitleLLM 
        : (inbox?.socialwiseShortTitleLLM ?? fullAssistant.shortTitleLLM),
      
      toolChoice: inheritFromAgent 
        ? fullAssistant.toolChoice 
        : (inbox?.socialwiseToolChoice || fullAssistant.toolChoice),
      
      inheritFromAgent
    };

    processorLogger.info('Assistant configuration loaded', {
      inboxId,
      assistantId: fullAssistant.id,
      inheritFromAgent,
      warmupDeadlineMs: finalConfig.warmupDeadlineMs,
      hardDeadlineMs: finalConfig.hardDeadlineMs,
      softDeadlineMs: finalConfig.softDeadlineMs,
      model: finalConfig.model,
      reasoningEffort: finalConfig.reasoningEffort,
      verbosity: finalConfig.verbosity
    });

    return finalConfig;
    
  } catch (error) {
    processorLogger.error('Failed to load assistant configuration', {
      error: error instanceof Error ? error.message : String(error),
      inboxId
    });
    return null;
  }
}

/**
 * Process HARD band classification (≥0.80 score)
 * Direct intent mapping with optional microcopy enhancement
 */
async function processHardBand(
  classification: ClassificationResult,
  context: ProcessorContext
): Promise<ChannelResponse> {
  const startTime = Date.now();
  
  try {
    const topIntent = classification.candidates[0];
    if (!topIntent) {
      return buildFallbackResponse(context.channelType, context.userText);
    }

    // Try direct mapping for WhatsApp and Instagram channels
    if (isWhatsAppChannel(context.channelType)) {
      const contactContext = { contactName: context.contactName, contactPhone: context.contactPhone };
      let mapped = await buildWhatsAppByIntentRaw(topIntent.slug, context.inboxId, context.wamid, contactContext);
      if (!mapped) {
        mapped = await buildWhatsAppByGlobalIntent(topIntent.slug, context.inboxId, context.wamid, contactContext);
      }
      
      if (mapped) {
        processorLogger.info('HARD band WhatsApp direct mapping successful', {
          intent: topIntent.slug,
          score: topIntent.score,
          processingMs: Date.now() - startTime,
          traceId: context.traceId
        });
        return mapped;
      }
    } else if (isInstagramChannel(context.channelType)) {
      processorLogger.info('HARD band attempting Instagram mapping', {
        intent: topIntent.slug,
        score: topIntent.score,
        traceId: context.traceId
      });
      
      let mapped = await buildInstagramByIntentRaw(topIntent.slug, context.inboxId);
      processorLogger.info('HARD band Instagram intent raw result', {
        intent: topIntent.slug,
        found: !!mapped,
        traceId: context.traceId
      });
      
      if (!mapped) {
        mapped = await buildInstagramByGlobalIntent(topIntent.slug, context.inboxId);
        processorLogger.info('HARD band Instagram global intent result', {
          intent: topIntent.slug,
          found: !!mapped,
          traceId: context.traceId
        });
      }
      
      if (mapped) {
        processorLogger.info('HARD band Instagram direct mapping successful', {
          intent: topIntent.slug,
          score: topIntent.score,
          processingMs: Date.now() - startTime,
          traceId: context.traceId
        });
        return mapped;
      } else {
        processorLogger.info('HARD band Instagram mapping failed - falling back to channel response', {
          intent: topIntent.slug,
          score: topIntent.score,
          traceId: context.traceId
        });
      }
    } else {
      processorLogger.info('HARD band skipping direct mapping for unsupported channel', {
        channelType: context.channelType,
        intent: topIntent.slug,
        score: topIntent.score,
        traceId: context.traceId
      });
    }

    // Fallback to channel response if no mapping found
    return buildChannelResponse(context.channelType, `Entendi que você quer ${topIntent.name || topIntent.slug}. Como posso ajudar?`);
    
  } catch (error) {
    processorLogger.error('HARD band processing failed', {
      error: error instanceof Error ? error.message : String(error),
      traceId: context.traceId
    });
    return buildFallbackResponse(context.channelType, context.userText);
  }
}

/**
 * Process SOFT band classification (0.65-0.79 score)
 * Aquecimento com Botões workflow with candidate intents and concurrency control
 */
async function processSoftBand(
  classification: ClassificationResult,
  context: ProcessorContext
): Promise<{ response: ChannelResponse; llmWarmupMs?: number }> {
  const startTime = Date.now();
  const concurrencyManager = getConcurrencyManager();
  
  try {
    // Get full assistant configuration with deadlines
    const agentConfig = await loadAssistantConfiguration(context.inboxId, context.chatwitAccountId);
    if (!agentConfig) {
      return { 
        response: buildDefaultLegalTopics(context.channelType),
        llmWarmupMs: Date.now() - startTime
      };
    }

    // Generate warmup buttons using LLM with concurrency control
    processorLogger.info('Preparing warmup buttons generation', {
      sessionId: context.sessionId,
      hasSessionId: !!context.sessionId,
      channelType: context.channelType,
      traceId: context.traceId
    });

    const warmupResult = await concurrencyManager.executeLlmOperation(
      context.inboxId,
      () => openaiService.generateWarmupButtons(
        context.userText,
        classification.candidates,
        agentConfig,
        { 
          channelType: normalizeChannelType(context.channelType),
          sessionId: context.sessionId
        }
      ),
      {
        priority: 'medium',
        timeoutMs: agentConfig.softDeadlineMs || 300,
        allowDegradation: true
      }
    );

    const llmWarmupMs = Date.now() - startTime;

    if (warmupResult) {
      const buttons = warmupResult.buttons.map(btn => ({
        title: btn.title,
        payload: btn.payload
      }));

      const response = buildChannelResponse(
        context.channelType,
        warmupResult.response_text,
        buttons
      );

      processorLogger.info('SOFT band warmup buttons generated', {
        candidatesCount: classification.candidates.length,
        buttonsGenerated: buttons.length,
        llmWarmupMs,
        traceId: context.traceId
      });

      return { response, llmWarmupMs };
    }

    // Degradation: Use humanized titles when LLM fails or is throttled
    const degradationContext: DegradationContext = {
      userText: context.userText,
      channelType: context.channelType,
      inboxId: context.inboxId,
      traceId: context.traceId,
      failurePoint: 'concurrency_limit',
      candidates: classification.candidates
    };

    const degradationResult = selectDegradationStrategy(degradationContext);
    
    processorLogger.info('SOFT band degraded to fallback', {
      strategy: degradationResult.strategy,
      fallbackLevel: degradationResult.fallbackLevel,
      degradationMs: degradationResult.degradationMs,
      traceId: context.traceId
    });

    return { 
      response: degradationResult.response,
      llmWarmupMs
    };
    
  } catch (error) {
    processorLogger.error('SOFT band processing failed', {
      error: error instanceof Error ? error.message : String(error),
      traceId: context.traceId
    });

    // Apply degradation strategy based on error type
    if (shouldDegrade(error)) {
      const degradationContext: DegradationContext = {
        userText: context.userText,
        channelType: context.channelType,
        inboxId: context.inboxId,
        traceId: context.traceId,
        failurePoint: determineFailurePoint(error),
        originalError: error instanceof Error ? error : undefined,
        candidates: classification.candidates
      };

      const degradationResult = selectDegradationStrategy(degradationContext);
      return { 
        response: degradationResult.response,
        llmWarmupMs: Date.now() - startTime
      };
    }
    
    return { 
      response: buildDefaultLegalTopics(context.channelType),
      llmWarmupMs: Date.now() - startTime
    };
  }
}



/**
 * Process ROUTER band classification (embedipreview=false)
 * Full LLM routing with conversational freedom and concurrency control
 */
async function processRouterBand(
  context: ProcessorContext,
  intentHints?: IntentCandidate[]
): Promise<{ response: ChannelResponse; llmWarmupMs?: number }> {
  const startTime = Date.now();
  const concurrencyManager = getConcurrencyManager();
  
  try {
    // Get full assistant configuration with deadlines
    const agentConfig = await loadAssistantConfiguration(context.inboxId, context.chatwitAccountId);
    if (!agentConfig) {
      return { 
        response: buildFallbackResponse(context.channelType, context.userText),
        llmWarmupMs: Date.now() - startTime
      };
    }

    // Debug: Log agent configuration for router LLM
    processorLogger.info('Router LLM agent configuration', {
      hardDeadlineMs: agentConfig.hardDeadlineMs,
      model: agentConfig.model,
      reasoningEffort: agentConfig.reasoningEffort,
      verbosity: agentConfig.verbosity,
      sessionId: context.sessionId,
      hasSessionId: !!context.sessionId,
      traceId: context.traceId
    });

    // Use Router LLM to decide between intent and chat with concurrency control
    // Prepare filtered intent hints (score >= 0.35)
    const filteredHints = (intentHints || []).filter(c => typeof c.score === 'number' && c.score! >= 0.35);
    
    // Log how many hints we are sending to Router
    processorLogger.info('Router LLM invoking with hints', {
      hints_count: filteredHints.length,
      min_score: 0.35,
      traceId: context.traceId
    });

    const routerResult = await concurrencyManager.executeLlmOperation(
      context.inboxId,
      () => openaiService.routerLLM(context.userText, agentConfig, { 
        channelType: normalizeChannelType(context.channelType),
        sessionId: context.sessionId,
        intentHints: filteredHints
      }),
      {
        priority: 'high', // Router decisions are high priority
        timeoutMs: agentConfig.hardDeadlineMs || 400,
        allowDegradation: true
      }
    );

    const llmWarmupMs = Date.now() - startTime;

    if (routerResult) {
      // Debug: Log router result details
      processorLogger.info('Router LLM result details', {
        mode: routerResult.mode,
        intent_payload: routerResult.intent_payload,
        response_text: routerResult.response_text,
        response_text_length: routerResult.response_text?.length || 0,
        buttons_count: routerResult.buttons?.length || 0,
        traceId: context.traceId
      });
      
      // Fallback: se Router retornou mode='intent' sem intent_payload, usar top-K hints
      if (routerResult.mode === 'intent' && !routerResult.intent_payload) {
        const candidates = (intentHints || []).filter(c => typeof c.score === 'number');
        candidates.sort((a, b) => (b.score! - a.score!));
        const top = candidates[0];
        const topScore = top?.score ?? 0;
        const threshold = typeof top?.threshold === 'number' ? top.threshold! : 0.5;

        if (top && topScore >= threshold) {
          routerResult.intent_payload = `@${top.slug}`;
          processorLogger.warn('ROUTER fallback applied: intent_payload filled from hints', {
            filled_payload: routerResult.intent_payload,
            top_score: Number(topScore.toFixed(3)),
            threshold,
            traceId: context.traceId
          });
        } else {
          // Degrada para chat por baixa confiança
          processorLogger.warn('ROUTER fallback applied: degraded to chat (low confidence, no valid intent)', {
            top_slug: top?.slug,
            top_score: topScore || null,
            threshold,
            traceId: context.traceId
          });
          routerResult.mode = 'chat';
        }
      }
      
      if (routerResult.mode === 'intent' && routerResult.intent_payload) {
        // Try to map the intent (only for WhatsApp)
        const intentName = routerResult.intent_payload.replace(/^@/, '');
        if (isWhatsAppChannel(context.channelType)) {
          const contactContext = { contactName: context.contactName, contactPhone: context.contactPhone };
          let mapped = await buildWhatsAppByIntentRaw(intentName, context.inboxId, context.wamid, contactContext);
          if (!mapped) {
            mapped = await buildWhatsAppByGlobalIntent(intentName, context.inboxId, context.wamid, contactContext);
          }
          
          if (mapped) {
            return { response: mapped, llmWarmupMs };
          }
        } else {
          processorLogger.info('ROUTER band skipping direct mapping for non-WhatsApp channel', {
            channelType: context.channelType,
            intent: intentName,
            traceId: context.traceId
          });
        }
      }

      // Chat mode or intent mapping failed - build conversational response
      const buttons = routerResult.buttons?.map(btn => ({
        title: btn.title,
        payload: btn.payload
      }));

      // O Router LLM sempre deve retornar response_text válido
      const responseText = routerResult.response_text;
      
      // Debug: Log response construction details
      processorLogger.info('Building channel response', {
        mode: routerResult.mode,
        response_text: routerResult.response_text,
        response_text_length: routerResult.response_text?.length || 0,
        buttonsCount: buttons?.length || 0,
        traceId: context.traceId
      });
      
      const response = buildChannelResponse(context.channelType, responseText, buttons);

      processorLogger.info('ROUTER band decision processed', {
        mode: routerResult.mode,
        hasButtons: !!buttons?.length,
        llmWarmupMs,
        traceId: context.traceId
      });

      return { response, llmWarmupMs };
    }

    // Degradation: Router LLM failed or was throttled
    const degradationContext: DegradationContext = {
      userText: context.userText,
      channelType: context.channelType,
      inboxId: context.inboxId,
      traceId: context.traceId,
      failurePoint: 'concurrency_limit'
    };

    const degradationResult = selectDegradationStrategy(degradationContext);
    
    processorLogger.info('ROUTER band degraded to fallback', {
      strategy: degradationResult.strategy,
      fallbackLevel: degradationResult.fallbackLevel,
      traceId: context.traceId
    });

    return { 
      response: degradationResult.response,
      llmWarmupMs
    };
    
  } catch (error) {
    processorLogger.error('ROUTER band processing failed', {
      error: error instanceof Error ? error.message : String(error),
      traceId: context.traceId
    });

    // Apply degradation strategy based on error type
    if (shouldDegrade(error)) {
      const degradationContext: DegradationContext = {
        userText: context.userText,
        channelType: context.channelType,
        inboxId: context.inboxId,
        traceId: context.traceId,
        failurePoint: determineFailurePoint(error),
        originalError: error instanceof Error ? error : undefined
      };

      const degradationResult = selectDegradationStrategy(degradationContext);
      return { 
        response: degradationResult.response,
        llmWarmupMs: Date.now() - startTime
      };
    }
    
    return { 
      response: buildFallbackResponse(context.channelType, context.userText),
      llmWarmupMs: Date.now() - startTime
    };
  }
}

/**
 * Main SocialWise Flow processor
 */
/**
 * Detect and process button reactions for Instagram
 * Based on legacy WhatsApp button processor logic
 */
async function processButtonReaction(context: ProcessorContext): Promise<ButtonReactionMeta | undefined> {
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
  } else if (isInstagramChannel(context.channelType)) {
    // Instagram: verifica postback_payload em content_attributes ou na raiz
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
      processorLogger.info('Button not mapped, continuing to LLM processing', {
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
    
    processorLogger.info('Button reaction mapped successfully', {
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
    processorLogger.error('Error processing button reaction', {
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

/**
 * Map emoji to Instagram reaction name
 * Based on Instagram's supported reaction types
 */
function mapEmojiToInstagramReaction(emoji: string): 'love' | 'like' | 'haha' | 'wow' | 'sad' | 'angry' | null {
  const e = (emoji || '').trim();
  switch (e) {
    case '❤️':
    case '❤':
    case '♥️':
      return 'love';
    case '👍':
    case '👌':
    case '✅':
      return 'like';
    case '😂':
    case '😹':
      return 'haha';
    case '😮':
    case '😯':
      return 'wow';
    case '😢':
    case '😭':
      return 'sad';
    case '😡':
    case '😠':
      return 'angry';
    default:
      return null;
  }
}

/**
 * Apply WhatsApp reaction metadata to the response
 * Creates a modified response for WhatsApp reactions (emoji reactions + text responses)
 */
function applyWhatsAppReactionMeta(response: ChannelResponse, reactionMeta: ButtonReactionMeta): any {
  // For text reactions, return a simple text response
  if (reactionMeta.textReaction && reactionMeta.textReaction.trim()) {
    processorLogger.info('Applied text reaction to WhatsApp response', {
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
    processorLogger.info('Applied WhatsApp reaction meta to response', {
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
function applyInstagramReactionMeta(response: ChannelResponse, reactionMeta: ButtonReactionMeta): any {
  // For text reactions, return a simple text response
  if (reactionMeta.textReaction && reactionMeta.textReaction.trim()) {
    processorLogger.info('Applied text reaction to Instagram response', {
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
    processorLogger.info('Applied Instagram reaction meta to response', {
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

export async function processSocialWiseFlow(
  context: ProcessorContext,
  embedipreview = true
): Promise<ProcessorResult> {
  const startTime = Date.now();
  
  try {
    // 1. Check for button reactions first (for both WhatsApp and Instagram)
    let buttonReactionMeta: ButtonReactionMeta | undefined;
    let shouldProcessLLM = true; // Por padrão, processa LLM
    let bypassEmbedding = false; // Flag para pular embedding em botões não mapeados
    
    if (isInstagramChannel(context.channelType) || isWhatsAppChannel(context.channelType)) {
      buttonReactionMeta = await processButtonReaction(context);
      
      if (buttonReactionMeta) {
        processorLogger.info('Button reaction processing enabled', {
          channelType: context.channelType,
          hasReaction: !!buttonReactionMeta.reaction,
          hasTextReaction: !!buttonReactionMeta.textReaction,
          mappingFound: !!buttonReactionMeta.mappingFound,
          shouldContinueProcessing: !!buttonReactionMeta.shouldContinueProcessing,
          traceId: context.traceId
        });
        
        // Se é botão mapeado que não precisa de LLM, só aplica a reação sem processar LLM
        if (buttonReactionMeta.mappingFound && !buttonReactionMeta.shouldContinueProcessing) {
          shouldProcessLLM = false;
        }
        
        // Se é botão não mapeado, modifica o contexto para processar o texto real do botão
        if (!buttonReactionMeta.mappingFound && buttonReactionMeta.shouldContinueProcessing) {
          // Usa o campo 'message' padronizado que contém o texto real do botão
          // Esse campo é consistente entre WhatsApp e Instagram
          const realButtonText = context.originalPayload?.message;
          
          if (realButtonText && realButtonText.trim()) {
            context.userText = realButtonText;
            
            // 🚀 OTIMIZAÇÃO: Para botões não mapeados, pular embedding e ir direto para Router LLM
            bypassEmbedding = true;
            
            processorLogger.info('Button not mapped, bypassing embedding and using Router LLM directly', {
              originalUserText: context.userText,
              realButtonText: realButtonText,
              bypassEmbedding: true,
              traceId: context.traceId
            });
          } else {
            // Fallback: extrai o buttonId para usar como texto se não houver message
            const payload = context.originalPayload;
            let buttonId: string | undefined;
            
            if (isWhatsAppChannel(context.channelType)) {
              buttonId = payload?.context?.message?.content_attributes?.button_reply?.id || payload?.button_id;
            } else if (isInstagramChannel(context.channelType)) {
              buttonId = payload?.context?.message?.content_attributes?.postback_payload || payload?.postback_payload;
            }
            
            if (buttonId) {
              // ⚡ MAPEAMENTO AUTOMÁTICO: @falar_atendente -> handoff nativo
              if (buttonId === '@falar_atendente') {
                processorLogger.info('🚨 HANDOFF AUTOMÁTICO: @falar_atendente detectado', {
                  buttonId,
                  channelType: context.channelType,
                  traceId: context.traceId
                });
                
                const routeTotalMs = Date.now() - startTime;
                return {
                  response: { action: 'handoff' },
                  metrics: {
                    band: 'ROUTER',
                    strategy: 'auto_handoff_button',
                    routeTotalMs,
                    embeddingMs: 0,
                    llmWarmupMs: 0,
                    score: 1.0
                  }
                };
              }
              
              // Remove @ do início se existir e usa como texto de entrada
              const buttonText = buttonId.startsWith('@') ? buttonId.substring(1) : buttonId;
              context.userText = buttonText;
              
              // Também bypassa embedding para fallback de buttonId
              bypassEmbedding = true;
              
              processorLogger.info('Button not mapped, bypassing embedding and using buttonId as fallback for Router LLM', {
                originalButtonId: buttonId,
                fallbackText: buttonText,
                bypassEmbedding: true,
                traceId: context.traceId
              });
            }
          }
        }
      }
    }

    // Se é botão mapeado que não precisa de LLM, retorna apenas a reação
    if (!shouldProcessLLM && buttonReactionMeta) {
      const fallbackResponse = buildFallbackResponse(context.channelType, "");
      const routeTotalMs = Date.now() - startTime;
      
      // Aplica metadados de reação
      let response = fallbackResponse;
      if (isInstagramChannel(context.channelType)) {
        response = applyInstagramReactionMeta(response, buttonReactionMeta);
      } else if (isWhatsAppChannel(context.channelType)) {
        response = applyWhatsAppReactionMeta(response, buttonReactionMeta);
      }
      
      return {
        response,
        metrics: {
          band: 'ROUTER',
          strategy: 'button_reaction',
          routeTotalMs,
          score: 1.0
        }
      };
    }

    // Resolve user ID from inbox if not provided
    let userId = context.userId;
    if (!userId && context.inboxId) {
      const prisma = getPrismaInstance();
      const inbox = await prisma.chatwitInbox.findFirst({
        where: { inboxId: context.inboxId },
        include: { usuarioChatwit: true }
      });
      userId = (inbox as any)?.usuarioChatwit?.appUserId;
    }

    if (!userId) {
      processorLogger.warn('No user ID found for inbox', { 
        inboxId: context.inboxId,
        traceId: context.traceId 
      });
      
      const response = buildFallbackResponse(context.channelType, context.userText);
      const routeTotalMs = Date.now() - startTime;
      
      return {
        response,
        metrics: {
          band: 'ROUTER',
          strategy: 'fallback_no_user',
          routeTotalMs,
          score: 0
        }
      };
    }

    // Debug: log resolved userId for classification tracing
    processorLogger.info('Resolved userId for classification', {
      userIdPreview: String(userId).substring(0, 16),
      userIdLength: String(userId).length,
      inboxId: context.inboxId,
      traceId: context.traceId
    });

    // Get full assistant configuration for agent settings
    const agentConfig = await loadAssistantConfiguration(context.inboxId, context.chatwitAccountId, context.assistantId);
    if (!agentConfig) {
      const response = buildFallbackResponse(context.channelType, context.userText);
      const routeTotalMs = Date.now() - startTime;
      
      return {
         response,
         metrics: {
           band: 'ROUTER',
           strategy: 'fallback_no_config',
           routeTotalMs,
           score: 0
         }
       };
    }

    // Override embedipreview if provided explicitly
    agentConfig.embedipreview = embedipreview;

    let classification: ClassificationResult;
    let response: ChannelResponse;
    let llmWarmupMs: number | undefined;

    // 🚀 BYPASS OTIMIZADO: Se é botão não mapeado, pular embedding e ir direto para Router LLM
    if (bypassEmbedding) {
      processorLogger.info('Bypassing embedding classification for unmapped button, going directly to Router LLM', {
        userText: context.userText,
        bypassReason: 'unmapped_button',
        traceId: context.traceId
      });
      
      // Mesmo no bypass, obtém intent hints para melhor contexto no Router LLM
      let intentHints: IntentCandidate[] = [];
      try {
        const quickClassification = await classifyIntent(
          context.userText, 
          userId, 
          agentConfig, 
          true, 
          {
            channelType: context.channelType,
            inboxId: context.inboxId,
            traceId: context.traceId
          }
        );
        intentHints = quickClassification.candidates || [];
        processorLogger.info('Bypass: obtained intent hints for Router LLM', {
          hintsCount: intentHints.length,
          traceId: context.traceId
        });
      } catch (error) {
        processorLogger.warn('Bypass: failed to obtain intent hints, proceeding without', {
          error: error instanceof Error ? error.message : 'Unknown error',
          traceId: context.traceId
        });
      }
      
      // Vai para Router LLM com intent hints quando disponíveis
      const routerResult = await processRouterBand(context, intentHints);
      response = routerResult.response;
      llmWarmupMs = routerResult.llmWarmupMs;
      
      classification = {
        band: 'ROUTER',
        score: 1.0,
        candidates: [],
        strategy: 'router_llm_bypass',
        metrics: {
          route_total_ms: Date.now() - startTime
        }
      };
    } else if (embedipreview) {
      // Embedding-first classification with degradation context
      const classificationContext = {
        channelType: context.channelType,
        inboxId: context.inboxId,
        traceId: context.traceId
      };
      
      classification = await classifyIntent(
        context.userText, 
        userId, 
        agentConfig, 
        true, 
        classificationContext
      );
      
      switch (classification.band) {
        case 'HARD':
          response = await processHardBand(classification, context);
          break;
        case 'SOFT':
          const softResult = await processSoftBand(classification, context);
          response = softResult.response;
          llmWarmupMs = softResult.llmWarmupMs;
          break;
        case 'ROUTER':
          // Process ROUTER band within embedding-first mode (degraded cases)
          const routerResult = await processRouterBand(context, classification.candidates);
          response = routerResult.response;
          llmWarmupMs = routerResult.llmWarmupMs;
          break;

        default:
          response = buildFallbackResponse(context.channelType, context.userText);
      }
    } else {
      // Router LLM mode - obtém intent hints primeiro para melhor contexto
      let intentHints: IntentCandidate[] = [];
      try {
        const quickClassification = await classifyIntent(
          context.userText, 
          userId, 
          agentConfig, 
          true, 
          {
            channelType: context.channelType,
            inboxId: context.inboxId,
            traceId: context.traceId
          }
        );
        intentHints = quickClassification.candidates || [];
        processorLogger.info('Router LLM mode: obtained intent hints', {
          hintsCount: intentHints.length,
          traceId: context.traceId
        });
      } catch (error) {
        processorLogger.warn('Router LLM mode: failed to obtain intent hints, proceeding without', {
          error: error instanceof Error ? error.message : 'Unknown error',
          traceId: context.traceId
        });
      }
      
      // Router LLM com intent hints quando disponíveis
      const routerResult = await processRouterBand(context, intentHints);
      response = routerResult.response;
      llmWarmupMs = routerResult.llmWarmupMs;
      
      classification = {
        band: 'ROUTER',
        score: 1.0,
        candidates: [],
        strategy: 'router_llm',
        metrics: {
          route_total_ms: Date.now() - startTime
        }
      };
    }

    const routeTotalMs = Date.now() - startTime;

    // Apply button reaction metadata for Instagram and WhatsApp
    if (buttonReactionMeta && (isInstagramChannel(context.channelType) || isWhatsAppChannel(context.channelType))) {
      if (isInstagramChannel(context.channelType)) {
        response = applyInstagramReactionMeta(response, buttonReactionMeta);
      } else if (isWhatsAppChannel(context.channelType)) {
        // For WhatsApp, we can apply similar logic or extend for WhatsApp-specific format
        response = applyWhatsAppReactionMeta(response, buttonReactionMeta);
      }
    }

    // Log the response for debugging
    logChannelResponse(response, {
      channelType: context.channelType,
      strategy: classification.strategy
    });

    // Collect performance metrics
    const performanceMetrics = createPerformanceMetrics(
      classification.band,
      classification.strategy,
      routeTotalMs,
      {
        channelType: context.channelType,
        userId,
        inboxId: context.inboxId,
        traceId: context.traceId,
        embeddingMs: classification.metrics?.embedding_ms,
        llmWarmupMs,
        jsonParseSuccess: true,
        timeoutOccurred: false,
        abortOccurred: false
      }
    );

    // Collect metrics asynchronously (don't block response)
    collectPerformanceMetrics(performanceMetrics).catch(error => {
      processorLogger.warn('Failed to collect metrics', { error: error instanceof Error ? error.message : String(error) });
    });

    processorLogger.info('SocialWise Flow processing completed', {
      band: classification.band,
      strategy: classification.strategy,
      score: classification.score,
      routeTotalMs,
      embeddingMs: classification.metrics?.embedding_ms,
      llmWarmupMs,
      traceId: context.traceId
    });

    return {
      response,
      metrics: {
        band: classification.band,
        strategy: classification.strategy,
        routeTotalMs,
        embeddingMs: classification.metrics?.embedding_ms,
        llmWarmupMs,
        score: classification.score
      }
    };
    
  } catch (error) {
    const routeTotalMs = Date.now() - startTime;
    
    processorLogger.error('SocialWise Flow processing failed', {
      error: error instanceof Error ? error.message : String(error),
      routeTotalMs,
      traceId: context.traceId
    });

    // Collect error metrics
    const errorMetrics = createPerformanceMetrics(
      'SOFT',
      'error_fallback',
      routeTotalMs,
      {
        channelType: context.channelType,
        userId: context.userId,
        inboxId: context.inboxId,
        traceId: context.traceId,
        jsonParseSuccess: false,
        timeoutOccurred: false,
        abortOccurred: false
      }
    );

    collectPerformanceMetrics(errorMetrics).catch(() => {
      // Ignore metrics collection errors in error path
    });

    return {
      response: buildFallbackResponse(context.channelType, context.userText),
      metrics: {
        band: 'ROUTER',
        strategy: 'error_fallback',
        routeTotalMs,
        score: 0
      }
    };
  }
}
