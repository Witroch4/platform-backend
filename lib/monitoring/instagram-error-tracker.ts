import { getRedisInstance } from '../connections';
import { apm } from './application-performance-monitor';
import { InstagramTranslationErrorCodes } from '../error-handling/instagram-translation-errors';

// Error category definitions
export enum ErrorCategory {
  VALIDATION = 'validation',
  CONVERSION = 'conversion',
  DATABASE = 'database',
  QUEUE = 'queue',
  SYSTEM = 'system',
  TIMEOUT = 'timeout',
  NETWORK = 'network',
  BUSINESS_LOGIC = 'business_logic',
}

// Error severity levels
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// Error tracking entry
export interface ErrorTrackingEntry {
  id: string;
  correlationId: string;
  errorCode: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  stackTrace?: string;
  context: {
    intentName?: string;
    inboxId?: string;
    messageType?: string;
    templateType?: string;
    retryCount: number;
    jobId?: string;
  };
  metadata: Record<string, any>;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  resolution?: string;
  occurrenceCount: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
}

// Error pattern for detecting recurring issues
export interface ErrorPattern {
  id: string;
  errorCode: string;
  category: ErrorCategory;
  pattern: string;
  occurrences: number;
  affectedCorrelationIds: string[];
  firstSeen: Date;
  lastSeen: Date;
  isActive: boolean;
  severity: ErrorSeverity;
  suggestedAction?: string;
}

// Error statistics
export interface ErrorStatistics {
  totalErrors: number;
  errorsByCategory: Record<ErrorCategory, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  errorsByCode: Record<string, number>;
  errorRate: number;
  topErrors: Array<{
    errorCode: string;
    count: number;
    category: ErrorCategory;
    severity: ErrorSeverity;
  }>;
  patterns: ErrorPattern[];
  timeWindow: string;
}

export class InstagramErrorTracker {
  private static instance: InstagramErrorTracker;
  private redis: ReturnType<typeof getRedisInstance>;
  private errorBuffer: ErrorTrackingEntry[] = [];
  private errorPatterns: Map<string, ErrorPattern> = new Map();
  
  private readonly BUFFER_SIZE = 200;
  private readonly FLUSH_INTERVAL = 30000; // 30 seconds
  private readonly PATTERN_DETECTION_INTERVAL = 60000; // 1 minute
  private readonly ERROR_RETENTION_DAYS = 7;
  private readonly PATTERN_THRESHOLD = 3; // Minimum occurrences to consider a pattern

  constructor(redisConnection?: ReturnType<typeof getRedisInstance>) {
    this.redis = redisConnection || getRedisInstance();
    this.startErrorTracking();
  }

  static getInstance(): InstagramErrorTracker {
    if (!this.instance) {
      this.instance = new InstagramErrorTracker();
    }
    return this.instance;
  }

  // Start error tracking processes
  private startErrorTracking(): void {
    // Flush errors to Redis periodically
    setInterval(() => {
      this.flushErrorsToRedis().catch(error => {
        console.error('[Instagram Error Tracker] Error flushing errors:', error);
      });
    }, this.FLUSH_INTERVAL);

    // Detect error patterns periodically
    setInterval(() => {
      this.detectErrorPatterns().catch(error => {
        console.error('[Instagram Error Tracker] Error detecting patterns:', error);
      });
    }, this.PATTERN_DETECTION_INTERVAL);

    console.log('[Instagram Error Tracker] Error tracking started');
  }

