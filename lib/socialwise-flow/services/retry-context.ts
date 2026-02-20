/**
 * Retry Context Service
 * Manages Redis storage for timeout retry context
 *
 * When LLM times out, stores the original message and context so that
 * when user clicks @retry, we can reprocess with a degraded model.
 */

import { getRedisInstance } from "@/lib/connections";

// Constants
const RETRY_CONTEXT_TTL_SECONDS = parseInt(process.env.RETRY_CONTEXT_TTL_SECONDS || "120", 10);
const RETRY_MAX_ATTEMPTS = parseInt(process.env.RETRY_MAX_ATTEMPTS || "2", 10);
const RETRY_KEY_PREFIX = "retry:";

// Fallback local storage for dev/CI
const retryContextState = new Map<string, RetryContext>();

/**
 * Classification result from the SocialWise Flow processor
 */
export interface ClassificationResult {
	band: string;
	score: number;
	candidates: Array<{
		id: string;
		name: string;
		slug: string;
		score: number;
	}>;
}

/**
 * Context stored when LLM times out
 */
export interface RetryContext {
	// Original request data
	originalUserText: string;
	originalPayload: any;

	// Timeout context
	timeoutTimestamp: number;
	originalModel: string;
	originalDeadlineMs: number;

	// Retry tracking
	retryAttempt: number;
	maxRetries: number;

	// Session context
	sessionId: string;
	channelType: string;
	inboxId: string;
	userId: string;
	contactName?: string;
	contactPhone?: string;

	// Classification state (if available)
	lastClassification?: ClassificationResult;

	// Agent instructions for the degraded model
	agentInstructions?: string;
	intentHints?: string;

	// Fallback provider configuration (from DB)
	fallbackProvider?: "OPENAI" | "GEMINI" | "CLAUDE";
	fallbackModel?: string;
}

/**
 * Input for storing retry context (partial, with defaults)
 */
export interface RetryContextInput {
	userText: string;
	payload: any;
	model?: string;
	deadlineMs?: number;
	sessionId: string;
	channelType: string;
	inboxId?: string;
	userId?: string;
	contactName?: string;
	contactPhone?: string;
	classification?: ClassificationResult;
	agentInstructions?: string;
	intentHints?: string;
	fallbackProvider?: "OPENAI" | "GEMINI" | "CLAUDE";
	fallbackModel?: string;
}

/**
 * Builds the Redis key for retry context
 */
function buildRetryKey(sessionId: string): string {
	return `${RETRY_KEY_PREFIX}${sessionId}`;
}

/**
 * Stores retry context in Redis when LLM times out
 *
 * @param sessionId - The session ID
 * @param input - The retry context input
 * @returns Promise<void>
 */
export async function storeRetryContext(sessionId: string, input: RetryContextInput): Promise<void> {
	const key = buildRetryKey(sessionId);

	const context: RetryContext = {
		originalUserText: input.userText,
		originalPayload: input.payload,
		timeoutTimestamp: Date.now(),
		originalModel: input.model || "unknown",
		originalDeadlineMs: input.deadlineMs || 15000,
		retryAttempt: 0,
		maxRetries: RETRY_MAX_ATTEMPTS,
		sessionId: input.sessionId,
		channelType: input.channelType,
		inboxId: input.inboxId || "",
		userId: input.userId || "",
		contactName: input.contactName,
		contactPhone: input.contactPhone,
		lastClassification: input.classification,
		agentInstructions: input.agentInstructions,
		intentHints: input.intentHints,
		fallbackProvider: input.fallbackProvider,
		fallbackModel: input.fallbackModel,
	};

	const redis = getRedisInstance?.();

	if (redis) {
		try {
			await redis.setex(key, RETRY_CONTEXT_TTL_SECONDS, JSON.stringify(context));
			console.log(`[Retry] Context stored: ${key} (TTL: ${RETRY_CONTEXT_TTL_SECONDS}s)`);
		} catch (error) {
			console.warn("[Retry] Redis setex failed, using fallback:", error);
			retryContextState.set(key, context);
		}
	} else {
		retryContextState.set(key, context);
		console.log(`[Retry] Context stored in local fallback: ${key}`);
	}
}

/**
 * Retrieves retry context from Redis
 *
 * @param sessionId - The session ID
 * @returns Promise<RetryContext | null>
 */
export async function getRetryContext(sessionId: string): Promise<RetryContext | null> {
	const key = buildRetryKey(sessionId);
	const redis = getRedisInstance?.();

	if (redis) {
		try {
			const data = await redis.get(key);
			if (data) {
				console.log(`[Retry] Context retrieved: ${key}`);
				return JSON.parse(data) as RetryContext;
			}
		} catch (error) {
			console.warn("[Retry] Redis get failed, using fallback:", error);
		}
	}

	// Fallback to local storage
	const localContext = retryContextState.get(key);
	if (localContext) {
		console.log(`[Retry] Context retrieved from local fallback: ${key}`);
		return localContext;
	}

	console.log(`[Retry] No context found for: ${key}`);
	return null;
}

/**
 * Increments the retry attempt counter and returns the new value
 *
 * @param sessionId - The session ID
 * @returns Promise<number> - The new retry attempt count
 */
export async function incrementRetryAttempt(sessionId: string): Promise<number> {
	const context = await getRetryContext(sessionId);

	if (!context) {
		console.warn(`[Retry] Cannot increment - no context found for: ${sessionId}`);
		return RETRY_MAX_ATTEMPTS + 1; // Force handoff if context is missing
	}

	const newAttempt = context.retryAttempt + 1;
	context.retryAttempt = newAttempt;

	// Update the context
	const key = buildRetryKey(sessionId);
	const redis = getRedisInstance?.();

	if (redis) {
		try {
			// Get remaining TTL
			const ttl = await redis.ttl(key);
			const effectiveTtl = ttl > 0 ? ttl : RETRY_CONTEXT_TTL_SECONDS;
			await redis.setex(key, effectiveTtl, JSON.stringify(context));
			console.log(`[Retry] Attempt incremented to ${newAttempt}/${context.maxRetries} for: ${key}`);
		} catch (error) {
			console.warn("[Retry] Redis setex failed during increment:", error);
			retryContextState.set(key, context);
		}
	} else {
		retryContextState.set(key, context);
	}

	return newAttempt;
}

/**
 * Clears the retry context after successful processing or max retries
 *
 * @param sessionId - The session ID
 * @returns Promise<void>
 */
export async function clearRetryContext(sessionId: string): Promise<void> {
	const key = buildRetryKey(sessionId);
	const redis = getRedisInstance?.();

	if (redis) {
		try {
			await redis.del(key);
			console.log(`[Retry] Context cleared: ${key}`);
		} catch (error) {
			console.warn("[Retry] Redis del failed:", error);
		}
	}

	// Always clear local fallback
	retryContextState.delete(key);
}

/**
 * Checks if retry is allowed (attempts < maxRetries)
 *
 * @param sessionId - The session ID
 * @returns Promise<boolean>
 */
export async function canRetry(sessionId: string): Promise<boolean> {
	const context = await getRetryContext(sessionId);

	if (!context) {
		return false;
	}

	return context.retryAttempt < context.maxRetries;
}

/**
 * Gets the configured max retry attempts
 */
export function getMaxRetryAttempts(): number {
	return RETRY_MAX_ATTEMPTS;
}

/**
 * Gets the configured retry context TTL in seconds
 */
export function getRetryContextTTL(): number {
	return RETRY_CONTEXT_TTL_SECONDS;
}
