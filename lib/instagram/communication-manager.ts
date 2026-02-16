/**
 * Instagram Translation Communication Manager
 *
 * Manages communication between webhook and worker processes
 * using Redis Pub/Sub and job result storage
 */

import { getRedisInstance } from "../connections";
import { InstagramTranslationResult, createErrorResult } from "../queue/instagram-translation.queue";
import { InstagramTranslationErrorCodes } from "../error-handling/instagram-translation-errors";
import { validateCorrelationId } from "../validation/instagram-translation-validation";
import { EventEmitter } from "events";

// Communication channels
const CHANNELS = {
	JOB_COMPLETED: "instagram-translation:job-completed",
	JOB_FAILED: "instagram-translation:job-failed",
	JOB_PROGRESS: "instagram-translation:job-progress",
	WORKER_HEALTH: "instagram-translation:worker-health",
} as const;

// Message types
export interface JobCompletedMessage {
	correlationId: string;
	success: true;
	result: InstagramTranslationResult;
	timestamp: number;
}

export interface JobFailedMessage {
	correlationId: string;
	success: false;
	error: string;
	errorCode: InstagramTranslationErrorCodes;
	timestamp: number;
}

export interface JobProgressMessage {
	correlationId: string;
	progress: number;
	stage: string;
	timestamp: number;
}

export interface WorkerHealthMessage {
	workerId: string;
	status: "healthy" | "busy" | "error";
	activeJobs: number;
	timestamp: number;
}

export type CommunicationMessage = JobCompletedMessage | JobFailedMessage | JobProgressMessage | WorkerHealthMessage;

/**
 * Communication Manager for Instagram Translation
 */
export class InstagramTranslationCommunicationManager extends EventEmitter {
	private subscriber: ReturnType<typeof getRedisInstance>;
	private publisher: ReturnType<typeof getRedisInstance>;
	private isSubscribed = false;
	private activeListeners = new Map<string, NodeJS.Timeout>();

	constructor() {
		super();
		// Use separate connections for pub/sub to avoid blocking
		this.subscriber = getRedisInstance().duplicate();
		this.publisher = getRedisInstance().duplicate();

		this.setupSubscriber();
	}

	/**
	 * Setup Redis subscriber for communication channels
	 */
	private async setupSubscriber(): Promise<void> {
		try {
			this.subscriber.on("message", this.handleMessage.bind(this));
			this.subscriber.on("error", (error: any) => {
				console.error("[Instagram Translation Communication] Subscriber error:", error);
				this.emit("error", error);
			});

			await this.subscriber.subscribe(
				CHANNELS.JOB_COMPLETED,
				CHANNELS.JOB_FAILED,
				CHANNELS.JOB_PROGRESS,
				CHANNELS.WORKER_HEALTH,
			);

			this.isSubscribed = true;
			console.log("[Instagram Translation Communication] Subscribed to communication channels");
		} catch (error) {
			console.error("[Instagram Translation Communication] Failed to setup subscriber:", error);
			throw error;
		}
	}

	/**
	 * Handle incoming messages from Redis channels
	 */
	private handleMessage(channel: string, message: string): void {
		try {
			const data = JSON.parse(message);

			switch (channel) {
				case CHANNELS.JOB_COMPLETED:
					this.handleJobCompleted(data as JobCompletedMessage);
					break;
				case CHANNELS.JOB_FAILED:
					this.handleJobFailed(data as JobFailedMessage);
					break;
				case CHANNELS.JOB_PROGRESS:
					this.handleJobProgress(data as JobProgressMessage);
					break;
				case CHANNELS.WORKER_HEALTH:
					this.handleWorkerHealth(data as WorkerHealthMessage);
					break;
				default:
					console.warn(`[Instagram Translation Communication] Unknown channel: ${channel}`);
			}
		} catch (error) {
			console.error(`[Instagram Translation Communication] Failed to parse message from ${channel}:`, error);
		}
	}

	/**
	 * Handle job completion messages
	 */
	private handleJobCompleted(message: JobCompletedMessage): void {
		console.log(`[Instagram Translation Communication] Job completed: ${message.correlationId}`);
		this.emit("job-completed", message);
		this.cleanupListener(message.correlationId);
	}

