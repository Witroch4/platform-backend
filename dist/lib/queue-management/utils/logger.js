"use strict";
/**
 * Logger Utility for Queue Management System
 *
 * Structured logging with different levels and context support
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.Logger = exports.LogLevel = void 0;
exports.createLogger = createLogger;
exports.measurePerformance = measurePerformance;
exports.auditLog = auditLog;
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["ERROR"] = 0] = "ERROR";
    LogLevel[LogLevel["WARN"] = 1] = "WARN";
    LogLevel[LogLevel["INFO"] = 2] = "INFO";
    LogLevel[LogLevel["DEBUG"] = 3] = "DEBUG";
    LogLevel[LogLevel["TRACE"] = 4] = "TRACE";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
/**
 * Logger class with structured logging support
 */
class Logger {
    module;
    logLevel;
    context;
    constructor(module, context = {}) {
        this.module = module;
        this.context = context;
        this.logLevel = this.getLogLevelFromEnv();
    }
    /**
     * Create a child logger with additional context
     */
    child(context) {
        return new Logger(this.module, { ...this.context, ...context });
    }
    /**
     * Log error message
     */
    error(message, error, context) {
        if (this.shouldLog(LogLevel.ERROR)) {
            this.log(LogLevel.ERROR, message, error, context);
        }
    }
    /**
     * Log warning message
     */
    warn(message, context) {
        if (this.shouldLog(LogLevel.WARN)) {
            this.log(LogLevel.WARN, message, undefined, context);
        }
    }
    /**
     * Log info message
     */
    info(message, context) {
        if (this.shouldLog(LogLevel.INFO)) {
            this.log(LogLevel.INFO, message, undefined, context);
        }
    }
    /**
     * Log debug message
     */
    debug(message, context) {
        if (this.shouldLog(LogLevel.DEBUG)) {
            this.log(LogLevel.DEBUG, message, undefined, context);
        }
    }
    /**
     * Log trace message
     */
    trace(message, context) {
        if (this.shouldLog(LogLevel.TRACE)) {
            this.log(LogLevel.TRACE, message, undefined, context);
        }
    }
    /**
     * Log performance metrics
     */
    performance(operation, duration, context) {
        this.info(`Performance: ${operation} completed in ${duration}ms`, {
            ...context,
            operation,
            duration,
            type: 'performance'
        });
    }
    /**
     * Log audit events
     */
    audit(action, userId, resource, context) {
        this.info(`Audit: ${action} on ${resource} by ${userId}`, {
            ...context,
            action,
            userId,
            resource,
            type: 'audit'
        });
    }
    /**
     * Log security events
     */
    security(event, userId, context) {
        this.warn(`Security: ${event}${userId ? ` (user: ${userId})` : ''}`, {
            ...context,
            event,
            userId,
            type: 'security'
        });
    }
    log(level, message, error, context) {
        const entry = {
            timestamp: new Date(),
            level,
            message,
            context: { ...this.context, ...context },
            error: error instanceof Error ? error : undefined,
            module: this.module
        };
        // Format and output the log entry
        this.output(entry, error);
    }
    output(entry, error) {
        const levelName = LogLevel[entry.level];
        const timestamp = entry.timestamp.toISOString();
        // Create base log object
        const logObj = {
            timestamp,
            level: levelName,
            module: entry.module,
            message: entry.message,
            ...entry.context
        };
        // Add error information if present
        if (entry.error) {
            logObj.error = {
                name: entry.error.name,
                message: entry.error.message,
                stack: entry.error.stack
            };
        }
        else if (error && typeof error === 'object') {
            logObj.error = error;
        }
        // Output based on environment
        if (process.env.NODE_ENV === 'production') {
            // Structured JSON logging for production
            console.log(JSON.stringify(logObj));
        }
        else {
            // Human-readable logging for development
            const colorCode = this.getColorCode(entry.level);
            const resetCode = '\x1b[0m';
            let output = `${colorCode}[${timestamp}] ${levelName.padEnd(5)} ${entry.module}: ${entry.message}${resetCode}`;
            if (Object.keys(entry.context || {}).length > 0) {
                output += `\n  Context: ${JSON.stringify(entry.context, null, 2)}`;
            }
            if (entry.error) {
                output += `\n  Error: ${entry.error.message}`;
                if (entry.error.stack) {
                    output += `\n  Stack: ${entry.error.stack}`;
                }
            }
            else if (error) {
                output += `\n  Error: ${JSON.stringify(error, null, 2)}`;
            }
            console.log(output);
        }
    }
    shouldLog(level) {
        return level <= this.logLevel;
    }
    getLogLevelFromEnv() {
        const envLevel = process.env.LOG_LEVEL?.toUpperCase();
        switch (envLevel) {
            case 'ERROR':
                return LogLevel.ERROR;
            case 'WARN':
                return LogLevel.WARN;
            case 'INFO':
                return LogLevel.INFO;
            case 'DEBUG':
                return LogLevel.DEBUG;
            case 'TRACE':
                return LogLevel.TRACE;
            default:
                return process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG;
        }
    }
    getColorCode(level) {
        switch (level) {
            case LogLevel.ERROR:
                return '\x1b[31m'; // Red
            case LogLevel.WARN:
                return '\x1b[33m'; // Yellow
            case LogLevel.INFO:
                return '\x1b[36m'; // Cyan
            case LogLevel.DEBUG:
                return '\x1b[35m'; // Magenta
            case LogLevel.TRACE:
                return '\x1b[37m'; // White
            default:
                return '\x1b[0m'; // Reset
        }
    }
}
exports.Logger = Logger;
/**
 * Create a logger instance
 */
function createLogger(module, context) {
    return new Logger(module, context);
}
/**
 * Default logger instance
 */
exports.logger = new Logger('QueueManagement');
/**
 * Performance measurement decorator
 */
function measurePerformance(logger, operation) {
    return function (target, propertyName, descriptor) {
        const method = descriptor.value;
        descriptor.value = async function (...args) {
            const start = Date.now();
            try {
                const result = await method.apply(this, args);
                const duration = Date.now() - start;
                logger.performance(operation, duration, { method: propertyName });
                return result;
            }
            catch (error) {
                const duration = Date.now() - start;
                logger.performance(`${operation} (failed)`, duration, {
                    method: propertyName,
                    error: error?.message || 'Unknown error'
                });
                throw error;
            }
        };
    };
}
/**
 * Audit logging decorator
 */
function auditLog(logger, action) {
    return function (target, propertyName, descriptor) {
        const method = descriptor.value;
        descriptor.value = async function (...args) {
            const context = this.getAuditContext ? this.getAuditContext() : {};
            try {
                const result = await method.apply(this, args);
                logger.audit(action, context.userId || 'system', context.resource || propertyName, {
                    method: propertyName,
                    args: args.length > 0 ? args[0] : undefined
                });
                return result;
            }
            catch (error) {
                logger.audit(`${action} (failed)`, context.userId || 'system', context.resource || propertyName, {
                    method: propertyName,
                    error: error?.message || 'Unknown error'
                });
                throw error;
            }
        };
    };
}
exports.default = Logger;
