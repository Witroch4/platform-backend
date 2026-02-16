/**
 * Queue Management System Errors
 *
 * Custom error classes for the BullMQ queue management system
 */

import { ERROR_CODES, HTTP_STATUS } from "./constants";

/**
 * Base error class for queue management system
 */
export class QueueManagementError extends Error {
	public readonly code: string;
	public readonly statusCode: number;
	public readonly details?: any;
	public readonly timestamp: Date;

	constructor(
		message: string,
		code: string = ERROR_CODES.INTERNAL_ERROR,
		statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
		details?: any,
	) {
		super(message);
		this.name = "QueueManagementError";
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
			stack: this.stack,
		};
	}
}

/**
 * Queue not found error
 */
export class QueueNotFoundError extends QueueManagementError {
	constructor(queueName: string) {
		super(`Queue not found: ${queueName}`, ERROR_CODES.QUEUE_NOT_FOUND, HTTP_STATUS.NOT_FOUND, { queueName });
		this.name = "QueueNotFoundError";
	}
}

/**
 * Queue already exists error
 */
export class QueueAlreadyExistsError extends QueueManagementError {
	constructor(queueName: string) {
		super(`Queue already exists: ${queueName}`, ERROR_CODES.QUEUE_ALREADY_EXISTS, HTTP_STATUS.CONFLICT, { queueName });
		this.name = "QueueAlreadyExistsError";
	}
}

/**
 * Job not found error
 */
export class JobNotFoundError extends QueueManagementError {
	constructor(jobId: string, queueName?: string) {
		super(
			`Job not found: ${jobId}${queueName ? ` in queue ${queueName}` : ""}`,
			ERROR_CODES.JOB_NOT_FOUND,
			HTTP_STATUS.NOT_FOUND,
			{ jobId, queueName },
		);
		this.name = "JobNotFoundError";
	}
}

/**
 * Job invalid state error
 */
export class JobInvalidStateError extends QueueManagementError {
	constructor(jobId: string, currentState: string, expectedState: string) {
		super(
			`Job ${jobId} is in invalid state: ${currentState}, expected: ${expectedState}`,
			ERROR_CODES.JOB_INVALID_STATE,
			HTTP_STATUS.BAD_REQUEST,
			{ jobId, currentState, expectedState },
		);
		this.name = "JobInvalidStateError";
	}
}

/**
 * Queue paused error
 */
export class QueuePausedError extends QueueManagementError {
	constructor(queueName: string) {
		super(`Queue is paused: ${queueName}`, ERROR_CODES.QUEUE_PAUSED, HTTP_STATUS.SERVICE_UNAVAILABLE, { queueName });
		this.name = "QueuePausedError";
	}
}

/**
 * Queue stopped error
 */
export class QueueStoppedError extends QueueManagementError {
	constructor(queueName: string) {
		super(`Queue is stopped: ${queueName}`, ERROR_CODES.QUEUE_STOPPED, HTTP_STATUS.SERVICE_UNAVAILABLE, { queueName });
		this.name = "QueueStoppedError";
	}
}

/**
 * Insufficient permissions error
 */
export class InsufficientPermissionsError extends QueueManagementError {
	constructor(action: string, resource: string, userId?: string) {
		super(
			`Insufficient permissions for ${action} on ${resource}${userId ? ` (user: ${userId})` : ""}`,
			ERROR_CODES.INSUFFICIENT_PERMISSIONS,
			HTTP_STATUS.FORBIDDEN,
			{ action, resource, userId },
		);
		this.name = "InsufficientPermissionsError";
	}
}

/**
 * Rate limit exceeded error
 */
export class RateLimitExceededError extends QueueManagementError {
	constructor(limit: number, window: number, identifier?: string) {
		super(
			`Rate limit exceeded: ${limit} requests per ${window}ms${identifier ? ` for ${identifier}` : ""}`,
			ERROR_CODES.RATE_LIMIT_EXCEEDED,
			HTTP_STATUS.TOO_MANY_REQUESTS,
			{ limit, window, identifier },
		);
		this.name = "RateLimitExceededError";
	}
}

