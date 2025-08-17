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

function isWhatsAppChannel(channelType?: string) {
  return (channelType || '').toLowerCase().includes('whatsapp');
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
 * Load full assistant configuration including SocialWise Flow deadlines
 * Supports inbox-level inheritance from agent configurations
 */
async function loadAssistantConfiguration(inboxId: string, chatwitAccountId?: string) {
  try {
    const prisma = getPrismaInstance();
    
    // Get assistant configuration with full details
    const assistant = await getAssistantForInbox(inboxId, chatwitAccountId);
    if (!assistant) {
      processorLogger.warn('No assistant found for inbox', { inboxId });
      return null;
    }

    // Get full assistant configuration from database
    const fullAssistant = await prisma.aiAssistant.findFirst({
      where: { 
        id: assistant.id,
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

    // Try direct mapping only for WhatsApp channel
    if (isWhatsAppChannel(context.channelType)) {
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
    } else {
      processorLogger.info('HARD band skipping direct mapping for non-WhatsApp channel', {
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
    const warmupResult = await concurrencyManager.executeLlmOperation(
      context.inboxId,
      () => openaiService.generateWarmupButtons(
        context.userText,
        classification.candidates,
        agentConfig,
        { channelType: normalizeChannelType(context.channelType) }
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
 * 🎯 NOVO: Chat livre com IA gerando botões dinâmicos baseados no agente configurado
 */
async function processLowBand(
  classification: ClassificationResult,
  context: ProcessorContext
): Promise<ChannelResponse> {
  const startTime = Date.now();
  const concurrencyManager = getConcurrencyManager();
  
  try {
    // 🎯 CORRIGIDO: Usar configuração do agente para chat livre
    const agentConfig = await loadAssistantConfiguration(context.inboxId, context.chatwitAccountId);
    if (!agentConfig) {
      return buildDefaultLegalTopics(context.channelType);
    }

    // 🎯 NOVA FUNCIONALIDADE: Chat livre com IA para banda LOW
    const freechatResult = await concurrencyManager.executeLlmOperation(
      context.inboxId,
      () => openaiService.generateFreeChatButtons(
        context.userText,
        agentConfig, // Usar instruções do agente configurado no Capitão
        { channelType: normalizeChannelType(context.channelType) }
      ),
      {
        priority: 'low',
        timeoutMs: agentConfig.warmupDeadlineMs || 1000,
        allowDegradation: true
      }
    );

    if (freechatResult) {
      const buttons = freechatResult.buttons.map(btn => ({
        title: btn.title,
        payload: btn.payload
      }));

      const response = buildChannelResponse(
        context.channelType,
        freechatResult.introduction_text,
        buttons
      );

      processorLogger.info('LOW band free chat generated', {
        score: classification.score,
        buttonsGenerated: buttons.length,
        processingMs: Date.now() - startTime,
        traceId: context.traceId
      });

      return response;
    }

    // Fallback para tópicos padrão se IA falhar
    const response = buildDefaultLegalTopics(context.channelType);
    
    processorLogger.info('LOW band domain topics provided (fallback)', {
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
      traceId: context.traceId
    });

    // Use Router LLM to decide between intent and chat with concurrency control
    const routerResult = await concurrencyManager.executeLlmOperation(
      context.inboxId,
      () => openaiService.routerLLM(context.userText, agentConfig, { channelType: normalizeChannelType(context.channelType) }),
      {
        priority: 'high', // Router decisions are high priority
        timeoutMs: agentConfig.hardDeadlineMs || 400,
        allowDegradation: true
      }
    );

    const llmWarmupMs = Date.now() - startTime;

    if (routerResult) {
      if (routerResult.mode === 'intent' && routerResult.intent_payload) {
        // Try to map the intent (only for WhatsApp)
        const intentName = routerResult.intent_payload.replace(/^@/, '');
        if (isWhatsAppChannel(context.channelType)) {
          let mapped = await buildWhatsAppByIntentRaw(intentName, context.inboxId, context.wamid);
          if (!mapped) {
            mapped = await buildWhatsAppByGlobalIntent(intentName, context.inboxId, context.wamid);
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

    // Get full assistant configuration for agent settings
    const agentConfig = await loadAssistantConfiguration(context.inboxId, context.chatwitAccountId);
    if (!agentConfig) {
      const response = buildFallbackResponse(context.channelType, context.userText);
      const routeTotalMs = Date.now() - startTime;
      
      return {
        response,
        metrics: {
          band: 'LOW',
          strategy: 'fallback_no_agent_config',
          routeTotalMs
        }
      };
    }

    // Override embedipreview if provided explicitly
    agentConfig.embedipreview = embedipreview;

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