/**
 * Queue Management - Cache Invalidation System
 *
 * Intelligent cache invalidation based on events and data changes
 */

import { getCacheManager } from "./cache-manager";
import { getQueueCache } from "./queue-cache";
import { getMetricsCache } from "./metrics-cache";
import { getUserCache } from "./user-cache";
import { EventType } from "../constants";

export interface InvalidationRule {
	eventType: EventType;
	patterns: string[];
	delay?: number; // milliseconds to delay invalidation
}

export class CacheInvalidationManager {
	private cacheManager = getCacheManager();
	private queueCache = getQueueCache();
	private metricsCache = getMetricsCache();
	private userCache = getUserCache();

	private invalidationRules: InvalidationRule[] = [
		// Queue events
		{
			eventType: "QUEUE_CREATED" as EventType,
			patterns: ["queue:list", "queue:active"],
		},
		{
			eventType: "QUEUE_UPDATED" as EventType,
			patterns: ["queue:config:*", "queue:health:*"],
		},
		{
			eventType: "QUEUE_DELETED" as EventType,
			patterns: ["queue:*", "metrics:*"],
		},
		{
			eventType: "QUEUE_PAUSED" as EventType,
			patterns: ["queue:health:*", "queue:paused:*"],
		},
		{
			eventType: "QUEUE_RESUMED" as EventType,
			patterns: ["queue:health:*", "queue:paused:*"],
		},

		// Job events
		{
			eventType: "JOB_CREATED" as EventType,
			patterns: ["queue:health:*", "queue:stats:*", "metrics:*"],
		},
		{
			eventType: "JOB_STARTED" as EventType,
			patterns: ["queue:health:*", "queue:stats:*", "metrics:realtime"],
		},
		{
			eventType: "JOB_COMPLETED" as EventType,
			patterns: ["queue:health:*", "queue:stats:*", "metrics:*"],
		},
		{
			eventType: "JOB_FAILED" as EventType,
			patterns: ["queue:health:*", "queue:stats:*", "queue:error:*", "metrics:*"],
		},
		{
			eventType: "JOB_RETRIED" as EventType,
			patterns: ["queue:health:*", "queue:stats:*", "metrics:*"],
		},

		// Alert events
		{
			eventType: "ALERT_TRIGGERED" as EventType,
			patterns: ["alerts:active", "metrics:alert:*"],
		},
		{
			eventType: "ALERT_ACKNOWLEDGED" as EventType,
			patterns: ["alerts:active"],
		},
		{
			eventType: "ALERT_RESOLVED" as EventType,
			patterns: ["alerts:active", "metrics:alert:*"],
		},

		// User events
		{
			eventType: "USER_LOGIN" as EventType,
			patterns: ["users:active"],
		},
		{
			eventType: "USER_LOGOUT" as EventType,
			patterns: ["users:active", "user:session:*"],
		},
		{
			eventType: "USER_ACTION" as EventType,
			patterns: ["user:activity:*"],
		},
	];

	/**
	 * Handle cache invalidation for an event
	 */
	async handleEvent(
		eventType: EventType,
		context: { queueName?: string; userId?: string; [key: string]: any },
	): Promise<void> {
		const rules = this.invalidationRules.filter((rule) => rule.eventType === eventType);

		for (const rule of rules) {
			if (rule.delay) {
				// Delayed invalidation
				setTimeout(() => {
					this.invalidatePatterns(rule.patterns, context);
				}, rule.delay);
			} else {
				// Immediate invalidation
				await this.invalidatePatterns(rule.patterns, context);
			}
		}
	}

	/**
	 * Invalidate cache patterns with context substitution
	 */
	private async invalidatePatterns(patterns: string[], context: Record<string, any>): Promise<void> {
		for (const pattern of patterns) {
			let resolvedPattern = pattern;

			// Substitute context variables
			if (context.queueName && pattern.includes("*")) {
				resolvedPattern = pattern.replace("*", context.queueName);
			}
			if (context.userId && pattern.includes("*")) {
				resolvedPattern = pattern.replace("*", context.userId);
			}

			// If pattern still contains wildcards, use pattern deletion
			if (resolvedPattern.includes("*")) {
				await this.cacheManager.deletePattern(resolvedPattern);
			} else {
				await this.cacheManager.delete(resolvedPattern);
			}
		}
	}

	/**
	 * Invalidate queue-related cache
	 */
	async invalidateQueue(queueName: string): Promise<void> {
		await Promise.all([
			this.queueCache.invalidateQueue(queueName),
			this.metricsCache.invalidateQueueMetrics(queueName),
		]);
	}

	/**
	 * Invalidate user-related cache
	 */
	async invalidateUser(userId: string): Promise<void> {
		await this.userCache.invalidateUser(userId);
	}

	/**
	 * Invalidate metrics cache
	 */
	async invalidateMetrics(queueName?: string): Promise<void> {
		if (queueName) {
			await this.metricsCache.invalidateQueueMetrics(queueName);
		} else {
			await this.metricsCache.invalidateAllMetrics();
		}
	}

