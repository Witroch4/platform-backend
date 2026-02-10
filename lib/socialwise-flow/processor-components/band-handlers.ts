/**
 * SocialWise Flow Processing Band Handlers
 * Handles HARD, SOFT, and ROUTER band processing logic
 */

import { createLogger } from '@/lib/utils/logger';
import { openaiService } from '@/services/openai';
import type { IntentCandidate } from '@/services/openai-components/types';
import { ClassificationResult } from '../classification';
import { buildChannelResponse, buildDefaultLegalTopics, buildFallbackResponse, ChannelResponse } from '../channel-formatting';
import { buildWhatsAppByIntentRaw, buildWhatsAppByGlobalIntent, buildInstagramByIntentRaw, buildInstagramByGlobalIntent, buildFacebookPageByIntentRaw, buildFacebookPageByGlobalIntent } from '@/lib/socialwise/templates';
import { getConcurrencyManager } from '../concurrency-manager';
import {
  selectDegradationStrategy,
  shouldDegrade,
  determineFailurePoint,
  DegradationContext
} from '../degradation-strategies';
import { isWhatsAppChannel, isInstagramChannel, isFacebookChannel, normalizeChannelType, computeDynamicHintThreshold } from './utils';
import { AssistantConfig } from './assistant-config';
import { ProcessorContext } from './button-reactions';
import { buildTimeoutFallbackResponse } from './timeout-helpers';
import { storeInteractiveMessageContext } from '@/services/openai-components/server-socialwise-componentes/session-manager';

const bandLogger = createLogger('SocialWise-Processor-BandHandlers');

export interface BandProcessingResult {
  response: ChannelResponse;
  llmWarmupMs?: number;
}

// ============ FLOW EXECUTION HELPER ============

/**
 * Executa um flow do Flow Builder para uma intenção mapeada.
 * Retorna ChannelResponse se bem-sucedido, ou null para fallback.
 */
async function executeFlowForIntent(
  flowId: string,
  context: ProcessorContext,
  intentName: string
): Promise<ChannelResponse | null> {
  try {
    // Import dinâmico para evitar dependência circular
    const { FlowOrchestrator } = await import('@/services/flow-engine');

    const orchestrator = new FlowOrchestrator();

    // Extrair conversationId e contactId do payload original
    const payload = context.originalPayload || {};
    const conversationId = payload.conversation?.id || payload.conversation_id || 0;
    const contactId = payload.sender?.id || payload.contact_id || 0;

    const deliveryContext = {
      accountId: parseInt(context.chatwitAccountId || '0'),
      conversationId: typeof conversationId === 'string' ? parseInt(conversationId) : conversationId,
      inboxId: parseInt(context.inboxId || '0'),
      contactId: typeof contactId === 'string' ? parseInt(contactId) : contactId,
      contactName: context.contactName || '',
      contactPhone: context.contactPhone || '',
      channelType: normalizeChannelType(context.channelType) as 'whatsapp' | 'instagram' | 'facebook',
      sourceMessageId: context.wamid,
      chatwitAccessToken: process.env.CHATWIT_API_TOKEN || '',
      chatwitBaseUrl: process.env.CHATWIT_BASE_URL || 'https://app.chatwit.io',
    };

    bandLogger.info('[Flow] Executando flow para intent', {
      flowId,
      intentName,
      conversationId: deliveryContext.conversationId,
      traceId: context.traceId,
    });

    const result = await orchestrator.executeFlowById(flowId, deliveryContext);

    if (result.syncResponse) {
      // Converter SynchronousResponse para ChannelResponse
      if (result.syncResponse.type === 'interactive') {
        return {
          whatsapp: {
            type: 'interactive',
            interactive: result.syncResponse.payload as any,
          }
        } as any;
      }
      return buildChannelResponse(context.channelType, result.syncResponse.content || '');
    }

    // Flow executou async ou aguarda input - retornar indicador
    bandLogger.info('[Flow] Flow executado (async ou waiting input)', {
      flowId,
      waitingInput: result.waitingInput,
      traceId: context.traceId,
    });

    // Se o flow está aguardando input, não temos uma resposta para retornar agora
    // A entrega já foi feita pelo FlowExecutor via API Chatwit
    return { _flowExecuted: true, flowId } as any;

  } catch (error) {
    bandLogger.error('[Flow] Falha ao executar flow', {
      flowId,
      intentName,
      error: error instanceof Error ? error.message : String(error),
      traceId: context.traceId,
    });

    // Retornar null para que o sistema use fallback
    return null;
  }
}