/**
 * Validation error
 */
export class ValidationError extends QueueManagementError {
	constructor(message: string, field?: string, value?: any) {
		super(message, ERROR_CODES.VALIDATION_ERROR, HTTP_STATUS.BAD_REQUEST, { field, value });
		this.name = "ValidationError";
	}
}

/**
 * Configuration error
 */
export class ConfigurationError extends QueueManagementError {
	constructor(message: string, configKey?: string) {
		super(message, ERROR_CODES.CONFIGURATION_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR, { configKey });
		this.name = "ConfigurationError";
	}
}

/**
 * Redis connection error
 */
export class RedisConnectionError extends QueueManagementError {
	constructor(message: string, redisError?: Error) {
		super(`Redis connection error: ${message}`, ERROR_CODES.REDIS_CONNECTION_ERROR, HTTP_STATUS.SERVICE_UNAVAILABLE, {
			originalError: redisError?.message,
		});
		this.name = "RedisConnectionError";
	}
}

/**
 * Database connection error
 */
export class DatabaseConnectionError extends QueueManagementError {
	constructor(message: string, dbError?: Error) {
		super(
			`Database connection error: ${message}`,
			ERROR_CODES.DATABASE_CONNECTION_ERROR,
			HTTP_STATUS.SERVICE_UNAVAILABLE,
			{ originalError: dbError?.message },
		);
		this.name = "DatabaseConnectionError";
	}
}

/**
 * Flow not found error
 */
export class FlowNotFoundError extends QueueManagementError {
	constructor(flowId: string) {
		super(`Flow not found: ${flowId}`, ERROR_CODES.FLOW_NOT_FOUND, HTTP_STATUS.NOT_FOUND, { flowId });
		this.name = "FlowNotFoundError";
	}
}

/**
 * Flow invalid state error
 */
export class FlowInvalidStateError extends QueueManagementError {
	constructor(flowId: string, currentState: string, expectedState: string) {
		super(
			`Flow ${flowId} is in invalid state: ${currentState}, expected: ${expectedState}`,
			ERROR_CODES.FLOW_INVALID_STATE,
			HTTP_STATUS.BAD_REQUEST,
			{ flowId, currentState, expectedState },
		);
		this.name = "FlowInvalidStateError";
	}
}

/**
 * Circular dependency error
 */
export class CircularDependencyError extends QueueManagementError {
	constructor(flowId: string, dependencyChain: string[]) {
		super(
			`Circular dependency detected in flow ${flowId}: ${dependencyChain.join(" -> ")}`,
			ERROR_CODES.CIRCULAR_DEPENDENCY,
			HTTP_STATUS.BAD_REQUEST,
			{ flowId, dependencyChain },
		);
		this.name = "CircularDependencyError";
	}
}

/**
 * Alert rule not found error
 */
export class AlertRuleNotFoundError extends QueueManagementError {
	constructor(ruleId: string) {
		super(`Alert rule not found: ${ruleId}`, ERROR_CODES.ALERT_RULE_NOT_FOUND, HTTP_STATUS.NOT_FOUND, { ruleId });
		this.name = "AlertRuleNotFoundError";
	}
}

/**
 * Alert not found error
 */
export class AlertNotFoundError extends QueueManagementError {
	constructor(alertId: string) {
		super(`Alert not found: ${alertId}`, ERROR_CODES.ALERT_NOT_FOUND, HTTP_STATUS.NOT_FOUND, { alertId });
		this.name = "AlertNotFoundError";
	}
}

/**
 * Alert already acknowledged error
 */
export class AlertAlreadyAcknowledgedError extends QueueManagementError {
	constructor(alertId: string, acknowledgedBy: string) {
		super(
			`Alert ${alertId} is already acknowledged by ${acknowledgedBy}`,
			ERROR_CODES.ALERT_ALREADY_ACKNOWLEDGED,
			HTTP_STATUS.CONFLICT,
			{ alertId, acknowledgedBy },
		);
		this.name = "AlertAlreadyAcknowledgedError";
	}
}