  // Track an error with comprehensive categorization
  trackError(
    correlationId: string,
    errorCode: string,
    error: Error,
    context: {
      intentName?: string;
      inboxId?: string;
      messageType?: string;
      templateType?: string;
      retryCount?: number;
      jobId?: string;
    },
    metadata: Record<string, any> = {}
  ): void {
    const category = this.categorizeError(errorCode, error);
    const severity = this.determineSeverity(errorCode, category, context.retryCount || 0);
    
    const errorId = this.generateErrorId(correlationId, errorCode);
    const timestamp = new Date();

    // Check if this error already exists
    const existingError = this.errorBuffer.find(e => e.id === errorId);
    
    if (existingError) {
      // Update existing error
      existingError.occurrenceCount++;
      existingError.lastOccurrence = timestamp;
      existingError.context.retryCount = context.retryCount || 0;
      existingError.metadata = { ...existingError.metadata, ...metadata };
    } else {
      // Create new error entry
      const errorEntry: ErrorTrackingEntry = {
        id: errorId,
        correlationId,
        errorCode,
        category,
        severity,
        message: error.message,
        stackTrace: error.stack,
        context: {
          intentName: context.intentName,
          inboxId: context.inboxId,
          messageType: context.messageType,
          templateType: context.templateType,
          retryCount: context.retryCount || 0,
          jobId: context.jobId,
        },
        metadata,
        timestamp,
        resolved: false,
        occurrenceCount: 1,
        firstOccurrence: timestamp,
        lastOccurrence: timestamp,
      };

      this.errorBuffer.push(errorEntry);
      
      if (this.errorBuffer.length > this.BUFFER_SIZE) {
        this.errorBuffer.shift();
      }
    }

    // Log the error with structured format
    this.logError(correlationId, errorCode, category, severity, error, context, metadata);

    // Create alert for high severity errors
    if (severity === ErrorSeverity.HIGH || severity === ErrorSeverity.CRITICAL) {
      this.createErrorAlert(correlationId, errorCode, category, severity, error, context);
    }

    // Update error patterns
    this.updateErrorPattern(errorCode, category, correlationId, timestamp);
  }

  // Categorize error based on error code and error details
  private categorizeError(errorCode: string, error: Error): ErrorCategory {
    // Map error codes to categories
    const errorCodeMapping: Record<string, ErrorCategory> = {
      [InstagramTranslationErrorCodes.TEMPLATE_NOT_FOUND]: ErrorCategory.DATABASE,
      [InstagramTranslationErrorCodes.MESSAGE_TOO_LONG]: ErrorCategory.VALIDATION,
      [InstagramTranslationErrorCodes.INVALID_CHANNEL]: ErrorCategory.VALIDATION,
      [InstagramTranslationErrorCodes.DATABASE_ERROR]: ErrorCategory.DATABASE,
      [InstagramTranslationErrorCodes.CONVERSION_FAILED]: ErrorCategory.CONVERSION,
      [InstagramTranslationErrorCodes.VALIDATION_ERROR]: ErrorCategory.VALIDATION,
      [InstagramTranslationErrorCodes.TIMEOUT_ERROR]: ErrorCategory.TIMEOUT,
      [InstagramTranslationErrorCodes.QUEUE_ERROR]: ErrorCategory.QUEUE,
      [InstagramTranslationErrorCodes.SYSTEM_ERROR]: ErrorCategory.SYSTEM,
    };

    if (errorCodeMapping[errorCode]) {
      return errorCodeMapping[errorCode];
    }

    // Categorize based on error message patterns
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      return ErrorCategory.TIMEOUT;
    }
    
    if (errorMessage.includes('network') || errorMessage.includes('connection')) {
      return ErrorCategory.NETWORK;
    }
    
