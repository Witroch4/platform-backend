"use strict";
/**
 * Queue Management System Errors
 *
 * Custom error classes for the BullMQ queue management system
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorHandler = exports.ErrorFactory = exports.JobTimeoutError = exports.UserNotFoundError = exports.AlertAlreadyAcknowledgedError = exports.AlertNotFoundError = exports.AlertRuleNotFoundError = exports.CircularDependencyError = exports.FlowInvalidStateError = exports.FlowNotFoundError = exports.DatabaseConnectionError = exports.RedisConnectionError = exports.ConfigurationError = exports.ValidationError = exports.RateLimitExceededError = exports.InsufficientPermissionsError = exports.QueueStoppedError = exports.QueuePausedError = exports.JobInvalidStateError = exports.JobNotFoundError = exports.QueueAlreadyExistsError = exports.QueueNotFoundError = exports.QueueManagementError = void 0;
const constants_1 = require("./constants");
/**
 * Base error class for queue management system
 */
class QueueManagementError extends Error {
    code;
    statusCode;
    details;
    timestamp;
    constructor(message, code = constants_1.ERROR_CODES.INTERNAL_ERROR, statusCode = constants_1.HTTP_STATUS.INTERNAL_SERVER_ERROR, details) {
        super(message);
        this.name = 'QueueManagementError';
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
        this.timestamp = new Date();
        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, QueueManagementError);
        }
    }
    /**
     * Convert error to JSON representation
     */
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            statusCode: this.statusCode,
            details: this.details,
            timestamp: this.timestamp,
            stack: this.stack
        };
    }
}
exports.QueueManagementError = QueueManagementError;
/**
 * Queue not found error
 */
class QueueNotFoundError extends QueueManagementError {
    constructor(queueName) {
        super(`Queue not found: ${queueName}`, constants_1.ERROR_CODES.QUEUE_NOT_FOUND, constants_1.HTTP_STATUS.NOT_FOUND, { queueName });
        this.name = 'QueueNotFoundError';
    }
}
exports.QueueNotFoundError = QueueNotFoundError;
/**
 * Queue already exists error
 */
class QueueAlreadyExistsError extends QueueManagementError {
    constructor(queueName) {
        super(`Queue already exists: ${queueName}`, constants_1.ERROR_CODES.QUEUE_ALREADY_EXISTS, constants_1.HTTP_STATUS.CONFLICT, { queueName });
        this.name = 'QueueAlreadyExistsError';
    }
}
exports.QueueAlreadyExistsError = QueueAlreadyExistsError;
/**
 * Job not found error
 */
class JobNotFoundError extends QueueManagementError {
    constructor(jobId, queueName) {
        super(`Job not found: ${jobId}${queueName ? ` in queue ${queueName}` : ''}`, constants_1.ERROR_CODES.JOB_NOT_FOUND, constants_1.HTTP_STATUS.NOT_FOUND, { jobId, queueName });
        this.name = 'JobNotFoundError';
    }
}
exports.JobNotFoundError = JobNotFoundError;
/**
 * Job invalid state error
 */
class JobInvalidStateError extends QueueManagementError {
    constructor(jobId, currentState, expectedState) {
        super(`Job ${jobId} is in invalid state: ${currentState}, expected: ${expectedState}`, constants_1.ERROR_CODES.JOB_INVALID_STATE, constants_1.HTTP_STATUS.BAD_REQUEST, { jobId, currentState, expectedState });
        this.name = 'JobInvalidStateError';
    }
}
exports.JobInvalidStateError = JobInvalidStateError;
/**
 * Queue paused error
 */
class QueuePausedError extends QueueManagementError {
    constructor(queueName) {
        super(`Queue is paused: ${queueName}`, constants_1.ERROR_CODES.QUEUE_PAUSED, constants_1.HTTP_STATUS.SERVICE_UNAVAILABLE, { queueName });
        this.name = 'QueuePausedError';
    }
}
exports.QueuePausedError = QueuePausedError;
/**
 * Queue stopped error
 */
class QueueStoppedError extends QueueManagementError {
    constructor(queueName) {
        super(`Queue is stopped: ${queueName}`, constants_1.ERROR_CODES.QUEUE_STOPPED, constants_1.HTTP_STATUS.SERVICE_UNAVAILABLE, { queueName });
        this.name = 'QueueStoppedError';
    }
}
exports.QueueStoppedError = QueueStoppedError;
/**
 * Insufficient permissions error
 */
class InsufficientPermissionsError extends QueueManagementError {
    constructor(action, resource, userId) {
        super(`Insufficient permissions for ${action} on ${resource}${userId ? ` (user: ${userId})` : ''}`, constants_1.ERROR_CODES.INSUFFICIENT_PERMISSIONS, constants_1.HTTP_STATUS.FORBIDDEN, { action, resource, userId });
        this.name = 'InsufficientPermissionsError';
    }
}
exports.InsufficientPermissionsError = InsufficientPermissionsError;
/**
 * Rate limit exceeded error
 */
