import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { queueMonitor } from "../../../../lib/monitoring/queue-monitor";
import { validateInput, handleApiError, createSuccessResponse } from "../../../../lib/utils/api-helpers";

// Validation schemas
const JobQuerySchema = z.object({
	queueName: z.string().optional(),
	status: z.enum(["all", "waiting", "active", "completed", "failed", "delayed"]).default("all"),
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(1000).default(50),
	search: z.string().optional(),
	sortBy: z.enum(["createdAt", "processingTime", "waitTime", "attempts"]).default("createdAt"),
	sortOrder: z.enum(["asc", "desc"]).default("desc"),
	timeRange: z.enum(["1h", "6h", "24h", "7d", "30d"]).default("24h"),
	correlationId: z.string().optional(),
	jobType: z.string().optional(),
});

const JobActionSchema = z.object({
	action: z.enum(["retry", "remove", "promote", "delay", "cancel"]),
	jobIds: z.array(z.string()).min(1).max(1000),
	queueName: z.string(),
	options: z
		.object({
			delay: z.number().int().min(0).optional(),
			priority: z.number().int().min(0).optional(),
			force: z.boolean().default(false),
		})
		.optional(),
});

const JobCreateSchema = z.object({
	queueName: z.string().min(1),
	jobName: z.string().min(1),
	data: z.record(z.any()),
	options: z
		.object({
			priority: z.number().int().min(0).optional(),
			delay: z.number().int().min(0).optional(),
			attempts: z.number().int().min(1).max(10).optional(),
			backoff: z
				.union([
					z.number().int().min(0),
					z.object({
						type: z.enum(["fixed", "exponential"]),
						delay: z.number().int().min(0),
					}),
				])
				.optional(),
			removeOnComplete: z.number().int().min(0).optional(),
			removeOnFail: z.number().int().min(0).optional(),
		})
		.optional(),
});

/**
 * GET /api/admin/jobs
 * Retrieve jobs with filtering, pagination, and search
 */
export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const query = JobQuerySchema.parse(Object.fromEntries(searchParams));

		// Convert time range to milliseconds
		const timeRangeMs = getTimeRangeMs(query.timeRange);
		const cutoffTime = new Date(Date.now() - timeRangeMs);

		let allJobs: any[] = [];

		if (query.queueName) {
			// Get jobs from specific queue
			const jobs = queueMonitor.getJobMetrics(query.queueName, 10000);
			allJobs = jobs.filter((job) => job.createdAt >= cutoffTime);
		} else {
			// Get jobs from all queues
			const dashboard = queueMonitor.getQueueDashboard();
			for (const queue of dashboard.queues) {
				const jobs = queueMonitor.getJobMetrics(queue.name, 10000);
				const filteredJobs = jobs.filter((job) => job.createdAt >= cutoffTime);
				allJobs.push(...filteredJobs);
			}
		}

		// Apply filters
		let filteredJobs = allJobs;

		if (query.status !== "all") {
			filteredJobs = filteredJobs.filter((job) => job.status === query.status);
		}

		if (query.search) {
			const searchLower = query.search.toLowerCase();
			filteredJobs = filteredJobs.filter(
				(job) =>
					job.jobId.toLowerCase().includes(searchLower) ||
					job.jobName.toLowerCase().includes(searchLower) ||
					job.queueName.toLowerCase().includes(searchLower) ||
					job.correlationId?.toLowerCase().includes(searchLower),
			);
		}

		if (query.correlationId) {
			filteredJobs = filteredJobs.filter((job) => job.correlationId === query.correlationId);
		}

		if (query.jobType) {
			filteredJobs = filteredJobs.filter((job) => job.jobName === query.jobType);
		}

		// Apply sorting
		filteredJobs.sort((a, b) => {
			let aValue: any, bValue: any;

			switch (query.sortBy) {
				case "createdAt":
					aValue = a.createdAt.getTime();
					bValue = b.createdAt.getTime();
					break;
				case "processingTime":
					aValue = a.processingTime || 0;
					bValue = b.processingTime || 0;
					break;
				case "waitTime":
					aValue = a.waitTime || 0;
					bValue = b.waitTime || 0;
					break;
				case "attempts":
					aValue = a.attempts;
					bValue = b.attempts;
					break;
				default:
					aValue = a.createdAt.getTime();
					bValue = b.createdAt.getTime();
			}

			return query.sortOrder === "asc" ? aValue - bValue : bValue - aValue;
		});

		// Apply pagination
		const total = filteredJobs.length;
		const startIndex = (query.page - 1) * query.limit;
		const endIndex = startIndex + query.limit;
		const paginatedJobs = filteredJobs.slice(startIndex, endIndex);

		// Format jobs for response
		const formattedJobs = paginatedJobs.map((job) => ({
			...job,
			createdAt: job.createdAt.toISOString(),
			processedAt: job.processedAt?.toISOString(),
			finishedAt: job.finishedAt?.toISOString(),
		}));

		// Calculate summary statistics
		const summary = {
			total: filteredJobs.length,
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
		};

		return createSuccessResponse({
			jobs: formattedJobs,
			summary,
			pagination: {
				page: query.page,
				limit: query.limit,
				total,
				totalPages: Math.ceil(total / query.limit),
				hasNext: endIndex < total,
				hasPrev: query.page > 1,
			},
			filters: {
				queueName: query.queueName,
				status: query.status,
				search: query.search,
				timeRange: query.timeRange,
				correlationId: query.correlationId,
				jobType: query.jobType,
				sortBy: query.sortBy,
				sortOrder: query.sortOrder,
			},
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		return handleApiError(error, "Failed to fetch jobs");
	}
}