    if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
      return ErrorCategory.VALIDATION;
    }
    
    if (errorMessage.includes('database') || errorMessage.includes('query')) {
      return ErrorCategory.DATABASE;
    }
    
    if (errorMessage.includes('queue') || errorMessage.includes('job')) {
      return ErrorCategory.QUEUE;
    }

    // Default to system error
    return ErrorCategory.SYSTEM;
  }

  // Determine error severity
  private determineSeverity(errorCode: string, category: ErrorCategory, retryCount: number): ErrorSeverity {
    // Critical errors that require immediate attention
    const criticalErrors = [
      InstagramTranslationErrorCodes.SYSTEM_ERROR,
      InstagramTranslationErrorCodes.DATABASE_ERROR,
    ];

    if (criticalErrors.includes(errorCode as InstagramTranslationErrorCodes)) {
      return ErrorSeverity.CRITICAL;
    }

    // High severity for errors after multiple retries
    if (retryCount >= 2) {
      return ErrorSeverity.HIGH;
    }

    // Medium severity for business logic and conversion errors
    if (category === ErrorCategory.CONVERSION || category === ErrorCategory.BUSINESS_LOGIC) {
      return ErrorSeverity.MEDIUM;
    }

    // Low severity for validation and timeout errors (usually recoverable)
    if (category === ErrorCategory.VALIDATION || category === ErrorCategory.TIMEOUT) {
      return ErrorSeverity.LOW;
    }

    return ErrorSeverity.MEDIUM;
  }

  // Generate unique error ID
  private generateErrorId(correlationId: string, errorCode: string): string {
    return `${correlationId}-${errorCode}`;
  }

  // Log error with structured format
  private logError(
    correlationId: string,
    errorCode: string,
    category: ErrorCategory,
    severity: ErrorSeverity,
    error: Error,
    context: any,
    metadata: any
  ): void {
    const logLevel = severity === ErrorSeverity.CRITICAL ? 'error' : 
                    severity === ErrorSeverity.HIGH ? 'error' : 'warn';

    console[logLevel](`[Instagram Error Tracker] [${severity.toUpperCase()}] [${correlationId}] ${errorCode}: ${error.message}`, {
      category,
      severity,
      errorCode,
      correlationId,
      context,
      metadata,
      timestamp: new Date().toISOString(),
    });
  }

  // Create alert for high severity errors
  private createErrorAlert(
    correlationId: string,
    errorCode: string,
    category: ErrorCategory,
    severity: ErrorSeverity,
    error: Error,
    context: any
  ): void {
    const alertLevel = severity === ErrorSeverity.CRITICAL ? 'critical' : 'error';
    
    apm.triggerAlert({
      level: alertLevel,
      component: 'instagram-translation',
      message: `${severity.toUpperCase()} Instagram translation error: ${errorCode}`,
      metrics: {
        errorCode,
        category,
        severity,
        correlationId,
        errorMessage: error.message,
        context,
      },
    });
  }

  // Update error pattern tracking
  private updateErrorPattern(
    errorCode: string,
    category: ErrorCategory,
    correlationId: string,
    timestamp: Date
  ): void {
    const patternId = `${errorCode}-${category}`;
    
    let pattern = this.errorPatterns.get(patternId);
    
    if (pattern) {
      pattern.occurrences++;
      pattern.lastSeen = timestamp;
      pattern.affectedCorrelationIds.push(correlationId);
      
      // Keep only unique correlation IDs
      pattern.affectedCorrelationIds = [...new Set(pattern.affectedCorrelationIds)];
    } else {
      pattern = {
        id: patternId,
        errorCode,
        category,
        pattern: `${errorCode} in ${category}`,
        occurrences: 1,
        affectedCorrelationIds: [correlationId],
        firstSeen: timestamp,
        lastSeen: timestamp,
        isActive: true,
        severity: this.determineSeverity(errorCode, category, 0),
      };
      
      this.errorPatterns.set(patternId, pattern);
    }
  }

  // Detect error patterns and create alerts
  private async detectErrorPatterns(): Promise<void> {
    try {
      const now = Date.now();
      const oneHourAgo = now - (60 * 60 * 1000);

      for (const [patternId, pattern] of this.errorPatterns.entries()) {
        // Check if pattern is recent and frequent
        if (pattern.lastSeen.getTime() > oneHourAgo && pattern.occurrences >= this.PATTERN_THRESHOLD) {
          
          // Check if we haven't already alerted for this pattern recently
          const lastAlertKey = `instagram:error-pattern:${patternId}:last-alert`;
          const lastAlert = await this.redis.get(lastAlertKey);
          
          if (!lastAlert || (now - parseInt(lastAlert)) > (30 * 60 * 1000)) { // 30 minutes
            // Create pattern alert
            apm.triggerAlert({
              level: pattern.severity === ErrorSeverity.CRITICAL ? 'critical' : 'warning',
              component: 'instagram-translation',
              message: `Error pattern detected: ${pattern.pattern} (${pattern.occurrences} occurrences)`,
              metrics: {
                patternId,
                errorCode: pattern.errorCode,
                category: pattern.category,
                occurrences: pattern.occurrences,
                affectedRequests: pattern.affectedCorrelationIds.length,
                timeSpan: `${Math.round((pattern.lastSeen.getTime() - pattern.firstSeen.getTime()) / 1000 / 60)} minutes`,
              },
            });

            // Set suggested action based on pattern
            pattern.suggestedAction = this.getSuggestedAction(pattern);

            // Record last alert time
            await this.redis.setex(lastAlertKey, 60 * 60, now.toString()); // 1 hour TTL
          }
        }

        // Deactivate old patterns
        if (pattern.lastSeen.getTime() < oneHourAgo) {
          pattern.isActive = false;
        }
      }

    } catch (error) {
      console.error('[Instagram Error Tracker] Error detecting patterns:', error);
    }
  }

  // Get suggested action for error pattern
  private getSuggestedAction(pattern: ErrorPattern): string {
    switch (pattern.category) {
      case ErrorCategory.DATABASE:
        return 'Check database connection and query performance. Consider connection pooling optimization.';
      
      case ErrorCategory.VALIDATION:
        return 'Review input validation rules. Check for changes in message format or structure.';
      
      case ErrorCategory.CONVERSION:
        return 'Review conversion logic for edge cases. Check template compatibility rules.';
      
      case ErrorCategory.TIMEOUT:
        return 'Investigate system performance. Consider increasing timeout thresholds or optimizing processing.';
      
      case ErrorCategory.QUEUE:
        return 'Check queue health and worker capacity. Consider scaling workers or adjusting concurrency.';
      
      case ErrorCategory.NETWORK:
        return 'Check network connectivity and external service availability.';
      
      case ErrorCategory.SYSTEM:
        return 'Investigate system resources (CPU, memory). Check for memory leaks or resource exhaustion.';
      
      default:
        return 'Investigate error details and consider implementing specific error handling.';
    }
  }

  // Get error statistics for a time window
  async getErrorStatistics(hoursBack: number = 1): Promise<ErrorStatistics> {
    try {
      const now = Date.now();
      const windowStart = now - (hoursBack * 60 * 60 * 1000);

      // Get recent errors from buffer and Redis
      const recentErrors = await this.getRecentErrors(hoursBack);
      
      const totalErrors = recentErrors.length;
      
      const errorsByCategory: Record<ErrorCategory, number> = {
        [ErrorCategory.VALIDATION]: 0,
        [ErrorCategory.CONVERSION]: 0,
        [ErrorCategory.DATABASE]: 0,
        [ErrorCategory.QUEUE]: 0,
        [ErrorCategory.SYSTEM]: 0,
        [ErrorCategory.TIMEOUT]: 0,
        [ErrorCategory.NETWORK]: 0,
        [ErrorCategory.BUSINESS_LOGIC]: 0,
      };

      const errorsBySeverity: Record<ErrorSeverity, number> = {
        [ErrorSeverity.LOW]: 0,
        [ErrorSeverity.MEDIUM]: 0,
        [ErrorSeverity.HIGH]: 0,
        [ErrorSeverity.CRITICAL]: 0,
      };

      const errorsByCode: Record<string, number> = {};

      for (const error of recentErrors) {
        errorsByCategory[error.category] += error.occurrenceCount;
        errorsBySeverity[error.severity] += error.occurrenceCount;
        errorsByCode[error.errorCode] = (errorsByCode[error.errorCode] || 0) + error.occurrenceCount;
      }

      // Calculate error rate (would need total requests for accurate rate)
      const errorRate = totalErrors; // Simplified - would need total request count

      // Get top errors
      const topErrors = Object.entries(errorsByCode)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([errorCode, count]) => {
          const error = recentErrors.find(e => e.errorCode === errorCode);
          return {
            errorCode,
            count,
            category: error?.category || ErrorCategory.SYSTEM,
            severity: error?.severity || ErrorSeverity.MEDIUM,
          };
        });

      // Get active patterns
      const activePatterns = Array.from(this.errorPatterns.values())
        .filter(p => p.isActive && p.lastSeen.getTime() > windowStart);

      return {
        totalErrors,
        errorsByCategory,
        errorsBySeverity,
        errorsByCode,
        errorRate,
        topErrors,
        patterns: activePatterns,
        timeWindow: `${hoursBack} hour${hoursBack > 1 ? 's' : ''}`,
      };

    } catch (error) {
      console.error('[Instagram Error Tracker] Error getting statistics:', error);
      return {
        totalErrors: 0,
        errorsByCategory: {} as Record<ErrorCategory, number>,
        errorsBySeverity: {} as Record<ErrorSeverity, number>,
        errorsByCode: {},
        errorRate: 0,
        topErrors: [],
        patterns: [],
        timeWindow: `${hoursBack} hour${hoursBack > 1 ? 's' : ''}`,
      };
    }
  }

  // Get recent errors from buffer and Redis
  private async getRecentErrors(hoursBack: number): Promise<ErrorTrackingEntry[]> {
    const now = Date.now();
    const windowStart = now - (hoursBack * 60 * 60 * 1000);

    // Get from buffer
    const bufferErrors = this.errorBuffer.filter(
      error => error.timestamp.getTime() > windowStart
    );

    // Get from Redis (if needed for longer time windows)
    if (hoursBack > 1) {
      try {
        const keys = await this.redis.keys('chatwit:errors:instagram-translation:*');
        const recentKeys = keys.filter(key => {
          const timestamp = key.split(':').pop();
          if (!timestamp) return false;
          
          const keyTime = new Date(timestamp).getTime();
          return keyTime > windowStart;
        });

        const errorBatches = await Promise.all(
          recentKeys.map(key => this.redis.get(key))
        );

        for (const batch of errorBatches) {
          if (batch) {
            try {
              const errors = JSON.parse(batch) as ErrorTrackingEntry[];
              bufferErrors.push(...errors);
            } catch (parseError) {
              console.error('[Instagram Error Tracker] Error parsing error batch:', parseError);
            }
          }
        }
      } catch (redisError) {
        console.error('[Instagram Error Tracker] Error fetching from Redis:', redisError);
      }
    }

    return bufferErrors;
  }

  // Flush errors to Redis for persistence
  private async flushErrorsToRedis(): Promise<void> {
    if (this.errorBuffer.length === 0) return;

    try {
      const timestamp = new Date().toISOString();
      const key = `chatwit:errors:instagram-translation:${timestamp}`;
      
      await this.redis.setex(
        key, 
        this.ERROR_RETENTION_DAYS * 24 * 60 * 60, 
        JSON.stringify(this.errorBuffer)
      );

      console.log(`[Instagram Error Tracker] Flushed ${this.errorBuffer.length} errors to Redis`);
      this.errorBuffer = [];

    } catch (error) {
      console.error('[Instagram Error Tracker] Error flushing errors to Redis:', error);
    }
  }

  // Mark error as resolved
  async resolveError(errorId: string, resolution: string): Promise<boolean> {
    try {
      const error = this.errorBuffer.find(e => e.id === errorId);
      
      if (error) {
        error.resolved = true;
        error.resolvedAt = new Date();
        error.resolution = resolution;
        
        console.log(`[Instagram Error Tracker] Error resolved: ${errorId}`, {
          resolution,
          resolvedAt: error.resolvedAt,
        });
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('[Instagram Error Tracker] Error resolving error:', error);
      return false;
    }
  }

  // Get error details by correlation ID
  getErrorsByCorrelationId(correlationId: string): ErrorTrackingEntry[] {
    return this.errorBuffer.filter(error => error.correlationId === correlationId);
  }

  // Get error patterns
  getErrorPatterns(): ErrorPattern[] {
    return Array.from(this.errorPatterns.values());
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    try {
      console.log('[Instagram Error Tracker] Shutting down error tracker...');
      
      // Flush remaining errors
      await this.flushErrorsToRedis();
      
      // Clear data
      this.errorBuffer = [];
      this.errorPatterns.clear();
      
      console.log('[Instagram Error Tracker] Error tracker shutdown completed');
    } catch (error) {
      console.error('[Instagram Error Tracker] Error during shutdown:', error);
    }
  }
}

