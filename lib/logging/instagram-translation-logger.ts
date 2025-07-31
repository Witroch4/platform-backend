import { performance } from 'perf_hooks';
import { connection } from '../redis';
import type IORedis from 'ioredis';

// Log levels
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

// Log level enum for easier usage
export const LogLevel = {
  DEBUG: 'debug' as const,
  INFO: 'info' as const,
  WARN: 'warn' as const,
  ERROR: 'error' as const,
  CRITICAL: 'critical' as const,
} as const;

// Log entry interface
export interface InstagramTranslationLogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  correlationId: string;
  message: string;
  metadata?: Record<string, any>;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  performance?: {
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
  };
}

// Log categories for better organization
export enum LogCategory {
  WEBHOOK = 'webhook',
  WORKER = 'worker',
  QUEUE = 'queue',
  CONVERSION = 'conversion',
  VALIDATION = 'validation',
  DATABASE = 'database',
  MONITORING = 'monitoring',
  ERROR_HANDLING = 'error-handling',
}

// Context interface for tracking request flow
export interface LogContext {
  correlationId: string;
  jobId?: string;
  intentName?: string;
  inboxId?: string;
  messageType?: string;
  templateType?: string;
  retryCount?: number;
  startTime?: number;
}

export class InstagramTranslationLogger {
  private static instance: InstagramTranslationLogger;
  private redis: IORedis;
  private logBuffer: InstagramTranslationLogEntry[] = [];
  private readonly BUFFER_SIZE = 500;
  private readonly FLUSH_INTERVAL = 15000; // 15 seconds
  private readonly LOG_RETENTION_HOURS = 24;

  constructor(redisConnection?: IORedis) {
    this.redis = redisConnection || connection;
    this.startLogFlushing();
  }

  static getInstance(): InstagramTranslationLogger {
    if (!this.instance) {
      this.instance = new InstagramTranslationLogger();
    }
    return this.instance;
  }

  // Start periodic log flushing to Redis
  private startLogFlushing(): void {
    setInterval(() => {
      this.flushLogsToRedis().catch(error => {
        console.error('[Instagram Logger] Error flushing logs:', error);
      });
    }, this.FLUSH_INTERVAL);

    console.log('[Instagram Logger] Log flushing started');
  }

