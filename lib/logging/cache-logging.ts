/**
 * Comprehensive Cache Logging Utilities
 *
 * This module provides standardized logging functions for cache operations
 * with user context and debugging information.
 */

export interface CacheLogContext {
	userContext: {
		usuarioChatwitId: string;
		inboxId: string;
	};
	intentName: string;
	operation: string;
	cacheKey?: string;
	correlationId?: string;
}

export interface CacheOperationMetrics {
	latency?: number;
	dataSize?: number;
	ttl?: number;
	hitCount?: number;
	executionTime?: number;
}

export interface CacheErrorDetails {
	message: string;
	name: string;
	stack?: string;
}

/**
 * Log cache hit with comprehensive context
 */
export function logCacheHit(
	context: CacheLogContext,
	metrics: CacheOperationMetrics = {},
	additionalData: Record<string, any> = {},
): void {
	const logData = {
		...context,
		...metrics,
		...additionalData,
		cacheResult: "HIT",
		timestamp: new Date().toISOString(),
	};

	console.log(`[Cache] [HIT] ${context.operation}:`, logData);
}

/**
 * Log cache miss with comprehensive context
 */
export function logCacheMiss(
	context: CacheLogContext,
	metrics: CacheOperationMetrics = {},
	reason: string = "Key not found",
	additionalData: Record<string, any> = {},
): void {
	const logData = {
		...context,
		...metrics,
		...additionalData,
		cacheResult: "MISS",
		reason,
		timestamp: new Date().toISOString(),
	};

	console.log(`[Cache] [MISS] ${context.operation}:`, logData);
}

/**
 * Log cache set operation with comprehensive context
 */
export function logCacheSet(
	context: CacheLogContext,
	metrics: CacheOperationMetrics = {},
	additionalData: Record<string, any> = {},
): void {
	const logData = {
		...context,
		...metrics,
		...additionalData,
		cacheResult: "SET",
		timestamp: new Date().toISOString(),
	};

	console.log(`[Cache] [SET] ${context.operation}:`, logData);
}

/**
 * Log cache invalidation with comprehensive context
 */
export function logCacheInvalidation(
	context: CacheLogContext,
	keysDeleted: string[] = [],
	reason: string = "Manual invalidation",
	additionalData: Record<string, any> = {},
): void {
	const logData = {
		...context,
		keysDeleted,
		keysDeletedCount: keysDeleted.length,
		reason,
		...additionalData,
		cacheResult: "INVALIDATED",
		timestamp: new Date().toISOString(),
	};

	console.log(`[Cache] [INVALIDATED] ${context.operation}:`, logData);
}

/**
 * Log cache error with comprehensive context
 */
export function logCacheError(
	context: CacheLogContext,
	error: Error | CacheErrorDetails,
	impact: string = "Operation failed",
	additionalData: Record<string, any> = {},
): void {
	const errorDetails =
		error instanceof Error
			? {
					message: error.message,
					name: error.name,
					stack: error.stack,
				}
			: error;

	const logData = {
		...context,
		error: errorDetails,
		impact,
		...additionalData,
		cacheResult: "ERROR",
		timestamp: new Date().toISOString(),
	};

	console.error(`[Cache] [ERROR] ${context.operation}:`, logData);
}

/**
 * Log cache key generation for debugging
 */
export function logCacheKeyGeneration(
	context: CacheLogContext,
	keyComponents: Record<string, any>,
	keyFormat: string,
	additionalData: Record<string, any> = {},
): void {
	const logData = {
		...context,
		keyComponents,
		keyFormat,
		...additionalData,
		operation: `${context.operation}_key_generation`,
		timestamp: new Date().toISOString(),
	};

	console.log(`[Cache] [DEBUG] Key generation for ${context.operation}:`, logData);
}

/**
 * Log API cache invalidation operations
 */
export function logApiCacheInvalidation(
	apiOperation: string,
	context: CacheLogContext,
	success: boolean,
	reason: string,
	additionalData: Record<string, any> = {},
): void {
	const logLevel = success ? "SUCCESS" : "ERROR";
	const logData = {
		apiOperation,
		...context,
		success,
		reason,
		...additionalData,
		timestamp: new Date().toISOString(),
	};

	if (success) {
		console.log(`[API Cache Invalidation] [${logLevel}] ${apiOperation}:`, logData);
	} else {
		console.error(`[API Cache Invalidation] [${logLevel}] ${apiOperation}:`, logData);
	}
}

/**
 * Log webhook cache operations
 */
export function logWebhookCacheOperation(
	webhookType: string,
	context: CacheLogContext,
	operation: "lookup" | "set" | "invalidate",
	result: "success" | "error" | "hit" | "miss",
	additionalData: Record<string, any> = {},
): void {
	const logData = {
		webhookType,
		...context,
		operation,
		result,
		...additionalData,
		timestamp: new Date().toISOString(),
	};

	const logLevel = result === "error" ? "ERROR" : "INFO";
	const logMethod = result === "error" ? console.error : console.log;

	logMethod(`[Webhook Cache] [${logLevel}] ${webhookType} - ${operation}:`, logData);
}

/**
 * Create a standardized cache log context
 */
export function createCacheLogContext(
	usuarioChatwitId: string,
	inboxId: string,
	intentName: string,
	operation: string,
	correlationId?: string,
): CacheLogContext {
	return {
		userContext: { usuarioChatwitId, inboxId },
		intentName,
		operation,
		correlationId,
	};
}

/**
 * Log cache performance metrics
 */
export function logCachePerformanceMetrics(
	context: CacheLogContext,
	metrics: {
		hitRate: number;
		averageLatency: number;
		totalOperations: number;
		errorRate: number;
	},
	additionalData: Record<string, any> = {},
): void {
	const logData = {
		...context,
		performance: metrics,
		...additionalData,
		timestamp: new Date().toISOString(),
	};

	console.log(`[Cache] [PERFORMANCE] ${context.operation}:`, logData);
}

/**
 * Log cache isolation verification
 */
export function logCacheIsolationCheck(
	context: CacheLogContext,
	isolationVerified: boolean,
	details: Record<string, any> = {},
): void {
	const logData = {
		...context,
		isolationVerified,
		...details,
		timestamp: new Date().toISOString(),
	};

	const logLevel = isolationVerified ? "SUCCESS" : "WARNING";
	const logMethod = isolationVerified ? console.log : console.warn;

	logMethod(`[Cache] [ISOLATION_CHECK] [${logLevel}] ${context.operation}:`, logData);
}
