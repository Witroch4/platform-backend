/**
 * TURBO Mode Queue Manager
 * Manages processing queues when resources are constrained
 * Based on requirement 3.6
 */

import { createLogger } from "@/lib/utils/logger";
import type { ExtendedLead } from "../../types";
import type { ThrottlingStrategy } from "./TurboModeResourceMonitor";

const logger = createLogger("TurboModeQueueManager");

export interface QueuedTask {
	id: string;
	leadId: string;
	lead: ExtendedLead;
	type: "pdf_unification" | "image_generation" | "preliminary_analysis";
	priority: "high" | "normal" | "low";
	createdAt: Date;
	scheduledAt?: Date;
	attempts: number;
	maxAttempts: number;
	lastError?: string;
}

export interface QueueStats {
	total: number;
	pending: number;
	processing: number;
	completed: number;
	failed: number;
	averageWaitTime: number;
	averageProcessingTime: number;
}

export interface QueueManagerOptions {
	maxQueueSize?: number;
	defaultPriority?: QueuedTask["priority"];
	maxAttempts?: number;
	retryDelay?: number;
	onTaskComplete?: (task: QueuedTask) => void;
	onTaskFailed?: (task: QueuedTask, error: Error) => void;
	onQueueEmpty?: () => void;
}

export class TurboModeQueueManager {
	private queues: Map<QueuedTask["type"], QueuedTask[]> = new Map();
	private processingTasks: Map<string, QueuedTask> = new Map();
	private completedTasks: QueuedTask[] = [];
	private failedTasks: QueuedTask[] = [];

	private maxQueueSize: number;
	private defaultPriority: QueuedTask["priority"];
	private maxAttempts: number;
	private retryDelay: number;
	private onTaskComplete?: (task: QueuedTask) => void;
	private onTaskFailed?: (task: QueuedTask, error: Error) => void;
	private onQueueEmpty?: () => void;

	private processingTimer: NodeJS.Timeout | null = null;
	private isProcessing: boolean = false;
	private currentThrottling: ThrottlingStrategy | null = null;

	constructor(options: QueueManagerOptions = {}) {
		this.maxQueueSize = options.maxQueueSize || 100;
		this.defaultPriority = options.defaultPriority || "normal";
		this.maxAttempts = options.maxAttempts || 3;
		this.retryDelay = options.retryDelay || 5000;
		this.onTaskComplete = options.onTaskComplete;
		this.onTaskFailed = options.onTaskFailed;
		this.onQueueEmpty = options.onQueueEmpty;

		// Initialize queues
		this.queues.set("pdf_unification", []);
		this.queues.set("image_generation", []);
		this.queues.set("preliminary_analysis", []);

		logger.info("TURBO Mode Queue Manager initialized", {
			maxQueueSize: this.maxQueueSize,
			defaultPriority: this.defaultPriority,
			maxAttempts: this.maxAttempts,
		});
	}

	/**
	 * Add task to queue
	 */
	public addTask(
		lead: ExtendedLead,
		type: QueuedTask["type"],
		priority: QueuedTask["priority"] = this.defaultPriority,
	): string {
		const taskId = `${type}_${lead.id}_${Date.now()}`;

		const task: QueuedTask = {
			id: taskId,
			leadId: lead.id,
			lead,
			type,
			priority,
			createdAt: new Date(),
			attempts: 0,
			maxAttempts: this.maxAttempts,
		};

		const queue = this.queues.get(type);
		if (!queue) {
			throw new Error(`Unknown task type: ${type}`);
		}

		// Check queue size limit
		if (queue.length >= this.maxQueueSize) {
			logger.warn("Queue size limit reached", {
				type,
				currentSize: queue.length,
				maxSize: this.maxQueueSize,
			});

			// Remove oldest low priority task to make room
			const lowPriorityIndex = queue.findIndex((t) => t.priority === "low");
			if (lowPriorityIndex !== -1) {
				const removedTask = queue.splice(lowPriorityIndex, 1)[0];
				logger.info("Removed low priority task to make room", {
					removedTaskId: removedTask.id,
					newTaskId: taskId,
				});
			} else {
				throw new Error(`Queue is full: ${type} (${queue.length}/${this.maxQueueSize})`);
			}
		}

		// Insert task based on priority
		this.insertTaskByPriority(queue, task);

		logger.debug("Task added to queue", {
			taskId,
			leadId: lead.id,
			type,
			priority,
			queueSize: queue.length,
		});

		// Start processing if not already running
		if (!this.isProcessing) {
			this.startProcessing();
		}

		return taskId;
	}