/**
 * POST /api/admin/jobs
 * Create a new job
 */
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { queueName, jobName, data, options } = JobCreateSchema.parse(body);

		// TODO: Implement job creation
		// This would involve:
		// 1. Getting the queue instance
		// 2. Adding the job with specified options
		// 3. Returning the created job details

		return createSuccessResponse(
			{
				message: "Job creation - implementation pending",
				queueName,
				jobName,
				data,
				options,
				timestamp: new Date().toISOString(),
			},
			201,
		);
	} catch (error) {
		return handleApiError(error, "Failed to create job");
	}
}

/**
 * PATCH /api/admin/jobs
 * Perform batch operations on jobs
 */
export async function PATCH(request: NextRequest) {
	try {
		const body = await request.json();
		const { action, jobIds, queueName, options } = JobActionSchema.parse(body);

		const results: Array<{
			jobId: string;
			success: boolean;
			message: string;
			details?: any;
		}> = [];

		// TODO: Implement batch job operations
		// This would involve:
		// 1. Getting the queue instance
		// 2. Performing the action on each job
		// 3. Collecting results

		for (const jobId of jobIds) {
			try {
				let result = false;
				let message = "";
				let details: any = undefined;

				switch (action) {
					case "retry":
						// TODO: Implement job retry
						message = "Job retry - implementation pending";
						break;

					case "remove":
						// TODO: Implement job removal
						message = "Job removal - implementation pending";
						break;

					case "promote":
						// TODO: Implement job promotion
						message = "Job promotion - implementation pending";
						break;

					case "delay":
						// TODO: Implement job delay
						message = "Job delay - implementation pending";
						details = { delay: options?.delay };
						break;

					case "cancel":
						// TODO: Implement job cancellation
						message = "Job cancellation - implementation pending";
						break;

					default:
						throw new Error(`Unknown action: ${action}`);
				}

				results.push({
					jobId,
					success: result,
					message,
					details,
				});
			} catch (error) {
				results.push({
					jobId,
					success: false,
					message: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}

		const successCount = results.filter((r) => r.success).length;
		const totalCount = results.length;

		return createSuccessResponse({
			action,
			queueName,
			summary: {
				total: totalCount,
				successful: successCount,
				failed: totalCount - successCount,
			},
			results,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		return handleApiError(error, "Failed to perform batch job operation");
	}
}

// Helper functions
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
