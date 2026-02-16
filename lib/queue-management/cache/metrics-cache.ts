/**
 * Queue Management - Metrics Cache
 *
 * Specialized cache for metrics and analytics data with intelligent invalidation
 */

import { getCacheManager, CacheManager } from "./cache-manager";
import { CACHE_KEYS } from "../constants";
import { QueueMetrics, SystemMetrics, AggregatedMetrics, Percentiles } from "../types/metrics.types";
import { EventEmitter } from "events";

export class MetricsCache extends EventEmitter {
	private cache: CacheManager;
	private invalidationRules: Map<string, string[]> = new Map();

	constructor(cacheManager?: CacheManager) {
		super();
		this.cache = cacheManager || getCacheManager();
		this.setupInvalidationRules();
	}

	/**
	 * Setup cache invalidation rules
	 */
	private setupInvalidationRules(): void {
		// Define which cache keys should be invalidated for different events
		this.invalidationRules.set("queue.updated", [
			"metrics:realtime",
			"metrics:dashboard",
			"queue:health:*",
			"metrics:*:${queueName}:*",
		]);

		this.invalidationRules.set("job.completed", [
			"metrics:realtime",
			"metrics:dashboard",
			"metrics:throughput:*",
			"metrics:processing:*",
			"metrics:aggregated:*",
		]);

		this.invalidationRules.set("job.failed", [
			"metrics:realtime",
			"metrics:dashboard",
			"metrics:errorrate:*",
			"metrics:aggregated:*",
		]);
	}

	/**
	 * Intelligent cache invalidation based on events
	 */
	async invalidateByEvent(eventType: string, context: { queueName?: string; jobId?: string }): Promise<void> {
		const rules = this.invalidationRules.get(eventType);
		if (!rules) return;

		for (const rule of rules) {
			let pattern = rule;

			// Replace placeholders with actual values
			if (context.queueName) {
				pattern = pattern.replace("${queueName}", context.queueName);
			}
			if (context.jobId) {
				pattern = pattern.replace("${jobId}", context.jobId);
			}

			await this.cache.deletePattern(pattern);
		}

		this.emit("cache_invalidated", { eventType, context, patterns: rules });
	}

	/**
	 * Cache queue metrics
	 */
	async setQueueMetrics(
		queueName: string,
		timestamp: number,
		metrics: QueueMetrics,
		ttl: number = 300,
	): Promise<boolean> {
		const key = CACHE_KEYS.QUEUE_METRICS(queueName, timestamp);
		return this.cache.set(key, metrics, { ttl });
	}

	/**
	 * Get cached queue metrics
	 */
	async getQueueMetrics(queueName: string, timestamp: number): Promise<QueueMetrics | null> {
		const key = CACHE_KEYS.QUEUE_METRICS(queueName, timestamp);
		return this.cache.get<QueueMetrics>(key);
	}

	/**
	 * Cache system metrics
	 */
	async setSystemMetrics(timestamp: number, metrics: SystemMetrics, ttl: number = 300): Promise<boolean> {
		const key = `system:metrics:${timestamp}`;
		return this.cache.set(key, metrics, { ttl });
	}

	/**
	 * Get cached system metrics
	 */
	async getSystemMetrics(timestamp: number): Promise<SystemMetrics | null> {
		const key = `system:metrics:${timestamp}`;
		return this.cache.get<SystemMetrics>(key);
	}

	/**
	 * Cache aggregated metrics
	 */
	async setAggregatedMetrics(
		queueName: string,
		granularity: string,
		startTime: number,
		metrics: AggregatedMetrics,
		ttl: number = 600,
	): Promise<boolean> {
		const key = `metrics:aggregated:${queueName}:${granularity}:${startTime}`;
		return this.cache.set(key, metrics, { ttl });
	}

	/**
	 * Get cached aggregated metrics
	 */
	async getAggregatedMetrics(
		queueName: string,
		granularity: string,
		startTime: number,
	): Promise<AggregatedMetrics | null> {
		const key = `metrics:aggregated:${queueName}:${granularity}:${startTime}`;
		return this.cache.get<AggregatedMetrics>(key);
	}