	/**
	 * Handle job failure messages
	 */
	private handleJobFailed(message: JobFailedMessage): void {
		console.log(`[Instagram Translation Communication] Job failed: ${message.correlationId}`);
		this.emit("job-failed", message);
		this.cleanupListener(message.correlationId);
	}

	/**
	 * Handle job progress messages
	 */
	private handleJobProgress(message: JobProgressMessage): void {
		console.log(
			`[Instagram Translation Communication] Job progress: ${message.correlationId} - ${message.stage} (${message.progress}%)`,
		);
		this.emit("job-progress", message);
	}

	/**
	 * Handle worker health messages
	 */
	private handleWorkerHealth(message: WorkerHealthMessage): void {
		console.log(`[Instagram Translation Communication] Worker health: ${message.workerId} - ${message.status}`);
		this.emit("worker-health", message);
	}

	/**
	 * Publish job completion message
	 */
	async publishJobCompleted(correlationId: string, result: InstagramTranslationResult): Promise<void> {
		if (!validateCorrelationId(correlationId)) {
			throw new Error(`Invalid correlation ID: ${correlationId}`);
		}

		const message: JobCompletedMessage = {
			correlationId,
			success: true,
			result,
			timestamp: Date.now(),
		};

		try {
			await this.publisher.publish(CHANNELS.JOB_COMPLETED, JSON.stringify(message));
			console.log(`[Instagram Translation Communication] Published job completion: ${correlationId}`);
		} catch (error) {
			console.error(`[Instagram Translation Communication] Failed to publish job completion: ${correlationId}`, error);
			throw error;
		}
	}

	/**
	 * Publish job failure message
	 */
	async publishJobFailed(
		correlationId: string,
		error: string,
		errorCode: InstagramTranslationErrorCodes = InstagramTranslationErrorCodes.UNKNOWN_ERROR,
	): Promise<void> {
		if (!validateCorrelationId(correlationId)) {
			throw new Error(`Invalid correlation ID: ${correlationId}`);
		}

		const message: JobFailedMessage = {
			correlationId,
			success: false,
			error,
			errorCode,
			timestamp: Date.now(),
		};

		try {
			await this.publisher.publish(CHANNELS.JOB_FAILED, JSON.stringify(message));
			console.log(`[Instagram Translation Communication] Published job failure: ${correlationId}`);
		} catch (error) {
			console.error(`[Instagram Translation Communication] Failed to publish job failure: ${correlationId}`, error);
			throw error;
		}
	}

	/**
	 * Publish job progress message
	 */
	async publishJobProgress(correlationId: string, progress: number, stage: string): Promise<void> {
		if (!validateCorrelationId(correlationId)) {
			throw new Error(`Invalid correlation ID: ${correlationId}`);
		}

		const message: JobProgressMessage = {
			correlationId,
			progress: Math.max(0, Math.min(100, progress)), // Clamp between 0-100
			stage,
			timestamp: Date.now(),
		};

		try {
			await this.publisher.publish(CHANNELS.JOB_PROGRESS, JSON.stringify(message));
		} catch (error) {
			console.error(`[Instagram Translation Communication] Failed to publish job progress: ${correlationId}`, error);
		}
	}

	/**
	 * Publish worker health message
	 */
	async publishWorkerHealth(
		workerId: string,
		status: "healthy" | "busy" | "error",
		activeJobs: number = 0,
	): Promise<void> {
		const message: WorkerHealthMessage = {
			workerId,
			status,
			activeJobs,
			timestamp: Date.now(),
		};

		try {
			await this.publisher.publish(CHANNELS.WORKER_HEALTH, JSON.stringify(message));
		} catch (error) {
			console.error(`[Instagram Translation Communication] Failed to publish worker health: ${workerId}`, error);
		}
	}

