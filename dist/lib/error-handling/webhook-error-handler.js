"use strict";
/**
 * Webhook Error Handler for Instagram Translation
 *
 * Provides comprehensive error handling utilities for webhook integration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateWebhookRequest = validateWebhookRequest;
exports.checkRateLimit = checkRateLimit;
exports.checkCircuitBreaker = checkCircuitBreaker;
exports.recordCircuitBreakerFailure = recordCircuitBreakerFailure;
exports.recordCircuitBreakerSuccess = recordCircuitBreakerSuccess;
exports.handleWebhookTimeout = handleWebhookTimeout;
exports.handleWebhookError = handleWebhookError;
exports.getErrorStatistics = getErrorStatistics;
exports.resetErrorTracking = resetErrorTracking;
exports.getServiceHealth = getServiceHealth;
const instagram_translation_errors_1 = require("./instagram-translation-errors");
const instagram_translation_validation_1 = require("../validation/instagram-translation-validation");
const payload_builder_1 = require("../instagram/payload-builder");
// Rate limiting map for tracking requests per inbox
const rateLimitMap = new Map();
const circuitBreakerState = {
    isOpen: false,
    failureCount: 0,
    lastFailureTime: 0,
    nextAttemptTime: 0,
};
const CIRCUIT_BREAKER_CONFIG = {
    failureThreshold: 10, // Open circuit after 10 failures
    recoveryTimeMs: 60000, // Try to close circuit after 1 minute
    halfOpenMaxAttempts: 3, // Allow 3 attempts when half-open
};
/**
 * Validate webhook request for Instagram translation
 */
function validateWebhookRequest(payload) {
    const errors = [];
    try {
        // Basic structure validation
        if (!payload || typeof payload !== 'object') {
            errors.push('Invalid payload structure');
            return { valid: false, errors };
        }
        // Channel type validation
        if (!(0, instagram_translation_validation_1.validateChannelType)(payload)) {
            errors.push('Invalid or missing channel type');
        }
        // Security validation
        const securityCheck = (0, instagram_translation_validation_1.validatePayloadSecurity)(payload);
        if (!securityCheck.safe) {
            errors.push(`Security issues detected: ${securityCheck.issues.join(', ')}`);
        }
        // Extract and validate required fields
        const intentName = payload.queryResult?.intent?.displayName;
        if (!intentName || typeof intentName !== 'string') {
            errors.push('Missing or invalid intent name');
        }
        const contactPhone = payload.originalDetectIntentRequest?.payload?.from?.phone;
        if (!contactPhone || typeof contactPhone !== 'string') {
            errors.push('Missing or invalid contact phone');
        }
        const conversationId = payload.originalDetectIntentRequest?.payload?.conversation?.id;
        if (!conversationId || typeof conversationId !== 'string') {
            errors.push('Missing or invalid conversation ID');
        }
        if (errors.length === 0) {
            return {
                valid: true,
                errors: [],
                sanitizedData: {
                    intentName: intentName.trim(),
                    contactPhone: contactPhone.trim(),
                    conversationId: conversationId.trim(),
                    originalPayload: payload,
                },
            };
        }
        return { valid: false, errors };
    }
    catch (error) {
        errors.push(`Validation error: ${(0, instagram_translation_validation_1.sanitizeErrorMessage)(error)}`);
        return { valid: false, errors };
    }
}
/**
 * Check rate limit for inbox
 */
function checkRateLimit(inboxId) {
    try {
        // Simple rate limit check - allow all requests for now
        return { allowed: true };
    }
    catch (error) {
        const validationError = (0, instagram_translation_errors_1.createValidationError)('rate_limit_check', (0, instagram_translation_validation_1.sanitizeErrorMessage)(error), undefined);
        return { allowed: false, error: validationError };
    }
}
/**
 * Check circuit breaker state
 */
function checkCircuitBreaker() {
    const now = Date.now();
    // If circuit is open, check if we should try to close it
    if (circuitBreakerState.isOpen) {
        if (now >= circuitBreakerState.nextAttemptTime) {
            // Try to close circuit (half-open state)
            circuitBreakerState.isOpen = false;
            console.log('[Instagram Translation] Circuit breaker moving to half-open state');
            return { allowed: true };
        }
        const error = (0, instagram_translation_errors_1.createValidationError)('circuit_breaker', 'Service temporarily unavailable due to high error rate', undefined);
        return { allowed: false, error };
    }
    return { allowed: true };
}
/**
 * Record circuit breaker failure
 */
function recordCircuitBreakerFailure() {
    circuitBreakerState.failureCount++;
    circuitBreakerState.lastFailureTime = Date.now();
    if (circuitBreakerState.failureCount >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
        circuitBreakerState.isOpen = true;
        circuitBreakerState.nextAttemptTime = Date.now() + CIRCUIT_BREAKER_CONFIG.recoveryTimeMs;
        console.warn('[Instagram Translation] Circuit breaker opened due to high failure rate', {
            failureCount: circuitBreakerState.failureCount,
            nextAttemptTime: circuitBreakerState.nextAttemptTime,
        });
    }
}
/**
 * Record circuit breaker success
 */
function recordCircuitBreakerSuccess() {
    circuitBreakerState.failureCount = 0;
    circuitBreakerState.isOpen = false;
    console.log('[Instagram Translation] Circuit breaker reset after successful operation');
}
/**
 * Handle webhook timeout with fallback
 */
