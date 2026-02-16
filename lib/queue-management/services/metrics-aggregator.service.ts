/**
 * Metrics Aggregator Service
 *
 * Handles temporal aggregation of metrics data including percentile calculations,
 * moving averages, trend analysis, and pre-aggregation for fast queries.
 */

import { getPrismaInstance, getRedisInstance } from "../../connections";
import type { PrismaClient } from "@prisma/client";
import { EventEmitter } from "events";
import { AggregatedMetrics, TimeRange, Percentiles, MetricFilters } from "../types/metrics.types";
import { getQueueManagementConfig } from "../config";
import { QueueManagementError } from "../errors";
import { TIME_GRANULARITIES } from "../constants";

interface AggregationConfig {
	intervals: string[];
	retentionPeriods: Record<string, number>; // days
	batchSize: number;
	parallelWorkers: number;
}

interface TimeSeriesData {
	timestamp: Date;
	value: number;
	labels?: Record<string, string>;
}

interface MovingAverageConfig {
	windowSize: number;
	type: "simple" | "exponential" | "weighted";
}

interface TrendData {
	slope: number;
	intercept: number;
	correlation: number;
	direction: "increasing" | "decreasing" | "stable";
	confidence: number;
}

export class MetricsAggregatorService extends EventEmitter {
	private static instance: MetricsAggregatorService | null = null;
	private prisma: PrismaClient;
	private redis: ReturnType<typeof getRedisInstance>;
	private config: AggregationConfig;
	private aggregationScheduler: NodeJS.Timeout | null = null;
	private isAggregating = false;

	constructor(prisma: PrismaClient, redis?: ReturnType<typeof getRedisInstance>) {
		super();
		this.prisma = prisma;
		this.redis = redis || getRedisInstance();

		const queueConfig = getQueueManagementConfig();
		this.config = {
			intervals: queueConfig.metrics.aggregationIntervals,
			retentionPeriods: {
				"1m": 7, // 1 week
				"5m": 30, // 1 month
				"1h": 90, // 3 months
				"1d": 365, // 1 year
			},
			batchSize: queueConfig.metrics.batchSize,
			parallelWorkers: 4,
		};

		this.startAggregationScheduler();
	}

	/**
	 * Get singleton instance
	 */
	static getInstance(prisma?: PrismaClient, redis?: ReturnType<typeof getRedisInstance>): MetricsAggregatorService {
		if (!MetricsAggregatorService.instance) {
			if (!prisma) {
				throw new QueueManagementError("Prisma instance required for first initialization", "INITIALIZATION_ERROR");
			}
			MetricsAggregatorService.instance = new MetricsAggregatorService(prisma, redis);
		}
		return MetricsAggregatorService.instance;
	}

	/**
	 * Aggregate metrics by time intervals (minute, hour, day)
	 */
	async aggregateByInterval(queueName: string, timeRange: TimeRange, granularity: string): Promise<AggregatedMetrics> {
		try {
			// Check cache first
			const cacheKey = this.buildCacheKey("interval", queueName, timeRange, granularity);
			const cached = await this.getCachedAggregation(cacheKey);
			if (cached) {
				return cached;
			}

			// Get raw metrics data
			const rawData = await this.getRawMetricsData(queueName, timeRange);

			// Group data by time intervals
			const groupedData = this.groupByTimeInterval(rawData, granularity);

			// Calculate aggregations for each interval
			const aggregatedData = await Promise.all(
				groupedData.map(async (group) => ({
					timestamp: group.timestamp,
					throughput: this.calculateAverage(group.data.map((d) => d.throughputPerMinute || 0)),
					avgProcessingTime: this.calculateAverage(group.data.map((d) => d.avgProcessingTime || 0)),
					successRate: this.calculateAverage(group.data.map((d) => d.successRate || 0)),
					errorRate: this.calculateAverage(group.data.map((d) => d.errorRate || 0)),
					queueSize: this.calculateAverage(
						group.data.map((d) => (d.waitingCount || 0) + (d.activeCount || 0) + (d.delayedCount || 0)),
					),
				})),
			);

			const result: AggregatedMetrics = {
				queueName,
				timeRange,
				granularity: granularity as any,
				data: aggregatedData,
			};

			// Cache the result
			await this.cacheAggregation(cacheKey, result, this.getCacheTTL(granularity));

			return result;
		} catch (error) {
			throw new QueueManagementError(
				`Failed to aggregate metrics by interval: ${error instanceof Error ? error.message : "Unknown error"}`,
				"AGGREGATION_ERROR",
			);
		}
	}

