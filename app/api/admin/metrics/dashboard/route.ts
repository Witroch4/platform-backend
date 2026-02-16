/**
 * Metrics Dashboard Data Endpoint
 * Based on requirements 10.3, 10.4, 11.2
 */

import { NextRequest, NextResponse } from "next/server";
import { aiMetrics } from "../../../../../lib/ai-integration/utils/metrics";
import { logAggregator } from "../../../../../lib/ai-integration/utils/log-aggregation";
import { aiLogger } from "../../../../../lib/ai-integration/utils/logger";

interface DashboardData {
	overview: {
		totalJobs: number;
		successRate: number;
		errorRate: number;
		avgLatency: number;
		activeWorkers: number;
	};
	latency: {
		p50: number;
		p95: number;
		p99: number;
		byStage: Record<string, number>;
	};
	fallbacks: {
		total: number;
		rate: number;
		byReason: Record<string, number>;
	};
	dlq: {
		total: number;
		byReason: Record<string, number>;
		recentErrors: Array<{
			timestamp: string;
			reason: string;
			jobId: string;
			accountId?: number;
		}>;
	};
	rateLimits: {
		total: number;
		byScope: Record<string, number>;
		recentHits: Array<{
			timestamp: string;
			scope: string;
			accountId?: number;
		}>;
	};
	tokens: {
		totalToday: number;
		byModel: Record<string, number>;
		byAccount: Record<string, number>;
		costUsd: number;
	};
	queues: {
		[queueName: string]: {
			waiting: number;
			active: number;
			completed: number;
			failed: number;
			lag: number;
		};
	};
	alerts: Array<{
		level: "warning" | "critical";
		message: string;
		timestamp: string;
		metric: string;
		value: number;
		threshold: number;
	}>;
}

// Calculate percentiles from histogram buckets
function calculatePercentiles(
	buckets: Array<{ le: number; count: number }>,
	totalCount: number,
): {
	p50: number;
	p95: number;
	p99: number;
} {
	if (totalCount === 0) return { p50: 0, p95: 0, p99: 0 };

	const p50Target = totalCount * 0.5;
	const p95Target = totalCount * 0.95;
	const p99Target = totalCount * 0.99;

	let p50 = 0,
		p95 = 0,
		p99 = 0;
	let cumulativeCount = 0;

	for (const bucket of buckets) {
		cumulativeCount += bucket.count;

		if (p50 === 0 && cumulativeCount >= p50Target) {
			p50 = bucket.le === Infinity ? buckets[buckets.length - 2]?.le || 0 : bucket.le;
		}
		if (p95 === 0 && cumulativeCount >= p95Target) {
			p95 = bucket.le === Infinity ? buckets[buckets.length - 2]?.le || 0 : bucket.le;
		}
		if (p99 === 0 && cumulativeCount >= p99Target) {
			p99 = bucket.le === Infinity ? buckets[buckets.length - 2]?.le || 0 : bucket.le;
		}
	}

	return { p50, p95, p99 };
}

// Check for alert conditions
function checkAlerts(metrics: any[]): DashboardData["alerts"] {
	const alerts: DashboardData["alerts"] = [];
	const now = new Date().toISOString();

	// Check error rate
	const errorRate = logAggregator.getErrorRate(5); // 5 minute window
	if (errorRate > 0.05) {
		// 5% threshold
		alerts.push({
			level: errorRate > 0.1 ? "critical" : "warning",
			message: `High error rate: ${(errorRate * 100).toFixed(1)}%`,
			timestamp: now,
			metric: "error_rate",
			value: errorRate,
			threshold: 0.05,
		});
	}

	// Check queue backlog
	const queueMetrics = metrics.filter((m) => m.name === "ai_jobs_in_queue");
	queueMetrics.forEach((metric) => {
		const value = metric.type === "histogram" ? metric.count : metric.value;
		if (value > 100) {
			alerts.push({
				level: value > 500 ? "critical" : "warning",
				message: `Queue backlog: ${value} jobs in ${metric.labels.queue_name}`,
				timestamp: now,
				metric: "queue_backlog",
				value,
				threshold: 100,
			});
		}
	});

	// Check latency
	const latencyMetrics = metrics.filter((m) => m.name === "ai_job_latency_ms" && m.type === "histogram");
	latencyMetrics.forEach((metric) => {
		if (metric.type === "histogram") {
			const percentiles = calculatePercentiles(metric.buckets, metric.count);
			if (percentiles.p95 > 2500) {
				// 2.5s threshold
				alerts.push({
					level: percentiles.p95 > 5000 ? "critical" : "warning",
					message: `High latency: P95 ${percentiles.p95}ms for ${metric.labels.stage}`,
					timestamp: now,
					metric: "latency_p95",
					value: percentiles.p95,
					threshold: 2500,
				});
			}
		}
	});

	return alerts;
}

