import { performance } from "perf_hooks";
import { getRedisInstance } from "../connections";
import { apm, recordWorkerMetrics, recordWebhookMetrics } from "./application-performance-monitor";
import { queueMonitor, registerQueueForMonitoring } from "./queue-monitor";
import { instagramTranslationQueue } from "../queue/instagram-translation.queue";

// Instagram Translation specific metrics interfaces
export interface InstagramTranslationMetrics {
	correlationId: string;
	conversionTime: number;
	templateType: "generic" | "button" | "incompatible";
	bodyLength: number;
	buttonsCount: number;
	hasImage: boolean;
	success: boolean;
	error?: string;
	errorCode?: string;
	timestamp: Date;
	retryCount: number;
	messageType: "interactive" | "enhanced_interactive" | "template" | "unified_template";
}

export interface InstagramWorkerPerformanceMetrics {
	correlationId: string;
	jobId: string;
	processingTime: number;
	queueWaitTime: number;
	databaseQueryTime: number;
	conversionTime: number;
	validationTime: number;
	success: boolean;
	error?: string;
	errorCode?: string;
	timestamp: Date;
	retryCount: number;
	memoryUsage: NodeJS.MemoryUsage;
	cpuUsage: NodeJS.CpuUsage;
}

export interface InstagramQueueHealthMetrics {
	queueName: string;
	waiting: number;
	active: number;
	completed: number;
	failed: number;
	delayed: number;
	paused: boolean;
	avgProcessingTime: number;
	avgWaitTime: number;
	successRate: number;
	errorRate: number;
	throughputPerMinute: number;
	timestamp: Date;
}

// Alert thresholds specific to Instagram translation
export const INSTAGRAM_ALERT_THRESHOLDS = {
	CONVERSION_TIME: 2000, // 2 seconds
	QUEUE_WAIT_TIME: 5000, // 5 seconds
	ERROR_RATE: 10, // 10% error rate
	QUEUE_DEPTH: 50, // 50 jobs waiting
	MEMORY_USAGE: 512 * 1024 * 1024, // 512MB
	CPU_USAGE_PERCENT: 80, // 80% CPU usage
	SUCCESS_RATE_THRESHOLD: 90, // 90% success rate
} as const;

export class InstagramTranslationMonitor {
	private static instance: InstagramTranslationMonitor;
	private redis: ReturnType<typeof getRedisInstance>;
	private metricsBuffer: {
		translations: InstagramTranslationMetrics[];
		workerPerformance: InstagramWorkerPerformanceMetrics[];
		queueHealth: InstagramQueueHealthMetrics[];
	} = {
		translations: [],
		workerPerformance: [],
		queueHealth: [],
	};

	private readonly METRICS_BUFFER_SIZE = 1000;
	private readonly METRICS_FLUSH_INTERVAL = 30000; // 30 seconds
	private readonly HEALTH_CHECK_INTERVAL = 60000; // 1 minute
	private readonly PERFORMANCE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

	private monitoringStartTime: number;
	private lastCpuUsage: NodeJS.CpuUsage;

	constructor(redisConnection?: ReturnType<typeof getRedisInstance>) {
		this.redis = redisConnection || getRedisInstance();
		this.monitoringStartTime = Date.now();
		this.lastCpuUsage = process.cpuUsage();
		this.startMonitoring();
	}

	static getInstance(): InstagramTranslationMonitor {
		if (!this.instance) {
			this.instance = new InstagramTranslationMonitor();
		}
		return this.instance;
	}

	// Start monitoring tasks
	private startMonitoring(): void {
		// Register Instagram translation queue for monitoring
		registerQueueForMonitoring(instagramTranslationQueue, "instagram-translation");

		// Flush metrics to Redis periodically
		setInterval(() => {
			this.flushMetricsToRedis().catch((error) => {
				console.error("[Instagram Monitor] Error flushing metrics:", error);
			});
		}, this.METRICS_FLUSH_INTERVAL);

		// Perform health checks periodically
		setInterval(() => {
			this.performHealthCheck().catch((error) => {
				console.error("[Instagram Monitor] Error performing health check:", error);
			});
		}, this.HEALTH_CHECK_INTERVAL);

		console.log("[Instagram Monitor] Instagram translation monitoring started");
	}