	/**
	 * Calculate percentiles (P50, P95, P99) for latency metrics
	 */
	async calculatePercentiles(queueName: string, metric: string, timeRange: TimeRange): Promise<Percentiles> {
		try {
			// Get processing time data
			const processingTimes = await this.getProcessingTimeData(queueName, timeRange);

			if (processingTimes.length === 0) {
				return { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0, max: 0 };
			}

			// Sort values for percentile calculation
			const sortedValues = processingTimes.sort((a, b) => a - b);

			const percentiles: Percentiles = {
				p50: this.getPercentile(sortedValues, 0.5),
				p75: this.getPercentile(sortedValues, 0.75),
				p90: this.getPercentile(sortedValues, 0.9),
				p95: this.getPercentile(sortedValues, 0.95),
				p99: this.getPercentile(sortedValues, 0.99),
				max: sortedValues[sortedValues.length - 1],
			};

			// Cache percentiles
			const cacheKey = this.buildCacheKey("percentiles", queueName, timeRange, metric);
			await this.cacheAggregation(cacheKey, percentiles, 300); // 5 minutes TTL

			return percentiles;
		} catch (error) {
			throw new QueueManagementError(
				`Failed to calculate percentiles: ${error instanceof Error ? error.message : "Unknown error"}`,
				"PERCENTILE_ERROR",
			);
		}
	}

	/**
	 * Calculate moving averages for trend analysis
	 */
	async calculateMovingAverage(
		queueName: string,
		metric: string,
		timeRange: TimeRange,
		config: MovingAverageConfig,
	): Promise<TimeSeriesData[]> {
		try {
			// Get time series data
			const timeSeriesData = await this.getTimeSeriesData(queueName, metric, timeRange);

			if (timeSeriesData.length < config.windowSize) {
				return timeSeriesData; // Not enough data for moving average
			}

			const movingAverages: TimeSeriesData[] = [];

			for (let i = config.windowSize - 1; i < timeSeriesData.length; i++) {
				const window = timeSeriesData.slice(i - config.windowSize + 1, i + 1);
				let average: number;

				switch (config.type) {
					case "simple":
						average = this.calculateSimpleMovingAverage(window);
						break;
					case "exponential":
						average = this.calculateExponentialMovingAverage(window);
						break;
					case "weighted":
						average = this.calculateWeightedMovingAverage(window);
						break;
					default:
						average = this.calculateSimpleMovingAverage(window);
				}

				movingAverages.push({
					timestamp: timeSeriesData[i].timestamp,
					value: average,
					labels: { type: "moving_average", window: config.windowSize.toString() },
				});
			}

			return movingAverages;
		} catch (error) {
			throw new QueueManagementError(
				`Failed to calculate moving average: ${error instanceof Error ? error.message : "Unknown error"}`,
				"MOVING_AVERAGE_ERROR",
			);
		}
	}

	/**
	 * Calculate trend analysis with linear regression
	 */
	async calculateTrend(queueName: string, metric: string, timeRange: TimeRange): Promise<TrendData> {
		try {
			// Get time series data
			const timeSeriesData = await this.getTimeSeriesData(queueName, metric, timeRange);

			if (timeSeriesData.length < 2) {
				return {
					slope: 0,
					intercept: 0,
					correlation: 0,
					direction: "stable",
					confidence: 0,
				};
			}

			// Convert timestamps to numeric values (hours since start)
			const startTime = timeSeriesData[0].timestamp.getTime();
			const dataPoints = timeSeriesData.map((point, index) => ({
				x: (point.timestamp.getTime() - startTime) / (1000 * 60 * 60), // hours
				y: point.value,
			}));

			// Calculate linear regression
			const regression = this.calculateLinearRegression(dataPoints);

			// Determine trend direction
			let direction: "increasing" | "decreasing" | "stable";
			if (Math.abs(regression.slope) < 0.01) {
				direction = "stable";
			} else if (regression.slope > 0) {
				direction = "increasing";
			} else {
				direction = "decreasing";
			}

			// Calculate confidence based on correlation coefficient
			const confidence = Math.abs(regression.correlation);

			const trendData: TrendData = {
				slope: regression.slope,
				intercept: regression.intercept,
				correlation: regression.correlation,
				direction,
				confidence,
			};

			// Cache trend data
			const cacheKey = this.buildCacheKey("trend", queueName, timeRange, metric);
			await this.cacheAggregation(cacheKey, trendData, 600); // 10 minutes TTL

			return trendData;
		} catch (error) {
			throw new QueueManagementError(
				`Failed to calculate trend: ${error instanceof Error ? error.message : "Unknown error"}`,
				"TREND_ERROR",
			);
		}
	}

