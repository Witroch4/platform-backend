/**
 * Performance Metrics Collection for SocialWise Flow
 * Implements comprehensive monitoring and observability
 */

import { createLogger } from "@/lib/utils/logger";
import { getRedisInstance } from "@/lib/connections";

const metricsLogger = createLogger("SocialWise-Metrics");

export interface PerformanceMetrics {
	// Timing metrics
	embedding_ms?: number;
	llm_warmup_ms?: number;
	llm_microcopy_ms?: number;
	route_total_ms: number;

	// Classification metrics
	band: "HARD" | "SOFT" | "ROUTER";
	strategy_used: string;

	// Quality metrics
	timeout_occurred: boolean;
	json_parse_success: boolean;
	abort_occurred: boolean;

	// Context
	channel_type: string;
	user_id?: string;
	inbox_id?: string;
	trace_id?: string;
}

export interface ClassificationRates {
	direct_map_rate: number; // % of HARD band classifications
	warmup_rate: number; // % of SOFT band classifications
	vague_rate: number; // % of ROUTER band classifications
	router_rate: number; // % of ROUTER band classifications
	total_requests: number;
}

export interface ErrorRates {
	timeout_rate: number;
	json_parse_fail_rate: number;
	abort_rate: number;
	embedding_fail_rate: number;
	llm_fail_rate: number;
	total_errors: number;
	total_requests: number;
}

/**
 * Collect performance metrics for a request
 */
