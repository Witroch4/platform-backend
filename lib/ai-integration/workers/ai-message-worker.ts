/**
 * AI Message Worker
 * Requirements: 1.1, 1.2, 14.1
 */

import { Worker, Job } from 'bullmq';
import { QUEUE_NAMES, aiMessageWorkerOptions } from '../queues/config';
import { AiMessageJobData, JobResult } from '../types/job-data';
import { aiLogger as logger } from '../utils/logger';
import { addToDLQ } from '../queues/dlq';

// Worker instance
let aiMessageWorker: Worker<AiMessageJobData, JobResult> | null = null;

/**
 * Process AI message job
 */
async function processAiMessage(job: Job<AiMessageJobData>): Promise<JobResult> {
  const startTime = Date.now();
  const { data } = job;
  
  logger.info('🔄 Processing AI message job', {
    jobId: job.id,
    traceId: data.traceId,
    accountId: data.accountId,
    conversationId: data.conversationId,
    messageId: data.messageId,
    channel: data.channel,
    stage: 'queue',
  });

  try {
    // Create distributed tracing span
    const span = createTraceSpan('ai-message-processing', {
      traceId: data.traceId,
      accountId: data.accountId,
      conversationId: data.conversationId,
      messageId: data.messageId,
      channel: data.channel,
    });

    let result: JobResult;

    try {
      // Check if agent handoff was requested
      if (data.agentHandoffRequested) {
        result = await handleAgentHandoff(data, span);
      } else {
        // Process with AI
        result = await processWithAI(data, span);
      }

      // span.setStatus({ code: 'OK', message: 'Success' });
      span.end();

      const processingTime = Date.now() - startTime;
      
      logger.info('✅ AI message job completed', {
        jobId: job.id,
        traceId: data.traceId,
        accountId: data.accountId,
        conversationId: data.conversationId,
        metadata: {
          success: result.success,
          processingTimeMs: processingTime,
          fallbackReason: result.fallbackReason,
        },
      });

      return {
        ...result,
        metrics: {
          ...result.metrics,
          processingTimeMs: processingTime,
        },
      };
    } catch (error) {
      span.recordException(error as Error);
      // span.setStatus({ code: 'ERROR', message: (error as Error).message });
      span.end();
      throw error;
    }
  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('❌ AI message job failed', {
      jobId: job.id,
      traceId: data.traceId,
      accountId: data.accountId,
      conversationId: data.conversationId,
      error: (error as Error).message,
      metadata: {
        processingTimeMs: processingTime,
      },
    });

    // Determine if this should be retried or sent to DLQ
    const shouldRetry = shouldRetryJob(error as Error, job.attemptsMade);
    
    if (!shouldRetry) {
      // Send to DLQ
      await addToDLQ(job, (error as Error).message, 'ai-message');
    }

    throw error;
  }
}

/**
 * Handle agent handoff
 */
async function handleAgentHandoff(
  data: AiMessageJobData, 
  span: any
): Promise<JobResult> {
  span.addEvent('agent-handoff-requested');
  
  // TODO: Implement Chatwit API integration (will be done in task 9)
  // For now, return a placeholder result
  
  logger.info('👤 Agent handoff requested', {
    traceId: data.traceId,
    conversationId: data.conversationId,
  });

  return {
    success: true,
    result: {
      type: 'agent_handoff',
      message: 'Acionei um atendente humano',
    },
    fallbackReason: 'agent_handoff_requested',
  };
}

/**
 * Process message with AI
 */
async function processWithAI(
  data: AiMessageJobData, 
  span: any
): Promise<JobResult> {
  span.addEvent('ai-processing-started');

  // Check feature flags
  if (!data.featureFlags?.intentsEnabled && !data.featureFlags?.dynamicLlmEnabled) {
    return await handleAgentHandoff(data, span);
  }

  try {
    // Step 1: Try intent classification (if enabled)
    if (data.featureFlags?.intentsEnabled) {
      span.addEvent('intent-classification-started');
      
      // TODO: Implement intent classification (will be done in task 6)
      // For now, simulate intent classification
      const intentResult = await simulateIntentClassification(data);
      
      if (intentResult.found) {
        span.addEvent('intent-found', { intent: intentResult.intent });
        
        return {
          success: true,
          result: {
            type: 'intent_response',
            intent: intentResult.intent,
            message: intentResult.response,
          },
          metrics: {
            processingTimeMs: 0, // Will be set by caller
            intentScore: intentResult.score,
          },
        };
      }
    }

    // Step 2: Try dynamic LLM generation (if enabled)
    if (data.featureFlags?.dynamicLlmEnabled) {
      span.addEvent('llm-generation-started');
      
      // TODO: Implement LLM generation (will be done in task 7)
      // For now, simulate LLM generation
      const llmResult = await simulateLLMGeneration(data);
      
      span.addEvent('llm-generation-completed');
      
      return {
        success: true,
        result: {
          type: 'llm_response',
          message: llmResult.message,
          buttons: llmResult.buttons,
        },
        metrics: {
          processingTimeMs: 0, // Will be set by caller
          llmTokensUsed: llmResult.tokensUsed,
        },
      };
    }

    // Fallback to agent handoff
    return await handleAgentHandoff(data, span);
  } catch (error) {
    span.recordException(error as Error);
    
    // On AI processing error, fallback to agent handoff
    logger.warn('⚠️ AI processing failed, falling back to agent handoff', {
      traceId: data.traceId,
      error: (error as Error).message,
    });
    
    return await handleAgentHandoff(data, span);
  }
}/**

 * Simulate intent classification (placeholder)
 */