  // Core logging method with structured format
  private log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    context: LogContext,
    metadata?: Record<string, any>,
    error?: Error
  ): void {
    const timestamp = new Date().toISOString();
    const duration = context.startTime ? performance.now() - context.startTime : undefined;

    const logEntry: InstagramTranslationLogEntry = {
      timestamp,
      level,
      component: `instagram-translation-${category}`,
      correlationId: context.correlationId,
      message,
      metadata: {
        ...metadata,
        jobId: context.jobId,
        intentName: context.intentName,
        inboxId: context.inboxId,
        messageType: context.messageType,
        templateType: context.templateType,
        retryCount: context.retryCount,
      },
      duration,
    };

    // Add error details if provided
    if (error) {
      logEntry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      };
    }

    // Add performance metrics for worker logs
    if (category === LogCategory.WORKER || category === LogCategory.CONVERSION) {
      logEntry.performance = {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
      };
    }

    // Add to buffer
    this.logBuffer.push(logEntry);
    
    if (this.logBuffer.length > this.BUFFER_SIZE) {
      this.logBuffer.shift();
    }

    // Console output with structured format
    this.outputToConsole(logEntry);
  }

  // Output to console with proper formatting
  private outputToConsole(entry: InstagramTranslationLogEntry): void {
    const prefix = `[${entry.component}] [${entry.level.toUpperCase()}] [${entry.correlationId}]`;
    const message = `${prefix} ${entry.message}`;
    
    const contextData = {
      timestamp: entry.timestamp,
      duration: entry.duration ? `${entry.duration.toFixed(2)}ms` : undefined,
      ...entry.metadata,
    };

    // Remove undefined values
    Object.keys(contextData).forEach(key => {
      if (contextData[key] === undefined) {
        delete contextData[key];
      }
    });

    switch (entry.level) {
      case 'critical':
      case 'error':
        console.error(message, entry.error ? { ...contextData, error: entry.error } : contextData);
        break;
      case 'warn':
        console.warn(message, contextData);
        break;
      case 'debug':
        console.debug(message, contextData);
        break;
      default:
        console.log(message, contextData);
    }
  }

  // Webhook-specific logging methods
  webhookReceived(context: LogContext, payload: any): void {
    this.log(LogLevel.INFO, LogCategory.WEBHOOK, 'Webhook request received', context, {
      payloadSize: JSON.stringify(payload).length,
      hasOriginalPayload: !!payload.originalDetectIntentRequest,
    });
  }

  webhookChannelDetected(context: LogContext, channelType: string, isInstagram: boolean): void {
    this.log(LogLevel.INFO, LogCategory.WEBHOOK, 'Channel type detected', context, {
      channelType,
      isInstagram,
      action: isInstagram ? 'queue_for_translation' : 'use_whatsapp_logic',
    });
  }

  webhookJobEnqueued(context: LogContext, jobId: string): void {
    this.log(LogLevel.INFO, LogCategory.WEBHOOK, 'Translation job enqueued', context, {
      jobId,
      queueName: 'instagram-translation',
    });
  }

  webhookWaitingForResult(context: LogContext, timeoutMs: number): void {
    this.log(LogLevel.DEBUG, LogCategory.WEBHOOK, 'Waiting for translation result', context, {
      timeoutMs,
      startedWaitingAt: new Date().toISOString(),
    });
  }

  webhookResultReceived(context: LogContext, success: boolean, processingTime: number): void {
    this.log(LogLevel.INFO, LogCategory.WEBHOOK, 'Translation result received', context, {
      success,
      processingTime,
      resultType: success ? 'success' : 'error',
    });
  }

  webhookTimeout(context: LogContext, timeoutMs: number): void {
    this.log(LogLevel.WARN, LogCategory.WEBHOOK, 'Webhook response timeout', context, {
      timeoutMs,
      action: 'sending_fallback_response',
    });
  }

  webhookError(context: LogContext, error: Error, stage: string): void {
    this.log(LogLevel.ERROR, LogCategory.WEBHOOK, `Webhook error during ${stage}`, context, {
      stage,
      errorType: error.constructor.name,
    }, error);
  }

  // Worker-specific logging methods
  workerJobStarted(context: LogContext): void {
    this.log(LogLevel.INFO, LogCategory.WORKER, 'Worker job started', context, {
      startedAt: new Date().toISOString(),
      memoryUsageMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    });
  }

  workerDatabaseQuery(context: LogContext, queryType: string, executionTime: number): void {
    this.log(LogLevel.DEBUG, LogCategory.DATABASE, 'Database query executed', context, {
      queryType,
      executionTime,
      performance: executionTime > 1000 ? 'slow' : 'normal',
    });
  }

  workerConversionStarted(context: LogContext, messageType: string, bodyLength: number): void {
    this.log(LogLevel.INFO, LogCategory.CONVERSION, 'Message conversion started', context, {
      messageType,
      bodyLength,
      conversionStartedAt: new Date().toISOString(),
    });
  }

  workerTemplateTypeDetected(context: LogContext, templateType: string, reason: string): void {
    this.log(LogLevel.DEBUG, LogCategory.CONVERSION, 'Instagram template type determined', context, {
      templateType,
      reason,
      isCompatible: templateType !== 'incompatible',
    });
  }

  workerButtonsConverted(context: LogContext, originalCount: number, convertedCount: number): void {
    this.log(LogLevel.DEBUG, LogCategory.CONVERSION, 'Buttons converted for Instagram', context, {
      originalCount,
      convertedCount,
      buttonsLimited: convertedCount < originalCount,
    });
  }

  workerValidationPerformed(context: LogContext, validationType: string, isValid: boolean, errors?: string[]): void {
    this.log(
      isValid ? LogLevel.DEBUG : LogLevel.WARN,
      LogCategory.VALIDATION,
      `Validation ${isValid ? 'passed' : 'failed'}: ${validationType}`,
      context,
      {
        validationType,
        isValid,
        errors: errors || [],
        errorCount: errors?.length || 0,
      }
    );
  }

  workerJobCompleted(context: LogContext, success: boolean, processingTime: number, messagesGenerated?: number): void {
    this.log(LogLevel.INFO, LogCategory.WORKER, 'Worker job completed', context, {
      success,
      processingTime,
      messagesGenerated,
      completedAt: new Date().toISOString(),
      memoryUsageMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    });
  }

  workerJobFailed(context: LogContext, error: Error, isRetryable: boolean): void {
    this.log(LogLevel.ERROR, LogCategory.WORKER, 'Worker job failed', context, {
      errorType: error.constructor.name,
      isRetryable,
      willRetry: isRetryable && (context.retryCount || 0) < 3,
      failedAt: new Date().toISOString(),
    }, error);
  }

  // Queue-specific logging methods
  queueJobAdded(context: LogContext, priority: number): void {
    this.log(LogLevel.DEBUG, LogCategory.QUEUE, 'Job added to queue', context, {
      priority,
      queueName: 'instagram-translation',
      addedAt: new Date().toISOString(),
    });
  }

  queueJobRetry(context: LogContext, attemptNumber: number, delay: number): void {
    this.log(LogLevel.WARN, LogCategory.QUEUE, 'Job retry scheduled', context, {
      attemptNumber,
      delay,
      retryScheduledAt: new Date().toISOString(),
    });
  }

  queueJobStalled(context: LogContext): void {
    this.log(LogLevel.WARN, LogCategory.QUEUE, 'Job stalled in queue', context, {
      stalledAt: new Date().toISOString(),
      action: 'will_be_retried',
    });
  }

  queueHealthCheck(queueName: string, health: any): void {
    this.log(LogLevel.DEBUG, LogCategory.MONITORING, 'Queue health check performed', 
      { correlationId: 'health-check' }, {
      queueName,
      waiting: health.waiting,
      active: health.active,
      failed: health.failed,
      paused: health.paused,
    });
  }

  // Error handling logging methods
  errorRecoveryAttempted(context: LogContext, errorCode: string, recoveryAction: string): void {
    this.log(LogLevel.INFO, LogCategory.ERROR_HANDLING, 'Error recovery attempted', context, {
      errorCode,
      recoveryAction,
      attemptedAt: new Date().toISOString(),
    });
  }

  errorRecoverySucceeded(context: LogContext, errorCode: string, fallbackUsed: string): void {
    this.log(LogLevel.INFO, LogCategory.ERROR_HANDLING, 'Error recovery succeeded', context, {
      errorCode,
      fallbackUsed,
      recoveredAt: new Date().toISOString(),
    });
  }

  errorRecoveryFailed(context: LogContext, errorCode: string, recoveryError: Error): void {
    this.log(LogLevel.ERROR, LogCategory.ERROR_HANDLING, 'Error recovery failed', context, {
      errorCode,
      recoveryErrorType: recoveryError.constructor.name,
    }, recoveryError);
  }

  // Performance and monitoring logging methods
  performanceMetricsRecorded(context: LogContext, metrics: Record<string, number>): void {
    this.log(LogLevel.DEBUG, LogCategory.MONITORING, 'Performance metrics recorded', context, {
      metrics,
      recordedAt: new Date().toISOString(),
    });
  }

  alertTriggered(alertLevel: string, alertMessage: string, correlationId?: string): void {
    this.log(LogLevel.WARN, LogCategory.MONITORING, `Alert triggered: ${alertMessage}`, 
      { correlationId: correlationId || 'system' }, {
      alertLevel,
      triggeredAt: new Date().toISOString(),
    });
  }

  // Utility methods
  createContext(correlationId: string, additionalContext?: Partial<LogContext>): LogContext {
    return {
      correlationId,
      startTime: performance.now(),
      ...additionalContext,
    };
  }

  updateContext(context: LogContext, updates: Partial<LogContext>): LogContext {
    return { ...context, ...updates };
  }

  // Flush logs to Redis for persistence and analysis
  private async flushLogsToRedis(): Promise<void> {
    if (this.logBuffer.length === 0) return;

    try {
      const timestamp = new Date().toISOString();
      const key = `chatwit:logs:instagram-translation:${timestamp}`;
      
      await this.redis.setex(
        key, 
        this.LOG_RETENTION_HOURS * 60 * 60, 
        JSON.stringify(this.logBuffer)
      );

      console.log(`[Instagram Logger] Flushed ${this.logBuffer.length} log entries to Redis`);
      this.logBuffer = [];

    } catch (error) {
      console.error('[Instagram Logger] Error flushing logs to Redis:', error);
    }
  }

  // Query logs from Redis (for debugging and analysis)
  async queryLogs(
    correlationId?: string,
    level?: LogLevel,
    category?: LogCategory,
    hoursBack: number = 1
  ): Promise<InstagramTranslationLogEntry[]> {
    try {
      const keys = await this.redis.keys('chatwit:logs:instagram-translation:*');
      const recentKeys = keys.filter(key => {
        const timestamp = key.split(':').pop();
        if (!timestamp) return false;
        
        const keyTime = new Date(timestamp).getTime();
        const cutoff = Date.now() - (hoursBack * 60 * 60 * 1000);
        return keyTime > cutoff;
      });

      const logBatches = await Promise.all(
        recentKeys.map(key => this.redis.get(key))
      );

      const allLogs: InstagramTranslationLogEntry[] = [];
      
      for (const batch of logBatches) {
        if (batch) {
          try {
            const logs = JSON.parse(batch) as InstagramTranslationLogEntry[];
            allLogs.push(...logs);
          } catch (parseError) {
            console.error('[Instagram Logger] Error parsing log batch:', parseError);
          }
        }
      }

      // Filter logs based on criteria
      return allLogs.filter(log => {
        if (correlationId && log.correlationId !== correlationId) return false;
        if (level && log.level !== level) return false;
        if (category && !log.component.includes(category)) return false;
        return true;
      }).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    } catch (error) {
      console.error('[Instagram Logger] Error querying logs:', error);
      return [];
    }
  }

  // Get log statistics
  async getLogStatistics(hoursBack: number = 1): Promise<{
    totalLogs: number;
    byLevel: Record<LogLevel, number>;
    byCategory: Record<string, number>;
    errorRate: number;
    topErrors: Array<{ message: string; count: number }>;
  }> {
    try {
      const logs = await this.queryLogs(undefined, undefined, undefined, hoursBack);
      
      const byLevel: Record<LogLevel, number> = {
        debug: 0,
        info: 0,
        warn: 0,
        error: 0,
        critical: 0,
      };

      const byCategory: Record<string, number> = {};
      const errorMessages: Record<string, number> = {};

      for (const log of logs) {
        byLevel[log.level]++;
        
        const category = log.component.replace('instagram-translation-', '');
        byCategory[category] = (byCategory[category] || 0) + 1;
        
        if (log.level === 'error' || log.level === 'critical') {
          const errorMsg = log.error?.message || log.message;
          errorMessages[errorMsg] = (errorMessages[errorMsg] || 0) + 1;
        }
      }

      const errorCount = byLevel.error + byLevel.critical;
      const errorRate = logs.length > 0 ? (errorCount / logs.length) * 100 : 0;

      const topErrors = Object.entries(errorMessages)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([message, count]) => ({ message, count }));

      return {
        totalLogs: logs.length,
        byLevel,
        byCategory,
        errorRate,
        topErrors,
      };

    } catch (error) {
      console.error('[Instagram Logger] Error getting log statistics:', error);
      return {
        totalLogs: 0,
        byLevel: { debug: 0, info: 0, warn: 0, error: 0, critical: 0 },
        byCategory: {},
        errorRate: 0,
        topErrors: [],
      };
    }
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    try {
      console.log('[Instagram Logger] Shutting down logger...');
      
      // Flush remaining logs
      await this.flushLogsToRedis();
      
      console.log('[Instagram Logger] Logger shutdown completed');
    } catch (error) {
      console.error('[Instagram Logger] Error during shutdown:', error);
    }
  }
}

