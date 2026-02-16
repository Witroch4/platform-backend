/**
 * Conversation Context Store Service
 * Requirements: 3.3, 7.3
 */

import { getRedisInstance } from "@/lib/connections";
import { ConversationContext } from "../types/llm";
import aiLogger from "../../log";

export interface ConversationMessage {
	role: "user" | "assistant";
	content: string;
	timestamp: number;
	messageId?: string;
	metadata?: Record<string, any>;
}

export interface ContextStoreConfig {
	maxMessages: number;
	ttlMinutes: number;
	enableCompression: boolean;
	maxContentLength: number;
}

export interface ContextSummary {
	conversationId: number;
	messageCount: number;
	lastMessageTime: number;
	contextLength: number;
	ttlRemaining: number;
}

export class ConversationContextStore {
	private redis: any;
	private config: ContextStoreConfig;

	constructor(redis?: any, config: Partial<ContextStoreConfig> = {}) {
		this.redis = redis || getRedisInstance();
		this.config = {
			maxMessages: 6, // Last N messages as per requirement
			ttlMinutes: 15, // 15 min TTL as per requirement
			enableCompression: true,
			maxContentLength: 1000, // Truncate very long messages
			...config,
		};
	}

	/**
	 * Add message to conversation context
	 */
	async addMessage(
		conversationId: number,
		message: ConversationMessage,
		options: { traceId?: string } = {},
	): Promise<void> {
		const { traceId } = options;

		try {
			const contextKey = this.getContextKey(conversationId);

			// Get current context
			const currentContext = await this.getContext(conversationId, { traceId });

			// Prepare new message
			const processedMessage: ConversationMessage = {
				...message,
				content: this.truncateContent(message.content),
				timestamp: message.timestamp || Date.now(),
			};

			// Add new message to context
			const updatedMessages = [...currentContext.messages, processedMessage];

			// Keep only the last N messages
			const trimmedMessages = updatedMessages.slice(-this.config.maxMessages);

			// Create updated context
			const updatedContext: ConversationContext = {
				conversationId,
				messages: trimmedMessages,
				ttl: this.config.ttlMinutes * 60, // Convert to seconds
				lastUpdated: new Date(),
			};

			// Store in Redis with TTL
			const contextData = this.config.enableCompression
				? this.compressContext(updatedContext)
				: JSON.stringify(updatedContext);

			await this.redis.setex(
				contextKey,
				this.config.ttlMinutes * 60, // TTL in seconds
				contextData,
			);

			aiLogger.debug("Message added to conversation context", {
				traceId,
				conversationId,
				messageRole: message.role,
				messageLength: message.content.length,
				totalMessages: trimmedMessages.length,
				contextSize: contextData.length,
			});
		} catch (error) {
			aiLogger.error("Failed to add message to context", {
				traceId,
				conversationId,
				messageRole: message.role,
				error: error instanceof Error ? error.message : "Unknown error",
			});
			throw error;
		}
	}

	/**
	 * Get conversation context
	 */
	async getContext(conversationId: number, options: { traceId?: string } = {}): Promise<ConversationContext> {
		const { traceId } = options;

		try {
			const contextKey = this.getContextKey(conversationId);
			const contextData = await this.redis.get(contextKey);

			if (!contextData) {
				// Return empty context
				return {
					conversationId,
					messages: [],
					ttl: this.config.ttlMinutes * 60,
					lastUpdated: new Date(),
				};
			}

			// Parse context data
			const context = this.config.enableCompression ? this.decompressContext(contextData) : JSON.parse(contextData);

			aiLogger.debug("Retrieved conversation context", {
				traceId,
				conversationId,
				messageCount: context.messages.length,
				lastUpdated: context.lastUpdated,
			});

			return context;
		} catch (error) {
			aiLogger.error("Failed to get conversation context", {
				traceId,
				conversationId,
				error: error instanceof Error ? error.message : "Unknown error",
			});

			// Return empty context on error
			return {
				conversationId,
				messages: [],
				ttl: this.config.ttlMinutes * 60,
				lastUpdated: new Date(),
			};
		}
	}

	/**
	 * Compose short context for LLM
	 */
	async composeContextForLLM(
		conversationId: number,
		options: {
			maxLength?: number;
			includeSystemPrompt?: boolean;
			traceId?: string;
		} = {},
	): Promise<string> {
		const { maxLength = 800, includeSystemPrompt = true, traceId } = options;

		try {
			const context = await this.getContext(conversationId, { traceId });

			if (context.messages.length === 0) {
				return includeSystemPrompt ? "Esta é uma nova conversa. Seja útil e cordial." : "";
			}

			// Build context string
			let contextString = "";

			if (includeSystemPrompt) {
				contextString += "Histórico da conversa:\n\n";
			}

			// Add messages in chronological order
			for (const message of context.messages) {
				const role = message.role === "user" ? "Cliente" : "Assistente";
				const timestamp = new Date(message.timestamp).toLocaleTimeString("pt-BR");

				contextString += `${role} (${timestamp}): ${message.content}\n`;
			}

			// Truncate if too long
			if (contextString.length > maxLength) {
				// Try to truncate at sentence boundary
				const truncated = contextString.substring(0, maxLength);
				const lastSentence = truncated.lastIndexOf(".");
				const lastNewline = truncated.lastIndexOf("\n");

				const cutPoint = Math.max(lastSentence, lastNewline);
				if (cutPoint > maxLength * 0.8) {
					contextString = truncated.substring(0, cutPoint + 1);
				} else {
					contextString = truncated + "...";
				}
			}

			aiLogger.debug("Composed LLM context", {
				traceId,
				conversationId,
				originalLength: contextString.length,
				messageCount: context.messages.length,
				truncated: contextString.includes("..."),
			});

			return contextString.trim();
		} catch (error) {
			aiLogger.error("Failed to compose LLM context", {
				traceId,
				conversationId,
				error: error instanceof Error ? error.message : "Unknown error",
			});

			return includeSystemPrompt ? "Erro ao carregar histórico. Continue a conversa normalmente." : "";
		}
	}

