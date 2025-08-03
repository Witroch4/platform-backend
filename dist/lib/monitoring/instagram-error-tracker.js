"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.instagramErrorTracker = exports.InstagramErrorTracker = exports.ErrorSeverity = exports.ErrorCategory = void 0;
exports.trackInstagramError = trackInstagramError;
exports.getInstagramErrorStatistics = getInstagramErrorStatistics;
exports.resolveInstagramError = resolveInstagramError;
exports.initializeInstagramErrorTracking = initializeInstagramErrorTracking;
const redis_1 = require("../redis");
const application_performance_monitor_1 = require("./application-performance-monitor");
const instagram_translation_queue_1 = require("../queue/instagram-translation.queue");
// Error category definitions
var ErrorCategory;
(function (ErrorCategory) {
    ErrorCategory["VALIDATION"] = "validation";
    ErrorCategory["CONVERSION"] = "conversion";
    ErrorCategory["DATABASE"] = "database";
    ErrorCategory["QUEUE"] = "queue";
    ErrorCategory["SYSTEM"] = "system";
    ErrorCategory["TIMEOUT"] = "timeout";
    ErrorCategory["NETWORK"] = "network";
    ErrorCategory["BUSINESS_LOGIC"] = "business_logic";
})(ErrorCategory || (exports.ErrorCategory = ErrorCategory = {}));
// Error severity levels
var ErrorSeverity;
(function (ErrorSeverity) {
    ErrorSeverity["LOW"] = "low";
    ErrorSeverity["MEDIUM"] = "medium";
    ErrorSeverity["HIGH"] = "high";
    ErrorSeverity["CRITICAL"] = "critical";
})(ErrorSeverity || (exports.ErrorSeverity = ErrorSeverity = {}));
class InstagramErrorTracker {
    static instance;
    redis;
    errorBuffer = [];
    errorPatterns = new Map();
    BUFFER_SIZE = 200;
    FLUSH_INTERVAL = 30000; // 30 seconds
    PATTERN_DETECTION_INTERVAL = 60000; // 1 minute
    ERROR_RETENTION_DAYS = 7;
    PATTERN_THRESHOLD = 3; // Minimum occurrences to consider a pattern
    constructor(redisConnection) {
        this.redis = redisConnection || redis_1.connection;
        this.startErrorTracking();
    }
    static getInstance() {
        if (!this.instance) {
            this.instance = new InstagramErrorTracker();
        }
        return this.instance;
    }
    // Start error tracking processes
    startErrorTracking() {
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
    trackError(correlationId, errorCode, error, context, metadata = {}) {
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
        }
        else {
            // Create new error entry
            const errorEntry = {
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
    categorizeError(errorCode, error) {
        // Map error codes to categories
        const errorCodeMapping = {
            [instagram_translation_queue_1.InstagramTranslationErrorCodes.TEMPLATE_NOT_FOUND]: ErrorCategory.DATABASE,
            [instagram_translation_queue_1.InstagramTranslationErrorCodes.MESSAGE_TOO_LONG]: ErrorCategory.VALIDATION,
            [instagram_translation_queue_1.InstagramTranslationErrorCodes.INVALID_CHANNEL]: ErrorCategory.VALIDATION,
            [instagram_translation_queue_1.InstagramTranslationErrorCodes.DATABASE_ERROR]: ErrorCategory.DATABASE,
            [instagram_translation_queue_1.InstagramTranslationErrorCodes.CONVERSION_FAILED]: ErrorCategory.CONVERSION,
            [instagram_translation_queue_1.InstagramTranslationErrorCodes.VALIDATION_ERROR]: ErrorCategory.VALIDATION,
            [instagram_translation_queue_1.InstagramTranslationErrorCodes.TIMEOUT_ERROR]: ErrorCategory.TIMEOUT,
            [instagram_translation_queue_1.InstagramTranslationErrorCodes.QUEUE_ERROR]: ErrorCategory.QUEUE,
            [instagram_translation_queue_1.InstagramTranslationErrorCodes.SYSTEM_ERROR]: ErrorCategory.SYSTEM,
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
    determineSeverity(errorCode, category, retryCount) {
        // Critical errors that require immediate attention
        const criticalErrors = [
            instagram_translation_queue_1.InstagramTranslationErrorCodes.SYSTEM_ERROR,
            instagram_translation_queue_1.InstagramTranslationErrorCodes.DATABASE_ERROR,
        ];
        if (criticalErrors.includes(errorCode)) {
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
    generateErrorId(correlationId, errorCode) {
        return `${correlationId}-${errorCode}`;
    }
    // Log error with structured format
    logError(correlationId, errorCode, category, severity, error, context, metadata) {
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
    createErrorAlert(correlationId, errorCode, category, severity, error, context) {
        const alertLevel = severity === ErrorSeverity.CRITICAL ? 'critical' : 'error';
        application_performance_monitor_1.apm.triggerAlert({
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
    updateErrorPattern(errorCode, category, correlationId, timestamp) {
        const patternId = `${errorCode}-${category}`;
        let pattern = this.errorPatterns.get(patternId);
        if (pattern) {
            pattern.occurrences++;
            pattern.lastSeen = timestamp;
            pattern.affectedCorrelationIds.push(correlationId);
            // Keep only unique correlation IDs
            pattern.affectedCorrelationIds = [...new Set(pattern.affectedCorrelationIds)];
        }
        else {
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
    async detectErrorPatterns() {
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
                        application_performance_monitor_1.apm.triggerAlert({
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
        }
        catch (error) {
            console.error('[Instagram Error Tracker] Error detecting patterns:', error);
        }
    }
    // Get suggested action for error pattern
    getSuggestedAction(pattern) {
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
    async getErrorStatistics(hoursBack = 1) {
        try {
            const now = Date.now();
            const windowStart = now - (hoursBack * 60 * 60 * 1000);
            // Get recent errors from buffer and Redis
            const recentErrors = await this.getRecentErrors(hoursBack);
            const totalErrors = recentErrors.length;
            const errorsByCategory = {
                [ErrorCategory.VALIDATION]: 0,
                [ErrorCategory.CONVERSION]: 0,
                [ErrorCategory.DATABASE]: 0,
                [ErrorCategory.QUEUE]: 0,
                [ErrorCategory.SYSTEM]: 0,
                [ErrorCategory.TIMEOUT]: 0,
                [ErrorCategory.NETWORK]: 0,
                [ErrorCategory.BUSINESS_LOGIC]: 0,
            };
            const errorsBySeverity = {
                [ErrorSeverity.LOW]: 0,
                [ErrorSeverity.MEDIUM]: 0,
                [ErrorSeverity.HIGH]: 0,
                [ErrorSeverity.CRITICAL]: 0,
            };
            const errorsByCode = {};
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
        }
        catch (error) {
            console.error('[Instagram Error Tracker] Error getting statistics:', error);
            return {
                totalErrors: 0,
                errorsByCategory: {},
                errorsBySeverity: {},
                errorsByCode: {},
                errorRate: 0,
                topErrors: [],
                patterns: [],
                timeWindow: `${hoursBack} hour${hoursBack > 1 ? 's' : ''}`,
            };
        }
    }
    // Get recent errors from buffer and Redis
    async getRecentErrors(hoursBack) {
        const now = Date.now();
        const windowStart = now - (hoursBack * 60 * 60 * 1000);
        // Get from buffer
        const bufferErrors = this.errorBuffer.filter(error => error.timestamp.getTime() > windowStart);
        // Get from Redis (if needed for longer time windows)
        if (hoursBack > 1) {
            try {
                const keys = await this.redis.keys('chatwit:errors:instagram-translation:*');
                const recentKeys = keys.filter(key => {
                    const timestamp = key.split(':').pop();
                    if (!timestamp)
                        return false;
                    const keyTime = new Date(timestamp).getTime();
                    return keyTime > windowStart;
                });
                const errorBatches = await Promise.all(recentKeys.map(key => this.redis.get(key)));
                for (const batch of errorBatches) {
                    if (batch) {
                        try {
                            const errors = JSON.parse(batch);
                            bufferErrors.push(...errors);
                        }
                        catch (parseError) {
                            console.error('[Instagram Error Tracker] Error parsing error batch:', parseError);
                        }
                    }
                }
            }
            catch (redisError) {
                console.error('[Instagram Error Tracker] Error fetching from Redis:', redisError);
            }
        }
        return bufferErrors;
    }
    // Flush errors to Redis for persistence
    async flushErrorsToRedis() {
        if (this.errorBuffer.length === 0)
            return;
        try {
            const timestamp = new Date().toISOString();
            const key = `chatwit:errors:instagram-translation:${timestamp}`;
            await this.redis.setex(key, this.ERROR_RETENTION_DAYS * 24 * 60 * 60, JSON.stringify(this.errorBuffer));
            console.log(`[Instagram Error Tracker] Flushed ${this.errorBuffer.length} errors to Redis`);
            this.errorBuffer = [];
        }
        catch (error) {
            console.error('[Instagram Error Tracker] Error flushing errors to Redis:', error);
        }
    }
    // Mark error as resolved
    async resolveError(errorId, resolution) {
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
        }
        catch (error) {
            console.error('[Instagram Error Tracker] Error resolving error:', error);
            return false;
        }
    }
    // Get error details by correlation ID
    getErrorsByCorrelationId(correlationId) {
        return this.errorBuffer.filter(error => error.correlationId === correlationId);
    }
    // Get error patterns
    getErrorPatterns() {
        return Array.from(this.errorPatterns.values());
    }
    // Graceful shutdown
    async shutdown() {
        try {
            console.log('[Instagram Error Tracker] Shutting down error tracker...');
            // Flush remaining errors
            await this.flushErrorsToRedis();
            // Clear data
            this.errorBuffer = [];
            this.errorPatterns.clear();
            console.log('[Instagram Error Tracker] Error tracker shutdown completed');
        }
        catch (error) {
            console.error('[Instagram Error Tracker] Error during shutdown:', error);
        }
    }
}
exports.InstagramErrorTracker = InstagramErrorTracker;
// Global error tracker instance
exports.instagramErrorTracker = InstagramErrorTracker.getInstance();
// Utility functions for easy integration
function trackInstagramError(correlationId, errorCode, error, context, metadata = {}) {
    exports.instagramErrorTracker.trackError(correlationId, errorCode, error, context, metadata);
}
function getInstagramErrorStatistics(hoursBack = 1) {
    return exports.instagramErrorTracker.getErrorStatistics(hoursBack);
}
function resolveInstagramError(errorId, resolution) {
    return exports.instagramErrorTracker.resolveError(errorId, resolution);
}
// Initialize Instagram error tracking
async function initializeInstagramErrorTracking() {
    try {
        console.log('[Instagram Error Tracker] Initializing Instagram error tracking...');
        // The error tracker is automatically initialized when getInstance() is called
        // This function is mainly for explicit initialization
        console.log('[Instagram Error Tracker] Instagram error tracking initialized successfully');
    }
    catch (error) {
        console.error('[Instagram Error Tracker] Failed to initialize Instagram error tracking:', error);
        throw error;
    }
}