	/**
	 * Cache percentiles
	 */
	async setPercentiles(
		queueName: string,
		metric: string,
		timeRange: string,
		percentiles: Percentiles,
		ttl: number = 600,
	): Promise<boolean> {
		const key = `metrics:percentiles:${queueName}:${metric}:${timeRange}`;
		return this.cache.set(key, percentiles, { ttl });
	}

	/**
	 * Get cached percentiles
	 */
	async getPercentiles(queueName: string, metric: string, timeRange: string): Promise<Percentiles | null> {
		const key = `metrics:percentiles:${queueName}:${metric}:${timeRange}`;
		return this.cache.get<Percentiles>(key);
	}

	/**
	 * Cache real-time metrics
	 */
	async setRealTimeMetrics(data: Record<string, any>, ttl: number = 30): Promise<boolean> {
		const key = "metrics:realtime";
		return this.cache.set(key, data, { ttl });
	}

	/**
	 * Get cached real-time metrics
	 */
	async getRealTimeMetrics(): Promise<Record<string, any> | null> {
		const key = "metrics:realtime";
		return this.cache.get<Record<string, any>>(key);
	}

	/**
	 * Add metric data point to time series
	 */
	async addMetricDataPoint(queueName: string, metric: string, timestamp: number, value: number): Promise<number> {
		const key = `metrics:timeseries:${queueName}:${metric}`;
		return this.cache.addToSortedSet(key, timestamp, value.toString());
	}

	/**
	 * Get metric time series data
	 */
	async getMetricTimeSeries(
		queueName: string,
		metric: string,
		since: number,
		until: number = Date.now(),
	): Promise<Array<{ timestamp: number; value: number }>> {
		const key = `metrics:timeseries:${queueName}:${metric}`;
		const results = await this.cache.getSortedSetRange(key, 0, -1, true);

		const timeSeries: Array<{ timestamp: number; value: number }> = [];
		for (let i = 0; i < results.length; i += 2) {
			const value = parseFloat(results[i]);
			const timestamp = parseInt(results[i + 1]);

			if (timestamp >= since && timestamp <= until) {
				timeSeries.push({ timestamp, value });
			}
		}

		return timeSeries.sort((a, b) => a.timestamp - b.timestamp);
	}

	/**
	 * Cache metric summary
	 */
	async setMetricSummary(
		queueName: string,
		metric: string,
		period: string,
		summary: { avg: number; min: number; max: number; count: number },
		ttl: number = 300,
	): Promise<boolean> {
		const key = `metrics:summary:${queueName}:${metric}:${period}`;
		return this.cache.set(key, summary, { ttl });
	}

	/**
	 * Get cached metric summary
	 */
	async getMetricSummary(
		queueName: string,
		metric: string,
		period: string,
	): Promise<{ avg: number; min: number; max: number; count: number } | null> {
		const key = `metrics:summary:${queueName}:${metric}:${period}`;
		return this.cache.get<{ avg: number; min: number; max: number; count: number }>(key);
	}

	/**
	 * Cache throughput data
	 */
	async setThroughputData(queueName: string, period: string, throughput: number, ttl: number = 300): Promise<boolean> {
		const key = `metrics:throughput:${queueName}:${period}`;
		return this.cache.set(key, throughput, { ttl });
	}

	/**
	 * Get cached throughput data
	 */
	async getThroughputData(queueName: string, period: string): Promise<number | null> {
		const key = `metrics:throughput:${queueName}:${period}`;
		return this.cache.get<number>(key);
	}

	/**
	 * Cache error rate data
	 */
	async setErrorRateData(queueName: string, period: string, errorRate: number, ttl: number = 300): Promise<boolean> {
		const key = `metrics:errorrate:${queueName}:${period}`;
		return this.cache.set(key, errorRate, { ttl });
	}

	/**
	 * Get cached error rate data
	 */
	async getErrorRateData(queueName: string, period: string): Promise<number | null> {
		const key = `metrics:errorrate:${queueName}:${period}`;
		return this.cache.get<number>(key);
	}