export async function GET(request: NextRequest) {
	const startTime = Date.now();

	try {
		// Basic auth check (you might want to implement proper admin auth)
		const authHeader = request.headers.get("authorization");
		const expectedAuth = process.env.ADMIN_AUTH_TOKEN;

		if (expectedAuth && authHeader !== `Bearer ${expectedAuth}`) {
			return new NextResponse("Unauthorized", { status: 401 });
		}

		// Get all metrics
		const metrics = aiMetrics.getMetrics();
		const logStats = logAggregator.getStats();

		// Calculate overview metrics
		const jobMetrics = metrics.filter((m) => m.name === "ai_jobs_total");
		const totalJobs = jobMetrics.reduce((sum, m) => sum + (m.type === "histogram" ? m.count : m.value), 0);
		const successJobs = jobMetrics
			.filter((m) => m.labels.status === "success")
			.reduce((sum, m) => sum + (m.type === "histogram" ? m.count : m.value), 0);
		const errorJobs = jobMetrics
			.filter((m) => m.labels.status === "error")
			.reduce((sum, m) => sum + (m.type === "histogram" ? m.count : m.value), 0);

		const successRate = totalJobs > 0 ? successJobs / totalJobs : 0;
		const errorRate = totalJobs > 0 ? errorJobs / totalJobs : 0;

		// Calculate latency metrics
		const latencyMetrics = metrics.filter((m) => m.name === "ai_job_latency_ms" && m.type === "histogram");
		let avgLatency = 0;
		let latencyByStage: Record<string, number> = {};
		let overallPercentiles = { p50: 0, p95: 0, p99: 0 };

		if (latencyMetrics.length > 0) {
			// Calculate overall percentiles from all latency metrics
			const allBuckets = new Map<number, number>();
			let totalCount = 0;
			let totalSum = 0;

			latencyMetrics.forEach((metric) => {
				if (metric.type === "histogram") {
					totalCount += metric.count;
					totalSum += metric.sum;

					metric.buckets.forEach((bucket) => {
						allBuckets.set(bucket.le, (allBuckets.get(bucket.le) || 0) + bucket.count);
					});

					// Calculate average latency by stage
					if (metric.count > 0) {
						latencyByStage[metric.labels.stage as string] = metric.sum / metric.count;
					}
				}
			});

			avgLatency = totalCount > 0 ? totalSum / totalCount : 0;

			const bucketArray = Array.from(allBuckets.entries())
				.map(([le, count]) => ({ le, count }))
				.sort((a, b) => a.le - b.le);

			overallPercentiles = calculatePercentiles(bucketArray, totalCount);
		}

		// Calculate fallback metrics
		const fallbackMetrics = metrics.filter((m) => m.name === "ai_fallback_total");
		const totalFallbacks = fallbackMetrics.reduce((sum, m) => sum + (m.type === "histogram" ? m.count : m.value), 0);
		const fallbackRate = totalJobs > 0 ? totalFallbacks / totalJobs : 0;
		const fallbacksByReason: Record<string, number> = {};
		fallbackMetrics.forEach((m) => {
			fallbacksByReason[m.labels.reason as string] = m.type === "histogram" ? m.count : m.value;
		});

		// Calculate DLQ metrics
		const dlqMetrics = metrics.filter((m) => m.name === "ai_jobs_dlq_total");
		const totalDLQ = dlqMetrics.reduce((sum, m) => sum + (m.type === "histogram" ? m.count : m.value), 0);
		const dlqByReason: Record<string, number> = {};
		dlqMetrics.forEach((m) => {
			dlqByReason[m.labels.reason as string] = m.type === "histogram" ? m.count : m.value;
		});

		// Get recent errors from logs
		const recentErrors = logAggregator
			.search({
				level: "error",
				limit: 10,
				startTime: new Date(Date.now() - 60 * 60 * 1000), // Last hour
			})
			.logs.map((log) => ({
				timestamp: log.timestamp,
				reason: log.context.error || "Unknown error",
				jobId: log.context.jobId || "unknown",
				accountId: log.context.accountId,
			}));

		// Calculate rate limit metrics
		const rateLimitMetrics = metrics.filter((m) => m.name === "ai_ratelimit_hits_total");
		const totalRateLimits = rateLimitMetrics.reduce((sum, m) => sum + (m.type === "histogram" ? m.count : m.value), 0);
		const rateLimitsByScope: Record<string, number> = {};
		rateLimitMetrics.forEach((m) => {
			rateLimitsByScope[m.labels.scope as string] = m.type === "histogram" ? m.count : m.value;
		});

		// Get recent rate limit hits from logs
		const recentRateLimits = logAggregator
			.search({
				message: "Rate limit hit",
				limit: 10,
				startTime: new Date(Date.now() - 60 * 60 * 1000), // Last hour
			})
			.logs.map((log) => ({
				timestamp: log.timestamp,
				scope: log.context.metadata?.scope || "unknown",
				accountId: log.context.accountId,
			}));

		// Calculate token metrics
		const tokenMetrics = metrics.filter((m) => m.name === "ai_llm_tokens_total" && m.type === "histogram");
		let totalTokensToday = 0;
		const tokensByModel: Record<string, number> = {};
		const tokensByAccount: Record<string, number> = {};

		// Calculate cost (simplified - you'd want more sophisticated cost calculation)
		let totalCostUsd = 0;
		const costPerToken = 0.00001; // Example cost per token

		tokenMetrics.forEach((metric) => {
			if (metric.type === "histogram") {
				totalTokensToday += metric.sum;
				totalCostUsd += metric.sum * costPerToken;

				const model = metric.labels.model as string;
				const accountId = metric.labels.account_id as string;

				tokensByModel[model] = (tokensByModel[model] || 0) + metric.sum;
				tokensByAccount[accountId] = (tokensByAccount[accountId] || 0) + metric.sum;
			}
		});

		// Get queue metrics
		const queueMetrics = metrics.filter((m) => m.name === "ai_jobs_in_queue");
		const queues: DashboardData["queues"] = {};
		queueMetrics.forEach((metric) => {
			const queueName = metric.labels.queue_name as string;
			queues[queueName] = {
				waiting: metric.type === "histogram" ? metric.count : metric.value,
				active: 0, // Would need separate metric
				completed: 0, // Would need separate metric
				failed: 0, // Would need separate metric
				lag: 0, // Would need queue lag metric
			};
		});

		// Get active workers
		const workerMetrics = metrics.filter((m) => m.name === "ai_active_workers");
		const activeWorkers = workerMetrics.reduce((sum, m) => sum + (m.type === "histogram" ? m.count : m.value), 0);

		// Check for alerts
		const alerts = checkAlerts(metrics);

		const dashboardData: DashboardData = {
			overview: {
				totalJobs,
				successRate,
				errorRate,
				avgLatency,
				activeWorkers,
			},
			latency: {
				p50: overallPercentiles.p50,
				p95: overallPercentiles.p95,
				p99: overallPercentiles.p99,
				byStage: latencyByStage,
			},
			fallbacks: {
				total: totalFallbacks,
				rate: fallbackRate,
				byReason: fallbacksByReason,
			},
			dlq: {
				total: totalDLQ,
				byReason: dlqByReason,
				recentErrors,
			},
			rateLimits: {
				total: totalRateLimits,
				byScope: rateLimitsByScope,
				recentHits: recentRateLimits,
			},
			tokens: {
				totalToday: totalTokensToday,
				byModel: tokensByModel,
				byAccount: tokensByAccount,
				costUsd: totalCostUsd,
			},
			queues,
			alerts,
		};

		const duration = Date.now() - startTime;
		aiLogger.info("Dashboard data generated", {
			stage: "admin",
			duration,
			metadata: {
				metricsCount: metrics.length,
				alertsCount: alerts.length,
			},
		});

		return NextResponse.json(dashboardData);
	} catch (error) {
		const duration = Date.now() - startTime;

		aiLogger.errorWithStack("Dashboard data generation failed", error as Error, {
			stage: "admin",
			duration,
		});

		return new NextResponse("Internal Server Error", { status: 500 });
	}
}
