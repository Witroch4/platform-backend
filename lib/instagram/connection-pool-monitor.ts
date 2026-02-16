/**
 * Connection Pool Monitor for Instagram Translation
 *
 * Monitors database connection pool health, performance, and provides
 * automatic recovery mechanisms for Instagram translation operations.
 */

import { withPrismaReconnect } from "@/lib/connections";
import { getRedisInstance } from "../connections";
import { PrismaClient, Prisma } from "@prisma/client";
import { isMonitorLogEnabled } from "@/lib/config";

// Connection pool configuration
export interface ConnectionPoolConfig {
	maxConnections: number;
	minConnections: number;
	acquireTimeoutMs: number;
	createTimeoutMs: number;
	destroyTimeoutMs: number;
	idleTimeoutMs: number;
	reapIntervalMs: number;
	createRetryIntervalMs: number;
	healthCheckIntervalMs: number;
	slowQueryThresholdMs: number;
}

export const DEFAULT_POOL_CONFIG: ConnectionPoolConfig = {
	maxConnections: 10,
	minConnections: 2,
	acquireTimeoutMs: 30000,
	createTimeoutMs: 30000,
	destroyTimeoutMs: 5000,
	idleTimeoutMs: 30000,
	reapIntervalMs: 1000,
	createRetryIntervalMs: 200,
	healthCheckIntervalMs: 60000, // 1 minute
	slowQueryThresholdMs: 1000, // 1 second
};

// Connection pool metrics
export interface ConnectionPoolMetrics {
	totalConnections: number;
	activeConnections: number;
	idleConnections: number;
	waitingRequests: number;
	totalQueries: number;
	successfulQueries: number;
	failedQueries: number;
	slowQueries: number;
	averageQueryTime: number;
	averageConnectionTime: number;
	lastHealthCheck: Date;
	uptime: number;
	errors: Array<{
		timestamp: Date;
		error: string;
		queryType?: string;
	}>;
}

// Health status
export interface PoolHealthStatus {
	isHealthy: boolean;
	status: "healthy" | "degraded" | "critical" | "down";
	issues: string[];
	recommendations: string[];
	metrics: ConnectionPoolMetrics;
	lastCheck: Date;
}

class ConnectionPoolMonitor {
	private config: ConnectionPoolConfig;
	private metrics: ConnectionPoolMetrics;
	private startTime: Date;
	private healthCheckInterval?: NodeJS.Timeout;
	private queryTimes: number[] = [];
	private connectionTimes: number[] = [];
	private readonly MAX_STORED_TIMES = 1000;

	constructor(config: ConnectionPoolConfig = DEFAULT_POOL_CONFIG) {
		this.config = config;
		this.startTime = new Date();
		this.metrics = this.initializeMetrics();
		this.startHealthChecking();
	}

	private initializeMetrics(): ConnectionPoolMetrics {
		return {
			totalConnections: 0,
			activeConnections: 0,
			idleConnections: 0,
			waitingRequests: 0,
			totalQueries: 0,
			successfulQueries: 0,
			failedQueries: 0,
			slowQueries: 0,
			averageQueryTime: 0,
			averageConnectionTime: 0,
			lastHealthCheck: new Date(),
			uptime: 0,
			errors: [],
		};
	}

	private startHealthChecking(): void {
		// Skip health checks in test environment
		if (process.env.NODE_ENV === "test") {
			return;
		}

		this.healthCheckInterval = setInterval(() => {
			this.performHealthCheck().catch((error) => {
				console.error("[ConnectionPoolMonitor] Health check failed:", error);
			});
		}, this.config.healthCheckIntervalMs);

		if (isMonitorLogEnabled()) {
			console.log("[ConnectionPoolMonitor] Health checking started");
		}
	}

