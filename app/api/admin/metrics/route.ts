import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { queueMonitor } from "../../../../lib/monitoring/queue-monitor";
import { validateInput, handleApiError, createSuccessResponse } from "../../../../lib/utils/api-helpers";

// Validation schemas
const MetricsQuerySchema = z.object({
	queueName: z.string().optional(),
	timeRange: z.enum(["1h", "6h", "24h", "7d", "30d"]).default("24h"),
	granularity: z.enum(["1m", "5m", "15m", "1h", "1d"]).default("5m"),
	metrics: z
		.array(
			z.enum([
				"throughput",
				"latency",
				"success_rate",
				"error_rate",
				"queue_depth",
				"processing_time",
				"wait_time",
				"retry_rate",
			]),
		)
		.default(["throughput", "latency", "success_rate"]),
	format: z.enum(["json", "csv", "prometheus"]).default("json"),
	includeJobMetrics: z.coerce.boolean().default(false),
	aggregation: z.enum(["avg", "sum", "max", "min", "p50", "p95", "p99"]).default("avg"),
});

const MetricsExportSchema = z.object({
	queueNames: z.array(z.string()).optional(),
	timeRange: z.object({
		start: z.string().datetime(),
		end: z.string().datetime(),
	}),
	metrics: z.array(z.string()),
	format: z.enum(["json", "csv"]),
	includeJobDetails: z.boolean().default(false),
	filters: z
		.object({
			jobTypes: z.array(z.string()).optional(),
			statuses: z.array(z.string()).optional(),
			correlationIds: z.array(z.string()).optional(),
		})
		.optional(),
});

/**
 * GET /api/admin/metrics
 * Retrieve metrics data with various aggregations and formats
 */
export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const query = MetricsQuerySchema.parse(Object.fromEntries(searchParams));

		// Calculate time range
		const timeRangeMs = getTimeRangeMs(query.timeRange);
		const endTime = new Date();
		const startTime = new Date(endTime.getTime() - timeRangeMs);

		let metricsData: any = {};

		if (query.queueName) {
			// Get metrics for specific queue
			metricsData = await getQueueMetrics(query.queueName, startTime, endTime, query);
		} else {
			// Get metrics for all queues
			const dashboard = queueMonitor.getQueueDashboard();
			metricsData = {
				overview: dashboard.overview,
				queues: {},
			};

			for (const queue of dashboard.queues) {
				metricsData.queues[queue.name] = await getQueueMetrics(queue.name, startTime, endTime, query);
			}
		}

		// Format response based on requested format
		switch (query.format) {
			case "json":
				return createSuccessResponse({
					metrics: metricsData,
					metadata: {
						timeRange: {
							start: startTime.toISOString(),
							end: endTime.toISOString(),
							duration: query.timeRange,
						},
						granularity: query.granularity,
						aggregation: query.aggregation,
						requestedMetrics: query.metrics,
						includeJobMetrics: query.includeJobMetrics,
					},
					timestamp: new Date().toISOString(),
				});

			case "csv":
				const csvData = formatMetricsAsCSV(metricsData, query);
				return new NextResponse(csvData, {
					headers: {
						"Content-Type": "text/csv",
						"Content-Disposition": `attachment; filename="queue-metrics-${Date.now()}.csv"`,
					},
				});

			case "prometheus":
				const prometheusData = formatMetricsAsPrometheus(metricsData, query);
				return new NextResponse(prometheusData, {
					headers: {
						"Content-Type": "text/plain; version=0.0.4",
					},
				});

			default:
				throw new Error(`Unsupported format: ${query.format}`);
		}
	} catch (error) {
		return handleApiError(error, "Failed to fetch metrics");
	}
}

