/**
 * Metrics Middleware for Automatic Collection
 * Based on requirements 10.1, 10.2, 14.2
 */

import { aiMetrics, MetricLabels } from './metrics';
import { aiLogger } from './logger';

export interface TimingContext {
  startTime: number;
  stage: string;
  labels: MetricLabels;
}

export class MetricsMiddleware {
  // Start timing for a stage
  static startTiming(stage: string, labels: MetricLabels = {}): TimingContext {
    return {
      startTime: Date.now(),
      stage,
      labels,
    };
  }

  // End timing and record metrics
  static endTiming(context: TimingContext, status: 'success' | 'error' | 'timeout' = 'success'): number {
    const duration = Date.now() - context.startTime;
    
    // Record latency
    aiMetrics.recordJobLatency(context.stage, duration, context.labels);
    
    // Record job count
    aiMetrics.incrementJobsTotal(context.stage, status, context.labels);
    
    // Log performance
    aiLogger.info(
      `Stage ${context.stage} completed`,
      {
        ...context.labels,
        stage: context.stage as "webhook" | "queue" | "classify" | "generate" | "deliver" | "admin",
        duration,
      }
    );

    return duration;
  }

  // Decorator for automatic timing
  static timed(stage: string, labels: MetricLabels = {}) {
    return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
      const method = descriptor.value;

      descriptor.value = async function (...args: any[]) {
        const context = MetricsMiddleware.startTiming(stage, {
          ...labels,
          method: propertyName,
        });

        try {
          const result = await method.apply(this, args);
          MetricsMiddleware.endTiming(context, 'success');
          return result;
        } catch (error) {
          MetricsMiddleware.endTiming(context, 'error');
          throw error;
        }
      };
    };
  }

  // Wrapper for functions with automatic metrics
  static withMetrics<T extends (...args: any[]) => any>(
    fn: T,
    stage: string,
    labels: MetricLabels = {}
  ): T {
    return (async (...args: any[]) => {
      const context = MetricsMiddleware.startTiming(stage, labels);

      try {
        const result = await fn(...args);
        MetricsMiddleware.endTiming(context, 'success');
        return result;
      } catch (error) {
        MetricsMiddleware.endTiming(context, 'error');
        throw error;
      }
    }) as T;
  }

  // Record LLM API call metrics
  static recordLLMCall(
    model: string,
    operation: string,
    durationMs: number,
    tokens: number,
    success: boolean,
    labels: MetricLabels = {}
  ): void {
    // Record response time
    aiMetrics.recordLLMResponseTime(model, operation, durationMs, labels);
    
    // Record token usage
    aiMetrics.recordLLMTokens(model, operation, tokens, labels);
    
    // Record success/failure
    aiMetrics.incrementJobsTotal('llm', success ? 'success' : 'error', {
      model,
      operation,
      ...labels,
    });

    // Log the call
    aiLogger.info('LLM API call completed', {
      stage: 'generate',
      duration: durationMs,
      metadata: {
        model,
        operation,
        tokens,
        success,
      },
      ...labels,
    });
  }

  // Record intent classification metrics
  static recordIntentClassification(
    intentName: string | null,
    confidence: number,
    candidates: Array<{ name: string; similarity: number }>,
    labels: MetricLabels = {}
  ): void {
    if (intentName) {
      // Record successful classification
      aiMetrics.recordIntentConfidence(intentName, confidence, labels);
      aiMetrics.incrementJobsTotal('classify', 'success', { intent: intentName, ...labels });
    } else {
      // Record rejection
      aiMetrics.incrementIntentRejects(labels);
      aiMetrics.incrementJobsTotal('classify', 'rejected', labels);
    }

    // Log classification details
    aiLogger.classify('Intent classification completed', {
      ...labels,
      metadata: {
        intentName,
        confidence,
        candidatesCount: candidates.length,
        topCandidate: candidates[0]?.name,
        topScore: candidates[0]?.similarity,
      },
    });
  }

  // Record rate limit hit
  static recordRateLimit(scope: string, labels: MetricLabels = {}): void {
    aiMetrics.incrementRateLimitHits(scope, labels);
    
    aiLogger.warn('Rate limit hit', {
      stage: 'webhook',
      ...labels,
      metadata: { scope },
    });
  }

  // Record fallback to human
  static recordFallback(reason: string, labels: MetricLabels = {}): void {
    aiMetrics.incrementFallbacks(reason, labels);
    
    aiLogger.warn('Fallback to human agent', {
      stage: 'deliver',
      ...labels,
      metadata: { reason },
    });
  }

  // Record DLQ event
  static recordDLQ(reason: string, jobData: any, labels: MetricLabels = {}): void {
    aiMetrics.incrementJobsDLQ(reason, labels);
    
    aiLogger.error('Job sent to dead letter queue', {
      stage: 'queue',
      error: reason,
      ...labels,
      metadata: {
        jobId: jobData.jobId,
        attempts: jobData.attempts,
      },
    });
  }

  // Record queue metrics
  static updateQueueMetrics(queueName: string, stats: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }): void {
    aiMetrics.setJobsInQueue(queueName, stats.waiting + stats.active + stats.delayed);
    
    // Calculate and record queue lag if available
    // This would typically be done by examining job timestamps
    
    aiLogger.debug('Queue metrics updated', {
      stage: 'queue',
      metadata: {
        queueName,
        ...stats,
      },
    });
  }

  // Record circuit breaker state change
  static recordCircuitBreakerState(service: string, state: 'open' | 'closed' | 'half_open'): void {
    aiMetrics.setCircuitBreakerState(service, state);
    
    aiLogger.warn(`Circuit breaker state changed to ${state}`, {
      stage: 'generate',
      metadata: { service, state },
    });
  }

  // Record button routing
  static recordButtonRoute(route: string, success: boolean, labels: MetricLabels = {}): void {
    const status = success ? 'success' : 'error';
    aiMetrics.incrementButtonRoutes(route, status, labels);
    
    aiLogger.info('Button route processed', {
      stage: 'classify',
      ...labels,
      metadata: { route, status },
    });
  }

  // Record budget exceeded
  static recordBudgetExceeded(accountId: number, type: 'tokens' | 'cost', limit: number, current: number): void {
    aiMetrics.incrementBudgetExceeded(accountId);
    
    aiLogger.warn('Budget exceeded', {
      stage: 'generate',
      accountId,
      metadata: {
        type,
        limit,
        current,
        percentage: (current / limit) * 100,
      },
    });
  }

  // Record cost metrics
  static recordCost(
    model: string,
    accountId: number,
    tokens: number,
    costUsd: number,
    labels: MetricLabels = {}
  ): void {
    aiMetrics.recordLLMCost(model, accountId, tokens, costUsd);
    
    aiLogger.info('LLM cost recorded', {
      stage: 'generate',
      accountId,
      ...labels,
      metadata: {
        model,
        tokens,
        costUsd,
        costPerToken: costUsd / tokens,
      },
    });
  }

  // Health check metrics
  static recordHealthCheck(service: string, healthy: boolean, responseTimeMs?: number): void {
    const status = healthy ? 'healthy' : 'unhealthy';
    
    aiMetrics.incrementJobsTotal('health_check', status, { service });
    
    if (responseTimeMs !== undefined) {
      aiMetrics.recordJobLatency('health_check', responseTimeMs, { service });
    }
    
    aiLogger.info(`Health check for ${service}`, {
      stage: 'admin',
      metadata: {
        service,
        status,
        responseTimeMs,
      },
    });
  }

  // Batch metrics update for performance
  static batchUpdate(updates: Array<{
    type: 'counter' | 'gauge' | 'histogram';
    name: string;
    value: number;
    labels?: MetricLabels;
  }>): void {
    updates.forEach(update => {
      switch (update.type) {
        case 'counter':
          aiMetrics.incrementJobsTotal('batch', 'success', update.labels);
          break;
        case 'gauge':
          // Would need to expose gauge methods from aiMetrics
          break;
        case 'histogram':
          aiMetrics.recordJobLatency('batch', update.value, update.labels);
          break;
      }
    });

    aiLogger.debug('Batch metrics update completed', {
      stage: 'admin',
      metadata: {
        updatesCount: updates.length,
      },
    });
  }
}

// Convenience functions
export const startTiming = MetricsMiddleware.startTiming;
export const endTiming = MetricsMiddleware.endTiming;
export const withMetrics = MetricsMiddleware.withMetrics;
export const timed = MetricsMiddleware.timed;

export default MetricsMiddleware;