	/**
	 * Insert task into queue based on priority
	 */
	private insertTaskByPriority(queue: QueuedTask[], task: QueuedTask): void {
		const priorityOrder = { high: 0, normal: 1, low: 2 };

		let insertIndex = queue.length;
		for (let i = 0; i < queue.length; i++) {
			if (priorityOrder[task.priority] < priorityOrder[queue[i].priority]) {
				insertIndex = i;
				break;
			}
		}

		queue.splice(insertIndex, 0, task);
	}

	/**
	 * Remove task from queue
	 */
	public removeTask(taskId: string): boolean {
		for (const [type, queue] of this.queues) {
			const index = queue.findIndex((task) => task.id === taskId);
			if (index !== -1) {
				queue.splice(index, 1);
				logger.debug("Task removed from queue", { taskId, type });
				return true;
			}
		}

		// Check if it's currently processing
		if (this.processingTasks.has(taskId)) {
			logger.warn("Cannot remove task that is currently processing", { taskId });
			return false;
		}

		return false;
	}

	/**
	 * Update throttling strategy
	 */
	public updateThrottling(throttling: ThrottlingStrategy): void {
		this.currentThrottling = throttling;

		logger.info("Queue throttling updated", {
			level: throttling.level,
			maxParallelProcesses: throttling.maxParallelProcesses,
			delayBetweenBatches: throttling.delayBetweenBatches,
		});

		// Adjust processing based on new throttling
		if (throttling.pauseProcessing && this.isProcessing) {
			this.pauseProcessing();
		} else if (!throttling.pauseProcessing && !this.isProcessing) {
			this.resumeProcessing();
		}
	}

	/**
	 * Start queue processing
	 */
	public startProcessing(): void {
		if (this.isProcessing) {
			return;
		}

		this.isProcessing = true;
		logger.info("Starting queue processing");

		this.scheduleNextProcessing();
	}

	/**
	 * Stop queue processing
	 */
	public stopProcessing(): void {
		if (!this.isProcessing) {
			return;
		}

		this.isProcessing = false;
		logger.info("Stopping queue processing");

		if (this.processingTimer) {
			clearTimeout(this.processingTimer);
			this.processingTimer = null;
		}
	}

	/**
	 * Pause processing (due to resource constraints)
	 */
	public pauseProcessing(): void {
		logger.info("Pausing queue processing due to resource constraints");
		this.stopProcessing();
	}

	/**
	 * Resume processing
	 */
	public resumeProcessing(): void {
		logger.info("Resuming queue processing");
		this.startProcessing();
	}

	/**
	 * Schedule next processing cycle
	 */
	private scheduleNextProcessing(): void {
		if (!this.isProcessing) {
			return;
		}

		const delay = this.currentThrottling?.delayBetweenBatches || 1000;

		this.processingTimer = setTimeout(() => {
			this.processNextTasks();
		}, delay);
	}

	/**
	 * Process next batch of tasks
	 */
	private async processNextTasks(): Promise<void> {
		if (!this.isProcessing) {
			return;
		}

		try {
			// Check if we should pause due to throttling
			if (this.currentThrottling?.pauseProcessing) {
				logger.info("Processing paused due to throttling");
				return;
			}

			// Determine how many tasks we can process in parallel
			const maxParallel = this.currentThrottling?.maxParallelProcesses || 5;
			const currentProcessing = this.processingTasks.size;
			const availableSlots = Math.max(0, maxParallel - currentProcessing);

			if (availableSlots === 0) {
				logger.debug("No available processing slots", {
					currentProcessing,
					maxParallel,
				});
				this.scheduleNextProcessing();
				return;
			}

			// Get next tasks to process
			const tasksToProcess = this.getNextTasks(availableSlots);

			if (tasksToProcess.length === 0) {
				// No tasks to process, check if queues are empty
				if (this.areAllQueuesEmpty() && this.processingTasks.size === 0) {
					logger.info("All queues are empty");
					if (this.onQueueEmpty) {
						this.onQueueEmpty();
					}
				}
				this.scheduleNextProcessing();
				return;
			}

			// Process tasks
			logger.debug("Processing next batch of tasks", {
				taskCount: tasksToProcess.length,
				availableSlots,
				currentProcessing,
			});

			for (const task of tasksToProcess) {
				this.processTask(task);
			}
		} catch (error) {
			logger.error("Error in processing cycle", { error });
		}

		// Schedule next processing cycle
		this.scheduleNextProcessing();
	}