	// Record translation metrics with structured logging
	recordTranslationMetrics(metrics: InstagramTranslationMetrics): void {
		// Add to buffer
		this.metricsBuffer.translations.push(metrics);

		if (this.metricsBuffer.translations.length > this.METRICS_BUFFER_SIZE) {
			this.metricsBuffer.translations.shift();
		}

		// Structured logging with correlation ID
		this.logWithCorrelationId("info", "Translation metrics recorded", metrics.correlationId, {
			conversionTime: metrics.conversionTime,
			templateType: metrics.templateType,
			bodyLength: metrics.bodyLength,
			buttonsCount: metrics.buttonsCount,
			hasImage: metrics.hasImage,
			success: metrics.success,
			messageType: metrics.messageType,
			retryCount: metrics.retryCount,
		});

		// Check for performance alerts
		this.checkTranslationPerformanceAlerts(metrics);

		// Record in APM for global monitoring
		recordWorkerMetrics({
			jobId: metrics.correlationId,
			jobType: "instagram-translation",
			processingTime: metrics.conversionTime,
			queueWaitTime: 0, // This would be calculated separately
			success: metrics.success,
			error: metrics.error,
			timestamp: metrics.timestamp,
			correlationId: metrics.correlationId,
			retryCount: metrics.retryCount,
		});
	}

	// Record worker performance metrics with CPU/Memory monitoring
	recordWorkerPerformanceMetrics(metrics: InstagramWorkerPerformanceMetrics): void {
		// Add to buffer
		this.metricsBuffer.workerPerformance.push(metrics);

		if (this.metricsBuffer.workerPerformance.length > this.METRICS_BUFFER_SIZE) {
			this.metricsBuffer.workerPerformance.shift();
		}

		// Structured logging with correlation ID
		this.logWithCorrelationId("info", "Worker performance metrics recorded", metrics.correlationId, {
			jobId: metrics.jobId,
			processingTime: metrics.processingTime,
			queueWaitTime: metrics.queueWaitTime,
			databaseQueryTime: metrics.databaseQueryTime,
			conversionTime: metrics.conversionTime,
			validationTime: metrics.validationTime,
			success: metrics.success,
			retryCount: metrics.retryCount,
			memoryUsage: {
				rss: Math.round(metrics.memoryUsage.rss / 1024 / 1024), // MB
				heapUsed: Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024), // MB
				heapTotal: Math.round(metrics.memoryUsage.heapTotal / 1024 / 1024), // MB
			},
			cpuUsage: {
				user: metrics.cpuUsage.user,
				system: metrics.cpuUsage.system,
			},
		});

		// Check for resource usage alerts
		this.checkResourceUsageAlerts(metrics);

