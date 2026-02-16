/**
 * SocialWise Flow Message Debouncer
 * Aggregates multiple messages from the same session before processing
 *
 * When a user sends multiple messages in quick succession, this service:
 * 1. Buffers all messages from the same sessionId
 * 2. Waits for SOCIALWISE_DEBOUNCE_MS (default: 5000ms) of inactivity
 * 3. Concatenates all messages and processes them as a single request
 * 4. Returns a single response to the user
 *
 * Benefits:
 * - Reduces API calls and costs
 * - Provides better context to the LLM
 * - Avoids race conditions in session management
 * - Better user experience for rapid-fire messages
 */

import { createLogger } from "@/lib/utils/logger";
import { getRedisInstance } from "@/lib/connections";
import { getSocialwiseFlowConfig } from "@/lib/config";

const debounceLogger = createLogger("SocialWise-Debounce");

export interface PendingMessage {
	text: string;
	timestamp: number;
	messageId: string;
	wamid?: string;
	traceId?: string;
}

export interface DebounceEntry {
	sessionId: string;
	channelType: string;
	inboxId: string;
	chatwitAccountId: string;
	userId?: string;
	contactName?: string;
	contactPhone?: string;
	messages: PendingMessage[];
	firstMessageAt: number;
	lastMessageAt: number;
	originalPayload: any;
}

export interface DebounceResult {
	shouldProcess: boolean;
	isDebounced: boolean;
	aggregatedText?: string;
	messageCount?: number;
	entry?: DebounceEntry;
}

// Redis key prefix for debounce entries
const DEBOUNCE_KEY_PREFIX = "socialwise:debounce:";

// In-memory timers for debounce (per-instance)
// Note: In a multi-instance setup, each instance manages its own timers
// but Redis ensures only ONE instance processes the final aggregated message
const debounceTimers = new Map<string, NodeJS.Timeout>();

// Pending response resolvers (for webhook response coordination)
const pendingResolvers = new Map<
	string,
	Array<{
		resolve: (result: DebounceResult) => void;
		messageId: string;
	}>
>();

/**
 * Get the debounce configuration
 */
export function getDebounceConfig(): { enabled: boolean; debounceMs: number } {
	const config = getSocialwiseFlowConfig();
	return {
		enabled: config.debounce?.enabled ?? false,
		debounceMs: config.debounce?.debounce_ms ?? 5000,
	};
}

/**
 * Build the Redis key for a session's debounce entry
 */
function buildDebounceKey(sessionId: string, inboxId: string): string {
	return `${DEBOUNCE_KEY_PREFIX}${inboxId}:${sessionId}`;
}

/**
 * Add a message to the debounce buffer
 * Returns a Promise that resolves when the debounced processing completes
 */
export async function addToDebounceBuffer(
	sessionId: string,
	message: PendingMessage,
	context: {
		channelType: string;
		inboxId: string;
		chatwitAccountId: string;
		userId?: string;
		contactName?: string;
		contactPhone?: string;
		originalPayload: any;
	},
): Promise<DebounceResult> {
	const redis = getRedisInstance();
	const { debounceMs } = getDebounceConfig();
	const key = buildDebounceKey(sessionId, context.inboxId);

	try {
		// Get existing entry or create new one
		const existingRaw = await redis.get(key);
		let entry: DebounceEntry;

		if (existingRaw) {
			entry = JSON.parse(existingRaw);
			entry.messages.push(message);
			entry.lastMessageAt = Date.now();
			// Update originalPayload to the latest (has most recent wamid, etc)
			entry.originalPayload = context.originalPayload;

			debounceLogger.info("Message added to existing debounce buffer", {
				sessionId,
				messageCount: entry.messages.length,
				timeSinceFirst: Date.now() - entry.firstMessageAt,
				messageId: message.messageId,
			});
		} else {
			entry = {
				sessionId,
				channelType: context.channelType,
				inboxId: context.inboxId,
				chatwitAccountId: context.chatwitAccountId,
				userId: context.userId,
				contactName: context.contactName,
				contactPhone: context.contactPhone,
				messages: [message],
				firstMessageAt: Date.now(),
				lastMessageAt: Date.now(),
				originalPayload: context.originalPayload,
			};

			debounceLogger.info("New debounce buffer created", {
				sessionId,
				inboxId: context.inboxId,
				messageId: message.messageId,
			});
		}

		// Save to Redis with TTL slightly longer than debounce time
		const ttlSeconds = Math.ceil((debounceMs + 5000) / 1000);
		await redis.set(key, JSON.stringify(entry), "EX", ttlSeconds);

		// Cancel existing timer for this session
		const timerKey = `${context.inboxId}:${sessionId}`;
		const existingTimer = debounceTimers.get(timerKey);
		if (existingTimer) {
			clearTimeout(existingTimer);
			debounceLogger.debug("Existing debounce timer cancelled", { sessionId, timerKey });
		}

		// Create a Promise that will resolve when processing completes
		return new Promise<DebounceResult>((resolve) => {
			// Add this request's resolver to the pending list
			if (!pendingResolvers.has(timerKey)) {
				pendingResolvers.set(timerKey, []);
			}
			pendingResolvers.get(timerKey)!.push({ resolve, messageId: message.messageId });

			// Set new timer
			const timer = setTimeout(async () => {
				debounceTimers.delete(timerKey);

				try {
					// Try to acquire lock and process
					const result = await processDebounceBuffer(sessionId, context.inboxId);

					// Resolve all pending promises for this session
					const resolvers = pendingResolvers.get(timerKey) || [];
					pendingResolvers.delete(timerKey);

					for (const { resolve: resolverFn, messageId } of resolvers) {
						// Only the first message should process, others get debounced result
						if (messageId === result.entry?.messages[0]?.messageId) {
							resolverFn(result);
						} else {
							resolverFn({
								shouldProcess: false,
								isDebounced: true,
								messageCount: result.messageCount,
							});
						}
					}
				} catch (error) {
					debounceLogger.error("Error processing debounce buffer", {
						error: error instanceof Error ? error.message : String(error),
						sessionId,
					});

					// Resolve with shouldProcess true to fallback to normal processing
					const resolvers = pendingResolvers.get(timerKey) || [];
					pendingResolvers.delete(timerKey);

					for (const { resolve: resolverFn } of resolvers) {
						resolverFn({
							shouldProcess: true,
							isDebounced: false,
						});
					}
				}
			}, debounceMs);

			debounceTimers.set(timerKey, timer);

			debounceLogger.debug("Debounce timer set", {
				sessionId,
				timerKey,
				debounceMs,
			});
		});
	} catch (error) {
		debounceLogger.error("Error adding to debounce buffer", {
			error: error instanceof Error ? error.message : String(error),
			sessionId,
		});

		// On error, return shouldProcess true to continue with normal processing
		return {
			shouldProcess: true,
			isDebounced: false,
		};
	}
}