	/**
	 * Pre-aggregate data for faster queries
	 */
	async preAggregateData(): Promise<void> {
		if (this.isAggregating) {
			return; // Already running
		}

		this.isAggregating = true;

		try {
			const now = new Date();

			// Pre-aggregate for each configured interval
			for (const interval of this.config.intervals) {
				await this.preAggregateInterval(interval, now);
			}

			this.emit("pre_aggregation_completed", { timestamp: now });
		} catch (error) {
			this.emit("pre_aggregation_error", error);
			throw new QueueManagementError(
				`Failed to pre-aggregate data: ${error instanceof Error ? error.message : "Unknown error"}`,
				"PRE_AGGREGATION_ERROR",
			);
		} finally {
			this.isAggregating = false;
		}
	}

	/**
	 * Get aggregated data with automatic fallback to real-time calculation
	 */
	async getAggregatedData(queueName: string, timeRange: TimeRange, granularity: string): Promise<AggregatedMetrics> {
		try {
			// Try to get pre-aggregated data first
			const preAggregated = await this.getPreAggregatedData(queueName, timeRange, granularity);
			if (preAggregated) {
				return preAggregated;
			}

			// Fallback to real-time aggregation
			return await this.aggregateByInterval(queueName, timeRange, granularity);
		} catch (error) {
			throw new QueueManagementError(
				`Failed to get aggregated data: ${error instanceof Error ? error.message : "Unknown error"}`,
				"AGGREGATED_DATA_ERROR",
			);
		}
	}

	/**
	 * Clean up old aggregated data based on retention policies
	 */
	async cleanupOldAggregations(): Promise<{ deletedRecords: number }> {
		try {
			let totalDeleted = 0;

			for (const [interval, retentionDays] of Object.entries(this.config.retentionPeriods)) {
				const cutoffDate = new Date();
				cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

				// Delete old pre-aggregated data
				const deleted = await this.deleteOldPreAggregations(interval, cutoffDate);
				totalDeleted += deleted;

				// Clean up cache entries
				await this.cleanupCacheEntries(interval, cutoffDate);
			}

			return { deletedRecords: totalDeleted };
		} catch (error) {
			throw new QueueManagementError(
				`Failed to cleanup old aggregations: ${error instanceof Error ? error.message : "Unknown error"}`,
				"CLEANUP_ERROR",
			);
		}
	}

	// Private helper methods

	private startAggregationScheduler(): void {
		// Run pre-aggregation every 5 minutes
		this.aggregationScheduler = setInterval(
			async () => {
				try {
					await this.preAggregateData();
				} catch (error) {
					console.error("Scheduled pre-aggregation failed:", error);
				}
			},
			5 * 60 * 1000,
		); // 5 minutes
	}

	private async getRawMetricsData(queueName: string, timeRange: TimeRange): Promise<any[]> {
		return await this.prisma.queueMetrics.findMany({
			where: {
				queueName,
				timestamp: {
					gte: timeRange.start,
					lte: timeRange.end,
				},
			},
			orderBy: { timestamp: "asc" },
		});
	}

	private groupByTimeInterval(data: any[], granularity: string): Array<{ timestamp: Date; data: any[] }> {
		const intervalMs = this.getIntervalMs(granularity);
		const groups = new Map<number, any[]>();

		for (const item of data) {
			const intervalStart = Math.floor(item.timestamp.getTime() / intervalMs) * intervalMs;

			if (!groups.has(intervalStart)) {
				groups.set(intervalStart, []);
			}
			groups.get(intervalStart)!.push(item);
		}

		return Array.from(groups.entries())
			.sort(([a], [b]) => a - b)
			.map(([timestamp, data]) => ({
				timestamp: new Date(timestamp),
				data,
			}));
	}