export async function collectPerformanceMetrics(metrics: PerformanceMetrics): Promise<void> {
	try {
		const redis = getRedisInstance();
		const timestamp = Date.now();
		const dateKey = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

		// Store individual metric
		const metricKey = `socialwise:metrics:${dateKey}:${timestamp}`;
		await redis.setex(metricKey, 86400, JSON.stringify(metrics)); // 24h TTL

		// Update aggregated counters
		const counterKey = `socialwise:counters:${dateKey}`;
		const pipeline = redis.pipeline();

		// Band counters
		pipeline.hincrby(counterKey, `band_${metrics.band.toLowerCase()}`, 1);
		pipeline.hincrby(counterKey, "total_requests", 1);

		// Timing histograms (simplified - store in buckets)
		const timingBucket = getTimingBucket(metrics.route_total_ms);
		pipeline.hincrby(counterKey, `timing_${timingBucket}`, 1);

		// Error counters
		if (metrics.timeout_occurred) {
			pipeline.hincrby(counterKey, "timeouts", 1);
		}
		if (!metrics.json_parse_success) {
			pipeline.hincrby(counterKey, "json_parse_failures", 1);
		}
		if (metrics.abort_occurred) {
			pipeline.hincrby(counterKey, "aborts", 1);
		}

		// Channel counters
		pipeline.hincrby(counterKey, `channel_${metrics.channel_type}`, 1);

		// Set expiry for counter key
		pipeline.expire(counterKey, 86400 * 7); // 7 days

		await pipeline.exec();

		// Log metrics for real-time monitoring
		metricsLogger.info("Performance metrics collected", {
			band: metrics.band,
			strategy: metrics.strategy_used,
			route_total_ms: metrics.route_total_ms,
			embedding_ms: metrics.embedding_ms,
			llm_warmup_ms: metrics.llm_warmup_ms,
			channel_type: metrics.channel_type,
			timeout_occurred: metrics.timeout_occurred,
			trace_id: metrics.trace_id,
		});
	} catch (error) {
		metricsLogger.error("Failed to collect metrics", {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/**
 * Get timing bucket for histogram
 */
function getTimingBucket(ms: number): string {
	if (ms < 50) return "0-50ms";
	if (ms < 100) return "50-100ms";
	if (ms < 200) return "100-200ms";
	if (ms < 400) return "200-400ms";
	if (ms < 800) return "400-800ms";
	if (ms < 1600) return "800-1600ms";
	return "1600ms+";
}

/**
 * Get classification rates for a date range
 */
export async function getClassificationRates(startDate: string, endDate: string): Promise<ClassificationRates> {
	try {
		const redis = getRedisInstance();
		const dates = getDateRange(startDate, endDate);

		let totalRequests = 0;
		let hardCount = 0;
		let softCount = 0;
		let lowCount = 0;
		let routerCount = 0;

		for (const date of dates) {
			const counterKey = `socialwise:counters:${date}`;
			const counters = await redis.hgetall(counterKey);

			totalRequests += parseInt(counters.total_requests || "0");
			hardCount += parseInt(counters.band_hard || "0");
			softCount += parseInt(counters.band_soft || "0");
			routerCount += parseInt(counters.band_router || "0");
		}

		return {
			direct_map_rate: totalRequests > 0 ? (hardCount / totalRequests) * 100 : 0,
			warmup_rate: totalRequests > 0 ? (softCount / totalRequests) * 100 : 0,
			vague_rate: totalRequests > 0 ? (lowCount / totalRequests) * 100 : 0,
			router_rate: totalRequests > 0 ? (routerCount / totalRequests) * 100 : 0,
			total_requests: totalRequests,
		};
	} catch (error) {
		metricsLogger.error("Failed to get classification rates", {
			error: error instanceof Error ? error.message : String(error),
		});

		return {
			direct_map_rate: 0,
			warmup_rate: 0,
			vague_rate: 0,
			router_rate: 0,
			total_requests: 0,
		};
	}
}

/**
 * Get error rates for a date range
 */
export async function getErrorRates(startDate: string, endDate: string): Promise<ErrorRates> {
	try {
		const redis = getRedisInstance();
		const dates = getDateRange(startDate, endDate);

		let totalRequests = 0;
		let timeouts = 0;
		let jsonParseFailures = 0;
		let aborts = 0;

		for (const date of dates) {
			const counterKey = `socialwise:counters:${date}`;
			const counters = await redis.hgetall(counterKey);

			totalRequests += parseInt(counters.total_requests || "0");
			timeouts += parseInt(counters.timeouts || "0");
			jsonParseFailures += parseInt(counters.json_parse_failures || "0");
			aborts += parseInt(counters.aborts || "0");
		}

		const totalErrors = timeouts + jsonParseFailures + aborts;

		return {
			timeout_rate: totalRequests > 0 ? (timeouts / totalRequests) * 100 : 0,
			json_parse_fail_rate: totalRequests > 0 ? (jsonParseFailures / totalRequests) * 100 : 0,
			abort_rate: totalRequests > 0 ? (aborts / totalRequests) * 100 : 0,
			embedding_fail_rate: 0, // TODO: Implement embedding failure tracking
			llm_fail_rate: 0, // TODO: Implement LLM failure tracking
			total_errors: totalErrors,
			total_requests: totalRequests,
		};
	} catch (error) {
		metricsLogger.error("Failed to get error rates", {
			error: error instanceof Error ? error.message : String(error),
		});

		return {
			timeout_rate: 0,
			json_parse_fail_rate: 0,
			abort_rate: 0,
			embedding_fail_rate: 0,
			llm_fail_rate: 0,
			total_errors: 0,
			total_requests: 0,
		};
	}
}

/**
 * Get performance percentiles for a date range
 */
export async function getPerformancePercentiles(
	startDate: string,
	endDate: string,
): Promise<{ p50: number; p95: number; p99: number }> {
	try {
		const redis = getRedisInstance();
		const dates = getDateRange(startDate, endDate);

		const allTimings: number[] = [];

		for (const date of dates) {
			const pattern = `socialwise:metrics:${date}:*`;
			const keys = await redis.keys(pattern);

			for (const key of keys) {
				const metricData = await redis.get(key);
				if (metricData) {
					try {
						const metric: PerformanceMetrics = JSON.parse(metricData);
						allTimings.push(metric.route_total_ms);
					} catch {
						// Skip invalid JSON
					}
				}
			}
		}

		if (allTimings.length === 0) {
			return { p50: 0, p95: 0, p99: 0 };
		}

		allTimings.sort((a, b) => a - b);

		const p50Index = Math.floor(allTimings.length * 0.5);
		const p95Index = Math.floor(allTimings.length * 0.95);
		const p99Index = Math.floor(allTimings.length * 0.99);

		return {
			p50: allTimings[p50Index] || 0,
			p95: allTimings[p95Index] || 0,
			p99: allTimings[p99Index] || 0,
		};
	} catch (error) {
		metricsLogger.error("Failed to get performance percentiles", {
			error: error instanceof Error ? error.message : String(error),
		});

		return { p50: 0, p95: 0, p99: 0 };
	}
}

/**
 * Generate date range array
 */
function getDateRange(startDate: string, endDate: string): string[] {
	const dates: string[] = [];
	const start = new Date(startDate);
	const end = new Date(endDate);

	for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
		dates.push(d.toISOString().split("T")[0]);
	}

	return dates;
}

/**
 * Create performance metrics object
 */
export function createPerformanceMetrics(
	band: "HARD" | "SOFT" | "ROUTER",
	strategy: string,
	routeTotalMs: number,
	context: {
		channelType: string;
		userId?: string;
		inboxId?: string;
		traceId?: string;
		embeddingMs?: number;
		llmWarmupMs?: number;
		llmMicrocopyMs?: number;
		timeoutOccurred?: boolean;
		jsonParseSuccess?: boolean;
		abortOccurred?: boolean;
	},
): PerformanceMetrics {
	return {
		embedding_ms: context.embeddingMs,
		llm_warmup_ms: context.llmWarmupMs,
		llm_microcopy_ms: context.llmMicrocopyMs,
		route_total_ms: routeTotalMs,
		band,
		strategy_used: strategy,
		timeout_occurred: context.timeoutOccurred || false,
		json_parse_success: context.jsonParseSuccess !== false,
		abort_occurred: context.abortOccurred || false,
		channel_type: context.channelType,
		user_id: context.userId,
		inbox_id: context.inboxId,
		trace_id: context.traceId,
	};
}
