"use strict";
/**
 * Comprehensive Cache Logging Utilities
 *
 * This module provides standardized logging functions for cache operations
 * with user context and debugging information.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logCacheHit = logCacheHit;
exports.logCacheMiss = logCacheMiss;
exports.logCacheSet = logCacheSet;
exports.logCacheInvalidation = logCacheInvalidation;
exports.logCacheError = logCacheError;
exports.logCacheKeyGeneration = logCacheKeyGeneration;
exports.logApiCacheInvalidation = logApiCacheInvalidation;
exports.logWebhookCacheOperation = logWebhookCacheOperation;
exports.createCacheLogContext = createCacheLogContext;
exports.logCachePerformanceMetrics = logCachePerformanceMetrics;
exports.logCacheIsolationCheck = logCacheIsolationCheck;
/**
 * Log cache hit with comprehensive context
 */
function logCacheHit(context, metrics = {}, additionalData = {}) {
    const logData = {
        ...context,
        ...metrics,
        ...additionalData,
        cacheResult: 'HIT',
        timestamp: new Date().toISOString()
    };
    console.log(`[Cache] [HIT] ${context.operation}:`, logData);
}
/**
 * Log cache miss with comprehensive context
 */
function logCacheMiss(context, metrics = {}, reason = 'Key not found', additionalData = {}) {
    const logData = {
        ...context,
        ...metrics,
        ...additionalData,
        cacheResult: 'MISS',
        reason,
        timestamp: new Date().toISOString()
    };
    console.log(`[Cache] [MISS] ${context.operation}:`, logData);
}
/**
 * Log cache set operation with comprehensive context
 */
function logCacheSet(context, metrics = {}, additionalData = {}) {
    const logData = {
        ...context,
        ...metrics,
        ...additionalData,
        cacheResult: 'SET',
        timestamp: new Date().toISOString()
    };
    console.log(`[Cache] [SET] ${context.operation}:`, logData);
}
/**
 * Log cache invalidation with comprehensive context
 */
function logCacheInvalidation(context, keysDeleted = [], reason = 'Manual invalidation', additionalData = {}) {
    const logData = {
        ...context,
        keysDeleted,
        keysDeletedCount: keysDeleted.length,
        reason,
        ...additionalData,
        cacheResult: 'INVALIDATED',
        timestamp: new Date().toISOString()
    };
    console.log(`[Cache] [INVALIDATED] ${context.operation}:`, logData);
}
/**
 * Log cache error with comprehensive context
 */
function logCacheError(context, error, impact = 'Operation failed', additionalData = {}) {
    const errorDetails = error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack
    } : error;
    const logData = {
        ...context,
        error: errorDetails,
        impact,
        ...additionalData,
        cacheResult: 'ERROR',
        timestamp: new Date().toISOString()
    };
    console.error(`[Cache] [ERROR] ${context.operation}:`, logData);
}
/**
 * Log cache key generation for debugging
 */
function logCacheKeyGeneration(context, keyComponents, keyFormat, additionalData = {}) {
    const logData = {
        ...context,
        keyComponents,
        keyFormat,
        ...additionalData,
        operation: `${context.operation}_key_generation`,
        timestamp: new Date().toISOString()
    };
    console.log(`[Cache] [DEBUG] Key generation for ${context.operation}:`, logData);
}
/**
 * Log API cache invalidation operations
 */
function logApiCacheInvalidation(apiOperation, context, success, reason, additionalData = {}) {
    const logLevel = success ? 'SUCCESS' : 'ERROR';
    const logData = {
        apiOperation,
        ...context,
        success,
        reason,
        ...additionalData,
        timestamp: new Date().toISOString()
    };
    if (success) {
        console.log(`[API Cache Invalidation] [${logLevel}] ${apiOperation}:`, logData);
    }
    else {
        console.error(`[API Cache Invalidation] [${logLevel}] ${apiOperation}:`, logData);
    }
}
/**
 * Log webhook cache operations
 */
function logWebhookCacheOperation(webhookType, context, operation, result, additionalData = {}) {
    const logData = {
        webhookType,
        ...context,
        operation,
        result,
        ...additionalData,
        timestamp: new Date().toISOString()
    };
    const logLevel = result === 'error' ? 'ERROR' : 'INFO';
    const logMethod = result === 'error' ? console.error : console.log;
    logMethod(`[Webhook Cache] [${logLevel}] ${webhookType} - ${operation}:`, logData);
}
/**
 * Create a standardized cache log context
 */
function createCacheLogContext(usuarioChatwitId, inboxId, intentName, operation, correlationId) {
    return {
        userContext: { usuarioChatwitId, inboxId },
        intentName,
        operation,
        correlationId
    };
}
/**
 * Log cache performance metrics
 */
function logCachePerformanceMetrics(context, metrics, additionalData = {}) {
    const logData = {
        ...context,
        performance: metrics,
        ...additionalData,
        timestamp: new Date().toISOString()
    };
    console.log(`[Cache] [PERFORMANCE] ${context.operation}:`, logData);
}
/**
 * Log cache isolation verification
 */
function logCacheIsolationCheck(context, isolationVerified, details = {}) {
    const logData = {
        ...context,
        isolationVerified,
        ...details,
        timestamp: new Date().toISOString()
    };
    const logLevel = isolationVerified ? 'SUCCESS' : 'WARNING';
    const logMethod = isolationVerified ? console.log : console.warn;
    logMethod(`[Cache] [ISOLATION_CHECK] [${logLevel}] ${context.operation}:`, logData);
}