// Global logger instance
export const instagramTranslationLogger = InstagramTranslationLogger.getInstance();

// Utility functions for easy integration
export function createLogContext(correlationId: string, additionalContext?: Partial<LogContext>): LogContext {
  return instagramTranslationLogger.createContext(correlationId, additionalContext);
}

export function updateLogContext(context: LogContext, updates: Partial<LogContext>): LogContext {
  return instagramTranslationLogger.updateContext(context, updates);
}

// Export logger methods for direct use
export const {
  webhookReceived,
  webhookChannelDetected,
  webhookJobEnqueued,
  webhookWaitingForResult,
  webhookResultReceived,
  webhookTimeout,
  webhookError,
  workerJobStarted,
  workerDatabaseQuery,
  workerConversionStarted,
  workerTemplateTypeDetected,
  workerButtonsConverted,
  workerValidationPerformed,
  workerJobCompleted,
  workerJobFailed,
  queueJobAdded,
  queueJobRetry,
  queueJobStalled,
  queueHealthCheck,
  errorRecoveryAttempted,
  errorRecoverySucceeded,
  errorRecoveryFailed,
  performanceMetricsRecorded,
  alertTriggered,
} = instagramTranslationLogger;

// Initialize Instagram translation logging
export async function initializeInstagramTranslationLogging(): Promise<void> {
  try {
    console.log('[Instagram Logger] Initializing Instagram translation logging...');
    
    // The logger is automatically initialized when getInstance() is called
    // This function is mainly for explicit initialization
    
    console.log('[Instagram Logger] Instagram translation logging initialized successfully');
  } catch (error) {
    console.error('[Instagram Logger] Failed to initialize Instagram translation logging:', error);
    throw error;
  }
}