/**
 * Process the debounce buffer for a session
 * Uses Redis lock to ensure only one instance processes
 */
async function processDebounceBuffer(sessionId: string, inboxId: string): Promise<DebounceResult> {
	const redis = getRedisInstance();
	const key = buildDebounceKey(sessionId, inboxId);
	const lockKey = `${key}:lock`;

	try {
		// Try to acquire lock (NX = only if not exists, EX = with expiry)
		const lockAcquired = await redis.set(lockKey, Date.now().toString(), "NX", "EX", 30);

		if (!lockAcquired) {
			// Another instance is processing this buffer
			debounceLogger.debug("Lock not acquired, another instance is processing", {
				sessionId,
				inboxId,
			});

			return {
				shouldProcess: false,
				isDebounced: true,
			};
		}

		try {
			// Get and delete the entry atomically
			const entryRaw = await redis.get(key);
			if (!entryRaw) {
				debounceLogger.warn("Debounce entry not found after lock acquired", {
					sessionId,
					inboxId,
				});

				return {
					shouldProcess: false,
					isDebounced: true,
				};
			}

			await redis.del(key);
			const entry: DebounceEntry = JSON.parse(entryRaw);

			// Aggregate messages
			const aggregatedText = entry.messages
				.sort((a, b) => a.timestamp - b.timestamp)
				.map((m) => m.text)
				.join("\n");

			debounceLogger.info("Debounce buffer processed", {
				sessionId,
				inboxId,
				messageCount: entry.messages.length,
				totalWaitMs: Date.now() - entry.firstMessageAt,
				aggregatedTextLength: aggregatedText.length,
			});

			return {
				shouldProcess: true,
				isDebounced: true,
				aggregatedText,
				messageCount: entry.messages.length,
				entry,
			};
		} finally {
			// Release lock
			await redis.del(lockKey).catch(() => {});
		}
	} catch (error) {
		debounceLogger.error("Error processing debounce buffer", {
			error: error instanceof Error ? error.message : String(error),
			sessionId,
		});

		return {
			shouldProcess: true,
			isDebounced: false,
		};
	}
}

/**
 * Check if debounce is enabled
 */
export function isDebounceEnabled(): boolean {
	return getDebounceConfig().enabled;
}

/**
 * Get debounce statistics for monitoring
 */
export function getDebounceStats(): {
	activeTimers: number;
	pendingResolvers: number;
} {
	return {
		activeTimers: debounceTimers.size,
		pendingResolvers: Array.from(pendingResolvers.values()).reduce((sum, arr) => sum + arr.length, 0),
	};
}

/**
 * Clear all debounce timers (for graceful shutdown)
 */
export function clearAllDebounceTimers(): void {
	for (const [key, timer] of debounceTimers) {
		clearTimeout(timer);
		debounceLogger.debug("Clearing debounce timer on shutdown", { key });
	}
	debounceTimers.clear();
	pendingResolvers.clear();
}
