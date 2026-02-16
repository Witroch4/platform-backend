/**
 * Message Ordering Guard Service
 *
 * Prevents out-of-order message processing by tracking the last processed message timestamp
 * per conversation. If a message arrives with created_at before the last processed timestamp,
 * it routes the message to human agent to prevent anachronistic responses.
 */

import { getRedisInstance } from "../../connections";
// Lazy import to avoid Edge Runtime issues
type Redis = any;

export interface MessageOrderingParams {
	conversationId: number;
	messageId: string;
	createdAt: number; // Unix timestamp in seconds
	ttlSeconds?: number;
}

export interface MessageOrderingResult {
	isOutOfOrder: boolean;
	shouldRouteToAgent: boolean;
	lastProcessedAt: number;
	currentMessageAt: number;
	key: string;
}

export interface ConversationTimestamp {
	conversationId: number;
	lastProcessedAt: number;
	lastMessageId: string;
	ttl: number;
}

export class MessageOrderingGuard {
	private redis: Redis;
	private readonly defaultTtl = 3600; // 1 hour - longer than conversation lock

	constructor() {
		this.redis = getRedisInstance();
	}

	/**
	 * Generate key for storing last processed timestamp per conversation
	 */
	private generateKey(conversationId: number): string {
		return `msg_order:cw:${conversationId}`;
	}

	/**
	 * Check if message is out of order and update last processed timestamp
	 * Returns true if message should be routed to agent due to out-of-order arrival
	 */
	async checkMessageOrder(params: MessageOrderingParams): Promise<MessageOrderingResult> {
		const key = this.generateKey(params.conversationId);
		const ttl = params.ttlSeconds || this.defaultTtl;
		const currentMessageAt = params.createdAt;

		try {
			// Get the last processed timestamp for this conversation
			const lastProcessedData = await this.redis.get(key);

			let lastProcessedAt = 0;
			let isOutOfOrder = false;

			if (lastProcessedData) {
				try {
					const parsed = JSON.parse(lastProcessedData);
					lastProcessedAt = parsed.timestamp || 0;

					// Check if current message is older than the last processed message
					isOutOfOrder = currentMessageAt < lastProcessedAt;
				} catch (parseError) {
					console.error("Error parsing last processed timestamp:", parseError);
					// If we can't parse, assume it's not out of order and continue
					lastProcessedAt = 0;
				}
			}

			// If message is not out of order, update the last processed timestamp
			if (!isOutOfOrder) {
				const newData = {
					timestamp: currentMessageAt,
					messageId: params.messageId,
					updatedAt: Date.now(),
				};

				await this.redis.setex(key, ttl, JSON.stringify(newData));
			}

			return {
				isOutOfOrder,
				shouldRouteToAgent: isOutOfOrder,
				lastProcessedAt,
				currentMessageAt,
				key,
			};
		} catch (error) {
			console.error(`Error checking message order for conversation ${params.conversationId}:`, error);

			// On Redis error, fail safe - don't route to agent, allow processing
			return {
				isOutOfOrder: false,
				shouldRouteToAgent: false,
				lastProcessedAt: 0,
				currentMessageAt,
				key,
			};
		}
	}

	/**
	 * Get the last processed timestamp for a conversation
	 */
	async getLastProcessedTimestamp(conversationId: number): Promise<ConversationTimestamp | null> {
		const key = this.generateKey(conversationId);

		try {
			const [data, ttl] = await Promise.all([this.redis.get(key), this.redis.ttl(key)]);

			if (!data) {
				return null;
			}

			const parsed = JSON.parse(data);

			return {
				conversationId,
				lastProcessedAt: parsed.timestamp || 0,
				lastMessageId: parsed.messageId || "",
				ttl: ttl || 0,
			};
		} catch (error) {
			console.error(`Error getting last processed timestamp for conversation ${conversationId}:`, error);
			return null;
		}
	}

	/**
	 * Force update the last processed timestamp (admin operation)
	 * Useful for correcting out-of-order situations or resetting conversation state
	 */
	async forceUpdateTimestamp(
		conversationId: number,
		timestamp: number,
		messageId: string,
		ttlSeconds?: number,
	): Promise<boolean> {
		const key = this.generateKey(conversationId);
		const ttl = ttlSeconds || this.defaultTtl;

		try {
			const data = {
				timestamp,
				messageId,
				updatedAt: Date.now(),
				forceUpdated: true,
			};

			await this.redis.setex(key, ttl, JSON.stringify(data));
			return true;
		} catch (error) {
			console.error(`Error force updating timestamp for conversation ${conversationId}:`, error);
			return false;
		}
	}