class RateLimitExceededError extends QueueManagementError {
    constructor(limit, window, identifier) {
        super(`Rate limit exceeded: ${limit} requests per ${window}ms${identifier ? ` for ${identifier}` : ''}`, constants_1.ERROR_CODES.RATE_LIMIT_EXCEEDED, constants_1.HTTP_STATUS.TOO_MANY_REQUESTS, { limit, window, identifier });
        this.name = 'RateLimitExceededError';
    }
}
exports.RateLimitExceededError = RateLimitExceededError;
/**
 * Validation error
 */
class ValidationError extends QueueManagementError {
    constructor(message, field, value) {
        super(message, constants_1.ERROR_CODES.VALIDATION_ERROR, constants_1.HTTP_STATUS.BAD_REQUEST, { field, value });
        this.name = 'ValidationError';
    }
}
exports.ValidationError = ValidationError;
/**
 * Configuration error
 */
class ConfigurationError extends QueueManagementError {
    constructor(message, configKey) {
        super(message, constants_1.ERROR_CODES.CONFIGURATION_ERROR, constants_1.HTTP_STATUS.INTERNAL_SERVER_ERROR, { configKey });
        this.name = 'ConfigurationError';
    }
}
exports.ConfigurationError = ConfigurationError;
/**
 * Redis connection error
 */
class RedisConnectionError extends QueueManagementError {
    constructor(message, redisError) {
        super(`Redis connection error: ${message}`, constants_1.ERROR_CODES.REDIS_CONNECTION_ERROR, constants_1.HTTP_STATUS.SERVICE_UNAVAILABLE, { originalError: redisError?.message });
        this.name = 'RedisConnectionError';
    }
}
exports.RedisConnectionError = RedisConnectionError;
/**
 * Database connection error
 */
class DatabaseConnectionError extends QueueManagementError {
    constructor(message, dbError) {
        super(`Database connection error: ${message}`, constants_1.ERROR_CODES.DATABASE_CONNECTION_ERROR, constants_1.HTTP_STATUS.SERVICE_UNAVAILABLE, { originalError: dbError?.message });
        this.name = 'DatabaseConnectionError';
    }
}
exports.DatabaseConnectionError = DatabaseConnectionError;
/**
 * Flow not found error
 */
class FlowNotFoundError extends QueueManagementError {
    constructor(flowId) {
        super(`Flow not found: ${flowId}`, constants_1.ERROR_CODES.FLOW_NOT_FOUND, constants_1.HTTP_STATUS.NOT_FOUND, { flowId });
        this.name = 'FlowNotFoundError';
    }
}
exports.FlowNotFoundError = FlowNotFoundError;
/**
 * Flow invalid state error
 */
class FlowInvalidStateError extends QueueManagementError {
    constructor(flowId, currentState, expectedState) {
        super(`Flow ${flowId} is in invalid state: ${currentState}, expected: ${expectedState}`, constants_1.ERROR_CODES.FLOW_INVALID_STATE, constants_1.HTTP_STATUS.BAD_REQUEST, { flowId, currentState, expectedState });
        this.name = 'FlowInvalidStateError';
    }
}
exports.FlowInvalidStateError = FlowInvalidStateError;
/**
 * Circular dependency error
 */
class CircularDependencyError extends QueueManagementError {
    constructor(flowId, dependencyChain) {
        super(`Circular dependency detected in flow ${flowId}: ${dependencyChain.join(' -> ')}`, constants_1.ERROR_CODES.CIRCULAR_DEPENDENCY, constants_1.HTTP_STATUS.BAD_REQUEST, { flowId, dependencyChain });
        this.name = 'CircularDependencyError';
    }
}
exports.CircularDependencyError = CircularDependencyError;
/**
 * Alert rule not found error
 */
class AlertRuleNotFoundError extends QueueManagementError {
    constructor(ruleId) {
        super(`Alert rule not found: ${ruleId}`, constants_1.ERROR_CODES.ALERT_RULE_NOT_FOUND, constants_1.HTTP_STATUS.NOT_FOUND, { ruleId });
        this.name = 'AlertRuleNotFoundError';
    }
}
exports.AlertRuleNotFoundError = AlertRuleNotFoundError;
/**
 * Alert not found error
 */
class AlertNotFoundError extends QueueManagementError {
    constructor(alertId) {
        super(`Alert not found: ${alertId}`, constants_1.ERROR_CODES.ALERT_NOT_FOUND, constants_1.HTTP_STATUS.NOT_FOUND, { alertId });
        this.name = 'AlertNotFoundError';
    }
}
exports.AlertNotFoundError = AlertNotFoundError;
/**
 * Alert already acknowledged error
 */