	private calculateAverage(values: number[]): number {
		if (values.length === 0) return 0;
		return values.reduce((sum, val) => sum + val, 0) / values.length;
	}

	private getPercentile(sortedArray: number[], percentile: number): number {
		const index = percentile * (sortedArray.length - 1);
		const lower = Math.floor(index);
		const upper = Math.ceil(index);
		const weight = index % 1;

		if (upper >= sortedArray.length) return sortedArray[sortedArray.length - 1];
		return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
	}

	private async getProcessingTimeData(queueName: string, timeRange: TimeRange): Promise<number[]> {
		const jobs = await this.prisma.jobMetrics.findMany({
			where: {
				queueName,
				processingTime: { not: null },
				completedAt: {
					gte: timeRange.start,
					lte: timeRange.end,
				},
			},
			select: { processingTime: true },
		});

		return jobs.map((job) => job.processingTime || 0);
	}

	private async getTimeSeriesData(queueName: string, metric: string, timeRange: TimeRange): Promise<TimeSeriesData[]> {
		const data = await this.prisma.queueMetrics.findMany({
			where: {
				queueName,
				timestamp: {
					gte: timeRange.start,
					lte: timeRange.end,
				},
			},
			orderBy: { timestamp: "asc" },
		});

		return data.map((item) => ({
			timestamp: item.timestamp,
			value: this.getMetricValue(item, metric),
			labels: { queueName, metric },
		}));
	}

	private getMetricValue(item: any, metric: string): number {
		switch (metric) {
			case "throughput":
				return item.throughputPerMinute || 0;
			case "processing_time":
				return item.avgProcessingTime || 0;
			case "success_rate":
				return item.successRate || 0;
			case "error_rate":
				return item.errorRate || 0;
			case "queue_size":
				return (item.waitingCount || 0) + (item.activeCount || 0) + (item.delayedCount || 0);
			default:
				return 0;
		}
	}

	private calculateSimpleMovingAverage(window: TimeSeriesData[]): number {
		return window.reduce((sum, point) => sum + point.value, 0) / window.length;
	}

	private calculateExponentialMovingAverage(window: TimeSeriesData[]): number {
		const alpha = 2 / (window.length + 1);
		let ema = window[0].value;

		for (let i = 1; i < window.length; i++) {
			ema = alpha * window[i].value + (1 - alpha) * ema;
		}

		return ema;
	}

	private calculateWeightedMovingAverage(window: TimeSeriesData[]): number {
		const weights = window.map((_, index) => index + 1);
		const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

		const weightedSum = window.reduce((sum, point, index) => sum + point.value * weights[index], 0);

		return weightedSum / totalWeight;
	}

	private calculateLinearRegression(dataPoints: Array<{ x: number; y: number }>): {
		slope: number;
		intercept: number;
		correlation: number;
	} {
		const n = dataPoints.length;
		const sumX = dataPoints.reduce((sum, point) => sum + point.x, 0);
		const sumY = dataPoints.reduce((sum, point) => sum + point.y, 0);
		const sumXY = dataPoints.reduce((sum, point) => sum + point.x * point.y, 0);
		const sumXX = dataPoints.reduce((sum, point) => sum + point.x * point.x, 0);
		const sumYY = dataPoints.reduce((sum, point) => sum + point.y * point.y, 0);

		const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
		const intercept = (sumY - slope * sumX) / n;

		// Calculate correlation coefficient
		const numerator = n * sumXY - sumX * sumY;
		const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
		const correlation = denominator === 0 ? 0 : numerator / denominator;

		return { slope, intercept, correlation };
	}

	private async preAggregateInterval(interval: string, now: Date): Promise<void> {
		const intervalMs = this.getIntervalMs(interval);
		const startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours

		// Get all unique queue names
		const queues = await this.prisma.queueMetrics.findMany({
			select: { queueName: true },
			distinct: ["queueName"],
			where: {
				timestamp: { gte: startTime },
			},
		});

		// Pre-aggregate for each queue
		for (const queue of queues) {
			await this.preAggregateQueueInterval(queue.queueName, interval, startTime, now);
		}
	}

