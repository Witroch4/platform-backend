/**
 * SocialWise Flow Enhanced Processor
 * Integrates intelligent classification, structured outputs, performance monitoring,
 * concurrency control, and graceful degradation strategies
 */

import { createLogger } from '@/lib/utils/logger';
import { getPrismaInstance } from '@/lib/connections';
import { openaiService } from '@/services/openai';
import { classifyIntent, ClassificationResult } from './classification';
import { buildChannelResponse, buildDefaultLegalTopics, buildFallbackResponse, logChannelResponse, ChannelResponse } from './channel-formatting';
import { collectPerformanceMetrics, createPerformanceMetrics } from './metrics';
import { getAssistantForInbox } from '@/lib/socialwise/assistant';
import { buildWhatsAppByIntentRaw, buildWhatsAppByGlobalIntent } from '@/lib/socialwise/templates';
import { getConcurrencyManager } from './concurrency-manager';
import { 
  selectDegradationStrategy, 
  shouldDegrade, 
  determineFailurePoint,
  DegradationContext 
} from './degradation-strategies';

const processorLogger = createLogger('SocialWise-Processor');

export interface ProcessorContext {
  userText: string;
  channelType: string;
  inboxId: string;
  chatwitAccountId?: string;
  userId?: string;
  wamid?: string;
  traceId?: string;
}

export interface ProcessorResult {
  response: ChannelResponse;
  metrics: {
    band: 'HARD' | 'SOFT' | 'LOW' | 'ROUTER';
    strategy: string;
    routeTotalMs: number;
    embeddingMs?: number;
    llmWarmupMs?: number;
  };
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

    // Try direct mapping first
    let mapped = await buildWhatsAppByIntentRaw(topIntent.slug, context.inboxId, context.wamid);
    if (!mapped) {
      mapped = await buildWhatsAppByGlobalIntent(topIntent.slug, context.inboxId, context.wamid);
    }

    if (mapped) {
      processorLogger.info('HARD band direct mapping successful', {
        intent: topIntent.slug,
        score: topIntent.score,
        processingMs: Date.now() - startTime,
        traceId: context.traceId
      });
      return mapped;
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
    // Get assistant configuration
    const assistant = await getAssistantForInbox(context.inboxId, context.chatwitAccountId);
    if (!assistant) {
      return { 
        response: buildDefaultLegalTopics(context.channelType),
        llmWarmupMs: Date.now() - startTime
      };
    }

    const agentConfig = {
      model: assistant.model || 'gpt-4o-mini',
      developer: assistant.instructions || '',
      instructions: assistant.instructions || '',
      warmupDeadlineMs: 250
    };

    // Generate warmup buttons using LLM with concurrency control
    const warmupResult = await concurrencyManager.executeLlmOperation(
      context.inboxId,
      () => openaiService.generateWarmupButtons(
        context.userText,
        classification.candidates,
        agentConfig
      ),
      {
        priority: 'medium',
        timeoutMs: 300,
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
        warmupResult.introduction_text,
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
 * Process LOW band classification (<0.65 score)
 * Domain-specific legal topic suggestion
 */
async function processLowBand(
  classification: ClassificationResult,
  context: ProcessorContext
): Promise<ChannelResponse> {
  const startTime = Date.now();
  
  try {
    // For legal domain, provide common legal areas
    const response = buildDefaultLegalTopics(context.channelType);
    
    processorLogger.info('LOW band domain topics provided', {
      score: classification.score,
      processingMs: Date.now() - startTime,
      traceId: context.traceId
    });
    
    return response;
    
  } catch (error) {
    processorLogger.error('LOW band processing failed', {
      error: error instanceof Error ? error.message : String(error),
      traceId: context.traceId
    });
    
    return buildFallbackResponse(context.channelType, context.userText);
  }
}

/**
 * Process ROUTER band classification (embedipreview=false)
 * Full LLM routing with conversational freedom and concurrency control
 */
async function processRouterBand(
  context: ProcessorContext
): Promise<{ response: ChannelResponse; llmWarmupMs?: number }> {
  const startTime = Date.now();
  const concurrencyManager = getConcurrencyManager();
  
  try {
    // Get assistant configuration
    const assistant = await getAssistantForInbox(context.inboxId, context.chatwitAccountId);
    if (!assistant) {
      return { 
        response: buildFallbackResponse(context.channelType, context.userText),
        llmWarmupMs: Date.now() - startTime
      };
    }

    const agentConfig = {
      model: assistant.model || 'gpt-4o-mini',
      developer: assistant.instructions || '',
      instructions: assistant.instructions || '',
      warmupDeadlineMs: 300
    };

    // Use Router LLM to decide between intent and chat with concurrency control
    const routerResult = await concurrencyManager.executeLlmOperation(
      context.inboxId,
      () => openaiService.routerLLM(context.userText, agentConfig),
      {
        priority: 'high', // Router decisions are high priority
        timeoutMs: 400,
        allowDegradation: true
      }
    );

    const llmWarmupMs = Date.now() - startTime;

    if (routerResult) {
      if (routerResult.mode === 'intent' && routerResult.intent_payload) {
        // Try to map the intent
        const intentName = routerResult.intent_payload.replace(/^@/, '');
        let mapped = await buildWhatsAppByIntentRaw(intentName, context.inboxId, context.wamid);
        if (!mapped) {
          mapped = await buildWhatsAppByGlobalIntent(intentName, context.inboxId, context.wamid);
        }
        
        if (mapped) {
          return { response: mapped, llmWarmupMs };
        }
      }

      // Chat mode or intent mapping failed - build conversational response
      const buttons = routerResult.buttons?.map(btn => ({
        title: btn.title,
        payload: btn.payload
      }));

      const responseText = routerResult.introduction_text || routerResult.text || 'Como posso ajudar você?';
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
export async function processSocialWiseFlow(
  context: ProcessorContext,
  embedipreview = true
): Promise<ProcessorResult> {
  const startTime = Date.now();
  
  try {
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
          band: 'LOW',
          strategy: 'fallback_no_user',
          routeTotalMs
        }
      };
    }

    // Get assistant configuration for agent settings
    const assistant = await getAssistantForInbox(context.inboxId, context.chatwitAccountId);
    const agentConfig = {
      model: assistant?.model || 'gpt-4o-mini',
      developer: assistant?.instructions || '',
      instructions: assistant?.instructions || '',
      embedipreview: embedipreview,
      warmupDeadlineMs: 250
    };

    let classification: ClassificationResult;
    let response: ChannelResponse;
    let llmWarmupMs: number | undefined;

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
          const softResult = await processSoftBand(classification, context);
          response = softResult.response;
          llmWarmupMs = softResult.llmWarmupMs;
          break;
        case 'LOW':
          response = await processLowBand(classification, context);
          break;
        default:
          response = buildFallbackResponse(context.channelType, context.userText);
      }
    } else {
      // Router LLM mode
      const routerResult = await processRouterBand(context);
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
        embeddingMs: classification.metrics.embedding_ms,
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
      embeddingMs: classification.metrics.embedding_ms,
      llmWarmupMs,
      traceId: context.traceId
    });

    return {
      response,
      metrics: {
        band: classification.band,
        strategy: classification.strategy,
        routeTotalMs,
        embeddingMs: classification.metrics.embedding_ms,
        llmWarmupMs
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
      'LOW',
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
        band: 'LOW',
        strategy: 'error_fallback',
        routeTotalMs
      }
    };
  }
}