/**
 * POST /api/admin/metrics/export
 * Export metrics data with custom time ranges and filters
 */
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const exportConfig = MetricsExportSchema.parse(body);

		const startTime = new Date(exportConfig.timeRange.start);
		const endTime = new Date(exportConfig.timeRange.end);

		// Validate time range
		if (startTime >= endTime) {
			return NextResponse.json(
				{
					success: false,
					error: {
						code: "INVALID_TIME_RANGE",
						message: "Start time must be before end time",
						timestamp: new Date().toISOString(),
					},
				},
				{ status: 400 },
			);
		}

		// Limit export time range to prevent excessive data
		const maxRangeMs = 30 * 24 * 60 * 60 * 1000; // 30 days
		if (endTime.getTime() - startTime.getTime() > maxRangeMs) {
			return NextResponse.json(
				{
					success: false,
					error: {
						code: "TIME_RANGE_TOO_LARGE",
						message: "Time range cannot exceed 30 days",
						timestamp: new Date().toISOString(),
					},
				},
				{ status: 400 },
			);
		}

		let exportData: any = {};

		if (exportConfig.queueNames && exportConfig.queueNames.length > 0) {
			// Export specific queues
			exportData.queues = {};
			for (const queueName of exportConfig.queueNames) {
				exportData.queues[queueName] = await getDetailedQueueMetrics(queueName, startTime, endTime, exportConfig);
			}
		} else {
			// Export all queues
			const dashboard = queueMonitor.getQueueDashboard();
			exportData.queues = {};

			for (const queue of dashboard.queues) {
				exportData.queues[queue.name] = await getDetailedQueueMetrics(queue.name, startTime, endTime, exportConfig);
			}
		}

		// Add export metadata
		exportData.metadata = {
			exportedAt: new Date().toISOString(),
			timeRange: {
				start: startTime.toISOString(),
				end: endTime.toISOString(),
			},
			metrics: exportConfig.metrics,
			filters: exportConfig.filters,
			includeJobDetails: exportConfig.includeJobDetails,
		};

		// Format and return data
		switch (exportConfig.format) {
			case "json":
				return createSuccessResponse(exportData);

			case "csv":
				const csvData = formatExportAsCSV(exportData);
				return new NextResponse(csvData, {
					headers: {
						"Content-Type": "text/csv",
						"Content-Disposition": `attachment; filename="queue-export-${Date.now()}.csv"`,
					},
				});

			default:
				throw new Error(`Unsupported export format: ${exportConfig.format}`);
		}
	} catch (error) {
		return handleApiError(error, "Failed to export metrics");
	}
}

// Helper functions
async function getQueueMetrics(queueName: string, startTime: Date, endTime: Date, query: any): Promise<any> {
	const performance = queueMonitor.getQueuePerformanceStats(queueName, 60);
	const health = queueMonitor.getQueueHealth(queueName);

	const metrics: any = {
		queueName,
		health: health
			? {
					...health,
					timestamp: health.timestamp.toISOString(),
				}
			: null,
		performance,
	};

	// Add requested metrics
	if (query.metrics.includes("throughput") && performance) {
		metrics.throughput = performance.throughput;
	}

	if (query.metrics.includes("latency") && performance) {
		metrics.latency = {
			averageProcessingTime: performance.averageProcessingTime,
			averageWaitTime: performance.averageWaitTime,
		};
	}

	if (query.metrics.includes("success_rate") && performance) {
		metrics.successRate = performance.successRate;
	}

	if (query.metrics.includes("error_rate") && performance) {
		metrics.errorRate = performance.errorRate;
	}

	if (query.metrics.includes("retry_rate") && performance) {
		metrics.retryRate = performance.retryRate;
	}

	if (query.metrics.includes("queue_depth") && health) {
		metrics.queueDepth = {
			waiting: health.waiting,
			active: health.active,
			delayed: health.delayed,
			total: health.waiting + health.active + health.delayed,
		};
	}

	// Add job metrics if requested
	if (query.includeJobMetrics) {
		const jobMetrics = queueMonitor.getJobMetrics(queueName, 1000);
		const filteredJobs = jobMetrics.filter((job) => job.createdAt >= startTime && job.createdAt <= endTime);

		metrics.jobMetrics = {
			total: filteredJobs.length,
			byStatus: {
				waiting: filteredJobs.filter((j) => j.status === "waiting").length,
				active: filteredJobs.filter((j) => j.status === "active").length,
				completed: filteredJobs.filter((j) => j.status === "completed").length,
				failed: filteredJobs.filter((j) => j.status === "failed").length,
				delayed: filteredJobs.filter((j) => j.status === "delayed").length,
			},
			recentJobs: filteredJobs.slice(-10).map((job) => ({
				...job,
				createdAt: job.createdAt.toISOString(),
				processedAt: job.processedAt?.toISOString(),
				finishedAt: job.finishedAt?.toISOString(),
			})),
		};
	}

	return metrics;
}