// ============ HELPERS FOR INTERACTIVE CONTEXT STORAGE ============

function extractBodyTextFromResponse(response: ChannelResponse): string {
  // Cast to any to access dynamic properties
  const r = response as any;

  // WhatsApp interactive
  if (r.whatsapp?.interactive?.body?.text) {
    return r.whatsapp.interactive.body.text;
  }
  // Instagram
  if (r.instagram?.text) {
    return r.instagram.text;
  }
  // Facebook
  if (r.facebook?.text) {
    return r.facebook.text;
  }
  // Simple text
  if (r.text) {
    return r.text;
  }
  return '';
}

function extractButtonsFromResponse(response: ChannelResponse): Array<{title: string; payload: string}> {
  // Cast to any to access dynamic properties
  const r = response as any;

  // WhatsApp
  if (r.whatsapp?.interactive?.action?.buttons) {
    return r.whatsapp.interactive.action.buttons.map((b: any) => ({
      title: b.reply?.title || '',
      payload: b.reply?.id || ''
    }));
  }
  // Instagram quick_replies
  if (r.instagram?.quick_replies) {
    return r.instagram.quick_replies.map((b: any) => ({
      title: b.title || '',
      payload: b.payload || ''
    }));
  }
  return [];
}

/**
 * Process HARD band classification (≥0.80 score)
 * Direct intent mapping with optional microcopy enhancement
 */