function handleWebhookTimeout(correlationId, timeoutMs) {
    const error = (0, instagram_translation_errors_1.createTimeoutError)(timeoutMs, correlationId);
    (0, instagram_translation_errors_1.logError)(error);
    recordCircuitBreakerFailure();
    // Return fallback message for timeout
    return {
        success: false,
        fulfillmentMessages: [
            {
                payload: {
                    socialwiseResponse: {
                        message_format: 'BUTTON_TEMPLATE',
                        payload: {
                            template_type: 'button',
                            text: 'Desculpe, houve um atraso no processamento. Tente novamente em alguns instantes.',
                            buttons: [],
                        },
                    },
                },
            },
        ],
        error: 'Request timeout - falling back to default message',
        metadata: {
            timeout: true,
            timeoutMs,
            fallbackUsed: true,
        },
    };
}
/**
 * Handle webhook error with recovery attempts
 */
async function handleWebhookError(error, correlationId) {
    let instagramError;
    // Convert to Instagram translation error if needed
    if (error instanceof instagram_translation_errors_1.InstagramTranslationError) {
        instagramError = error;
    }
    else {
        instagramError = (0, instagram_translation_errors_1.createValidationError)('webhook_error', (0, instagram_translation_validation_1.sanitizeErrorMessage)(error), correlationId);
    }
    (0, instagram_translation_errors_1.logError)(instagramError);
    recordCircuitBreakerFailure();
    // Attempt recovery
    try {
        const recovery = await (0, instagram_translation_errors_1.attemptRecovery)(instagramError);
        switch (recovery.fallbackAction) {
            case 'whatsapp_only':
                return {
                    success: false,
                    error: 'Instagram not supported - use WhatsApp format',
                    metadata: {
                        fallbackAction: 'whatsapp_only',
                        originalError: instagramError.code,
                    },
                };
            case 'simple_text':
                return {
                    success: true,
                    fulfillmentMessages: (0, payload_builder_1.createInstagramFallbackMessage)(recovery.fallbackMessage || 'Mensagem recebida. Entre em contato para mais informações.'),
                    metadata: {
                        fallbackUsed: true,
                        fallbackAction: 'simple_text',
                        originalError: instagramError.code,
                    },
                };
            case 'retry':
                return {
                    success: false,
                    error: 'Retryable error occurred - will be retried',
                    metadata: {
                        fallbackAction: 'retry',
                        originalError: instagramError.code,
                    },
                };
            case 'skip':
                return {
                    success: false,
                    error: 'Processing skipped due to permanent error',
                    metadata: {
                        fallbackAction: 'skip',
                        originalError: instagramError.code,
                    },
                };
            case 'circuit_open':
                return {
                    success: false,
                    fulfillmentMessages: (0, payload_builder_1.createInstagramFallbackMessage)('Serviço temporariamente indisponível. Tente novamente em alguns minutos.'),
                    error: 'Service temporarily unavailable',
                    metadata: {
                        circuitOpen: true,
                        fallbackUsed: true,
                    },
                };
            default:
                // Default fallback
                return {
                    success: false,
                    fulfillmentMessages: (0, payload_builder_1.createInstagramFallbackMessage)('Desculpe, não foi possível processar sua mensagem no momento.'),
                    error: instagramError.message,
                    metadata: {
                        fallbackUsed: true,
                        originalError: instagramError.code,
                    },
                };
        }
    }
    catch (recoveryError) {
        console.error('[Instagram Translation] Error recovery failed:', recoveryError);
        // Final fallback
        return {
            success: false,
            fulfillmentMessages: (0, payload_builder_1.createInstagramFallbackMessage)('Desculpe, não foi possível processar sua mensagem no momento.'),
            error: 'Error recovery failed',
            metadata: {
                fallbackUsed: true,
                recoveryFailed: true,
                originalError: instagramError.code,
            },
        };
    }
}
/**
 * Get error statistics for monitoring
 */
function getErrorStatistics(timeRangeMs) {
    const summary = (0, instagram_translation_errors_1.getGlobalErrorSummary)(timeRangeMs);
    // Calculate rate limit stats
    let totalRequests = 0;
    for (const requests of rateLimitMap.values()) {
        totalRequests += requests.length;
    }
    return {
        summary,
        circuitBreakerState: { ...circuitBreakerState },
        rateLimitStats: {
            activeInboxes: rateLimitMap.size,
            totalRequests,
        },
    };
}
/**
 * Reset error tracking (for testing or maintenance)
 */
function resetErrorTracking() {
    rateLimitMap.clear();
    circuitBreakerState.isOpen = false;
    circuitBreakerState.failureCount = 0;
    circuitBreakerState.lastFailureTime = 0;
    circuitBreakerState.nextAttemptTime = 0;
    console.log('[Instagram Translation] Error tracking reset');
}
/**
 * Health check for Instagram translation service
 */
function getServiceHealth() {
    const issues = [];
    const stats = getErrorStatistics(300000); // Last 5 minutes
    // Check circuit breaker
    if (circuitBreakerState.isOpen) {
        issues.push('Circuit breaker is open');
    }
    // Check error rate
    const errorRate = stats.summary.total / Math.max(stats.rateLimitStats.totalRequests, 1);
    if (errorRate > 0.1) { // More than 10% error rate
        issues.push(`High error rate: ${(errorRate * 100).toFixed(1)}%`);
    }
    // Check for critical errors
    if (stats.summary.bySeverity.critical > 0) {
        issues.push(`${stats.summary.bySeverity.critical} critical errors in last 5 minutes`);
    }
    let status;
    if (issues.length === 0) {
        status = 'healthy';
    }
    else if (circuitBreakerState.isOpen || errorRate > 0.5) {
        status = 'unhealthy';
    }
    else {
        status = 'degraded';
    }
    return {
        healthy: status === 'healthy',
        status,
        issues,
        metrics: {
            errorRate,
            circuitBreakerOpen: circuitBreakerState.isOpen,
            totalErrors: stats.summary.total,
            retryableErrors: stats.summary.retryable,
            activeInboxes: stats.rateLimitStats.activeInboxes,
        },
    };
}