	/**
	 * Get next tasks to process based on priority and throttling
	 */
	private getNextTasks(maxTasks: number): QueuedTask[] {
		const tasks: QueuedTask[] = [];
		const now = new Date();

		// Process queues in priority order
		const queueTypes: QueuedTask["type"][] = ["pdf_unification", "preliminary_analysis", "image_generation"];

		for (const type of queueTypes) {
			if (tasks.length >= maxTasks) {
				break;
			}

			const queue = this.queues.get(type);
			if (!queue || queue.length === 0) {
				continue;
			}

			// Find tasks that are ready to process
			for (const task of queue) {
				if (tasks.length >= maxTasks) {
					break;
				}

				// Check if task is scheduled for later
				if (task.scheduledAt && task.scheduledAt > now) {
					continue;
				}

				// Remove from queue and add to processing
				const index = queue.indexOf(task);
				queue.splice(index, 1);
				tasks.push(task);
			}
		}

		return tasks;
	}

	/**
	 * Process a single task
	 */
	private async processTask(task: QueuedTask): Promise<void> {
		const startTime = Date.now();

		// Mark as processing
		this.processingTasks.set(task.id, task);
		task.attempts++;

		logger.debug("Starting task processing", {
			taskId: task.id,
			leadId: task.leadId,
			type: task.type,
			attempt: task.attempts,
		});

		try {
			// Simulate task processing (replace with actual implementation)
			await this.executeTask(task);

			const processingTime = Date.now() - startTime;

			// Mark as completed
			this.processingTasks.delete(task.id);
			this.completedTasks.push(task);

			logger.info("Task completed successfully", {
				taskId: task.id,
				leadId: task.leadId,
				type: task.type,
				processingTime,
				attempts: task.attempts,
			});

			if (this.onTaskComplete) {
				this.onTaskComplete(task);
			}
		} catch (error) {
			const processingTime = Date.now() - startTime;

			logger.error("Task processing failed", {
				taskId: task.id,
				leadId: task.leadId,
				type: task.type,
				attempt: task.attempts,
				maxAttempts: task.maxAttempts,
				processingTime,
				error: error instanceof Error ? error.message : "Unknown error",
			});

			// Handle task failure
			await this.handleTaskFailure(task, error instanceof Error ? error : new Error("Unknown error"));
		}
	}

	/**
	 * Execute the actual task (to be implemented by specific processors)
	 */
	private async executeTask(task: QueuedTask): Promise<void> {
		// This is a placeholder - in the real implementation, this would call
		// the appropriate processor based on task type

		switch (task.type) {
			case "pdf_unification":
				await this.simulateProcessing(2000, 5000); // 2-5 seconds
				break;
			case "image_generation":
				await this.simulateProcessing(3000, 8000); // 3-8 seconds
				break;
			case "preliminary_analysis":
				await this.simulateProcessing(1000, 3000); // 1-3 seconds
				break;
			default:
				throw new Error(`Unknown task type: ${task.type}`);
		}
	}

	/**
	 * Simulate processing time (for testing)
	 */
	private async simulateProcessing(minMs: number, maxMs: number): Promise<void> {
		const delay = Math.random() * (maxMs - minMs) + minMs;
		return new Promise((resolve) => setTimeout(resolve, delay));
	}