	// Record query execution
	recordQuery(queryType: string, executionTime: number, success: boolean, error?: Error): void {
		this.metrics.totalQueries++;

		if (success) {
			this.metrics.successfulQueries++;
		} else {
			this.metrics.failedQueries++;

			if (error) {
				this.metrics.errors.push({
					timestamp: new Date(),
					error: error.message,
					queryType,
				});

				// Keep only recent errors
				if (this.metrics.errors.length > 100) {
					this.metrics.errors.shift();
				}
			}
		}

		// Track query times
		this.queryTimes.push(executionTime);
		if (this.queryTimes.length > this.MAX_STORED_TIMES) {
			this.queryTimes.shift();
		}

		// Update average query time
		this.metrics.averageQueryTime = this.queryTimes.reduce((sum, time) => sum + time, 0) / this.queryTimes.length;

		// Track slow queries
		if (executionTime > this.config.slowQueryThresholdMs) {
			this.metrics.slowQueries++;
			console.warn(`[ConnectionPoolMonitor] Slow query detected: ${queryType}`, {
				executionTime,
				threshold: this.config.slowQueryThresholdMs,
			});
		}

		// Log performance warnings
		if (this.metrics.totalQueries % 100 === 0) {
			this.logPerformanceWarnings();
		}
	}

	// Record connection acquisition time
	recordConnectionAcquisition(acquisitionTime: number): void {
		this.connectionTimes.push(acquisitionTime);
		if (this.connectionTimes.length > this.MAX_STORED_TIMES) {
			this.connectionTimes.shift();
		}

		this.metrics.averageConnectionTime =
			this.connectionTimes.reduce((sum, time) => sum + time, 0) / this.connectionTimes.length;

		if (acquisitionTime > this.config.acquireTimeoutMs / 2) {
			console.warn(`[ConnectionPoolMonitor] Slow connection acquisition: ${acquisitionTime}ms`);
		}
	}

	// Perform comprehensive health check
	private async performHealthCheck(): Promise<PoolHealthStatus> {
		const checkStart = Date.now();
		const issues: string[] = [];
		const recommendations: string[] = [];
		let status: PoolHealthStatus["status"] = "healthy";

		try {
			// Update uptime
			this.metrics.uptime = Date.now() - this.startTime.getTime();
			this.metrics.lastHealthCheck = new Date();

			// Test database connectivity
			const dbHealthy = await this.testDatabaseConnectivity();
			if (!dbHealthy) {
				issues.push("Database connectivity test failed");
				status = "critical";
			}

			// Test Redis connectivity
			const redisHealthy = await this.testRedisConnectivity();
			if (!redisHealthy) {
				issues.push("Redis connectivity test failed");
				status = status === "critical" ? "critical" : "degraded";
			}

			// Check query performance
			const queryPerformanceIssues = this.checkQueryPerformance();
			issues.push(...queryPerformanceIssues.issues);
			recommendations.push(...queryPerformanceIssues.recommendations);

			// Check error rates
			const errorRateIssues = this.checkErrorRates();
			issues.push(...errorRateIssues.issues);
			recommendations.push(...errorRateIssues.recommendations);

			// Check connection pool utilization
			const poolUtilizationIssues = this.checkPoolUtilization();
			issues.push(...poolUtilizationIssues.issues);
			recommendations.push(...poolUtilizationIssues.recommendations);

			// Determine overall status
			if (issues.length === 0) {
				status = "healthy";
			} else if (status === "healthy") {
				status = issues.some((issue) => issue.includes("critical") || issue.includes("failed"))
					? "degraded"
					: "healthy";
			}

			const healthStatus: PoolHealthStatus = {
				isHealthy: status === "healthy",
				status,
				issues,
				recommendations,
				metrics: { ...this.metrics },
				lastCheck: new Date(),
			};

			// Log health status periodically
			if ((this.metrics.totalQueries % 1000 === 0 || issues.length > 0) && isMonitorLogEnabled()) {
				console.log("[ConnectionPoolMonitor] Health check completed", {
					status,
					issues: issues.length,
					recommendations: recommendations.length,
					checkDuration: Date.now() - checkStart,
				});
			}

			return healthStatus;
		} catch (error) {
			console.error("[ConnectionPoolMonitor] Health check error:", error);

			return {
				isHealthy: false,
				status: "critical",
				issues: [`Health check failed: ${error instanceof Error ? error.message : "Unknown error"}`],
				recommendations: ["Investigate health check system", "Check system resources"],
				metrics: { ...this.metrics },
				lastCheck: new Date(),
			};
		}
	}

	// Test database connectivity
	private async testDatabaseConnectivity(): Promise<boolean> {
		try {
			const start = Date.now();

			await withPrismaReconnect(async (prisma) => {
				return prisma.$queryRaw`SELECT 1`;
			});

			const connectionTime = Date.now() - start;
			this.recordConnectionAcquisition(connectionTime);

			return true;
		} catch (error) {
			console.error("[ConnectionPoolMonitor] Database connectivity test failed:", error);
			return false;
		}
	}

