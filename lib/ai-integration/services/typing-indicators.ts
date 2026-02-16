/**
 * Typing Indicators Service
 *
 * Manages typing indicators and seen semantics to improve user experience
 * by showing activity during AI processing.
 */

import log from "@/lib/log";
import { ChatwitApiClient } from "./chatwit-api-client";

export interface TypingSession {
	conversationId: number;
	accountId: number;
	traceId: string;
	startTime: number;
	isActive: boolean;
	timeoutId?: NodeJS.Timeout;
}

export interface TypingConfig {
	enabled: boolean;
	minProcessingTime: number; // Only show typing if processing > this time (ms)
	maxTypingDuration: number; // Max time to show typing indicator (ms)
	typingInterval: number; // Interval to refresh typing indicator (ms)
}

export class TypingIndicatorsService {
	private chatwitClient: ChatwitApiClient;
	private activeSessions: Map<string, TypingSession> = new Map();
	private config: TypingConfig;

	constructor(chatwitClient: ChatwitApiClient, config?: Partial<TypingConfig>) {
		this.chatwitClient = chatwitClient;

		this.config = {
			enabled: process.env.TYPING_INDICATORS_ENABLED === "true",
			minProcessingTime: parseInt(process.env.TYPING_MIN_PROCESSING_TIME || "1000"), // 1s
			maxTypingDuration: parseInt(process.env.TYPING_MAX_DURATION || "30000"), // 30s
			typingInterval: parseInt(process.env.TYPING_REFRESH_INTERVAL || "5000"), // 5s
			...config,
		};

		log.debug("Typing indicators service initialized", {
			enabled: this.config.enabled,
			minProcessingTime: this.config.minProcessingTime,
			maxTypingDuration: this.config.maxTypingDuration,
		});
	}

	/**
	 * Start typing indicator for a conversation
	 */
	async startTyping(params: {
		accountId: number;
		conversationId: number;
		traceId: string;
		expectedProcessingTime?: number;
	}): Promise<void> {
		if (!this.config.enabled) {
			return;
		}

		const sessionKey = this.getSessionKey(params.accountId, params.conversationId);

		// Check if we should show typing based on expected processing time
		const processingTime = params.expectedProcessingTime || 0;
		if (processingTime < this.config.minProcessingTime) {
			log.debug("Skipping typing indicator - processing time too short", {
				conversationId: params.conversationId,
				processingTime,
				minRequired: this.config.minProcessingTime,
				traceId: params.traceId,
			});
			return;
		}

		// Stop any existing session
		await this.stopTyping(params.accountId, params.conversationId);

		const session: TypingSession = {
			conversationId: params.conversationId,
			accountId: params.accountId,
			traceId: params.traceId,
			startTime: Date.now(),
			isActive: true,
		};

		this.activeSessions.set(sessionKey, session);

		try {
			// Send initial typing indicator
			await this.sendTypingIndicator(session);

			// Set up periodic refresh
			session.timeoutId = setInterval(async () => {
				if (session.isActive) {
					const elapsed = Date.now() - session.startTime;

					// Stop if max duration reached
					if (elapsed > this.config.maxTypingDuration) {
						log.debug("Stopping typing indicator - max duration reached", {
							conversationId: session.conversationId,
							elapsed,
							maxDuration: this.config.maxTypingDuration,
							traceId: session.traceId,
						});
						await this.stopTyping(session.accountId, session.conversationId);
						return;
					}

					// Refresh typing indicator
					await this.sendTypingIndicator(session);
				}
			}, this.config.typingInterval);

			log.debug("Typing indicator started", {
				conversationId: params.conversationId,
				traceId: params.traceId,
				expectedProcessingTime: processingTime,
			});
		} catch (error) {
			log.warn("Failed to start typing indicator", {
				conversationId: params.conversationId,
				traceId: params.traceId,
				error: (error as Error).message,
			});

			// Clean up on error
			this.activeSessions.delete(sessionKey);
		}
	}

	/**
	 * Stop typing indicator for a conversation
	 */
	async stopTyping(accountId: number, conversationId: number): Promise<void> {
		if (!this.config.enabled) {
			return;
		}

		const sessionKey = this.getSessionKey(accountId, conversationId);
		const session = this.activeSessions.get(sessionKey);

		if (!session) {
			return;
		}

		session.isActive = false;

		// Clear timeout
		if (session.timeoutId) {
			clearInterval(session.timeoutId);
		}

		// Remove from active sessions
		this.activeSessions.delete(sessionKey);

		try {
			// Send stop typing indicator
			await this.sendStopTypingIndicator(session);

			const duration = Date.now() - session.startTime;
			log.debug("Typing indicator stopped", {
				conversationId,
				traceId: session.traceId,
				duration,
			});
		} catch (error) {
			log.warn("Failed to stop typing indicator", {
				conversationId,
				traceId: session.traceId,
				error: (error as Error).message,
			});
		}
	}

	/**
	 * Send typing indicator to Chatwit
	 */
	private async sendTypingIndicator(session: TypingSession): Promise<void> {
		try {
			await this.chatwitClient.sendTypingIndicator({
				accountId: session.accountId,
				conversationId: session.conversationId,
				traceId: session.traceId,
			});

			log.debug("Typing indicator sent", {
				conversationId: session.conversationId,
				traceId: session.traceId,
			});
		} catch (error) {
			// Typing indicators are optional - don't fail the main flow
			log.debug("Typing indicator send failed (non-critical)", {
				conversationId: session.conversationId,
				traceId: session.traceId,
				error: (error as Error).message,
			});
		}
	}