	/**
	 * Smart invalidation based on data changes
	 */
	async smartInvalidate(
		changeType: "queue" | "job" | "user" | "alert" | "metric",
		identifier: string,
		operation: "create" | "update" | "delete",
	): Promise<void> {
		switch (changeType) {
			case "queue":
				await this.invalidateQueueData(identifier, operation);
				break;
			case "job":
				await this.invalidateJobData(identifier, operation);
				break;
			case "user":
				await this.invalidateUserData(identifier, operation);
				break;
			case "alert":
				await this.invalidateAlertData(identifier, operation);
				break;
			case "metric":
				await this.invalidateMetricData(identifier, operation);
				break;
		}
	}

	/**
	 * Invalidate queue data based on operation
	 */
	private async invalidateQueueData(queueName: string, operation: "create" | "update" | "delete"): Promise<void> {
		switch (operation) {
			case "create":
				await this.cacheManager.delete("queue:list");
				await this.queueCache.addActiveQueue(queueName);
				break;
			case "update":
				await this.queueCache.invalidateQueueConfig(queueName);
				await this.queueCache.invalidateQueueHealth(queueName);
				break;
			case "delete":
				await this.invalidateQueue(queueName);
				await this.queueCache.removeActiveQueue(queueName);
				await this.cacheManager.delete("queue:list");
				break;
		}
	}

	/**
	 * Invalidate job data based on operation
	 */
	private async invalidateJobData(jobId: string, operation: "create" | "update" | "delete"): Promise<void> {
		// Extract queue name from job ID if possible
		// This is a simplified implementation - in practice, you'd need the queue name
		await this.cacheManager.deletePattern("queue:health:*");
		await this.cacheManager.deletePattern("queue:stats:*");
		await this.cacheManager.deletePattern("metrics:realtime*");
	}

	/**
	 * Invalidate user data based on operation
	 */
	private async invalidateUserData(userId: string, operation: "create" | "update" | "delete"): Promise<void> {
		switch (operation) {
			case "create":
				await this.userCache.addActiveUser(userId);
				break;
			case "update":
				await this.userCache.invalidateUserPermissions(userId);
				await this.userCache.invalidateUserSession(userId);
				break;
			case "delete":
				await this.userCache.invalidateUser(userId);
				await this.userCache.removeActiveUser(userId);
				break;
		}
	}

	/**
	 * Invalidate alert data based on operation
	 */
	private async invalidateAlertData(alertId: string, operation: "create" | "update" | "delete"): Promise<void> {
		await this.cacheManager.delete("alerts:active");
		await this.cacheManager.deletePattern("metrics:alert:*");
	}

	/**
	 * Invalidate metric data based on operation
	 */
	private async invalidateMetricData(metricKey: string, operation: "create" | "update" | "delete"): Promise<void> {
		await this.cacheManager.deletePattern(`metrics:*${metricKey}*`);
		await this.cacheManager.delete("metrics:dashboard");
		await this.cacheManager.delete("metrics:realtime");
	}

	/**
	 * Bulk invalidation for multiple items
	 */
	async bulkInvalidate(items: Array<{ type: string; identifier: string; operation: string }>): Promise<void> {
		const promises = items.map((item) =>
			this.smartInvalidate(
				item.type as "queue" | "job" | "user" | "alert" | "metric",
				item.identifier,
				item.operation as "create" | "update" | "delete",
			),
		);

		await Promise.all(promises);
	}

	/**
	 * Schedule periodic cache cleanup
	 */
	scheduleCleanup(intervalMs: number = 3600000): NodeJS.Timeout {
		// Default 1 hour
		return setInterval(async () => {
			await this.performCleanup();
		}, intervalMs);
	}

	/**
	 * Perform cache cleanup
	 */
	async performCleanup(): Promise<void> {
		try {
			// Clean up expired keys (Redis handles this automatically, but we can do additional cleanup)
			const info = await this.cacheManager.getRedisInfo();
			const expiredKeys = parseInt(info.expired_keys || "0");

			if (expiredKeys > 1000) {
				console.log(`Cache cleanup: ${expiredKeys} keys expired`);
			}

			// Clean up old metric data points
			await this.metricsCache.cleanupOldMetrics(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
		} catch (error) {
			console.error("Cache cleanup error:", error);
		}
	}

	/**
	 * Add custom invalidation rule
	 */
	addInvalidationRule(rule: InvalidationRule): void {
		this.invalidationRules.push(rule);
	}

	/**
	 * Remove invalidation rule
	 */
	removeInvalidationRule(eventType: EventType): void {
		this.invalidationRules = this.invalidationRules.filter((rule) => rule.eventType !== eventType);
	}

	/**
	 * Get current invalidation rules
	 */
	getInvalidationRules(): InvalidationRule[] {
		return [...this.invalidationRules];
	}
}

// Singleton instance
let cacheInvalidationManager: CacheInvalidationManager | null = null;

/**
 * Get cache invalidation manager instance
 */
export function getCacheInvalidationManager(): CacheInvalidationManager {
	if (!cacheInvalidationManager) {
		cacheInvalidationManager = new CacheInvalidationManager();
	}
	return cacheInvalidationManager;
}

/**
 * Set cache invalidation manager instance (useful for testing)
 */
export function setCacheInvalidationManager(manager: CacheInvalidationManager): void {
	cacheInvalidationManager = manager;
}

export default getCacheInvalidationManager;
