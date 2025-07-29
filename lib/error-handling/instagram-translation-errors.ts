/**
 * Instagram Translation Error Handling
 * 
 * Comprehensive error handling utilities for Instagram message translation
 */

import { InstagramTranslationErrorCodes } from '../queue/instagram-translation.queue';

// Base Error Class
export class InstagramTranslationError extends Error {
  public readonly code: InstagramTranslationErrorCodes;
  public readonly correlationId?: string;
  public readonly retryable: boolean;
  public readonly metadata?: Record<string, any>;

  constructor(
    message: string,
    code: InstagramTranslationErrorCodes,
    correlationId?: string,
    retryable: boolean = false,
    metadata?: Record<string, any>
  ) {
    super(message);
    this.name = 'InstagramTranslationError';
    this.code = code;
    this.correlationId = correlationId;
    this.retryable = retryable;
    this.metadata = metadata;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InstagramTranslationError);
    }
  }

  /**
   * Convert error to JSON for logging/storage
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      correlationId: this.correlationId,
      retryable: this.retryable,
      metadata: this.metadata,
      stack: this.stack,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Create error from JSON
   */
  static fromJSON(data: any): InstagramTranslationError {
    const error = new InstagramTranslationError(
      data.message,
      data.code,
      data.correlationId,
      data.retryable,
      data.metadata
    );
    error.stack = data.stack;
    return error;
  }
}

// Specific Error Classes
export class TemplateNotFoundError extends InstagramTranslationError {
  constructor(intentName: string, inboxId: string, correlationId?: string) {
    super(
      `Template not found for intent "${intentName}" in inbox "${inboxId}"`,
      InstagramTranslationErrorCodes.TEMPLATE_NOT_FOUND,
      correlationId,
      false, // Not retryable - template doesn't exist
      { intentName, inboxId }
    );
  }
}

export class MessageTooLongError extends InstagramTranslationError {
  constructor(messageLength: number, maxLength: number, correlationId?: string) {
    super(
      `Message too long (${messageLength} chars). Instagram supports max ${maxLength} characters`,
      InstagramTranslationErrorCodes.MESSAGE_TOO_LONG,
      correlationId,
      false, // Not retryable - message is inherently too long
      { messageLength, maxLength }
    );
  }
}

export class InvalidChannelError extends InstagramTranslationError {
  constructor(channelType: string, correlationId?: string) {
    super(
      `Invalid channel type: ${channelType}. Expected "Channel::Instagram"`,
      InstagramTranslationErrorCodes.INVALID_CHANNEL,
      correlationId,
      false, // Not retryable - wrong channel
      { channelType }
    );
  }
}

export class DatabaseError extends InstagramTranslationError {
  constructor(operation: string, originalError: Error, correlationId?: string) {
    super(
      `Database error during ${operation}: ${originalError.message}`,
      InstagramTranslationErrorCodes.DATABASE_ERROR,
      correlationId,
      true, // Retryable - database might recover
      { operation, originalError: originalError.message }
    );
  }
}

export class ConversionFailedError extends InstagramTranslationError {
  constructor(reason: string, correlationId?: string, metadata?: Record<string, any>) {
    super(
      `Message conversion failed: ${reason}`,
      InstagramTranslationErrorCodes.CONVERSION_FAILED,
      correlationId,
      false, // Usually not retryable - conversion logic issue
      metadata
    );
  }
}

export class ValidationError extends InstagramTranslationError {
  constructor(field: string, reason: string, correlationId?: string) {
    super(
      `Validation error for ${field}: ${reason}`,
      InstagramTranslationErrorCodes.VALIDATION_ERROR,
      correlationId,
      false, // Not retryable - invalid input
      { field, reason }
    );
  }
}

export class TimeoutError extends InstagramTranslationError {
  constructor(timeoutMs: number, correlationId?: string) {
    super(
      `Operation timed out after ${timeoutMs}ms`,
      InstagramTranslationErrorCodes.TIMEOUT_ERROR,
      correlationId,
      true, // Retryable - might succeed on retry
      { timeoutMs }
    );
  }
}