	/**
	 * Reset conversation ordering state (useful for testing or conversation restart)
	 */
	async resetConversationOrder(conversationId: number): Promise<boolean> {
		const key = this.generateKey(conversationId);

		try {
			const result = await this.redis.del(key);
			return result === 1;
		} catch (error) {
			console.error(`Error resetting conversation order for ${conversationId}:`, error);
			return false;
		}
	}

	/**
	 * Get all conversations with ordering state (for monitoring)
	 */
	async getAllConversationStates(pattern?: string): Promise<ConversationTimestamp[]> {
		const searchPattern = pattern || "msg_order:cw:*";

		try {
			const keys = await this.redis.keys(searchPattern);

			if (keys.length === 0) {
				return [];
			}

			// Get data and TTL for all keys
			const pipeline = this.redis.pipeline();
			keys.forEach((key: string) => {
				pipeline.get(key);
				pipeline.ttl(key);
			});

			const results = await pipeline.exec();

			if (!results) {
				return [];
			}

			const states: ConversationTimestamp[] = [];

			for (let i = 0; i < keys.length; i++) {
				const key = keys[i];
				const data = results[i * 2][1] as string;
				const ttl = results[i * 2 + 1][1] as number;

				if (data) {
					try {
						const parsed = JSON.parse(data);

						// Extract conversation ID from key
						const match = key.match(/^msg_order:cw:(\d+)$/);
						if (match) {
							states.push({
								conversationId: parseInt(match[1]),
								lastProcessedAt: parsed.timestamp || 0,
								lastMessageId: parsed.messageId || "",
								ttl: ttl || 0,
							});
						}
					} catch (parseError) {
						console.error(`Error parsing data for key ${key}:`, parseError);
					}
				}
			}

			return states.sort((a, b) => b.lastProcessedAt - a.lastProcessedAt);
		} catch (error) {
			console.error("Error getting all conversation states:", error);
			return [];
		}
	}

	/**
	 * Clean up expired conversation states (maintenance operation)
	 */
	async cleanupExpiredStates(): Promise<number> {
		try {
			const states = await this.getAllConversationStates();
			let cleanedCount = 0;

			for (const state of states) {
				if (state.ttl <= 0) {
					const reset = await this.resetConversationOrder(state.conversationId);
					if (reset) {
						cleanedCount++;
					}
				}
			}

			return cleanedCount;
		} catch (error) {
			console.error("Error cleaning up expired states:", error);
			return 0;
		}
	}

	/**
	 * Batch check multiple messages for ordering
	 * Useful for processing multiple messages from the same conversation
	 */
	async batchCheckOrder(messagesList: MessageOrderingParams[]): Promise<MessageOrderingResult[]> {
		if (messagesList.length === 0) {
			return [];
		}

		// Group messages by conversation for efficient processing
		const conversationGroups = new Map<number, MessageOrderingParams[]>();

		for (const message of messagesList) {
			const existing = conversationGroups.get(message.conversationId) || [];
			existing.push(message);
			conversationGroups.set(message.conversationId, existing);
		}

		const results: MessageOrderingResult[] = [];

		// Process each conversation group sequentially to maintain ordering
		for (const [conversationId, messages] of conversationGroups) {
			// Sort messages by timestamp within each conversation
			const sortedMessages = messages.sort((a, b) => a.createdAt - b.createdAt);

			for (const message of sortedMessages) {
				const result = await this.checkMessageOrder(message);
				results.push(result);
			}
		}

		// Return results in original order
		return messagesList.map((originalMessage) => {
			return (
				results.find(
					(result) =>
						result.key === this.generateKey(originalMessage.conversationId) &&
						result.currentMessageAt === originalMessage.createdAt,
				) || {
					isOutOfOrder: false,
					shouldRouteToAgent: false,
					lastProcessedAt: 0,
					currentMessageAt: originalMessage.createdAt,
					key: this.generateKey(originalMessage.conversationId),
				}
			);
		});
	}

	/**
	 * Get ordering statistics for monitoring
	 */
	async getOrderingStats(timeRangeMs: number = 3600000): Promise<{
		totalConversations: number;
		outOfOrderCount: number;
		averageTimeDrift: number;
		maxTimeDrift: number;
	}> {
		// This would typically be implemented with proper metrics collection
		// For now, return basic stats from current state
		try {
			const states = await this.getAllConversationStates();

			return {
				totalConversations: states.length,
				outOfOrderCount: 0, // Would need to track this in metrics
				averageTimeDrift: 0, // Would need to track this in metrics
				maxTimeDrift: 0, // Would need to track this in metrics
			};
		} catch (error) {
			console.error("Error getting ordering stats:", error);
			return {
				totalConversations: 0,
				outOfOrderCount: 0,
				averageTimeDrift: 0,
				maxTimeDrift: 0,
			};
		}
	}
}

// Export singleton instance
export const messageOrderingGuard = new MessageOrderingGuard();
