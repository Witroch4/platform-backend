"use strict";
// Comprehensive logging system for Interactive Messages
// Provides structured logging for debugging, monitoring, and audit trails
Object.defineProperty(exports, "__esModule", { value: true });
exports.InteractiveMessageLogger = exports.logger = exports.LOG_CATEGORIES = exports.LogLevel = void 0;
exports.logApiCall = logApiCall;
exports.logDatabaseQuery = logDatabaseQuery;
exports.logUserAction = logUserAction;
exports.logValidationError = logValidationError;
exports.logSecurityEvent = logSecurityEvent;
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["ERROR"] = 3] = "ERROR";
    LogLevel[LogLevel["CRITICAL"] = 4] = "CRITICAL";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
// Default configuration
const DEFAULT_CONFIG = {
    level: LogLevel.INFO,
    enableConsole: true,
    enableFile: false,
    enableRemote: false,
    maxLogSize: 10 * 1024 * 1024, // 10MB
    maxLogFiles: 5,
    bufferSize: 100,
    flushInterval: 5000, // 5 seconds
};
// Log categories for better organization
exports.LOG_CATEGORIES = {
    VALIDATION: "validation",
    ERROR_HANDLING: "error_handling",
    API_REQUEST: "api_request",
    API_RESPONSE: "api_response",
    DATABASE: "database",
    AUTHENTICATION: "authentication",
    BUSINESS_LOGIC: "business_logic",
    PERFORMANCE: "performance",
    SECURITY: "security",
    USER_ACTION: "user_action",
    SYSTEM: "system",
    WEBHOOK: "webhook",
    EXTERNAL_API: "external_api",
};
class InteractiveMessageLogger {
    config;
    logBuffer = [];
    flushTimer;
    logCounter = 0;
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.startFlushTimer();
    }
    // Main logging methods
    debug(message, category, context, metadata) {
        this.log(LogLevel.DEBUG, message, category, context, metadata);
    }
    info(message, category, context, metadata) {
        this.log(LogLevel.INFO, message, category, context, metadata);
    }
    warn(message, category, context, metadata) {
        this.log(LogLevel.WARN, message, category, context, metadata);
    }
    error(message, category, error, context, metadata) {
        const errorInfo = error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
                code: error.code,
            }
            : undefined;
        this.log(LogLevel.ERROR, message, category, context, metadata, errorInfo);
    }
    critical(message, category, error, context, metadata) {
        const errorInfo = error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
                code: error.code,
            }
            : undefined;
        this.log(LogLevel.CRITICAL, message, category, context, metadata, errorInfo);
        // Immediately flush critical logs
        this.flush();
    }
    // Performance logging
    startPerformanceTimer(operation, category, context) {
        const timerId = this.generateId();
        const startTime = Date.now();
        this.debug(`Starting operation: ${operation}`, category, {
            ...context,
            timerId,
        }, {
            operation,
            startTime,
        });
        return timerId;
    }
    endPerformanceTimer(timerId, operation, category, context, metadata) {
        const endTime = Date.now();
        const memoryUsage = process.memoryUsage();
        // Try to find the start time from recent logs (simplified approach)
        const startTime = Date.now() - 1000; // Fallback if not found
        const duration = endTime - startTime;
        this.info(`Completed operation: ${operation}`, category, {
            ...context,
            timerId,
        }, {
            ...metadata,
            operation,
            performance: {
                duration,
                memoryUsage,
                startTime,
                endTime,
            },
        });
    }
    // Specialized logging methods
    logApiRequest(method, url, context, requestData) {
        this.info(`API Request: ${method} ${url}`, exports.LOG_CATEGORIES.API_REQUEST, context, {
            method,
            url,
            requestData: this.sanitizeData(requestData),
        });
    }
    logApiResponse(method, url, status, context, responseData, duration) {
        const level = status >= 400 ? LogLevel.ERROR : LogLevel.INFO;
        this.log(level, `API Response: ${method} ${url} - ${status}`, exports.LOG_CATEGORIES.API_RESPONSE, context, {
            method,
            url,
            status,
            responseData: this.sanitizeData(responseData),
            performance: duration ? { duration } : undefined,
        });
    }
    logValidationError(field, error, context, validationData) {
        this.warn(`Validation failed for field: ${field}`, exports.LOG_CATEGORIES.VALIDATION, context, {
            field,
            validationError: error,
            validationData: this.sanitizeData(validationData),
        });
    }
    logDatabaseOperation(operation, table, context, queryData, duration) {
        this.info(`Database ${operation}: ${table}`, exports.LOG_CATEGORIES.DATABASE, context, {
            operation,
            table,
            queryData: this.sanitizeData(queryData),
            performance: duration ? { duration } : undefined,
        });
    }
    logUserAction(action, context, actionData) {
        this.info(`User action: ${action}`, exports.LOG_CATEGORIES.USER_ACTION, context, {
            action,
            actionData: this.sanitizeData(actionData),
        });
    }
    logSecurityEvent(event, severity, context, eventData) {
        const level = severity === "critical"
            ? LogLevel.CRITICAL
            : severity === "high"
                ? LogLevel.ERROR
                : severity === "medium"
                    ? LogLevel.WARN
                    : LogLevel.INFO;
        this.log(level, `Security event: ${event}`, exports.LOG_CATEGORIES.SECURITY, context, {
            event,
            severity,
            eventData: this.sanitizeData(eventData),
        });
    }
    // Core logging method
    log(level, message, category, context, metadata, error, performance) {
        // Check if log level meets threshold
        if (level < this.config.level) {
            return;
        }
        const logEntry = {
            id: this.generateId(),
            timestamp: new Date(),
            level,
            category,
            message,
            context,
            metadata,
            error,
            performance,
        };
        // Add to buffer
        this.logBuffer.push(logEntry);
        // Console output if enabled
        if (this.config.enableConsole) {
            this.writeToConsole(logEntry);
        }
        // Flush if buffer is full
        if (this.logBuffer.length >= this.config.bufferSize) {
            this.flush();
        }
    }
    // Output methods
    writeToConsole(entry) {
        const timestamp = entry.timestamp.toISOString();
        const levelName = LogLevel[entry.level];
        const contextStr = entry.context
            ? ` [${this.formatContext(entry.context)}]`
            : "";
        const metadataStr = entry.metadata
            ? ` ${JSON.stringify(entry.metadata)}`
            : "";
        const logMessage = `[${timestamp}] ${levelName} [${entry.category}]${contextStr} ${entry.message}${metadataStr}`;
        switch (entry.level) {
            case LogLevel.DEBUG:
                console.debug(logMessage);
                break;
            case LogLevel.INFO:
                console.info(logMessage);
                break;
            case LogLevel.WARN:
                console.warn(logMessage);
                break;
            case LogLevel.ERROR:
            case LogLevel.CRITICAL:
                console.error(logMessage);
                if (entry.error?.stack) {
                    console.error(entry.error.stack);
                }
                break;
        }
    }
    formatContext(context) {
        const parts = [];
        if (context?.userId)
            parts.push(`user:${context.userId}`);
        if (context?.requestId)
            parts.push(`req:${context.requestId}`);
        if (context?.messageId)
            parts.push(`msg:${context.messageId}`);
        if (context?.caixaId)
            parts.push(`caixa:${context.caixaId}`);
        if (context?.component)
            parts.push(`comp:${context.component}`);
        if (context?.action)
            parts.push(`action:${context.action}`);
        return parts.join("|");
    }
    // Buffer management
    flush() {
        if (this.logBuffer.length === 0)
            return;
        const logsToFlush = [...this.logBuffer];
        this.logBuffer = [];
        // Write to file if enabled
        if (this.config.enableFile) {
            this.writeToFile(logsToFlush);
        }
        // Send to remote service if enabled
        if (this.config.enableRemote) {
            this.sendToRemote(logsToFlush);
        }
    }
    writeToFile(logs) {
        // In a real implementation, you would write to a rotating log file
        // For now, we'll store in localStorage for browser environments
        try {
            const existingLogs = JSON.parse(localStorage.getItem("interactive_message_logs") || "[]");
            const allLogs = [...existingLogs, ...logs];
            // Keep only recent logs to prevent storage overflow
            const maxLogs = 1000;
            const recentLogs = allLogs.slice(-maxLogs);
            localStorage.setItem("interactive_message_logs", JSON.stringify(recentLogs));
        }
        catch (error) {
            console.error("Failed to write logs to storage:", error);
        }
    }
    async sendToRemote(logs) {
        if (!this.config.remoteEndpoint || !this.config.apiKey)
            return;
        try {
            const response = await fetch(this.config.remoteEndpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.config.apiKey}`,
                },
                body: JSON.stringify({
                    logs,
                    source: "interactive-message-system",
                    timestamp: new Date().toISOString(),
                }),
            });
            if (!response.ok) {
                console.error("Failed to send logs to remote service:", response.statusText);
            }
        }
        catch (error) {
            console.error("Error sending logs to remote service:", error);
        }
    }
    startFlushTimer() {
        this.flushTimer = setInterval(() => {
            this.flush();
        }, this.config.flushInterval);
    }
    // Utility methods
    generateId() {
        return `log_${Date.now()}_${++this.logCounter}_${Math.random().toString(36).substr(2, 9)}`;
    }
    sanitizeData(data) {
        if (!data)
            return data;
        // Remove sensitive information
        const sensitiveKeys = [
            "password",
            "token",
            "apiKey",
            "secret",
            "authorization",
        ];
        if (typeof data === "object") {
            const sanitized = { ...data };
            for (const key of sensitiveKeys) {
                if (key in sanitized) {
                    sanitized[key] = "[REDACTED]";
                }
            }
            return sanitized;
        }
        return data;
    }
    // Public utility methods
    getLogs(category, level, limit = 100) {
        try {
            const storedLogs = JSON.parse(localStorage.getItem("interactive_message_logs") || "[]");
            let filteredLogs = storedLogs;
            if (category) {
                filteredLogs = filteredLogs.filter((log) => log.category === category);
            }
            if (level !== undefined) {
                filteredLogs = filteredLogs.filter((log) => log.level >= level);
            }
            return filteredLogs.slice(-limit);
        }
        catch (error) {
            console.error("Failed to retrieve logs:", error);
            return [];
        }
    }
    clearLogs() {
        try {
            localStorage.removeItem("interactive_message_logs");
            this.logBuffer = [];
        }
        catch (error) {
            console.error("Failed to clear logs:", error);
        }
    }
    getLogStats() {
        try {
            const logs = JSON.parse(localStorage.getItem("interactive_message_logs") || "[]");
            const stats = {
                total: logs.length,
                byLevel: {},
                byCategory: {},
            };
            for (const log of logs) {
                const levelName = LogLevel[log.level];
                stats.byLevel[levelName] = (stats.byLevel[levelName] || 0) + 1;
                stats.byCategory[log.category] =
                    (stats.byCategory[log.category] || 0) + 1;
            }
            return stats;
        }
        catch (error) {
            console.error("Failed to get log stats:", error);
            return { total: 0, byLevel: {}, byCategory: {} };
        }
    }
    // Cleanup
    destroy() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }
        this.flush(); // Final flush
    }
}
exports.InteractiveMessageLogger = InteractiveMessageLogger;
// Global logger instance
exports.logger = new InteractiveMessageLogger({
    level: process.env.NODE_ENV === "development" ? LogLevel.DEBUG : LogLevel.INFO,
    enableConsole: true,
    enableFile: process.env.NODE_ENV === "production",
    enableRemote: process.env.NODE_ENV === "production",
    remoteEndpoint: process.env.LOG_ENDPOINT,
    apiKey: process.env.LOG_API_KEY,
});
// Utility functions for common logging patterns
function logApiCall(operation, apiCall, context) {
    const timerId = exports.logger.startPerformanceTimer(operation, exports.LOG_CATEGORIES.API_REQUEST, context);
    return apiCall()
        .then((result) => {
        exports.logger.endPerformanceTimer(timerId, operation, exports.LOG_CATEGORIES.API_REQUEST, context, { success: true });
        return result;
    })
        .catch((error) => {
        exports.logger.endPerformanceTimer(timerId, operation, exports.LOG_CATEGORIES.API_REQUEST, context, { success: false });
        exports.logger.error(`API call failed: ${operation}`, exports.LOG_CATEGORIES.API_REQUEST, error, context);
        throw error;
    });
}
function logDatabaseQuery(query, operation, context) {
    const timerId = exports.logger.startPerformanceTimer(`DB: ${query}`, exports.LOG_CATEGORIES.DATABASE, context);
    return operation()
        .then((result) => {
        exports.logger.endPerformanceTimer(timerId, `DB: ${query}`, exports.LOG_CATEGORIES.DATABASE, context, { success: true });
        return result;
    })
        .catch((error) => {
        exports.logger.endPerformanceTimer(timerId, `DB: ${query}`, exports.LOG_CATEGORIES.DATABASE, context, { success: false });
        exports.logger.error(`Database query failed: ${query}`, exports.LOG_CATEGORIES.DATABASE, error, context);
        throw error;
    });
}
function logUserAction(action, context, data) {
    exports.logger.logUserAction(action, context, data);
}
function logValidationError(field, error, context, data) {
    exports.logger.logValidationError(field, error, context, data);
}
function logSecurityEvent(event, severity, context, data) {
    exports.logger.logSecurityEvent(event, severity, context, data);
}