	/**
	 * Wait for job completion with timeout
	 */
	async waitForJobCompletion(correlationId: string, timeoutMs: number = 4500): Promise<InstagramTranslationResult> {
		if (!validateCorrelationId(correlationId)) {
			throw new Error(`Invalid correlation ID: ${correlationId}`);
		}

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.cleanupListener(correlationId);
				const timeoutError = createErrorResult(
					correlationId,
					`Job timeout after ${timeoutMs}ms`,
					InstagramTranslationErrorCodes.TIMEOUT_ERROR,
					timeoutMs,
				);
				resolve(timeoutError);
			}, timeoutMs);

			// Store timeout for cleanup
			this.activeListeners.set(correlationId, timeout);

			// Listen for completion
			const onCompleted = (message: JobCompletedMessage) => {
				if (message.correlationId === correlationId) {
					this.off("job-completed", onCompleted);
					this.off("job-failed", onFailed);
					clearTimeout(timeout);
					this.cleanupListener(correlationId);
					resolve(message.result);
				}
			};

			// Listen for failure
			const onFailed = (message: JobFailedMessage) => {
				if (message.correlationId === correlationId) {
					this.off("job-completed", onCompleted);
					this.off("job-failed", onFailed);
					clearTimeout(timeout);
					this.cleanupListener(correlationId);

					const errorResult = createErrorResult(
						correlationId,
						message.error,
						message.errorCode,
						Date.now() - message.timestamp,
					);
					resolve(errorResult);
				}
			};

			this.on("job-completed", onCompleted);
			this.on("job-failed", onFailed);
		});
	}

	/**
	 * Listen for job progress updates
	 */
	onJobProgress(correlationId: string, callback: (progress: number, stage: string) => void): () => void {
		const listener = (message: JobProgressMessage) => {
			if (message.correlationId === correlationId) {
				callback(message.progress, message.stage);
			}
		};

		this.on("job-progress", listener);

		// Return cleanup function
		return () => {
			this.off("job-progress", listener);
		};
	}

	/**
	 * Listen for worker health updates
	 */
	onWorkerHealth(callback: (workerId: string, status: string, activeJobs: number) => void): () => void {
		const listener = (message: WorkerHealthMessage) => {
			callback(message.workerId, message.status, message.activeJobs);
		};

		this.on("worker-health", listener);

		// Return cleanup function
		return () => {
			this.off("worker-health", listener);
		};
	}

	/**
	 * Cleanup listener timeout
	 */
	private cleanupListener(correlationId: string): void {
		const timeout = this.activeListeners.get(correlationId);
		if (timeout) {
			clearTimeout(timeout);
			this.activeListeners.delete(correlationId);
		}
	}

	/**
	 * Get communication health status
	 */
	async getHealthStatus(): Promise<{
		subscriber: boolean;
		publisher: boolean;
		activeListeners: number;
		channels: string[];
	}> {
		try {
			// Test publisher connection
			await this.publisher.ping();

			return {
				subscriber: this.isSubscribed,
				publisher: true,
				activeListeners: this.activeListeners.size,
				channels: Object.values(CHANNELS),
			};
		} catch (error) {
			return {
				subscriber: this.isSubscribed,
				publisher: false,
				activeListeners: this.activeListeners.size,
				channels: Object.values(CHANNELS),
			};
		}
	}

	/**
	 * Cleanup and close connections
	 */
	async cleanup(): Promise<void> {
		try {
			// Clear all active listeners
			for (const timeout of this.activeListeners.values()) {
				clearTimeout(timeout);
			}
			this.activeListeners.clear();

			// Unsubscribe from channels
			if (this.isSubscribed) {
				await this.subscriber.unsubscribe();
				this.isSubscribed = false;
			}

			// Close connections
			this.subscriber.disconnect();
			this.publisher.disconnect();

			console.log("[Instagram Translation Communication] Cleanup completed");
		} catch (error) {
			console.error("[Instagram Translation Communication] Cleanup error:", error);
		}
	}
}

// Singleton instance
let communicationManager: InstagramTranslationCommunicationManager | null = null;

/**
 * Get singleton communication manager instance
 */
export function getCommunicationManager(): InstagramTranslationCommunicationManager {
	if (!communicationManager) {
		communicationManager = new InstagramTranslationCommunicationManager();
	}
	return communicationManager;
}

/**
 * Cleanup communication manager (for testing or shutdown)
 */
export async function cleanupCommunicationManager(): Promise<void> {
	if (communicationManager) {
		await communicationManager.cleanup();
		communicationManager = null;
	}
}

// Export channels for external use
export { CHANNELS };