	/**
	 * Send stop typing indicator to Chatwit
	 */
	private async sendStopTypingIndicator(session: TypingSession): Promise<void> {
		try {
			// This would typically call a stop typing API if available
			// For now, we'll just log the intent
			log.debug("Stop typing indicator would be sent", {
				conversationId: session.conversationId,
				traceId: session.traceId,
			});

			// TODO: Implement actual stop typing API call if Chatwit supports it
			// await this.chatwitClient.stopTypingIndicator({
			//   accountId: session.accountId,
			//   conversationId: session.conversationId,
			//   traceId: session.traceId
			// });
		} catch (error) {
			log.debug("Stop typing indicator failed (non-critical)", {
				conversationId: session.conversationId,
				traceId: session.traceId,
				error: (error as Error).message,
			});
		}
	}

	/**
	 * Mark message as seen (if supported by Chatwit)
	 */
	async markAsSeen(params: {
		accountId: number;
		conversationId: number;
		messageId: number;
		traceId: string;
	}): Promise<void> {
		if (!this.config.enabled) {
			return;
		}

		try {
			// This would typically call Chatwit's mark as seen API
			log.debug("Message would be marked as seen", {
				conversationId: params.conversationId,
				messageId: params.messageId,
				traceId: params.traceId,
			});

			// TODO: Implement actual mark as seen API call if Chatwit supports it
			// await this.chatwitClient.markMessageAsSeen({
			//   accountId: params.accountId,
			//   conversationId: params.conversationId,
			//   messageId: params.messageId,
			//   traceId: params.traceId
			// });
		} catch (error) {
			log.debug("Mark as seen failed (non-critical)", {
				conversationId: params.conversationId,
				messageId: params.messageId,
				traceId: params.traceId,
				error: (error as Error).message,
			});
		}
	}

	/**
	 * Auto-manage typing indicator for a processing function
	 */
	async withTypingIndicator<T>(
		params: {
			accountId: number;
			conversationId: number;
			traceId: string;
			expectedProcessingTime?: number;
		},
		processingFunction: () => Promise<T>,
	): Promise<T> {
		const startTime = Date.now();

		try {
			// Start typing indicator
			await this.startTyping(params);

			// Execute the processing function
			const result = await processingFunction();

			// Stop typing indicator
			await this.stopTyping(params.accountId, params.conversationId);

			const actualProcessingTime = Date.now() - startTime;
			log.debug("Processing completed with typing indicator", {
				conversationId: params.conversationId,
				traceId: params.traceId,
				expectedTime: params.expectedProcessingTime,
				actualTime: actualProcessingTime,
			});

			return result;
		} catch (error) {
			// Ensure typing indicator is stopped on error
			await this.stopTyping(params.accountId, params.conversationId);
			throw error;
		}
	}

	/**
	 * Get session key for tracking
	 */
	private getSessionKey(accountId: number, conversationId: number): string {
		return `${accountId}:${conversationId}`;
	}

	/**
	 * Get active sessions count
	 */
	getActiveSessionsCount(): number {
		return this.activeSessions.size;
	}

	/**
	 * Get active sessions for monitoring
	 */
	getActiveSessions(): Array<{
		accountId: number;
		conversationId: number;
		traceId: string;
		duration: number;
	}> {
		const now = Date.now();
		return Array.from(this.activeSessions.values()).map((session) => ({
			accountId: session.accountId,
			conversationId: session.conversationId,
			traceId: session.traceId,
			duration: now - session.startTime,
		}));
	}

	/**
	 * Clean up stale sessions
	 */
	async cleanupStaleSessions(): Promise<number> {
		const now = Date.now();
		const staleThreshold = this.config.maxTypingDuration * 2; // 2x max duration
		let cleanedCount = 0;

		for (const [sessionKey, session] of this.activeSessions.entries()) {
			const age = now - session.startTime;

			if (age > staleThreshold) {
				log.warn("Cleaning up stale typing session", {
					conversationId: session.conversationId,
					traceId: session.traceId,
					age,
					threshold: staleThreshold,
				});

				await this.stopTyping(session.accountId, session.conversationId);
				cleanedCount++;
			}
		}

		if (cleanedCount > 0) {
			log.info("Cleaned up stale typing sessions", { count: cleanedCount });
		}

		return cleanedCount;
	}

	/**
	 * Get typing indicator statistics
	 */
	getStats(): {
		activeSessions: number;
		totalSessionsStarted: number;
		averageSessionDuration: number;
		config: TypingConfig;
	} {
		// This would typically track more detailed statistics
		return {
			activeSessions: this.activeSessions.size,
			totalSessionsStarted: 0, // Would be tracked in production
			averageSessionDuration: 0, // Would be calculated from historical data
			config: this.config,
		};
	}

	/**
	 * Update configuration
	 */
	updateConfig(newConfig: Partial<TypingConfig>): void {
		this.config = { ...this.config, ...newConfig };

		log.info("Typing indicators configuration updated", {
			config: this.config,
		});
	}

	/**
	 * Shutdown service and clean up all sessions
	 */
	async shutdown(): Promise<void> {
		log.info("Shutting down typing indicators service", {
			activeSessions: this.activeSessions.size,
		});

		// Stop all active sessions
		const promises = Array.from(this.activeSessions.values()).map((session) =>
			this.stopTyping(session.accountId, session.conversationId),
		);

		await Promise.allSettled(promises);

		log.info("Typing indicators service shutdown complete");
	}
}

/**
 * Create default typing indicators service
 */
export function createTypingIndicatorsService(
	chatwitClient: ChatwitApiClient,
	config?: Partial<TypingConfig>,
): TypingIndicatorsService {
	return new TypingIndicatorsService(chatwitClient, config);
}