	/**
	 * Clear conversation context
	 */
	async clearContext(conversationId: number, options: { traceId?: string } = {}): Promise<void> {
		const { traceId } = options;

		try {
			const contextKey = this.getContextKey(conversationId);
			await this.redis.del(contextKey);

			aiLogger.info("Conversation context cleared", {
				traceId,
				conversationId,
			});
		} catch (error) {
			aiLogger.error("Failed to clear conversation context", {
				traceId,
				conversationId,
				error: error instanceof Error ? error.message : "Unknown error",
			});
			throw error;
		}
	}

	/**
	 * Get context summary
	 */
	async getContextSummary(conversationId: number, options: { traceId?: string } = {}): Promise<ContextSummary | null> {
		const { traceId } = options;

		try {
			const contextKey = this.getContextKey(conversationId);
			const [contextData, ttl] = await Promise.all([this.redis.get(contextKey), this.redis.ttl(contextKey)]);

			if (!contextData) {
				return null;
			}

			const context = this.config.enableCompression ? this.decompressContext(contextData) : JSON.parse(contextData);

			const lastMessageTime =
				context.messages.length > 0 ? Math.max(...context.messages.map((m: any) => m.timestamp)) : 0;

			return {
				conversationId,
				messageCount: context.messages.length,
				lastMessageTime,
				contextLength: contextData.length,
				ttlRemaining: ttl,
			};
		} catch (error) {
			aiLogger.error("Failed to get context summary", {
				traceId,
				conversationId,
				error: error instanceof Error ? error.message : "Unknown error",
			});
			return null;
		}
	}

	/**
	 * Extend context TTL
	 */
	async extendTTL(
		conversationId: number,
		additionalMinutes: number = 15,
		options: { traceId?: string } = {},
	): Promise<void> {
		const { traceId } = options;

		try {
			const contextKey = this.getContextKey(conversationId);
			const currentTTL = await this.redis.ttl(contextKey);

			if (currentTTL > 0) {
				const newTTL = currentTTL + additionalMinutes * 60;
				await this.redis.expire(contextKey, newTTL);

				aiLogger.debug("Context TTL extended", {
					traceId,
					conversationId,
					additionalMinutes,
					newTTLSeconds: newTTL,
				});
			}
		} catch (error) {
			aiLogger.error("Failed to extend context TTL", {
				traceId,
				conversationId,
				additionalMinutes,
				error: error instanceof Error ? error.message : "Unknown error",
			});
			throw error;
		}
	}

	/**
	 * Get active conversations count
	 */
	async getActiveConversationsCount(options: { traceId?: string } = {}): Promise<number> {
		const { traceId } = options;

		try {
			const pattern = this.getContextKey("*");
			const keys = await this.redis.keys(pattern);

			aiLogger.debug("Retrieved active conversations count", {
				traceId,
				count: keys.length,
			});

			return keys.length;
		} catch (error) {
			aiLogger.error("Failed to get active conversations count", {
				traceId,
				error: error instanceof Error ? error.message : "Unknown error",
			});
			return 0;
		}
	}

	/**
	 * Cleanup expired contexts (manual cleanup)
	 */
	async cleanupExpiredContexts(options: { traceId?: string } = {}): Promise<number> {
		const { traceId } = options;

		try {
			const pattern = this.getContextKey("*");
			const keys = await this.redis.keys(pattern);

			let cleanedCount = 0;

			for (const key of keys) {
				const ttl = await this.redis.ttl(key);
				if (ttl === -1) {
					// Key exists but has no TTL
					await this.redis.del(key);
					cleanedCount++;
				}
			}

			aiLogger.info("Expired contexts cleaned up", {
				traceId,
				totalKeys: keys.length,
				cleanedCount,
			});

			return cleanedCount;
		} catch (error) {
			aiLogger.error("Failed to cleanup expired contexts", {
				traceId,
				error: error instanceof Error ? error.message : "Unknown error",
			});
			return 0;
		}
	}

	/**
	 * Generate Redis key for conversation context
	 */
	private getContextKey(conversationId: number | string): string {
		return `ai:context:${conversationId}`;
	}

	/**
	 * Truncate content to max length
	 */
	private truncateContent(content: string): string {
		if (content.length <= this.config.maxContentLength) {
			return content;
		}

		// Try to truncate at word boundary
		const truncated = content.substring(0, this.config.maxContentLength);
		const lastSpace = truncated.lastIndexOf(" ");

		if (lastSpace > this.config.maxContentLength * 0.8) {
			return truncated.substring(0, lastSpace) + "...";
		}

		return truncated + "...";
	}

	/**
	 * Compress context data (simple JSON compression)
	 */
	private compressContext(context: ConversationContext): string {
		// For now, just use JSON.stringify
		// In production, could use actual compression like gzip
		return JSON.stringify(context);
	}

	/**
	 * Decompress context data
	 */
	private decompressContext(data: string): ConversationContext {
		// For now, just parse JSON
		// In production, would decompress first
		return JSON.parse(data);
	}
}

/**
 * Factory function to create conversation context store
 */
export function createConversationContextStore(
	redis?: any,
	config: Partial<ContextStoreConfig> = {},
): ConversationContextStore {
	return new ConversationContextStore(redis, config);
}
