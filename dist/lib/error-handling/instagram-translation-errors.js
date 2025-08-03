"use strict";
/**
 * Instagram Translation Error Handling
 *
 * Comprehensive error handling utilities for Instagram message translation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.recoveryStrategies = exports.ErrorAggregator = exports.TimeoutError = exports.ValidationError = exports.ConversionFailedError = exports.DatabaseError = exports.InvalidChannelError = exports.MessageTooLongError = exports.TemplateNotFoundError = exports.InstagramTranslationError = exports.InstagramTranslationErrorCodes = void 0;
exports.createTemplateNotFoundError = createTemplateNotFoundError;
exports.createMessageTooLongError = createMessageTooLongError;
exports.createInvalidChannelError = createInvalidChannelError;
exports.createDatabaseError = createDatabaseError;
exports.createConversionFailedError = createConversionFailedError;
exports.createValidationError = createValidationError;
exports.createTimeoutError = createTimeoutError;
exports.isRetryableError = isRetryableError;
exports.getErrorSeverity = getErrorSeverity;
exports.logError = logError;
exports.getGlobalErrorSummary = getGlobalErrorSummary;
exports.clearGlobalErrors = clearGlobalErrors;
exports.attemptRecovery = attemptRecovery;
// Error codes for Instagram translation
var InstagramTranslationErrorCodes;
(function (InstagramTranslationErrorCodes) {
    InstagramTranslationErrorCodes["TEMPLATE_NOT_FOUND"] = "TEMPLATE_NOT_FOUND";
    InstagramTranslationErrorCodes["MESSAGE_TOO_LONG"] = "MESSAGE_TOO_LONG";
    InstagramTranslationErrorCodes["INVALID_CHANNEL"] = "INVALID_CHANNEL";
    InstagramTranslationErrorCodes["DATABASE_ERROR"] = "DATABASE_ERROR";
    InstagramTranslationErrorCodes["CONVERSION_FAILED"] = "CONVERSION_FAILED";
    InstagramTranslationErrorCodes["VALIDATION_ERROR"] = "VALIDATION_ERROR";
    InstagramTranslationErrorCodes["TIMEOUT_ERROR"] = "TIMEOUT_ERROR";
    InstagramTranslationErrorCodes["QUEUE_ERROR"] = "QUEUE_ERROR";
    InstagramTranslationErrorCodes["SYSTEM_ERROR"] = "SYSTEM_ERROR";
    InstagramTranslationErrorCodes["UNKNOWN_ERROR"] = "UNKNOWN_ERROR";
})(InstagramTranslationErrorCodes || (exports.InstagramTranslationErrorCodes = InstagramTranslationErrorCodes = {}));
// Base Error Class
class InstagramTranslationError extends Error {
    code;
    correlationId;
    retryable;
    metadata;
    constructor(message, code, correlationId, retryable = false, metadata) {
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
    toJSON() {
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
    static fromJSON(data) {
        const error = new InstagramTranslationError(data.message, data.code, data.correlationId, data.retryable, data.metadata);
        error.stack = data.stack;
        return error;
    }
}
exports.InstagramTranslationError = InstagramTranslationError;
// Specific Error Classes
class TemplateNotFoundError extends InstagramTranslationError {
    constructor(intentName, inboxId, correlationId) {
        super(`Template not found for intent "${intentName}" in inbox "${inboxId}"`, InstagramTranslationErrorCodes.TEMPLATE_NOT_FOUND, correlationId, false, // Not retryable - template doesn't exist
        { intentName, inboxId });
    }
}
exports.TemplateNotFoundError = TemplateNotFoundError;
class MessageTooLongError extends InstagramTranslationError {
    constructor(messageLength, maxLength, correlationId) {
        super(`Message too long (${messageLength} chars). Instagram supports max ${maxLength} characters`, InstagramTranslationErrorCodes.MESSAGE_TOO_LONG, correlationId, false, // Not retryable - message is inherently too long
        { messageLength, maxLength });
    }
}
exports.MessageTooLongError = MessageTooLongError;
class InvalidChannelError extends InstagramTranslationError {
    constructor(channelType, correlationId) {
        super(`Invalid channel type: ${channelType}. Expected "Channel::Instagram"`, InstagramTranslationErrorCodes.INVALID_CHANNEL, correlationId, false, // Not retryable - wrong channel
        { channelType });
    }
}
exports.InvalidChannelError = InvalidChannelError;
class DatabaseError extends InstagramTranslationError {
    constructor(operation, originalError, correlationId) {
        super(`Database error during ${operation}: ${originalError.message}`, InstagramTranslationErrorCodes.DATABASE_ERROR, correlationId, true, // Retryable - database might recover
        { operation, originalError: originalError.message });
    }
}
exports.DatabaseError = DatabaseError;
class ConversionFailedError extends InstagramTranslationError {
    constructor(reason, correlationId, metadata) {
        super(`Message conversion failed: ${reason}`, InstagramTranslationErrorCodes.CONVERSION_FAILED, correlationId, false, // Usually not retryable - conversion logic issue
        metadata);
    }
}
exports.ConversionFailedError = ConversionFailedError;
class ValidationError extends InstagramTranslationError {
    constructor(field, reason, correlationId) {
        super(`Validation error for ${field}: ${reason}`, InstagramTranslationErrorCodes.VALIDATION_ERROR, correlationId, false, // Not retryable - invalid input
        { field, reason });
    }
}
exports.ValidationError = ValidationError;
class TimeoutError extends InstagramTranslationError {
    constructor(timeoutMs, correlationId) {
        super(`Operation timed out after ${timeoutMs}ms`, InstagramTranslationErrorCodes.TIMEOUT_ERROR, correlationId, true, // Retryable - might succeed on retry
        { timeoutMs });
    }
}
exports.TimeoutError = TimeoutError;
// Error Factory Functions
function createTemplateNotFoundError(intentName, inboxId, correlationId) {
    return new TemplateNotFoundError(intentName, inboxId, correlationId);
}
function createMessageTooLongError(messageLength, maxLength = 640, correlationId) {
    return new MessageTooLongError(messageLength, maxLength, correlationId);
}
function createInvalidChannelError(channelType, correlationId) {
    return new InvalidChannelError(channelType, correlationId);
}
function createDatabaseError(operation, originalError, correlationId) {
    return new DatabaseError(operation, originalError, correlationId);
}
function createConversionFailedError(reason, correlationId, metadata) {
    return new ConversionFailedError(reason, correlationId, metadata);
}
function createValidationError(field, reason, correlationId) {
    return new ValidationError(field, reason, correlationId);
}
function createTimeoutError(timeoutMs, correlationId) {
    return new TimeoutError(timeoutMs, correlationId);
}
// Error Classification
function isRetryableError(error) {
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
function getErrorSeverity(error) {
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
class ErrorAggregator {
    errors = [];
    maxErrors;
    constructor(maxErrors = 1000) {
        this.maxErrors = maxErrors;
    }
    /**
     * Add error to aggregator
     */
    addError(error) {
        this.errors.push(error);
        // Keep only recent errors
        if (this.errors.length > this.maxErrors) {
            this.errors = this.errors.slice(-this.maxErrors);
        }
    }
    /**
     * Get error summary
     */
    getSummary(timeRangeMs) {
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
        const summary = {
            total: relevantErrors.length,
            byCode: {},
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
            }
            else {
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
    clear() {
        this.errors = [];
    }
    /**
     * Get error count by code
     */
    getCountByCode(code) {
        return this.errors.filter(error => error.code === code).length;
    }
}
exports.ErrorAggregator = ErrorAggregator;
// Global error aggregator instance
const globalErrorAggregator = new ErrorAggregator();
/**
 * Log and aggregate error
 */
function logError(error) {
    console.error('[Instagram Translation Error]', error.toJSON());
    globalErrorAggregator.addError(error);
}
/**
 * Get global error summary
 */
function getGlobalErrorSummary(timeRangeMs) {
    return globalErrorAggregator.getSummary(timeRangeMs);
}
/**
 * Clear global error history
 */
function clearGlobalErrors() {
    globalErrorAggregator.clear();
}
exports.recoveryStrategies = {
    // Circuit breaker for system errors (check first before retry)
    circuitBreaker: {
        canRecover: (error) => error.code === InstagramTranslationErrorCodes.SYSTEM_ERROR ||
            error.code === InstagramTranslationErrorCodes.DATABASE_ERROR,
        recover: async (error) => {
            console.log(`[Instagram Translation] Circuit breaker activated for ${error.correlationId}`);
            // For testing purposes, we'll use a simple check
            // In production, this would integrate with the webhook error handler's circuit breaker
            return { fallbackAction: 'circuit_open' };
        },
    },
    // Fallback to WhatsApp format for incompatible messages
    whatsappFallback: {
        canRecover: (error) => error.code === InstagramTranslationErrorCodes.MESSAGE_TOO_LONG ||
            error.code === InstagramTranslationErrorCodes.CONVERSION_FAILED,
        recover: async (error) => {
            console.log(`[Instagram Translation] Falling back to WhatsApp format for ${error.correlationId}`);
            return { fallbackAction: 'whatsapp_only' };
        },
    },
    // Skip processing for permanent errors
    skipStrategy: {
        canRecover: (error) => error.code === InstagramTranslationErrorCodes.TEMPLATE_NOT_FOUND ||
            error.code === InstagramTranslationErrorCodes.INVALID_CHANNEL,
        recover: async (error) => {
            console.log(`[Instagram Translation] Skipping processing for ${error.correlationId}`);
            return { fallbackAction: 'skip' };
        },
    },
    // Graceful degradation for validation errors
    gracefulDegradation: {
        canRecover: (error) => error.code === InstagramTranslationErrorCodes.VALIDATION_ERROR,
        recover: async (error) => {
            console.log(`[Instagram Translation] Applying graceful degradation for ${error.correlationId}`);
            // Return a simple text message as fallback
            return {
                fallbackAction: 'simple_text',
                fallbackMessage: 'Mensagem recebida. Entre em contato para mais informações.'
            };
        },
    },
    // Retry for transient errors (check last)
    retryStrategy: {
        canRecover: (error) => error.retryable,
        recover: async (error) => {
            console.log(`[Instagram Translation] Scheduling retry for ${error.correlationId}`);
            return { fallbackAction: 'retry' };
        },
    },
};
/**
 * Attempt error recovery
 */
async function attemptRecovery(error) {
    for (const [strategyName, strategy] of Object.entries(exports.recoveryStrategies)) {
        if (strategy.canRecover(error)) {
            try {
                console.log(`[Instagram Translation] Attempting recovery with ${strategyName} for ${error.correlationId}`);
                return await strategy.recover(error);
            }
            catch (recoveryError) {
                console.error(`[Instagram Translation] Recovery strategy ${strategyName} failed:`, recoveryError);
            }
        }
    }
    // No recovery strategy available
    return { fallbackAction: 'skip' };
}