async function simulateIntentClassification(data: AiMessageJobData) {
  // Simple keyword matching for simulation
  const text = data.text.toLowerCase();
  
  if (text.includes('rastrear') || text.includes('pedido') || text.includes('entrega')) {
    return {
      found: true,
      intent: 'track_order',
      score: 0.85,
      response: 'Vou ajudar você a rastrear seu pedido. Por favor, informe o número do pedido.',
    };
  }
  
  if (text.includes('pagamento') || text.includes('pagar') || text.includes('cobrança')) {
    return {
      found: true,
      intent: 'payment_help',
      score: 0.82,
      response: 'Posso ajudar com questões de pagamento. Qual é sua dúvida?',
    };
  }
  
  return { found: false };
}

/**
 * Simulate LLM generation (placeholder)
 */
async function simulateLLMGeneration(data: AiMessageJobData) {
  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  return {
    message: 'Como posso ajudar você hoje?',
    buttons: [
      { title: 'Rastrear Pedido', id: 'intent:track_order' },
      { title: 'Pagamento', id: 'intent:payment_help' },
      { title: 'Falar com Atendente', id: 'handoff:human' },
    ],
    tokensUsed: 150,
  };
}

/**
 * Determine if job should be retried
 */
function shouldRetryJob(error: Error, attemptsMade: number): boolean {
  const errorMessage = error.message.toLowerCase();
  
  // Don't retry client errors (4xx)
  if (errorMessage.includes('400') || 
      errorMessage.includes('401') || 
      errorMessage.includes('403') || 
      errorMessage.includes('404')) {
    return false;
  }
  
  // Don't retry if max attempts reached
  if (attemptsMade >= 3) {
    return false;
  }
  
  // Retry server errors and timeouts
  return true;
}

/**
 * Create distributed tracing span (placeholder)
 */
function createTraceSpan(name: string, attributes: Record<string, any>) {
  // TODO: Implement proper distributed tracing (OpenTelemetry)
  // For now, return a mock span
  return {
    addEvent: (name: string, attributes?: Record<string, any>) => {
      logger.debug(`Trace event: ${name}`, attributes);
    },
    recordException: (error: Error) => {
      logger.error('Trace exception recorded', { error: error.message });
    },
    setStatus: (status: { code: string; message?: string }) => {
      // logger.debug('Trace status set', status);
    },
    end: () => {
      logger.debug('Trace span ended');
    },
  };
}

/**
 * Initialize AI Message Worker
 */
export function initializeAiMessageWorker(): Worker<AiMessageJobData, JobResult> {
  if (aiMessageWorker) {
    return aiMessageWorker;
  }

  aiMessageWorker = new Worker<AiMessageJobData, JobResult>(
    QUEUE_NAMES.AI_INCOMING_MESSAGE,
    processAiMessage,
    aiMessageWorkerOptions
  );

  // Setup event listeners
  aiMessageWorker.on('completed', (job, result) => {
    logger.info('✅ AI message worker job completed', {
      jobId: job.id,
      traceId: job.data.traceId,
      metadata: {
        success: result.success,
      },
    });
  });

  aiMessageWorker.on('failed', (job, err) => {
    logger.error('❌ AI message worker job failed', {
      jobId: job?.id,
      traceId: job?.data?.traceId,
      error: err.message,
      metadata: {
        attempts: job?.attemptsMade,
      },
    });
  });

  aiMessageWorker.on('stalled', (jobId) => {
    logger.warn('⚠️ AI message worker job stalled', { jobId });
  });

  aiMessageWorker.on('error', (err) => {
    logger.error('❌ AI message worker error', { error: err.message });
  });

  logger.info('🚀 AI Message Worker initialized', {
    metadata: {
      queueName: QUEUE_NAMES.AI_INCOMING_MESSAGE,
      concurrency: aiMessageWorkerOptions.concurrency,
    },
  });

  return aiMessageWorker;
}

/**
 * Get AI Message Worker instance
 */
export function getAiMessageWorker(): Worker<AiMessageJobData, JobResult> | null {
  return aiMessageWorker;
}

/**
 * Close AI Message Worker
 */
export async function closeAiMessageWorker(): Promise<void> {
  if (aiMessageWorker) {
    await aiMessageWorker.close();
    aiMessageWorker = null;
    logger.info('🔌 AI Message Worker closed');
  }
}