// Error Factory Functions
export function createTemplateNotFoundError(
  intentName: string,
  inboxId: string,
  correlationId?: string
): TemplateNotFoundError {
  return new TemplateNotFoundError(intentName, inboxId, correlationId);
}

export function createMessageTooLongError(
  messageLength: number,
  maxLength: number = 640,
  correlationId?: string
): MessageTooLongError {
  return new MessageTooLongError(messageLength, maxLength, correlationId);
}

export function createInvalidChannelError(
  channelType: string,
  correlationId?: string
): InvalidChannelError {
  return new InvalidChannelError(channelType, correlationId);
}

export function createDatabaseError(
  operation: string,
  originalError: Error,
  correlationId?: string
): DatabaseError {
  return new DatabaseError(operation, originalError, correlationId);
}

export function createConversionFailedError(
  reason: string,
  correlationId?: string,
  metadata?: Record<string, any>
): ConversionFailedError {
  return new ConversionFailedError(reason, correlationId, metadata);
}

export function createValidationError(
  field: string,
  reason: string,
  correlationId?: string
): ValidationError {
  return new ValidationError(field, reason, correlationId);
}

export function createTimeoutError(
  timeoutMs: number,
  correlationId?: string
): TimeoutError {
  return new TimeoutError(timeoutMs, correlationId);
}

// Error Classification
export function isRetryableError(error: Error): boolean {
  if (error instanceof InstagramTranslationError) {
    return error.retryable;
  }
  
  // Check for known retryable error patterns
  const retryablePatterns = [
    /connection/i,
    /timeout/i,
    /network/i,
    /temporary/i,
    /rate limit/i,
    /service unavailable/i,
  ];
  
  return retryablePatterns.some(pattern => pattern.test(error.message));
}

export function getErrorSeverity(error: Error): 'low' | 'medium' | 'high' | 'critical' {
  if (error instanceof InstagramTranslationError) {
    switch (error.code) {
      case InstagramTranslationErrorCodes.TEMPLATE_NOT_FOUND:
      case InstagramTranslationErrorCodes.MESSAGE_TOO_LONG:
      case InstagramTranslationErrorCodes.INVALID_CHANNEL:
        return 'medium';
      
      case InstagramTranslationErrorCodes.VALIDATION_ERROR:
        return 'low';
      
      case InstagramTranslationErrorCodes.DATABASE_ERROR:
        return 'high';
      
      case InstagramTranslationErrorCodes.TIMEOUT_ERROR:
        return 'medium';
      
      case InstagramTranslationErrorCodes.CONVERSION_FAILED:
        return 'medium';
      
      default:
        return 'high';
    }
  }
  
  return 'medium';
}

// Error Aggregation
export interface ErrorSummary {
  total: number;
  byCode: Record<InstagramTranslationErrorCodes, number>;
  bySeverity: Record<string, number>;
  retryable: number;
  nonRetryable: number;
  recentErrors: Array<{
    timestamp: Date;
    code: InstagramTranslationErrorCodes;
    message: string;
    correlationId?: string;
  }>;
}

export class ErrorAggregator {
  private errors: InstagramTranslationError[] = [];
  private maxErrors: number;

  constructor(maxErrors: number = 1000) {
    this.maxErrors = maxErrors;
  }