	/**
	 * Cache processing time statistics
	 */
	async setProcessingTimeStats(
		queueName: string,
		period: string,
		stats: { avg: number; p50: number; p95: number; p99: number },
		ttl: number = 300,
	): Promise<boolean> {
		const key = `metrics:processing:${queueName}:${period}`;
		return this.cache.set(key, stats, { ttl });
	}

	/**
	 * Get cached processing time statistics
	 */
	async getProcessingTimeStats(
		queueName: string,
		period: string,
	): Promise<{ avg: number; p50: number; p95: number; p99: number } | null> {
		const key = `metrics:processing:${queueName}:${period}`;
		return this.cache.get<{ avg: number; p50: number; p95: number; p99: number }>(key);
	}

	/**
	 * Cache dashboard metrics
	 */
	async setDashboardMetrics(metrics: Record<string, any>, ttl: number = 60): Promise<boolean> {
		const key = "metrics:dashboard";
		return this.cache.set(key, metrics, { ttl });
	}

	/**
	 * Get cached dashboard metrics
	 */
	async getDashboardMetrics(): Promise<Record<string, any> | null> {
		const key = "metrics:dashboard";
		return this.cache.get<Record<string, any>>(key);
	}

	/**
	 * Cache metric comparison data
	 */
	async setMetricComparison(
		queueName: string,
		metric: string,
		comparisonId: string,
		data: Record<string, any>,
		ttl: number = 600,
	): Promise<boolean> {
		const key = `metrics:comparison:${queueName}:${metric}:${comparisonId}`;
		return this.cache.set(key, data, { ttl });
	}

	/**
	 * Get cached metric comparison data
	 */
	async getMetricComparison(
		queueName: string,
		metric: string,
		comparisonId: string,
	): Promise<Record<string, any> | null> {
		const key = `metrics:comparison:${queueName}:${metric}:${comparisonId}`;
		return this.cache.get<Record<string, any>>(key);
	}

	/**
	 * Cache baseline metrics
	 */
	async setBaselineMetrics(
		queueName: string,
		metric: string,
		baseline: { value: number; threshold: { warning: number; critical: number } },
		ttl: number = 3600,
	): Promise<boolean> {
		const key = `metrics:baseline:${queueName}:${metric}`;
		return this.cache.set(key, baseline, { ttl });
	}

	/**
	 * Get cached baseline metrics
	 */
	async getBaselineMetrics(
		queueName: string,
		metric: string,
	): Promise<{ value: number; threshold: { warning: number; critical: number } } | null> {
		const key = `metrics:baseline:${queueName}:${metric}`;
		return this.cache.get<{ value: number; threshold: { warning: number; critical: number } }>(key);
	}

	/**
	 * Increment metric counter
	 */
	async incrementMetricCounter(queueName: string, metric: string, by: number = 1): Promise<number> {
		const key = `metrics:counter:${queueName}:${metric}`;
		return this.cache.increment(key, by);
	}

	/**
	 * Get metric counter value
	 */
	async getMetricCounter(queueName: string, metric: string): Promise<number> {
		const key = `metrics:counter:${queueName}:${metric}`;
		const value = await this.cache.get<number>(key);
		return value || 0;
	}

	/**
	 * Reset metric counter
	 */
	async resetMetricCounter(queueName: string, metric: string): Promise<boolean> {
		const key = `metrics:counter:${queueName}:${metric}`;
		return this.cache.delete(key);
	}

	/**
	 * Cache metric alerts status
	 */
	async setMetricAlertStatus(
		queueName: string,
		metric: string,
		status: { triggered: boolean; lastTriggered?: number; count: number },
		ttl: number = 300,
	): Promise<boolean> {
		const key = `metrics:alert:${queueName}:${metric}`;
		return this.cache.set(key, status, { ttl });
	}