// Global error tracker instance
export const instagramErrorTracker = InstagramErrorTracker.getInstance();

// Utility functions for easy integration
export function trackInstagramError(
  correlationId: string,
  errorCode: string,
  error: Error,
  context: {
    intentName?: string;
    inboxId?: string;
    messageType?: string;
    templateType?: string;
    retryCount?: number;
    jobId?: string;
  },
  metadata: Record<string, any> = {}
): void {
  instagramErrorTracker.trackError(correlationId, errorCode, error, context, metadata);
}

export function getInstagramErrorStatistics(hoursBack: number = 1): Promise<ErrorStatistics> {
  return instagramErrorTracker.getErrorStatistics(hoursBack);
}

export function resolveInstagramError(errorId: string, resolution: string): Promise<boolean> {
  return instagramErrorTracker.resolveError(errorId, resolution);
}

// Initialize Instagram error tracking
export async function initializeInstagramErrorTracking(): Promise<void> {
  try {
    console.log('[Instagram Error Tracker] Initializing Instagram error tracking...');
    
    // The error tracker is automatically initialized when getInstance() is called
    // This function is mainly for explicit initialization
    
    console.log('[Instagram Error Tracker] Instagram error tracking initialized successfully');
  } catch (error) {
    console.error('[Instagram Error Tracker] Failed to initialize Instagram error tracking:', error);
    throw error;
  }
}