async function getDetailedQueueMetrics(queueName: string, startTime: Date, endTime: Date, config: any): Promise<any> {
	const jobMetrics = queueMonitor.getJobMetrics(queueName, 10000);
	let filteredJobs = jobMetrics.filter((job) => job.createdAt >= startTime && job.createdAt <= endTime);

	// Apply filters
	if (config.filters) {
		if (config.filters.jobTypes) {
			filteredJobs = filteredJobs.filter((job) => config.filters.jobTypes.includes(job.jobName));
		}

		if (config.filters.statuses) {
			filteredJobs = filteredJobs.filter((job) => config.filters.statuses.includes(job.status));
		}

		if (config.filters.correlationIds) {
			filteredJobs = filteredJobs.filter(
				(job) => job.correlationId && config.filters.correlationIds.includes(job.correlationId),
			);
		}
	}

	const metrics = {
		queueName,
		timeRange: {
			start: startTime.toISOString(),
			end: endTime.toISOString(),
		},
		summary: {
			totalJobs: filteredJobs.length,
			byStatus: {
				waiting: filteredJobs.filter((j) => j.status === "waiting").length,
				active: filteredJobs.filter((j) => j.status === "active").length,
				completed: filteredJobs.filter((j) => j.status === "completed").length,
				failed: filteredJobs.filter((j) => j.status === "failed").length,
				delayed: filteredJobs.filter((j) => j.status === "delayed").length,
			},
			averageProcessingTime: calculateAverage(filteredJobs, "processingTime"),
			averageWaitTime: calculateAverage(filteredJobs, "waitTime"),
			successRate: calculateSuccessRate(filteredJobs),
		},
	};

	if (config.includeJobDetails) {
		(metrics as any).jobs = filteredJobs.map((job) => ({
			...job,
			createdAt: job.createdAt.toISOString(),
			processedAt: job.processedAt?.toISOString(),
			finishedAt: job.finishedAt?.toISOString(),
		}));
	}

	return metrics;
}

function formatMetricsAsCSV(metricsData: any, query: any): string {
	// TODO: Implement CSV formatting
	return "CSV formatting - implementation pending";
}

function formatMetricsAsPrometheus(metricsData: any, query: any): string {
	// TODO: Implement Prometheus format
	return "# Prometheus format - implementation pending";
}

function formatExportAsCSV(exportData: any): string {
	// TODO: Implement export CSV formatting
	return "Export CSV formatting - implementation pending";
}

function getTimeRangeMs(timeRange: string): number {
	switch (timeRange) {
		case "1h":
			return 60 * 60 * 1000;
		case "6h":
			return 6 * 60 * 60 * 1000;
		case "24h":
			return 24 * 60 * 60 * 1000;
		case "7d":
			return 7 * 24 * 60 * 60 * 1000;
		case "30d":
			return 30 * 24 * 60 * 60 * 1000;
		default:
			return 24 * 60 * 60 * 1000;
	}
}

function calculateAverage(jobs: any[], field: string): number {
	const validJobs = jobs.filter((job) => job[field] !== undefined && job[field] !== null);
	if (validJobs.length === 0) return 0;

	const sum = validJobs.reduce((acc, job) => acc + job[field], 0);
	return Math.round((sum / validJobs.length) * 100) / 100;
}

function calculateSuccessRate(jobs: any[]): number {
	if (jobs.length === 0) return 0;

	const completedJobs = jobs.filter((job) => job.status === "completed").length;
	const processedJobs = jobs.filter((job) => job.status === "completed" || job.status === "failed").length;

	if (processedJobs === 0) return 0;

	return Math.round((completedJobs / processedJobs) * 10000) / 100;
}
