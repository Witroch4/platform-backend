import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { queueMonitor } from "../../../../../lib/monitoring/queue-monitor";
import { validateInput, handleApiError, createSuccessResponse } from "../../../../../lib/utils/api-helpers";

// Validation schemas
const JobActionSchema = z.object({
	action: z.enum(["retry", "remove", "promote", "delay", "cancel"]),
	queueName: z.string(),
	options: z
		.object({
			delay: z.number().int().min(0).optional(),
			priority: z.number().int().min(0).optional(),
			force: z.boolean().default(false),
		})
		.optional(),
});

const JobUpdateSchema = z.object({
	priority: z.number().int().min(0).optional(),
	delay: z.number().int().min(0).optional(),
	data: z.record(z.any()).optional(),
	options: z.record(z.any()).optional(),
});

/**
 * GET /api/admin/jobs/[jobId]
 * Get detailed information about a specific job
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
	try {
		const { jobId } = await params;
		const { searchParams } = new URL(request.url);
		const queueName = searchParams.get("queueName");
		const includePayload = searchParams.get("includePayload") === "true";
		const includeHistory = searchParams.get("includeHistory") === "true";

		if (!queueName) {
			return NextResponse.json(
				{
					success: false,
					error: {
						code: "MISSING_QUEUE_NAME",
						message: "Queue name is required to fetch job details",
						timestamp: new Date().toISOString(),
					},
				},
				{ status: 400 },
			);
		}

		// Find the job in the metrics history
		const jobMetrics = queueMonitor.getJobMetrics(queueName, 10000);
		const job = jobMetrics.find((j) => j.jobId === jobId);

		if (!job) {
			return NextResponse.json(
				{
					success: false,
					error: {
						code: "JOB_NOT_FOUND",
						message: `Job not found: ${jobId}`,
						timestamp: new Date().toISOString(),
					},
				},
				{ status: 404 },
			);
		}

		// Format job data
		const jobDetails = {
			...job,
			createdAt: job.createdAt.toISOString(),
			processedAt: job.processedAt?.toISOString(),
			finishedAt: job.finishedAt?.toISOString(),
		};

		// TODO: Get additional job details from BullMQ
		// This would include:
		// - Full job payload (if includePayload is true)
		// - Job options and configuration
		// - Retry history and logs
		// - Progress information
		// - Stack trace for failed jobs

		const response: any = {
			job: jobDetails,
			metadata: {
				includePayload,
				includeHistory,
			},
		};

		if (includePayload) {
			response.payload = {
				message: "Job payload retrieval - implementation pending",
			};
		}

		if (includeHistory) {
			response.history = {
				message: "Job history retrieval - implementation pending",
			};
		}

		return createSuccessResponse({
			...response,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		return handleApiError(error, `Failed to fetch job details for ${(await params).jobId}`);
	}
}

/**
 * PUT /api/admin/jobs/[jobId]
 * Update job properties (limited to certain fields)
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
	try {
		const { jobId } = await params;
		const body = await request.json();
		const updates = JobUpdateSchema.parse(body);
		const { searchParams } = new URL(request.url);
		const queueName = searchParams.get("queueName");

		if (!queueName) {
			return NextResponse.json(
				{
					success: false,
					error: {
						code: "MISSING_QUEUE_NAME",
						message: "Queue name is required to update job",
						timestamp: new Date().toISOString(),
					},
				},
				{ status: 400 },
			);
		}

		// Check if job exists
		const jobMetrics = queueMonitor.getJobMetrics(queueName, 10000);
		const job = jobMetrics.find((j) => j.jobId === jobId);

		if (!job) {
			return NextResponse.json(
				{
					success: false,
					error: {
						code: "JOB_NOT_FOUND",
						message: `Job not found: ${jobId}`,
						timestamp: new Date().toISOString(),
					},
				},
				{ status: 404 },
			);
		}

		// TODO: Implement job update
		// This would involve:
		// 1. Getting the actual BullMQ job instance
		// 2. Updating allowed properties (priority, delay, etc.)
		// 3. Validating that the job is in a state that allows updates

		return createSuccessResponse({
			message: "Job update - implementation pending",
			jobId,
			queueName,
			updates,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		return handleApiError(error, `Failed to update job ${(await params).jobId}`);
	}
}

/**
 * POST /api/admin/jobs/[jobId]/actions
 * Perform actions on a specific job
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
	try {
		const { jobId } = await params;
		const body = await request.json();
		const { action, queueName, options } = JobActionSchema.parse(body);

		// Check if job exists
		const jobMetrics = queueMonitor.getJobMetrics(queueName, 10000);
		const job = jobMetrics.find((j) => j.jobId === jobId);

		if (!job) {
			return NextResponse.json(
				{
					success: false,
					error: {
						code: "JOB_NOT_FOUND",
						message: `Job not found: ${jobId}`,
						timestamp: new Date().toISOString(),
					},
				},
				{ status: 404 },
			);
		}

		let result = false;
		let message = "";
		let details: any = undefined;

		// TODO: Implement job actions
		// This would involve getting the actual BullMQ job instance and performing the action

		switch (action) {
			case "retry":
				// TODO: Implement job retry
				message = "Job retry - implementation pending";
				details = {
					previousAttempts: job.attempts,
					maxAttempts: job.maxAttempts,
				};
				break;

			case "remove":
				// TODO: Implement job removal
				message = "Job removal - implementation pending";
				details = { force: options?.force };
				break;

			case "promote":
				// TODO: Implement job promotion (move to front of queue)
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
				details = { force: options?.force };
				break;

			default:
				throw new Error(`Unknown action: ${action}`);
		}

		return createSuccessResponse({
			success: result,
			message,
			jobId,
			queueName,
			action,
			details,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		return handleApiError(error, `Failed to perform action on job ${(await params).jobId}`);
	}
}

/**
 * DELETE /api/admin/jobs/[jobId]
 * Delete a specific job
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
	try {
		const { jobId } = await params;
		const { searchParams } = new URL(request.url);
		const queueName = searchParams.get("queueName");
		const force = searchParams.get("force") === "true";

		if (!queueName) {
			return NextResponse.json(
				{
					success: false,
					error: {
						code: "MISSING_QUEUE_NAME",
						message: "Queue name is required to delete job",
						timestamp: new Date().toISOString(),
					},
				},
				{ status: 400 },
			);
		}

		// Check if job exists
		const jobMetrics = queueMonitor.getJobMetrics(queueName, 10000);
		const job = jobMetrics.find((j) => j.jobId === jobId);

		if (!job) {
			return NextResponse.json(
				{
					success: false,
					error: {
						code: "JOB_NOT_FOUND",
						message: `Job not found: ${jobId}`,
						timestamp: new Date().toISOString(),
					},
				},
				{ status: 404 },
			);
		}

		// TODO: Implement job deletion
		// This would involve:
		// 1. Getting the actual BullMQ job instance
		// 2. Checking if the job can be safely deleted
		// 3. Removing the job from the queue
		// 4. Optionally forcing deletion even if job is active

		return createSuccessResponse({
			message: "Job deletion - implementation pending",
			jobId,
			queueName,
			force,
			jobStatus: job.status,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		return handleApiError(error, `Failed to delete job ${(await params).jobId}`);
	}
}