/**
 * User not found error
 */
export class UserNotFoundError extends QueueManagementError {
	constructor(userId: string) {
		super(`User not found: ${userId}`, ERROR_CODES.USER_NOT_FOUND, HTTP_STATUS.NOT_FOUND, { userId });
		this.name = "UserNotFoundError";
	}
}

/**
 * Job timeout error
 */
export class JobTimeoutError extends QueueManagementError {
	constructor(jobId: string, timeout: number) {
		super(`Job ${jobId} timed out after ${timeout}ms`, ERROR_CODES.JOB_TIMEOUT, HTTP_STATUS.REQUEST_TIMEOUT, {
			jobId,
			timeout,
		});
		this.name = "JobTimeoutError";
	}
}

/**
 * Error factory for creating appropriate error instances
 */
export class ErrorFactory {
	static createError(code: string, message: string, details?: any): QueueManagementError {
		switch (code) {
			case ERROR_CODES.QUEUE_NOT_FOUND:
				return new QueueNotFoundError(details?.queueName || "unknown");
			case ERROR_CODES.QUEUE_ALREADY_EXISTS:
				return new QueueAlreadyExistsError(details?.queueName || "unknown");
			case ERROR_CODES.JOB_NOT_FOUND:
				return new JobNotFoundError(details?.jobId || "unknown", details?.queueName);
			case ERROR_CODES.JOB_INVALID_STATE:
				return new JobInvalidStateError(
					details?.jobId || "unknown",
					details?.currentState || "unknown",
					details?.expectedState || "unknown",
				);
			case ERROR_CODES.INSUFFICIENT_PERMISSIONS:
				return new InsufficientPermissionsError(
					details?.action || "unknown",
					details?.resource || "unknown",
					details?.userId,
				);
			case ERROR_CODES.RATE_LIMIT_EXCEEDED:
				return new RateLimitExceededError(details?.limit || 0, details?.window || 0, details?.identifier);
			case ERROR_CODES.VALIDATION_ERROR:
				return new ValidationError(message, details?.field, details?.value);
			case ERROR_CODES.CONFIGURATION_ERROR:
				return new ConfigurationError(message, details?.configKey);
			case ERROR_CODES.REDIS_CONNECTION_ERROR:
				return new RedisConnectionError(message, details?.originalError);
			case ERROR_CODES.DATABASE_CONNECTION_ERROR:
				return new DatabaseConnectionError(message, details?.originalError);
			default:
				return new QueueManagementError(message, code, HTTP_STATUS.INTERNAL_SERVER_ERROR, details);
		}
	}
}

/**
 * Error handler utility
 */
export class ErrorHandler {
	static handle(error: Error): QueueManagementError {
		if (error instanceof QueueManagementError) {
			return error;
		}

		// Handle known error types
		if (error.message.includes("Queue not found")) {
			return new QueueNotFoundError("unknown");
		}

		if (error.message.includes("Job not found")) {
			return new JobNotFoundError("unknown");
		}

		if (error.message.includes("Redis")) {
			return new RedisConnectionError(error.message, error);
		}

		// Default to internal error
		return new QueueManagementError(error.message, ERROR_CODES.INTERNAL_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR, {
			originalError: error.message,
			stack: error.stack,
		});
	}

	static isRetryable(error: QueueManagementError): boolean {
		const retryableCodes = [
			ERROR_CODES.REDIS_CONNECTION_ERROR,
			ERROR_CODES.DATABASE_CONNECTION_ERROR,
			ERROR_CODES.JOB_TIMEOUT,
		];
		return retryableCodes.includes(error.code as any);
	}

	static shouldLog(error: QueueManagementError): boolean {
		const noLogCodes = [
			ERROR_CODES.NOT_FOUND,
			ERROR_CODES.VALIDATION_ERROR,
			ERROR_CODES.UNAUTHORIZED,
			ERROR_CODES.FORBIDDEN,
		];
		return !noLogCodes.includes(error.code as any);
	}
}