export async function processHardBand(
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

      // NOVO: Verificar se deve executar flow do Flow Builder
      if (mapped && (mapped as any)._type === 'execute_flow') {
        bandLogger.info('HARD band WhatsApp intent mapeado para Flow', {
          intent: topIntent.slug,
          flowId: (mapped as any).flowId,
          flowName: (mapped as any).flowName,
          traceId: context.traceId
        });

        const flowResult = await executeFlowForIntent(
          (mapped as any).flowId,
          context,
          topIntent.slug
        );
        if (flowResult) return flowResult;

        // Se flow falhou, continuar com fallback
        mapped = null;
      }

      if (!mapped) {
        mapped = await buildWhatsAppByGlobalIntent(topIntent.slug, context.inboxId, context.wamid, contactContext);
      }

      if (mapped) {
        // 🆕 Armazenar contexto da mensagem interativa para enriquecer futuras interações
        if (context.sessionId) {
          const bodyText = extractBodyTextFromResponse(mapped);
          if (bodyText) {
            storeInteractiveMessageContext(context.sessionId, {
              bodyText,
              intentSlug: topIntent.slug,
              timestamp: Date.now(),
              buttons: extractButtonsFromResponse(mapped)
            }, {
              sessionTtlSeconds: context.sessionTtlSeconds,
              sessionTtlDevSeconds: context.sessionTtlDevSeconds
            }).catch(err => {
              bandLogger.warn('Failed to store interactive context', { error: err, traceId: context.traceId });
            });
          }
        }

        bandLogger.info('HARD band WhatsApp direct mapping successful', {
          intent: topIntent.slug,
          score: topIntent.score,
          processingMs: Date.now() - startTime,
          traceId: context.traceId
        });
        return mapped;
      }
    } else if (isInstagramChannel(context.channelType) || isFacebookChannel(context.channelType)) {
      const isInsta = isInstagramChannel(context.channelType);
      const platformName = isInsta ? 'Instagram' : 'Facebook';
      bandLogger.info(`HARD band attempting ${platformName} mapping`, {
        intent: topIntent.slug,
        score: topIntent.score,
        traceId: context.traceId
      });

      let mapped = isInsta
        ? await buildInstagramByIntentRaw(topIntent.slug, context.inboxId, { contactName: context.contactName, contactPhone: context.contactPhone })
        : await buildFacebookPageByIntentRaw(topIntent.slug, context.inboxId, { contactName: context.contactName, contactPhone: context.contactPhone });

      // NOVO: Verificar se deve executar flow do Flow Builder
      if (mapped && (mapped as any)._type === 'execute_flow') {
        bandLogger.info(`HARD band ${platformName} intent mapeado para Flow`, {
          intent: topIntent.slug,
          flowId: (mapped as any).flowId,
          flowName: (mapped as any).flowName,
          traceId: context.traceId
        });

        const flowResult = await executeFlowForIntent(
          (mapped as any).flowId,
          context,
          topIntent.slug
        );
        if (flowResult) return flowResult;

        // Se flow falhou, continuar com fallback
        mapped = null;
      }

      bandLogger.info(`HARD band ${platformName} intent raw result`, {
        intent: topIntent.slug,
        found: !!mapped,
        traceId: context.traceId
      });

      if (!mapped) {
        mapped = isInsta
          ? await buildInstagramByGlobalIntent(topIntent.slug, context.inboxId, { contactName: context.contactName, contactPhone: context.contactPhone })
          : await buildFacebookPageByGlobalIntent(topIntent.slug, context.inboxId, { contactName: context.contactName, contactPhone: context.contactPhone });
        bandLogger.info(`HARD band ${platformName} global intent result`, {
          intent: topIntent.slug,
          found: !!mapped,
          traceId: context.traceId
        });
      }

      if (mapped) {
        // 🆕 Armazenar contexto da mensagem interativa para enriquecer futuras interações
        if (context.sessionId) {
          const bodyText = extractBodyTextFromResponse(mapped);
          if (bodyText) {
            storeInteractiveMessageContext(context.sessionId, {
              bodyText,
              intentSlug: topIntent.slug,
              timestamp: Date.now(),
              buttons: extractButtonsFromResponse(mapped)
            }, {
              sessionTtlSeconds: context.sessionTtlSeconds,
              sessionTtlDevSeconds: context.sessionTtlDevSeconds
            }).catch(err => {
              bandLogger.warn('Failed to store interactive context', { error: err, traceId: context.traceId });
            });
          }
        }

        bandLogger.info(`HARD band ${platformName} direct mapping successful`, {
          intent: topIntent.slug,
          score: topIntent.score,
          processingMs: Date.now() - startTime,
          traceId: context.traceId
        });
        return mapped;
      } else {
        bandLogger.info(`HARD band ${platformName} mapping failed - falling back to channel response`, {
          intent: topIntent.slug,
          score: topIntent.score,
          traceId: context.traceId
        });
      }
    } else {
      bandLogger.info('HARD band skipping direct mapping for unsupported channel', {
        channelType: context.channelType,
        intent: topIntent.slug,
        score: topIntent.score,
        traceId: context.traceId
      });
    }

    // Fallback to channel response if no mapping found
    return buildChannelResponse(context.channelType, `Entendi que você quer ${topIntent.name || topIntent.slug}. Como posso ajudar?`);

  } catch (error) {
    bandLogger.error('HARD band processing failed', {
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
export async function processSoftBand(
  classification: ClassificationResult,
  context: ProcessorContext,
  agentConfig: AssistantConfig
): Promise<BandProcessingResult> {
  const startTime = Date.now();
  const concurrencyManager = getConcurrencyManager();
  let llmWarmupMs: number | undefined;

  try {
    const useRouterLite = (process.env.SOCIALWISE_ROUTER_LITE || '').trim() === '1';

    if (!useRouterLite) {
      // Generate warmup buttons using LLM with concurrency control
      bandLogger.info('Preparing warmup buttons generation', {
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

      llmWarmupMs = Date.now() - startTime;

      // ✅ NEW: Check if timeout occurred
      if (!warmupResult) {
        bandLogger.warn('SOFT band warmup timeout - returning fallback response', {
          llmWarmupMs,
          softDeadlineMs: agentConfig.softDeadlineMs,
          traceId: context.traceId
        });

        const fallbackResponse = buildTimeoutFallbackResponse(normalizeChannelType(context.channelType));
        return { response: fallbackResponse, llmWarmupMs };
      }

      const buttons = warmupResult.buttons.map(btn => ({
        title: btn.title,
        payload: btn.payload
      }));

      const response = buildChannelResponse(
        context.channelType,
        warmupResult.response_text,
        buttons
      );

      bandLogger.info('SOFT band warmup buttons generated', {
        candidatesCount: classification.candidates.length,
        buttonsGenerated: buttons.length,
        llmWarmupMs,
        traceId: context.traceId
      });

      return { response, llmWarmupMs };
    } else {
      // ROUTER_LITE path replacing SOFT band
      bandLogger.info('SOFT band replaced by ROUTER_LITE (flag enabled)', {
        sessionId: context.sessionId,
        hasSessionId: !!context.sessionId,
        channelType: context.channelType,
        traceId: context.traceId
      });

      const routerResult = await concurrencyManager.executeLlmOperation(
        context.inboxId,
        () => openaiService.routerLLM(
          context.userText,
          agentConfig,
          {
            channelType: normalizeChannelType(context.channelType),
            sessionId: context.sessionId,
            intentHints: classification.candidates,
            profile: 'lite'
          }
        ),
        {
          priority: 'medium',
          timeoutMs: agentConfig.softDeadlineMs || 300,
          allowDegradation: true
        }
      );

      const llmWarmupMs = Date.now() - startTime;

      // ✅ NEW: Check if timeout occurred
      if (!routerResult) {
        bandLogger.warn('SOFT band ROUTER_LITE timeout - returning fallback response', {
          llmWarmupMs,
          softDeadlineMs: agentConfig.softDeadlineMs,
          traceId: context.traceId
        });

        const fallbackResponse = buildTimeoutFallbackResponse(normalizeChannelType(context.channelType));
        return { response: fallbackResponse, llmWarmupMs };
      }

      if (routerResult.mode === 'intent' && !routerResult.intent_payload) {
          const candidates = (classification.candidates || []).filter(c => typeof c.score === 'number');
          candidates.sort((a, b) => (b.score! - a.score!));
          const top = candidates[0];
          const dynThreshold = computeDynamicHintThreshold(candidates);

          if (top && (top.score ?? 0) >= dynThreshold) {
            routerResult.intent_payload = `@${top.slug}`;
            bandLogger.warn('ROUTER_LITE fallback applied: intent_payload filled from hints', {
              filled_payload: routerResult.intent_payload,
              top_score: Number((top.score ?? 0).toFixed(3)),
              threshold: dynThreshold,
              traceId: context.traceId
            });
          } else {
            bandLogger.warn('ROUTER_LITE fallback applied: degraded to chat (low confidence, no valid intent)', {
              top_slug: top?.slug,
              top_score: top?.score ?? null,
              threshold: dynThreshold,
              traceId: context.traceId
            });
            routerResult.mode = 'chat';
          }
        }

        const buttons = routerResult.buttons?.map(btn => ({ title: btn.title, payload: btn.payload }));
        const response = buildChannelResponse(context.channelType, routerResult.response_text, buttons);

        bandLogger.info('SOFT band via ROUTER_LITE processed', {
          mode: routerResult.mode,
          hasButtons: !!buttons?.length,
          llmWarmupMs,
          traceId: context.traceId
        });

        return { response, llmWarmupMs };
      }

    // ✅ Degradation fallback moved to catch block - this was unreachable code
  } catch (error) {
    bandLogger.error('SOFT band processing failed', {
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
export async function processRouterBand(
  context: ProcessorContext,
  agentConfig: AssistantConfig,
  intentHints?: IntentCandidate[]
): Promise<BandProcessingResult> {
  const startTime = Date.now();
  const concurrencyManager = getConcurrencyManager();

  try {
    // Debug: Log agent configuration for router LLM
    bandLogger.info('Router LLM agent configuration', {
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
    bandLogger.info('Router LLM invoking with hints', {
      hints_count: filteredHints.length,
      min_score: 0.35,
      traceId: context.traceId
    });

    const routerResult = await concurrencyManager.executeLlmOperation(
      context.inboxId,
      () => openaiService.routerLLM(context.userText, agentConfig, {
        channelType: normalizeChannelType(context.channelType),
        sessionId: context.sessionId,
        intentHints: filteredHints,
        supplementalContext: context.agentSupplement
      }),
      {
        priority: 'high', // Router decisions are high priority
        timeoutMs: agentConfig.hardDeadlineMs || 400,
        allowDegradation: true
      }
    );

    const llmWarmupMs = Date.now() - startTime;

    // ✅ NEW: Check if timeout occurred (routerResult is null after deadline)
    if (!routerResult) {
      bandLogger.warn('Router LLM timeout - returning fallback response', {
        llmWarmupMs,
        hardDeadlineMs: agentConfig.hardDeadlineMs,
        traceId: context.traceId
      });

      // Return timeout fallback response with retry and human handoff options
      const fallbackResponse = buildTimeoutFallbackResponse(normalizeChannelType(context.channelType));
      return {
        response: fallbackResponse,
        llmWarmupMs
      };
    }

    // Debug: Log router result details
    bandLogger.info('Router LLM result details', {
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
        const dynThreshold = computeDynamicHintThreshold(candidates);

        if (top && (top.score ?? 0) >= dynThreshold) {
          routerResult.intent_payload = `@${top.slug}`;
          bandLogger.warn('ROUTER fallback applied: intent_payload filled from hints', {
            filled_payload: routerResult.intent_payload,
            top_score: Number((top.score ?? 0).toFixed(3)),
            threshold: dynThreshold,
            traceId: context.traceId
          });
        } else {
          // Degrada para chat por baixa confiança
          bandLogger.warn('ROUTER fallback applied: degraded to chat (low confidence, no valid intent)', {
            top_slug: top?.slug,
            top_score: top?.score ?? null,
            threshold: dynThreshold,
            traceId: context.traceId
          });
          routerResult.mode = 'chat';
        }
      }

      if (routerResult.mode === 'intent' && routerResult.intent_payload) {
        // Try to map the intent based on channel
        const intentName = routerResult.intent_payload.replace(/^@/, '');
        if (isWhatsAppChannel(context.channelType)) {
          const contactContext = { contactName: context.contactName, contactPhone: context.contactPhone };
          let mapped = await buildWhatsAppByIntentRaw(intentName, context.inboxId, context.wamid, contactContext);
          if (!mapped) mapped = await buildWhatsAppByGlobalIntent(intentName, context.inboxId, context.wamid, contactContext);
          if (mapped) return { response: mapped, llmWarmupMs };
        } else if (isFacebookChannel(context.channelType)) {
          const contactContext = { contactName: context.contactName, contactPhone: context.contactPhone };
          let mapped = await buildFacebookPageByIntentRaw(intentName, context.inboxId, contactContext);
          if (!mapped) mapped = await buildFacebookPageByGlobalIntent(intentName, context.inboxId, contactContext);
          if (mapped) return { response: mapped, llmWarmupMs };
        } else if (isInstagramChannel(context.channelType)) {
          const contactContext = { contactName: context.contactName, contactPhone: context.contactPhone };
          let mapped = await buildInstagramByIntentRaw(intentName, context.inboxId, contactContext);
          if (!mapped) mapped = await buildInstagramByGlobalIntent(intentName, context.inboxId, contactContext);
          if (mapped) return { response: mapped, llmWarmupMs };
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
      bandLogger.info('Building channel response', {
        mode: routerResult.mode,
        response_text: routerResult.response_text,
        response_text_length: routerResult.response_text?.length || 0,
        buttonsCount: buttons?.length || 0,
        traceId: context.traceId
      });

      const response = buildChannelResponse(context.channelType, responseText, buttons);

      bandLogger.info('ROUTER band decision processed', {
        mode: routerResult.mode,
        hasButtons: !!buttons?.length,
        llmWarmupMs,
        traceId: context.traceId
      });

      return { response, llmWarmupMs };

    // ✅ Unreachable degradation code removed - handled in catch block
  } catch (error) {
    bandLogger.error('ROUTER band processing failed', {
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