		// Record in APM for global monitoring
		recordWorkerMetrics({
			jobId: metrics.jobId,
			jobType: "instagram-translation",
			processingTime: metrics.processingTime,
			queueWaitTime: metrics.queueWaitTime,
			success: metrics.success,
			error: metrics.error,
			timestamp: metrics.timestamp,
			correlationId: metrics.correlationId,
			retryCount: metrics.retryCount,
		});
	}

	// Check translation performance alerts
	private checkTranslationPerformanceAlerts(metrics: InstagramTranslationMetrics): void {
		// Alert on slow conversion
		if (metrics.conversionTime > INSTAGRAM_ALERT_THRESHOLDS.CONVERSION_TIME) {
			apm.triggerAlert({
				level: "warning",
				component: "instagram-translation",
				message: `Slow Instagram translation: ${metrics.conversionTime}ms`,
				metrics: {
					correlationId: metrics.correlationId,
					conversionTime: metrics.conversionTime,
					templateType: metrics.templateType,
					bodyLength: metrics.bodyLength,
				},
			});
		}

		// Alert on conversion failure
		if (!metrics.success) {
			const alertLevel = metrics.retryCount >= 2 ? "error" : "warning";

			apm.triggerAlert({
				level: alertLevel,
				component: "instagram-translation",
				message: `Instagram translation failed: ${metrics.error}`,
				metrics: {
					correlationId: metrics.correlationId,
					error: metrics.error,
					errorCode: metrics.errorCode,
					retryCount: metrics.retryCount,
					templateType: metrics.templateType,
				},
			});
		}

		// Alert on incompatible messages
		if (metrics.templateType === "incompatible") {
			apm.triggerAlert({
				level: "info",
				component: "instagram-translation",
				message: `Message incompatible with Instagram: ${metrics.bodyLength} characters`,
				metrics: {
					correlationId: metrics.correlationId,
					bodyLength: metrics.bodyLength,
					messageType: metrics.messageType,
				},
			});
		}
	}

	// Check resource usage alerts
	private checkResourceUsageAlerts(metrics: InstagramWorkerPerformanceMetrics): void {
		// Alert on high memory usage
		if (metrics.memoryUsage.rss > INSTAGRAM_ALERT_THRESHOLDS.MEMORY_USAGE) {
			apm.triggerAlert({
				level: "warning",
				component: "instagram-translation",
				message: `High memory usage in Instagram worker: ${Math.round(metrics.memoryUsage.rss / 1024 / 1024)}MB`,
				metrics: {
					correlationId: metrics.correlationId,
					jobId: metrics.jobId,
					memoryUsage: metrics.memoryUsage,
				},
			});
		}

		// Calculate CPU usage percentage
		const cpuPercent = this.calculateCpuUsagePercent(metrics.cpuUsage);
		if (cpuPercent > INSTAGRAM_ALERT_THRESHOLDS.CPU_USAGE_PERCENT) {
			apm.triggerAlert({
				level: "warning",
				component: "instagram-translation",
				message: `High CPU usage in Instagram worker: ${cpuPercent.toFixed(1)}%`,
				metrics: {
					correlationId: metrics.correlationId,
					jobId: metrics.jobId,
					cpuPercent,
					cpuUsage: metrics.cpuUsage,
				},
			});
		}

		// Alert on long processing time
		if (metrics.processingTime > INSTAGRAM_ALERT_THRESHOLDS.CONVERSION_TIME * 2) {
			apm.triggerAlert({
				level: "warning",
				component: "instagram-translation",
				message: `Long Instagram worker processing time: ${metrics.processingTime}ms`,
				metrics: {
					correlationId: metrics.correlationId,
					jobId: metrics.jobId,
					processingTime: metrics.processingTime,
					breakdown: {
						databaseQueryTime: metrics.databaseQueryTime,
						conversionTime: metrics.conversionTime,
						validationTime: metrics.validationTime,
					},
				},
			});
		}
	}

	// Calculate CPU usage percentage
	private calculateCpuUsagePercent(cpuUsage: NodeJS.CpuUsage): number {
		const totalUsage = cpuUsage.user + cpuUsage.system;
		const elapsedTime = (Date.now() - this.monitoringStartTime) * 1000; // Convert to microseconds

		if (elapsedTime === 0) return 0;

		return (totalUsage / elapsedTime) * 100;
	}

	// Perform comprehensive health check
	private async performHealthCheck(): Promise<void> {
		try {
			const queueHealth = queueMonitor.getQueueHealth("instagram-translation");

			if (queueHealth) {
				// Check queue depth
				const totalJobs = queueHealth.waiting + queueHealth.active;
				if (totalJobs > INSTAGRAM_ALERT_THRESHOLDS.QUEUE_DEPTH) {
					apm.triggerAlert({
						level: "warning",
						component: "instagram-translation",
						message: `High Instagram translation queue depth: ${totalJobs} jobs`,
						metrics: {
							waiting: queueHealth.waiting,
							active: queueHealth.active,
							failed: queueHealth.failed,
						},
					});
				}

				// Check error rate
				const performanceStats = queueMonitor.getQueuePerformanceStats("instagram-translation", 5);
				if (performanceStats) {
					if (performanceStats.errorRate > INSTAGRAM_ALERT_THRESHOLDS.ERROR_RATE) {
						apm.triggerAlert({
							level: "error",
							component: "instagram-translation",
							message: `High Instagram translation error rate: ${performanceStats.errorRate.toFixed(1)}%`,
							metrics: {
								errorRate: performanceStats.errorRate,
								successRate: performanceStats.successRate,
								throughput: performanceStats.throughput,
							},
						});
					}

					if (performanceStats.successRate < INSTAGRAM_ALERT_THRESHOLDS.SUCCESS_RATE_THRESHOLD) {
						apm.triggerAlert({
							level: "error",
							component: "instagram-translation",
							message: `Low Instagram translation success rate: ${performanceStats.successRate.toFixed(1)}%`,
							metrics: {
								successRate: performanceStats.successRate,
								errorRate: performanceStats.errorRate,
								throughput: performanceStats.throughput,
							},
						});
					}
				}

				// Check if queue is paused
				if (queueHealth.paused) {
					apm.triggerAlert({
						level: "warning",
						component: "instagram-translation",
						message: "Instagram translation queue is paused",
						metrics: { paused: true },
					});
				}
			}

			// Check recent performance metrics
			await this.checkRecentPerformanceMetrics();
		} catch (error) {
			console.error("[Instagram Monitor] Health check error:", error);

			apm.triggerAlert({
				level: "error",
				component: "instagram-translation",
				message: `Instagram translation health check failed: ${error instanceof Error ? error.message : error}`,
				metrics: { error: error instanceof Error ? error.message : String(error) },
			});
		}
	}

	// Check recent performance metrics for trends
	private async checkRecentPerformanceMetrics(): Promise<void> {
		const now = Date.now();
		const windowStart = now - this.PERFORMANCE_WINDOW_MS;

		// Analyze recent translation metrics
		const recentTranslations = this.metricsBuffer.translations.filter((m) => m.timestamp.getTime() > windowStart);

		if (recentTranslations.length > 10) {
			// Calculate average conversion time
			const avgConversionTime =
				recentTranslations.reduce((sum, m) => sum + m.conversionTime, 0) / recentTranslations.length;

			if (avgConversionTime > INSTAGRAM_ALERT_THRESHOLDS.CONVERSION_TIME) {
				apm.triggerAlert({
					level: "warning",
					component: "instagram-translation",
					message: `High average Instagram conversion time: ${avgConversionTime.toFixed(0)}ms`,
					metrics: {
						avgConversionTime,
						sampleSize: recentTranslations.length,
						timeWindow: "5 minutes",
					},
				});
			}

			// Calculate error rate
			const errorCount = recentTranslations.filter((m) => !m.success).length;
			const errorRate = (errorCount / recentTranslations.length) * 100;

			if (errorRate > INSTAGRAM_ALERT_THRESHOLDS.ERROR_RATE) {
				apm.triggerAlert({
					level: "error",
					component: "instagram-translation",
					message: `High Instagram translation error rate: ${errorRate.toFixed(1)}%`,
					metrics: {
						errorRate,
						errorCount,
						totalTranslations: recentTranslations.length,
						timeWindow: "5 minutes",
					},
				});
			}

			// Analyze error patterns
			const errorsByCode = recentTranslations
				.filter((m) => !m.success && m.errorCode)
				.reduce(
					(acc, m) => {
						acc[m.errorCode!] = (acc[m.errorCode!] || 0) + 1;
						return acc;
					},
					{} as Record<string, number>,
				);

			// Alert on frequent specific errors
			for (const [errorCode, count] of Object.entries(errorsByCode)) {
				if (count > 5) {
					// More than 5 occurrences of the same error
					apm.triggerAlert({
						level: "warning",
						component: "instagram-translation",
						message: `Frequent Instagram translation error: ${errorCode} (${count} occurrences)`,
						metrics: {
							errorCode,
							occurrences: count,
							timeWindow: "5 minutes",
						},
					});
				}
			}
		}

		// Analyze recent worker performance metrics
		const recentWorkerMetrics = this.metricsBuffer.workerPerformance.filter((m) => m.timestamp.getTime() > windowStart);

		if (recentWorkerMetrics.length > 5) {
			// Calculate average memory usage
			const avgMemoryUsage =
				recentWorkerMetrics.reduce((sum, m) => sum + m.memoryUsage.rss, 0) / recentWorkerMetrics.length;

			if (avgMemoryUsage > INSTAGRAM_ALERT_THRESHOLDS.MEMORY_USAGE * 0.8) {
				// 80% of threshold
				apm.triggerAlert({
					level: "info",
					component: "instagram-translation",
					message: `Instagram worker memory usage trending high: ${Math.round(avgMemoryUsage / 1024 / 1024)}MB average`,
					metrics: {
						avgMemoryUsageMB: Math.round(avgMemoryUsage / 1024 / 1024),
						sampleSize: recentWorkerMetrics.length,
						timeWindow: "5 minutes",
					},
				});
			}
		}
	}

	// Flush metrics to Redis for persistence
	private async flushMetricsToRedis(): Promise<void> {
		try {
			const timestamp = new Date().toISOString();

			// Flush translation metrics
			if (this.metricsBuffer.translations.length > 0) {
				const key = `chatwit:metrics:instagram-translation:${timestamp}`;
				await this.redis.setex(key, 60 * 60, JSON.stringify(this.metricsBuffer.translations)); // 1 hour TTL
				console.log(`[Instagram Monitor] Flushed ${this.metricsBuffer.translations.length} translation metrics`);
				this.metricsBuffer.translations = [];
			}

			// Flush worker performance metrics
			if (this.metricsBuffer.workerPerformance.length > 0) {
				const key = `chatwit:metrics:instagram-worker:${timestamp}`;
				await this.redis.setex(key, 60 * 60, JSON.stringify(this.metricsBuffer.workerPerformance));
				console.log(
					`[Instagram Monitor] Flushed ${this.metricsBuffer.workerPerformance.length} worker performance metrics`,
				);
				this.metricsBuffer.workerPerformance = [];
			}
		} catch (error) {
			console.error("[Instagram Monitor] Error flushing metrics to Redis:", error);
		}
	}

	// Structured logging with correlation ID
	private logWithCorrelationId(
		level: "info" | "warn" | "error" | "debug",
		message: string,
		correlationId: string,
		additionalData?: any,
	): void {
		const logData = {
			timestamp: new Date().toISOString(),
			level: level.toUpperCase(),
			component: "instagram-translation",
			message,
			correlationId,
			...additionalData,
		};

		const logMessage = `[Instagram Monitor] [${logData.level}] [${correlationId}] ${message}`;

		switch (level) {
			case "error":
				console.error(logMessage, additionalData ? logData : "");
				break;
			case "warn":
				console.warn(logMessage, additionalData ? logData : "");
				break;
			case "debug":
				console.debug(logMessage, additionalData ? logData : "");
				break;
			default:
				console.log(logMessage, additionalData ? logData : "");
		}
	}

	// Get performance summary for Instagram translation
	async getPerformanceSummary(timeWindowMinutes: number = 60): Promise<{
		translations: {
			total: number;
			successful: number;
			failed: number;
			successRate: number;
			avgConversionTime: number;
			templateTypes: Record<string, number>;
		};
		worker: {
			avgProcessingTime: number;
			avgQueueWaitTime: number;
			avgMemoryUsageMB: number;
			avgCpuPercent: number;
		};
		queue: {
			waiting: number;
			active: number;
			failed: number;
			throughputPerMinute: number;
		};
		alerts: {
			active: number;
			byLevel: Record<string, number>;
		};
	}> {
		const now = Date.now();
		const windowStart = now - timeWindowMinutes * 60 * 1000;

		// Analyze translation metrics
		const recentTranslations = this.metricsBuffer.translations.filter((m) => m.timestamp.getTime() > windowStart);

		const translationStats = {
			total: recentTranslations.length,
			successful: recentTranslations.filter((m) => m.success).length,
			failed: recentTranslations.filter((m) => !m.success).length,
			successRate:
				recentTranslations.length > 0
					? (recentTranslations.filter((m) => m.success).length / recentTranslations.length) * 100
					: 0,
			avgConversionTime:
				recentTranslations.length > 0
					? recentTranslations.reduce((sum, m) => sum + m.conversionTime, 0) / recentTranslations.length
					: 0,
			templateTypes: recentTranslations.reduce(
				(acc, m) => {
					acc[m.templateType] = (acc[m.templateType] || 0) + 1;
					return acc;
				},
				{} as Record<string, number>,
			),
		};

		// Analyze worker performance metrics
		const recentWorkerMetrics = this.metricsBuffer.workerPerformance.filter((m) => m.timestamp.getTime() > windowStart);

		const workerStats = {
			avgProcessingTime:
				recentWorkerMetrics.length > 0
					? recentWorkerMetrics.reduce((sum, m) => sum + m.processingTime, 0) / recentWorkerMetrics.length
					: 0,
			avgQueueWaitTime:
				recentWorkerMetrics.length > 0
					? recentWorkerMetrics.reduce((sum, m) => sum + m.queueWaitTime, 0) / recentWorkerMetrics.length
					: 0,
			avgMemoryUsageMB:
				recentWorkerMetrics.length > 0
					? recentWorkerMetrics.reduce((sum, m) => sum + m.memoryUsage.rss, 0) /
						recentWorkerMetrics.length /
						1024 /
						1024
					: 0,
			avgCpuPercent:
				recentWorkerMetrics.length > 0
					? recentWorkerMetrics.reduce((sum, m) => sum + this.calculateCpuUsagePercent(m.cpuUsage), 0) /
						recentWorkerMetrics.length
					: 0,
		};

		// Get queue stats
		const queueHealth = queueMonitor.getQueueHealth("instagram-translation");
		const queuePerformance = queueMonitor.getQueuePerformanceStats("instagram-translation", timeWindowMinutes);

		const queueStats = {
			waiting: queueHealth?.waiting || 0,
			active: queueHealth?.active || 0,
			failed: queueHealth?.failed || 0,
			throughputPerMinute: queuePerformance?.throughput.jobsPerMinute || 0,
		};

		// Get alert stats
		const activeAlerts = apm.getAlertsByComponent("instagram-translation");
		const alertsByLevel = activeAlerts.reduce(
			(acc, alert) => {
				acc[alert.level] = (acc[alert.level] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>,
		);

		const alertStats = {
			active: activeAlerts.length,
			byLevel: alertsByLevel,
		};

		return {
			translations: translationStats,
			worker: workerStats,
			queue: queueStats,
			alerts: alertStats,
		};
	}

	// Graceful shutdown
	async shutdown(): Promise<void> {
		try {
			console.log("[Instagram Monitor] Shutting down Instagram translation monitor...");

			// Flush remaining metrics
			await this.flushMetricsToRedis();

			// Clear buffers
			this.metricsBuffer.translations = [];
			this.metricsBuffer.workerPerformance = [];
			this.metricsBuffer.queueHealth = [];

			console.log("[Instagram Monitor] Instagram translation monitor shutdown completed");
		} catch (error) {
			console.error("[Instagram Monitor] Error during shutdown:", error);
		}
	}
}

// Global Instagram translation monitor instance
export const instagramTranslationMonitor = InstagramTranslationMonitor.getInstance();

// Utility functions for easy integration
export function recordInstagramTranslationMetrics(metrics: InstagramTranslationMetrics): void {
	instagramTranslationMonitor.recordTranslationMetrics(metrics);
}

export function recordInstagramWorkerPerformanceMetrics(metrics: InstagramWorkerPerformanceMetrics): void {
	instagramTranslationMonitor.recordWorkerPerformanceMetrics(metrics);
}

// Performance measurement decorator for Instagram translation functions
export function measureInstagramTranslationPerformance<T extends (...args: any[]) => Promise<any>>(
	fn: T,
	getMetricsData: (args: Parameters<T>, result: any, error?: Error) => Partial<InstagramTranslationMetrics>,
): T {
	return (async (...args: Parameters<T>) => {
		const start = performance.now();
		let result: any;
		let error: Error | undefined;

		try {
			result = await fn(...args);
			return result;
		} catch (err) {
			error = err instanceof Error ? err : new Error(String(err));
			throw error;
		} finally {
			const conversionTime = performance.now() - start;
			const metricsData = getMetricsData(args, result, error);

			recordInstagramTranslationMetrics({
				conversionTime,
				timestamp: new Date(),
				success: !error,
				error: error?.message,
				correlationId: metricsData.correlationId || "unknown",
				templateType: metricsData.templateType || "generic",
				bodyLength: metricsData.bodyLength || 0,
				buttonsCount: metricsData.buttonsCount || 0,
				hasImage: metricsData.hasImage || false,
				retryCount: metricsData.retryCount || 0,
				messageType: metricsData.messageType || "interactive",
				...metricsData,
			});
		}
	}) as T;
}

// Initialize Instagram translation monitoring
export async function initializeInstagramTranslationMonitoring(): Promise<void> {
	try {
		console.log("[Instagram Monitor] Initializing Instagram translation monitoring...");

		// The monitor is automatically initialized when getInstance() is called
		// This function is mainly for explicit initialization

		console.log("[Instagram Monitor] Instagram translation monitoring initialized successfully");
	} catch (error) {
		console.error("[Instagram Monitor] Failed to initialize Instagram translation monitoring:", error);
		throw error;
	}
}