class AlertAlreadyAcknowledgedError extends QueueManagementError {
    constructor(alertId, acknowledgedBy) {
        super(`Alert ${alertId} is already acknowledged by ${acknowledgedBy}`, constants_1.ERROR_CODES.ALERT_ALREADY_ACKNOWLEDGED, constants_1.HTTP_STATUS.CONFLICT, { alertId, acknowledgedBy });
        this.name = 'AlertAlreadyAcknowledgedError';
    }
}
exports.AlertAlreadyAcknowledgedError = AlertAlreadyAcknowledgedError;
/**
 * User not found error
 */
class UserNotFoundError extends QueueManagementError {
    constructor(userId) {
        super(`User not found: ${userId}`, constants_1.ERROR_CODES.USER_NOT_FOUND, constants_1.HTTP_STATUS.NOT_FOUND, { userId });
        this.name = 'UserNotFoundError';
    }
}
exports.UserNotFoundError = UserNotFoundError;
/**
 * Job timeout error
 */
class JobTimeoutError extends QueueManagementError {
    constructor(jobId, timeout) {
        super(`Job ${jobId} timed out after ${timeout}ms`, constants_1.ERROR_CODES.JOB_TIMEOUT, constants_1.HTTP_STATUS.REQUEST_TIMEOUT, { jobId, timeout });
        this.name = 'JobTimeoutError';
    }
}
exports.JobTimeoutError = JobTimeoutError;
/**
 * Error factory for creating appropriate error instances
 */
class ErrorFactory {
    static createError(code, message, details) {
        switch (code) {
            case constants_1.ERROR_CODES.QUEUE_NOT_FOUND:
                return new QueueNotFoundError(details?.queueName || 'unknown');
            case constants_1.ERROR_CODES.QUEUE_ALREADY_EXISTS:
                return new QueueAlreadyExistsError(details?.queueName || 'unknown');
            case constants_1.ERROR_CODES.JOB_NOT_FOUND:
                return new JobNotFoundError(details?.jobId || 'unknown', details?.queueName);
            case constants_1.ERROR_CODES.JOB_INVALID_STATE:
                return new JobInvalidStateError(details?.jobId || 'unknown', details?.currentState || 'unknown', details?.expectedState || 'unknown');
            case constants_1.ERROR_CODES.INSUFFICIENT_PERMISSIONS:
                return new InsufficientPermissionsError(details?.action || 'unknown', details?.resource || 'unknown', details?.userId);
            case constants_1.ERROR_CODES.RATE_LIMIT_EXCEEDED:
                return new RateLimitExceededError(details?.limit || 0, details?.window || 0, details?.identifier);
            case constants_1.ERROR_CODES.VALIDATION_ERROR:
                return new ValidationError(message, details?.field, details?.value);
            case constants_1.ERROR_CODES.CONFIGURATION_ERROR:
                return new ConfigurationError(message, details?.configKey);
            case constants_1.ERROR_CODES.REDIS_CONNECTION_ERROR:
                return new RedisConnectionError(message, details?.originalError);
            case constants_1.ERROR_CODES.DATABASE_CONNECTION_ERROR:
                return new DatabaseConnectionError(message, details?.originalError);
            default:
                return new QueueManagementError(message, code, constants_1.HTTP_STATUS.INTERNAL_SERVER_ERROR, details);
        }
    }
}
exports.ErrorFactory = ErrorFactory;
/**
 * Error handler utility
 */
class ErrorHandler {
    static handle(error) {
        if (error instanceof QueueManagementError) {
            return error;
        }
        // Handle known error types
        if (error.message.includes('Queue not found')) {
            return new QueueNotFoundError('unknown');
        }
        if (error.message.includes('Job not found')) {
            return new JobNotFoundError('unknown');
        }
        if (error.message.includes('Redis')) {
            return new RedisConnectionError(error.message, error);
        }
        // Default to internal error
        return new QueueManagementError(error.message, constants_1.ERROR_CODES.INTERNAL_ERROR, constants_1.HTTP_STATUS.INTERNAL_SERVER_ERROR, { originalError: error.message, stack: error.stack });
    }
    static isRetryable(error) {
        const retryableCodes = [
            constants_1.ERROR_CODES.REDIS_CONNECTION_ERROR,
            constants_1.ERROR_CODES.DATABASE_CONNECTION_ERROR,
            constants_1.ERROR_CODES.JOB_TIMEOUT
        ];
        return retryableCodes.includes(error.code);
    }
    static shouldLog(error) {
        const noLogCodes = [
            constants_1.ERROR_CODES.NOT_FOUND,
            constants_1.ERROR_CODES.VALIDATION_ERROR,
            constants_1.ERROR_CODES.UNAUTHORIZED,
            constants_1.ERROR_CODES.FORBIDDEN
        ];
        return !noLogCodes.includes(error.code);
    }
}
exports.ErrorHandler = ErrorHandler;