  /**
   * Add error to aggregator
   */
  addError(error: InstagramTranslationError): void {
    this.errors.push(error);
    
    // Keep only recent errors
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }
  }

  /**
   * Get error summary
   */
  getSummary(timeRangeMs?: number): ErrorSummary {
    let relevantErrors = this.errors;
    
    // Filter by time range if specified
    if (timeRangeMs) {
      const cutoff = Date.now() - timeRangeMs;
      relevantErrors = this.errors.filter(error => {
        const errorTime = error.metadata?.timestamp 
          ? new Date(error.metadata.timestamp).getTime()
          : Date.now();
        return errorTime >= cutoff;
      });
    }

    const summary: ErrorSummary = {
      total: relevantErrors.length,
      byCode: {} as Record<InstagramTranslationErrorCodes, number>,
      bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
      retryable: 0,
      nonRetryable: 0,
      recentErrors: [],
    };

    // Initialize code counts
    Object.values(InstagramTranslationErrorCodes).forEach(code => {
      summary.byCode[code] = 0;
    });

    // Aggregate errors
    for (const error of relevantErrors) {
      summary.byCode[error.code]++;
      
      const severity = getErrorSeverity(error);
      summary.bySeverity[severity]++;
      
      if (error.retryable) {
        summary.retryable++;
      } else {
        summary.nonRetryable++;
      }
    }

    // Get recent errors (last 10)
    summary.recentErrors = relevantErrors
      .slice(-10)
      .map(error => ({
        timestamp: new Date(),
        code: error.code,
        message: error.message,
        correlationId: error.correlationId,
      }));

    return summary;
  }

  /**
   * Clear all errors
   */
  clear(): void {
    this.errors = [];
  }

  /**
   * Get error count by code
   */
  getCountByCode(code: InstagramTranslationErrorCodes): number {
    return this.errors.filter(error => error.code === code).length;
  }
}

// Global error aggregator instance
const globalErrorAggregator = new ErrorAggregator();

/**
 * Log and aggregate error
 */
export function logError(error: InstagramTranslationError): void {
  console.error('[Instagram Translation Error]', error.toJSON());
  globalErrorAggregator.addError(error);
}

/**
 * Get global error summary
 */
export function getGlobalErrorSummary(timeRangeMs?: number): ErrorSummary {
  return globalErrorAggregator.getSummary(timeRangeMs);
}

/**
 * Clear global error history
 */
export function clearGlobalErrors(): void {
  globalErrorAggregator.clear();
}

// Error Recovery Strategies
export interface RecoveryStrategy {
  canRecover: (error: InstagramTranslationError) => boolean;
  recover: (error: InstagramTranslationError) => Promise<any>;
}

export const recoveryStrategies: Record<string, RecoveryStrategy> = {
  // Fallback to WhatsApp format for incompatible messages
  whatsappFallback: {
    canRecover: (error) => 
      error.code === InstagramTranslationErrorCodes.MESSAGE_TOO_LONG ||
      error.code === InstagramTranslationErrorCodes.CONVERSION_FAILED,
    recover: async (error) => {
      console.log(`[Instagram Translation] Falling back to WhatsApp format for ${error.correlationId}`);
      return { fallbackAction: 'whatsapp_only' };
    },
  },

  // Retry for transient errors
  retryStrategy: {
    canRecover: (error) => error.retryable,
    recover: async (error) => {
      console.log(`[Instagram Translation] Scheduling retry for ${error.correlationId}`);
      return { fallbackAction: 'retry' };
    },
  },

  // Skip processing for permanent errors
  skipStrategy: {
    canRecover: (error) => 
      error.code === InstagramTranslationErrorCodes.TEMPLATE_NOT_FOUND ||
      error.code === InstagramTranslationErrorCodes.INVALID_CHANNEL,
    recover: async (error) => {
      console.log(`[Instagram Translation] Skipping processing for ${error.correlationId}`);
      return { fallbackAction: 'skip' };
    },
  },
};

/**
 * Attempt error recovery
 */
export async function attemptRecovery(error: InstagramTranslationError): Promise<any> {
  for (const [strategyName, strategy] of Object.entries(recoveryStrategies)) {
    if (strategy.canRecover(error)) {
      try {
        console.log(`[Instagram Translation] Attempting recovery with ${strategyName} for ${error.correlationId}`);
        return await strategy.recover(error);
      } catch (recoveryError) {
        console.error(`[Instagram Translation] Recovery strategy ${strategyName} failed:`, recoveryError);
      }
    }
  }
  
  // No recovery strategy available
  return { fallbackAction: 'skip' };
}