	private async preAggregateQueueInterval(
		queueName: string,
		interval: string,
		startTime: Date,
		endTime: Date,
	): Promise<void> {
		const timeRange: TimeRange = { start: startTime, end: endTime };

		try {
			const aggregated = await this.aggregateByInterval(queueName, timeRange, interval);

			// Store pre-aggregated data
			const cacheKey = this.buildPreAggregationKey(queueName, interval, startTime);
			await this.redis.setex(cacheKey, this.getPreAggregationTTL(interval), JSON.stringify(aggregated));
		} catch (error) {
			console.error(`Failed to pre-aggregate ${queueName} for ${interval}:`, error);
		}
	}

	private async getPreAggregatedData(
		queueName: string,
		timeRange: TimeRange,
		granularity: string,
	): Promise<AggregatedMetrics | null> {
		const cacheKey = this.buildPreAggregationKey(queueName, granularity, timeRange.start);
		const cached = await this.redis.get(cacheKey);

		if (cached) {
			const data = JSON.parse(cached);

			// Filter data to match exact time range
			data.data = data.data.filter((item: any) => item.timestamp >= timeRange.start && item.timestamp <= timeRange.end);

			return data;
		}

		return null;
	}

	private async deleteOldPreAggregations(interval: string, cutoffDate: Date): Promise<number> {
		// Delete old pre-aggregated data from cache
		const pattern = `pre_agg:${interval}:*`;
		const keys = await this.redis.keys(pattern);

		let deleted = 0;
		for (const key of keys) {
			const timestamp = this.extractTimestampFromKey(key);
			if (timestamp && new Date(timestamp) < cutoffDate) {
				await this.redis.del(key);
				deleted++;
			}
		}

		return deleted;
	}

	private async cleanupCacheEntries(interval: string, cutoffDate: Date): Promise<void> {
		const patterns = [`interval:*:${interval}:*`, `percentiles:*:${interval}:*`, `trend:*:${interval}:*`];

		for (const pattern of patterns) {
			const keys = await this.redis.keys(pattern);

			for (const key of keys) {
				const timestamp = this.extractTimestampFromKey(key);
				if (timestamp && new Date(timestamp) < cutoffDate) {
					await this.redis.del(key);
				}
			}
		}
	}

	private getIntervalMs(granularity: string): number {
		switch (granularity) {
			case "1m":
				return 60 * 1000;
			case "5m":
				return 5 * 60 * 1000;
			case "1h":
				return 60 * 60 * 1000;
			case "1d":
				return 24 * 60 * 60 * 1000;
			default:
				return 60 * 60 * 1000;
		}
	}

	private buildCacheKey(type: string, queueName: string, timeRange: TimeRange, extra?: string): string {
		const parts = [type, queueName, timeRange.start.getTime(), timeRange.end.getTime()];

		if (extra) {
			parts.push(extra);
		}

		return parts.join(":");
	}

	private buildPreAggregationKey(queueName: string, interval: string, timestamp: Date): string {
		return `pre_agg:${interval}:${queueName}:${timestamp.getTime()}`;
	}

	private getCacheTTL(granularity: string): number {
		switch (granularity) {
			case "1m":
				return 300; // 5 minutes
			case "5m":
				return 900; // 15 minutes
			case "1h":
				return 3600; // 1 hour
			case "1d":
				return 86400; // 24 hours
			default:
				return 3600;
		}
	}

	private getPreAggregationTTL(interval: string): number {
		const retentionDays = this.config.retentionPeriods[interval] || 7;
		return retentionDays * 24 * 60 * 60; // Convert to seconds
	}

	private async getCachedAggregation(cacheKey: string): Promise<any | null> {
		const cached = await this.redis.get(cacheKey);
		return cached ? JSON.parse(cached) : null;
	}

	private async cacheAggregation(cacheKey: string, data: any, ttl: number): Promise<void> {
		await this.redis.setex(cacheKey, ttl, JSON.stringify(data));
	}

	private extractTimestampFromKey(key: string): number | null {
		const parts = key.split(":");
		const timestampStr = parts[parts.length - 1];
		const timestamp = parseInt(timestampStr);
		return isNaN(timestamp) ? null : timestamp;
	}
}
