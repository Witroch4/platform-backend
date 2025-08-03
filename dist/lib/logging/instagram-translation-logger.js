"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.alertTriggered = exports.performanceMetricsRecorded = exports.errorRecoveryFailed = exports.errorRecoverySucceeded = exports.errorRecoveryAttempted = exports.queueHealthCheck = exports.queueJobStalled = exports.queueJobRetry = exports.queueJobAdded = exports.workerJobFailed = exports.workerJobCompleted = exports.workerValidationPerformed = exports.workerButtonsConverted = exports.workerTemplateTypeDetected = exports.workerConversionStarted = exports.workerDatabaseQuery = exports.workerJobStarted = exports.webhookError = exports.webhookTimeout = exports.webhookResultReceived = exports.webhookWaitingForResult = exports.webhookJobEnqueued = exports.webhookChannelDetected = exports.webhookReceived = exports.instagramTranslationLogger = exports.InstagramTranslationLogger = exports.LogCategory = exports.LogLevel = void 0;
exports.createLogContext = createLogContext;
exports.updateLogContext = updateLogContext;
exports.initializeInstagramTranslationLogging = initializeInstagramTranslationLogging;
const perf_hooks_1 = require("perf_hooks");
const redis_1 = require("../redis");
// Log level enum for easier usage
exports.LogLevel = {
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
    CRITICAL: 'critical',
};
// Log categories for better organization
var LogCategory;
(function (LogCategory) {
    LogCategory["WEBHOOK"] = "webhook";
    LogCategory["WORKER"] = "worker";
    LogCategory["QUEUE"] = "queue";
    LogCategory["CONVERSION"] = "conversion";
    LogCategory["VALIDATION"] = "validation";
    LogCategory["DATABASE"] = "database";
    LogCategory["MONITORING"] = "monitoring";
    LogCategory["ERROR_HANDLING"] = "error-handling";
})(LogCategory || (exports.LogCategory = LogCategory = {}));
class InstagramTranslationLogger {
    static instance;
    redis;
    logBuffer = [];
    BUFFER_SIZE = 500;
    FLUSH_INTERVAL = 15000; // 15 seconds
    LOG_RETENTION_HOURS = 24;
    constructor(redisConnection) {
        this.redis = redisConnection || redis_1.connection;
        this.startLogFlushing();
    }
    static getInstance() {
        if (!this.instance) {
            this.instance = new InstagramTranslationLogger();
        }
        return this.instance;
    }
    // Start periodic log flushing to Redis
    startLogFlushing() {
        setInterval(() => {
            this.flushLogsToRedis().catch(error => {
                console.error('[Instagram Logger] Error flushing logs:', error);
            });
        }, this.FLUSH_INTERVAL);
        console.log('[Instagram Logger] Log flushing started');
    }
    // Core logging method with structured format
    log(level, category, message, context, metadata, error) {
        const timestamp = new Date().toISOString();
        const duration = context.startTime ? perf_hooks_1.performance.now() - context.startTime : undefined;
        const logEntry = {
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
                code: error.code,
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
    outputToConsole(entry) {
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
    webhookReceived(context, payload) {
        this.log(exports.LogLevel.INFO, LogCategory.WEBHOOK, 'Webhook request received', context, {
            payloadSize: JSON.stringify(payload).length,
            hasOriginalPayload: !!payload.originalDetectIntentRequest,
        });
    }
    webhookChannelDetected(context, channelType, isInstagram) {
        this.log(exports.LogLevel.INFO, LogCategory.WEBHOOK, 'Channel type detected', context, {
            channelType,
            isInstagram,
            action: isInstagram ? 'queue_for_translation' : 'use_whatsapp_logic',
        });
    }
    webhookJobEnqueued(context, jobId) {
        this.log(exports.LogLevel.INFO, LogCategory.WEBHOOK, 'Translation job enqueued', context, {
            jobId,
            queueName: 'instagram-translation',
        });
    }
    webhookWaitingForResult(context, timeoutMs) {
        this.log(exports.LogLevel.DEBUG, LogCategory.WEBHOOK, 'Waiting for translation result', context, {
            timeoutMs,
            startedWaitingAt: new Date().toISOString(),
        });
    }
    webhookResultReceived(context, success, processingTime) {
        this.log(exports.LogLevel.INFO, LogCategory.WEBHOOK, 'Translation result received', context, {
            success,
            processingTime,
            resultType: success ? 'success' : 'error',
        });
    }
    webhookTimeout(context, timeoutMs) {
        this.log(exports.LogLevel.WARN, LogCategory.WEBHOOK, 'Webhook response timeout', context, {
            timeoutMs,
            action: 'sending_fallback_response',
        });
    }
    webhookError(context, error, stage) {
        this.log(exports.LogLevel.ERROR, LogCategory.WEBHOOK, `Webhook error during ${stage}`, context, {
            stage,
            errorType: error.constructor.name,
        }, error);
    }
    // Worker-specific logging methods
    workerJobStarted(context) {
        this.log(exports.LogLevel.INFO, LogCategory.WORKER, 'Worker job started', context, {
            startedAt: new Date().toISOString(),
            memoryUsageMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
        });
    }
    workerDatabaseQuery(context, queryType, executionTime) {
        this.log(exports.LogLevel.DEBUG, LogCategory.DATABASE, 'Database query executed', context, {
            queryType,
            executionTime,
            performance: executionTime > 1000 ? 'slow' : 'normal',
        });
    }
    workerConversionStarted(context, messageType, bodyLength) {
        this.log(exports.LogLevel.INFO, LogCategory.CONVERSION, 'Message conversion started', context, {
            messageType,
            bodyLength,
            conversionStartedAt: new Date().toISOString(),
        });
    }
    workerTemplateTypeDetected(context, templateType, reason) {
        this.log(exports.LogLevel.DEBUG, LogCategory.CONVERSION, 'Instagram template type determined', context, {
            templateType,
            reason,
            isCompatible: templateType !== 'incompatible',
        });
    }
    workerButtonsConverted(context, originalCount, convertedCount) {
        this.log(exports.LogLevel.DEBUG, LogCategory.CONVERSION, 'Buttons converted for Instagram', context, {
            originalCount,
            convertedCount,
            buttonsLimited: convertedCount < originalCount,
        });
    }
    workerValidationPerformed(context, validationType, isValid, errors) {
        this.log(isValid ? exports.LogLevel.DEBUG : exports.LogLevel.WARN, LogCategory.VALIDATION, `Validation ${isValid ? 'passed' : 'failed'}: ${validationType}`, context, {
            validationType,
            isValid,
            errors: errors || [],
            errorCount: errors?.length || 0,
        });
    }
    workerJobCompleted(context, success, processingTime, messagesGenerated) {
        this.log(exports.LogLevel.INFO, LogCategory.WORKER, 'Worker job completed', context, {
            success,
            processingTime,
            messagesGenerated,
            completedAt: new Date().toISOString(),
            memoryUsageMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
        });
    }
    workerJobFailed(context, error, isRetryable) {
        this.log(exports.LogLevel.ERROR, LogCategory.WORKER, 'Worker job failed', context, {
            errorType: error.constructor.name,
            isRetryable,
            willRetry: isRetryable && (context.retryCount || 0) < 3,
            failedAt: new Date().toISOString(),
        }, error);
    }
    // Queue-specific logging methods
    queueJobAdded(context, priority) {
        this.log(exports.LogLevel.DEBUG, LogCategory.QUEUE, 'Job added to queue', context, {
            priority,
            queueName: 'instagram-translation',
            addedAt: new Date().toISOString(),
        });
    }
    queueJobRetry(context, attemptNumber, delay) {
        this.log(exports.LogLevel.WARN, LogCategory.QUEUE, 'Job retry scheduled', context, {
            attemptNumber,
            delay,
            retryScheduledAt: new Date().toISOString(),
        });
    }
    queueJobStalled(context) {
        this.log(exports.LogLevel.WARN, LogCategory.QUEUE, 'Job stalled in queue', context, {
            stalledAt: new Date().toISOString(),
            action: 'will_be_retried',
        });
    }
    queueHealthCheck(queueName, health) {
        this.log(exports.LogLevel.DEBUG, LogCategory.MONITORING, 'Queue health check performed', { correlationId: 'health-check' }, {
            queueName,
            waiting: health.waiting,
            active: health.active,
            failed: health.failed,
            paused: health.paused,
        });
    }
    // Error handling logging methods
    errorRecoveryAttempted(context, errorCode, recoveryAction) {
        this.log(exports.LogLevel.INFO, LogCategory.ERROR_HANDLING, 'Error recovery attempted', context, {
            errorCode,
            recoveryAction,
            attemptedAt: new Date().toISOString(),
        });
    }
    errorRecoverySucceeded(context, errorCode, fallbackUsed) {
        this.log(exports.LogLevel.INFO, LogCategory.ERROR_HANDLING, 'Error recovery succeeded', context, {
            errorCode,
            fallbackUsed,
            recoveredAt: new Date().toISOString(),
        });
    }
    errorRecoveryFailed(context, errorCode, recoveryError) {
        this.log(exports.LogLevel.ERROR, LogCategory.ERROR_HANDLING, 'Error recovery failed', context, {
            errorCode,
            recoveryErrorType: recoveryError.constructor.name,
        }, recoveryError);
    }
    // Performance and monitoring logging methods
    performanceMetricsRecorded(context, metrics) {
        this.log(exports.LogLevel.DEBUG, LogCategory.MONITORING, 'Performance metrics recorded', context, {
            metrics,
            recordedAt: new Date().toISOString(),
        });
    }
    alertTriggered(alertLevel, alertMessage, correlationId) {
        this.log(exports.LogLevel.WARN, LogCategory.MONITORING, `Alert triggered: ${alertMessage}`, { correlationId: correlationId || 'system' }, {
            alertLevel,
            triggeredAt: new Date().toISOString(),
        });
    }
    // Utility methods
    createContext(correlationId, additionalContext) {
        return {
            correlationId,
            startTime: perf_hooks_1.performance.now(),
            ...additionalContext,
        };
    }
    updateContext(context, updates) {
        return { ...context, ...updates };
    }
    // Flush logs to Redis for persistence and analysis
    async flushLogsToRedis() {
        if (this.logBuffer.length === 0)
            return;
        try {
            const timestamp = new Date().toISOString();
            const key = `chatwit:logs:instagram-translation:${timestamp}`;
            await this.redis.setex(key, this.LOG_RETENTION_HOURS * 60 * 60, JSON.stringify(this.logBuffer));
            console.log(`[Instagram Logger] Flushed ${this.logBuffer.length} log entries to Redis`);
            this.logBuffer = [];
        }
        catch (error) {
            console.error('[Instagram Logger] Error flushing logs to Redis:', error);
        }
    }
    // Query logs from Redis (for debugging and analysis)
    async queryLogs(correlationId, level, category, hoursBack = 1) {
        try {
            const keys = await this.redis.keys('chatwit:logs:instagram-translation:*');
            const recentKeys = keys.filter(key => {
                const timestamp = key.split(':').pop();
                if (!timestamp)
                    return false;
                const keyTime = new Date(timestamp).getTime();
                const cutoff = Date.now() - (hoursBack * 60 * 60 * 1000);
                return keyTime > cutoff;
            });
            const logBatches = await Promise.all(recentKeys.map(key => this.redis.get(key)));
            const allLogs = [];
            for (const batch of logBatches) {
                if (batch) {
                    try {
                        const logs = JSON.parse(batch);
                        allLogs.push(...logs);
                    }
                    catch (parseError) {
                        console.error('[Instagram Logger] Error parsing log batch:', parseError);
                    }
                }
            }
            // Filter logs based on criteria
            return allLogs.filter(log => {
                if (correlationId && log.correlationId !== correlationId)
                    return false;
                if (level && log.level !== level)
                    return false;
                if (category && !log.component.includes(category))
                    return false;
                return true;
            }).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        }
        catch (error) {
            console.error('[Instagram Logger] Error querying logs:', error);
            return [];
        }
    }
    // Get log statistics
    async getLogStatistics(hoursBack = 1) {
        try {
            const logs = await this.queryLogs(undefined, undefined, undefined, hoursBack);
            const byLevel = {
                debug: 0,
                info: 0,
                warn: 0,
                error: 0,
                critical: 0,
            };
            const byCategory = {};
            const errorMessages = {};
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
        }
        catch (error) {
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
    async shutdown() {
        try {
            console.log('[Instagram Logger] Shutting down logger...');
            // Flush remaining logs
            await this.flushLogsToRedis();
            console.log('[Instagram Logger] Logger shutdown completed');
        }
        catch (error) {
            console.error('[Instagram Logger] Error during shutdown:', error);
        }
    }
}
exports.InstagramTranslationLogger = InstagramTranslationLogger;
// Global logger instance
exports.instagramTranslationLogger = InstagramTranslationLogger.getInstance();
// Utility functions for easy integration
function createLogContext(correlationId, additionalContext) {
    return exports.instagramTranslationLogger.createContext(correlationId, additionalContext);
}
function updateLogContext(context, updates) {
    return exports.instagramTranslationLogger.updateContext(context, updates);
}
// Export logger methods for direct use
exports.webhookReceived = exports.instagramTranslationLogger.webhookReceived, exports.webhookChannelDetected = exports.instagramTranslationLogger.webhookChannelDetected, exports.webhookJobEnqueued = exports.instagramTranslationLogger.webhookJobEnqueued, exports.webhookWaitingForResult = exports.instagramTranslationLogger.webhookWaitingForResult, exports.webhookResultReceived = exports.instagramTranslationLogger.webhookResultReceived, exports.webhookTimeout = exports.instagramTranslationLogger.webhookTimeout, exports.webhookError = exports.instagramTranslationLogger.webhookError, exports.workerJobStarted = exports.instagramTranslationLogger.workerJobStarted, exports.workerDatabaseQuery = exports.instagramTranslationLogger.workerDatabaseQuery, exports.workerConversionStarted = exports.instagramTranslationLogger.workerConversionStarted, exports.workerTemplateTypeDetected = exports.instagramTranslationLogger.workerTemplateTypeDetected, exports.workerButtonsConverted = exports.instagramTranslationLogger.workerButtonsConverted, exports.workerValidationPerformed = exports.instagramTranslationLogger.workerValidationPerformed, exports.workerJobCompleted = exports.instagramTranslationLogger.workerJobCompleted, exports.workerJobFailed = exports.instagramTranslationLogger.workerJobFailed, exports.queueJobAdded = exports.instagramTranslationLogger.queueJobAdded, exports.queueJobRetry = exports.instagramTranslationLogger.queueJobRetry, exports.queueJobStalled = exports.instagramTranslationLogger.queueJobStalled, exports.queueHealthCheck = exports.instagramTranslationLogger.queueHealthCheck, exports.errorRecoveryAttempted = exports.instagramTranslationLogger.errorRecoveryAttempted, exports.errorRecoverySucceeded = exports.instagramTranslationLogger.errorRecoverySucceeded, exports.errorRecoveryFailed = exports.instagramTranslationLogger.errorRecoveryFailed, exports.performanceMetricsRecorded = exports.instagramTranslationLogger.performanceMetricsRecorded, exports.alertTriggered = exports.instagramTranslationLogger.alertTriggered;
// Initialize Instagram translation logging
async function initializeInstagramTranslationLogging() {
    try {
        console.log('[Instagram Logger] Initializing Instagram translation logging...');
        // The logger is automatically initialized when getInstance() is called
        // This function is mainly for explicit initialization
        console.log('[Instagram Logger] Instagram translation logging initialized successfully');
    }
    catch (error) {
        console.error('[Instagram Logger] Failed to initialize Instagram translation logging:', error);
        throw error;
    }
}