	// Test Redis connectivity
	private async testRedisConnectivity(): Promise<boolean> {
		try {
			const start = Date.now();
			await getRedisInstance().ping();
			const latency = Date.now() - start;

			if (latency > 1000) {
				console.warn(`[ConnectionPoolMonitor] High Redis latency: ${latency}ms`);
			}

			return true;
		} catch (error) {
			console.error("[ConnectionPoolMonitor] Redis connectivity test failed:", error);
			return false;
		}
	}

	// Check query performance
	private checkQueryPerformance(): { issues: string[]; recommendations: string[] } {
		const issues: string[] = [];
		const recommendations: string[] = [];

		// Check average query time
		if (this.metrics.averageQueryTime > this.config.slowQueryThresholdMs) {
			issues.push(`High average query time: ${this.metrics.averageQueryTime.toFixed(0)}ms`);
			recommendations.push("Consider query optimization or database indexing");
		}

		// Check slow query percentage
		const slowQueryPercentage =
			this.metrics.totalQueries > 0 ? (this.metrics.slowQueries / this.metrics.totalQueries) * 100 : 0;

		if (slowQueryPercentage > 10) {
			issues.push(`High slow query percentage: ${slowQueryPercentage.toFixed(1)}%`);
			recommendations.push("Investigate and optimize slow queries");
		}

		// Check connection acquisition time
		if (this.metrics.averageConnectionTime > this.config.acquireTimeoutMs / 4) {
			issues.push(`High connection acquisition time: ${this.metrics.averageConnectionTime.toFixed(0)}ms`);
			recommendations.push("Consider increasing connection pool size");
		}

		return { issues, recommendations };
	}

	// Check error rates
	private checkErrorRates(): { issues: string[]; recommendations: string[] } {
		const issues: string[] = [];
		const recommendations: string[] = [];

		if (this.metrics.totalQueries === 0) return { issues, recommendations };

		const errorRate = (this.metrics.failedQueries / this.metrics.totalQueries) * 100;

		if (errorRate > 5) {
			issues.push(`High error rate: ${errorRate.toFixed(1)}%`);
			recommendations.push("Investigate query failures and connection issues");
		}

		// Check recent errors
		const recentErrors = this.metrics.errors.filter(
			(error) => Date.now() - error.timestamp.getTime() < 300000, // Last 5 minutes
		);

		if (recentErrors.length > 10) {
			issues.push(`High recent error count: ${recentErrors.length} in last 5 minutes`);
			recommendations.push("Check for system issues or resource constraints");
		}

		return { issues, recommendations };
	}

	// Check connection pool utilization
	private checkPoolUtilization(): { issues: string[]; recommendations: string[] } {
		const issues: string[] = [];
		const recommendations: string[] = [];

		// This would require integration with actual connection pool metrics
		// For now, we'll use estimated values based on query patterns

		const estimatedActiveConnections = Math.min(
			Math.ceil(this.metrics.totalQueries / 1000),
			this.config.maxConnections,
		);

		const utilizationPercentage = (estimatedActiveConnections / this.config.maxConnections) * 100;

		if (utilizationPercentage > 80) {
			issues.push(`High connection pool utilization: ${utilizationPercentage.toFixed(1)}%`);
			recommendations.push("Consider increasing max connections or optimizing query patterns");
		}

		if (this.metrics.waitingRequests > 0) {
			issues.push(`Requests waiting for connections: ${this.metrics.waitingRequests}`);
			recommendations.push("Increase connection pool size or reduce query load");
		}

		return { issues, recommendations };
	}

	// Log performance warnings
	private logPerformanceWarnings(): void {
		const stats = this.getPerformanceStats();

		if (stats.errorRate > 5) {
			console.warn("[ConnectionPoolMonitor] High error rate detected", stats);
		}

		if (stats.averageQueryTime > this.config.slowQueryThresholdMs) {
			console.warn("[ConnectionPoolMonitor] High average query time detected", stats);
		}
	}

