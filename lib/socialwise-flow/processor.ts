/**
 * SocialWise Flow Enhanced Processor
 * Integrates intelligent classification, structured outputs, performance monitoring,
 * concurrency control, and graceful degradation strategies
 */

import { createLogger } from '@/lib/utils/logger';
import { getPrismaInstance } from '@/lib/connections';
import type { IntentCandidate } from '@/services/openai-components/types';
import { classifyIntent, ClassificationResult } from './classification';
import { buildFallbackResponse, logChannelResponse, ChannelResponse } from './channel-formatting';
import { collectPerformanceMetrics, createPerformanceMetrics } from './metrics';
import {
  // Utility functions
  isWhatsAppChannel,
  isInstagramChannel,
  isFacebookChannel,
  extractSessionId,
  // Button reaction processing
  processButtonReaction,
  ButtonReactionMeta,
  ProcessorContext,
  // Assistant configuration
  loadAssistantConfiguration,
  // Processing band handlers
  processHardBand,
  processSoftBand,
  processRouterBand,
  // Reaction metadata
  applyReactionMetadata
} from './processor-components';

// Re-export for external use
export { extractSessionId } from './processor-components';
export type { ProcessorContext, ButtonReactionMeta } from './processor-components';

const processorLogger = createLogger('SocialWise-Processor');

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
 * Main SocialWise Flow processor
 */

export async function processSocialWiseFlow(
  context: ProcessorContext,
  embedipreview = true
): Promise<ProcessorResult> {
  const startTime = Date.now();
  
  try {
    // 1. Check for button reactions first (for both WhatsApp and Instagram)
    let buttonReactionMeta: ButtonReactionMeta | undefined;
    let shouldProcessLLM = true; // Por padrão, processa LLM
    
    if (isInstagramChannel(context.channelType) || isFacebookChannel(context.channelType) || isWhatsAppChannel(context.channelType)) {
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
            
            // ✅ CORREÇÃO: NÃO pular embedding - deixar seguir o fluxo completo
            // direct alias hit → embedding → classificação por bandas
            processorLogger.info('Button not mapped, processing through full flow with button text', {
              originalUserText: context.userText,
              realButtonText: realButtonText,
              bypassEmbedding: false,
              traceId: context.traceId
            });
          } else {
            // Fallback: extrai o buttonId para usar como texto se não houver message
            const payload = context.originalPayload;
            let buttonId: string | undefined;
            
            if (isWhatsAppChannel(context.channelType)) {
              buttonId = payload?.context?.message?.content_attributes?.button_reply?.id || payload?.button_id;
            } else if (isInstagramChannel(context.channelType) || isFacebookChannel(context.channelType)) {
              // Meta Platforms (Instagram + Facebook) usam a mesma estrutura
              buttonId = payload?.context?.message?.content_attributes?.postback_payload || 
                        payload?.context?.message?.content_attributes?.quick_reply_payload ||
                        payload?.postback_payload || 
                        payload?.quick_reply_payload;
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
              
              // ✅ CORREÇÃO: NÃO pular embedding - deixar seguir o fluxo completo
              processorLogger.info('Button not mapped, processing buttonId through full flow', {
                originalButtonId: buttonId,
                fallbackText: buttonText,
                bypassEmbedding: false,
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
      const response = applyReactionMetadata(fallbackResponse, buttonReactionMeta, context.channelType);
      
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

    // ✅ SEMPRE usar o fluxo completo: embedding-first ou router LLM mode
    if (embedipreview) {
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
          const softResult = await processSoftBand(classification, context, agentConfig);
          response = softResult.response;
          llmWarmupMs = softResult.llmWarmupMs;
          break;
        case 'ROUTER':
          // Process ROUTER band within embedding-first mode (degraded cases)
          const routerResult = await processRouterBand(context, agentConfig, classification.candidates);
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
      const routerResult = await processRouterBand(context, agentConfig, intentHints);
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
    if (buttonReactionMeta && (isInstagramChannel(context.channelType) || isFacebookChannel(context.channelType) || isWhatsAppChannel(context.channelType))) {
      response = applyReactionMetadata(response, buttonReactionMeta, context.channelType);
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