	/**
	 * Handle task failure
	 */
	private async handleTaskFailure(task: QueuedTask, error: Error): Promise<void> {
		this.processingTasks.delete(task.id);
		task.lastError = error.message;

		// Check if we should retry
		if (task.attempts < task.maxAttempts) {
			// Schedule for retry
			task.scheduledAt = new Date(Date.now() + this.retryDelay);

			// Add back to queue
			const queue = this.queues.get(task.type);
			if (queue) {
				this.insertTaskByPriority(queue, task);

				logger.info("Task scheduled for retry", {
					taskId: task.id,
					attempt: task.attempts,
					maxAttempts: task.maxAttempts,
					scheduledAt: task.scheduledAt,
				});
			}
		} else {
			// Max attempts reached, mark as failed
			this.failedTasks.push(task);

			logger.error("Task failed permanently", {
				taskId: task.id,
				leadId: task.leadId,
				type: task.type,
				attempts: task.attempts,
				lastError: task.lastError,
			});

			if (this.onTaskFailed) {
				this.onTaskFailed(task, error);
			}
		}
	}

	/**
	 * Check if all queues are empty
	 */
	private areAllQueuesEmpty(): boolean {
		for (const queue of this.queues.values()) {
			if (queue.length > 0) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Get queue statistics
	 */
	public getStats(): QueueStats {
		const total = this.getTotalTaskCount();
		const pending = this.getPendingTaskCount();
		const processing = this.processingTasks.size;
		const completed = this.completedTasks.length;
		const failed = this.failedTasks.length;

		// Calculate average times
		const completedWithTimes = this.completedTasks.filter((t) => t.createdAt);
		const averageWaitTime =
			completedWithTimes.length > 0
				? completedWithTimes.reduce((sum, task) => {
						// This would need actual processing start time to be accurate
						return sum + 1000; // Placeholder
					}, 0) / completedWithTimes.length
				: 0;

		const averageProcessingTime =
			completedWithTimes.length > 0
				? 3000 // Placeholder - would need actual processing times
				: 0;

		return {
			total,
			pending,
			processing,
			completed,
			failed,
			averageWaitTime,
			averageProcessingTime,
		};
	}

	/**
	 * Get total task count across all queues
	 */
	private getTotalTaskCount(): number {
		let total = 0;
		for (const queue of this.queues.values()) {
			total += queue.length;
		}
		return total + this.processingTasks.size + this.completedTasks.length + this.failedTasks.length;
	}

	/**
	 * Get pending task count
	 */
	private getPendingTaskCount(): number {
		let pending = 0;
		for (const queue of this.queues.values()) {
			pending += queue.length;
		}
		return pending;
	}

	/**
	 * Get queue status for a specific type
	 */
	public getQueueStatus(type: QueuedTask["type"]): {
		pending: number;
		processing: number;
		nextTask?: QueuedTask;
	} {
		const queue = this.queues.get(type) || [];
		const processing = Array.from(this.processingTasks.values()).filter((t) => t.type === type).length;

		return {
			pending: queue.length,
			processing,
			nextTask: queue[0],
		};
	}

	/**
	 * Clear all queues
	 */
	public clearAllQueues(): void {
		logger.info("Clearing all queues");

		for (const queue of this.queues.values()) {
			queue.length = 0;
		}

		this.completedTasks.length = 0;
		this.failedTasks.length = 0;
	}

	/**
	 * Get task by ID
	 */
	public getTask(taskId: string): QueuedTask | null {
		// Check processing tasks
		if (this.processingTasks.has(taskId)) {
			return this.processingTasks.get(taskId)!;
		}

		// Check queues
		for (const queue of this.queues.values()) {
			const task = queue.find((t) => t.id === taskId);
			if (task) {
				return task;
			}
		}

		// Check completed tasks
		const completedTask = this.completedTasks.find((t) => t.id === taskId);
		if (completedTask) {
			return completedTask;
		}

		// Check failed tasks
		const failedTask = this.failedTasks.find((t) => t.id === taskId);
		if (failedTask) {
			return failedTask;
		}

		return null;
	}

	/**
	 * Get all tasks for a specific lead
	 */
	public getTasksForLead(leadId: string): QueuedTask[] {
		const tasks: QueuedTask[] = [];

		// Check all queues
		for (const queue of this.queues.values()) {
			tasks.push(...queue.filter((t) => t.leadId === leadId));
		}

		// Check processing tasks
		for (const task of this.processingTasks.values()) {
			if (task.leadId === leadId) {
				tasks.push(task);
			}
		}

		// Check completed and failed tasks
		tasks.push(...this.completedTasks.filter((t) => t.leadId === leadId));
		tasks.push(...this.failedTasks.filter((t) => t.leadId === leadId));

		return tasks;
	}
}