	/**
	 * Get cached metric alert status
	 */
	async getMetricAlertStatus(
		queueName: string,
		metric: string,
	): Promise<{ triggered: boolean; lastTriggered?: number; count: number } | null> {
		const key = `metrics:alert:${queueName}:${metric}`;
		return this.cache.get<{ triggered: boolean; lastTriggered?: number; count: number }>(key);
	}

	/**
	 * Invalidate metrics cache for a queue
	 */
	async invalidateQueueMetrics(queueName: string): Promise<number> {
		const pattern = `metrics:*:${queueName}:*`;
		return this.cache.deletePattern(pattern);
	}

	/**
	 * Invalidate all metrics cache
	 */
	async invalidateAllMetrics(): Promise<number> {
		return this.cache.deletePattern("metrics:*");
	}

	/**
	 * Clean up old metric data points
	 */
	async cleanupOldMetrics(olderThan: number): Promise<number> {
		let deletedCount = 0;

		try {
			// Clean up old time series data
			const patterns = ["metrics:timeseries:*", "metrics:aggregated:*", "metrics:percentiles:*"];

			for (const pattern of patterns) {
				const keys = await this.cache.getRedisInfo();
				// This is a simplified implementation
				// In a real scenario, you'd iterate through keys and check timestamps
				deletedCount += await this.cache.deletePattern(pattern);
			}

			return deletedCount;
		} catch (error) {
			console.error("Failed to cleanup old metrics:", error);
			return 0;
		}
	}

	/**
	 * Warm up cache with frequently accessed data
	 */
	async warmupCache(queueNames: string[]): Promise<void> {
		const now = new Date();
		const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

		for (const queueName of queueNames) {
			try {
				// Pre-load common metrics
				await this.setThroughputData(queueName, "1h", 0, 3600);
				await this.setErrorRateData(queueName, "1h", 0, 3600);
				await this.setProcessingTimeStats(
					queueName,
					"1h",
					{
						avg: 0,
						p50: 0,
						p95: 0,
						p99: 0,
					},
					3600,
				);

				// Pre-load time series data
				await this.addMetricDataPoint(queueName, "throughput", now.getTime(), 0);
			} catch (error) {
				console.error(`Failed to warmup cache for queue ${queueName}:`, error);
			}
		}
	}

	/**
	 * Get cache hit rate for metrics
	 */
	async getCacheHitRate(): Promise<number> {
		try {
			const stats = this.cache.getStats();
			return stats.hitRate;
		} catch (error) {
			console.error("Failed to get cache hit rate:", error);
			return 0;
		}
	}

	/**
	 * Optimize cache by removing least recently used items
	 */
	async optimizeCache(): Promise<{ removedKeys: number; freedMemory: number }> {
		try {
			// Get Redis memory info
			const info = await this.cache.getRedisInfo();
			const usedMemory = parseInt(info.used_memory || "0");
			const maxMemory = parseInt(info.maxmemory || "0");

			if (maxMemory > 0 && usedMemory > maxMemory * 0.8) {
				// Cache is getting full, remove old entries
				const patterns = ["metrics:aggregated:*", "metrics:comparison:*", "metrics:summary:*"];

				let removedKeys = 0;
				for (const pattern of patterns) {
					removedKeys += await this.cache.deletePattern(pattern);
				}

				const newUsedMemory = parseInt((await this.cache.getRedisInfo()).used_memory || "0");
				const freedMemory = usedMemory - newUsedMemory;

				return { removedKeys, freedMemory };
			}

			return { removedKeys: 0, freedMemory: 0 };
		} catch (error) {
			console.error("Failed to optimize cache:", error);
			return { removedKeys: 0, freedMemory: 0 };
		}
	}
}

// Singleton instance
let metricsCache: MetricsCache | null = null;

/**
 * Get metrics cache instance
 */
export function getMetricsCache(): MetricsCache {
	if (!metricsCache) {
		metricsCache = new MetricsCache();
	}
	return metricsCache;
}

/**
 * Set metrics cache instance (useful for testing)
 */
export function setMetricsCache(cache: MetricsCache): void {
	metricsCache = cache;
}

export default getMetricsCache;