	// Get current performance statistics
	getPerformanceStats(): {
		totalQueries: number;
		successRate: number;
		errorRate: number;
		averageQueryTime: number;
		slowQueryPercentage: number;
		uptime: number;
		recentErrors: number;
	} {
		const successRate =
			this.metrics.totalQueries > 0 ? (this.metrics.successfulQueries / this.metrics.totalQueries) * 100 : 0;

		const errorRate =
			this.metrics.totalQueries > 0 ? (this.metrics.failedQueries / this.metrics.totalQueries) * 100 : 0;

		const slowQueryPercentage =
			this.metrics.totalQueries > 0 ? (this.metrics.slowQueries / this.metrics.totalQueries) * 100 : 0;

		const recentErrors = this.metrics.errors.filter(
			(error) => Date.now() - error.timestamp.getTime() < 300000, // Last 5 minutes
		).length;

		return {
			totalQueries: this.metrics.totalQueries,
			successRate: Math.round(successRate * 100) / 100,
			errorRate: Math.round(errorRate * 100) / 100,
			averageQueryTime: Math.round(this.metrics.averageQueryTime * 100) / 100,
			slowQueryPercentage: Math.round(slowQueryPercentage * 100) / 100,
			uptime: this.metrics.uptime,
			recentErrors,
		};
	}

	// Get current health status
	async getCurrentHealthStatus(): Promise<PoolHealthStatus> {
		return this.performHealthCheck();
	}

	// Get detailed metrics
	getDetailedMetrics(): ConnectionPoolMetrics {
		return { ...this.metrics };
	}

	// Reset metrics (useful for testing or periodic resets)
	resetMetrics(): void {
		const oldMetrics = { ...this.metrics };
		this.metrics = this.initializeMetrics();
		this.queryTimes = [];
		this.connectionTimes = [];

		console.log("[ConnectionPoolMonitor] Metrics reset", {
			previousTotalQueries: oldMetrics.totalQueries,
			previousSuccessRate:
				oldMetrics.totalQueries > 0 ? (oldMetrics.successfulQueries / oldMetrics.totalQueries) * 100 : 0,
		});
	}

	// Shutdown monitoring
	shutdown(): void {
		if (this.healthCheckInterval) {
			clearInterval(this.healthCheckInterval);
			this.healthCheckInterval = undefined;
		}

		console.log("[ConnectionPoolMonitor] Monitoring shutdown completed");
	}

	// Update configuration
	updateConfig(newConfig: Partial<ConnectionPoolConfig>): void {
		this.config = { ...this.config, ...newConfig };

		console.log("[ConnectionPoolMonitor] Configuration updated", {
			newConfig,
			currentConfig: this.config,
		});
	}
}

// Global monitor instance
export const connectionPoolMonitor = new ConnectionPoolMonitor();

// Utility functions for external use
export async function getConnectionPoolHealth(): Promise<PoolHealthStatus> {
	return connectionPoolMonitor.getCurrentHealthStatus();
}

export function getConnectionPoolStats(): ReturnType<typeof connectionPoolMonitor.getPerformanceStats> {
	return connectionPoolMonitor.getPerformanceStats();
}

export function recordDatabaseQuery(queryType: string, executionTime: number, success: boolean, error?: Error): void {
	connectionPoolMonitor.recordQuery(queryType, executionTime, success, error);
}

export function recordConnectionAcquisition(acquisitionTime: number): void {
	connectionPoolMonitor.recordConnectionAcquisition(acquisitionTime);
}

// Utility function to wrap Prisma queries with monitoring
export function withQueryMonitoring<T>(
	queryName: string,
	queryPromise: Prisma.PrismaPromise<T>,
): Prisma.PrismaPromise<T> {
	const start = Date.now();
	let success = true;
	let error: Error | undefined;

	return queryPromise
		.then(
			(result) => {
				success = true;
				return result;
			},
			(e) => {
				success = false;
				error = e instanceof Error ? e : new Error("Unknown error");
				throw e;
			},
		)
		.finally(() => {
			const executionTime = Date.now() - start;
			connectionPoolMonitor.recordQuery(queryName, executionTime, success, error);
		}) as Prisma.PrismaPromise<T>;
}

// Automatic monitoring startup
console.log("[ConnectionPoolMonitor] Connection pool monitoring initialized");

// Graceful shutdown handling
process.on("SIGTERM", () => {
	console.log("[ConnectionPoolMonitor] Received SIGTERM, shutting down monitoring...");
	connectionPoolMonitor.shutdown();
});

process.on("SIGINT", () => {
	console.log("[ConnectionPoolMonitor] Received SIGINT, shutting down monitoring...");
	connectionPoolMonitor.shutdown();
});
