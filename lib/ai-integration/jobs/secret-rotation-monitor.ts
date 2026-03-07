/**
 * Secret Rotation Monitor Job
 *
 * BullMQ job that monitors secret rotation status and sends alerts
 * when secrets are due for rotation or overdue.
 */

import { Job } from "bullmq";
import log from "@/lib/log";
import {
	getSecretsNeedingRotation,
	generateRotationReport,
	scheduleRotationReminders,
} from "../services/secret-rotation";
import { logAuditTrail } from "../services/access-control";

/**
 * Interface for rotation monitor job data
 */
export interface RotationMonitorJobData {
	checkType: "daily" | "weekly" | "manual";
	sendAlerts?: boolean;
	generateReport?: boolean;
}

/**
 * Interface for rotation monitor job result
 */
export interface RotationMonitorJobResult {
	timestamp: string;
	checkType: string;
	secretsChecked: number;
	overdueSecrets: number;
	dueSoonSecrets: number;
	inOverlapSecrets: number;
	alertsSent: number;
	reportGenerated: boolean;
	recommendations: string[];
}

/**
 * Processes the secret rotation monitor job
 */
export async function processSecretRotationMonitorJob(
	job: Job<RotationMonitorJobData>,
): Promise<RotationMonitorJobResult> {
	const { checkType, sendAlerts = true, generateReport = true } = job.data;

	try {
		log.info("Starting secret rotation monitor job", {
			jobId: job.id,
			checkType,
			sendAlerts,
			generateReport,
		});

		// Get secrets needing rotation
		const { overdue, dueSoon, inOverlap } = await getSecretsNeedingRotation();

		const result: RotationMonitorJobResult = {
			timestamp: new Date().toISOString(),
			checkType,
			secretsChecked: overdue.length + dueSoon.length + inOverlap.length,
			overdueSecrets: overdue.length,
			dueSoonSecrets: dueSoon.length,
			inOverlapSecrets: inOverlap.length,
			alertsSent: 0,
			reportGenerated: false,
			recommendations: [],
		};

		// Generate recommendations
		if (overdue.length > 0) {
			result.recommendations.push(`🔴 ${overdue.length} secrets are overdue for rotation`);
			overdue.forEach((secret) => {
				result.recommendations.push(`  - ${secret.secretName}: ${Math.abs(secret.daysUntilRotation)} days overdue`);
			});
		}

		if (dueSoon.length > 0) {
			result.recommendations.push(`🟡 ${dueSoon.length} secrets due for rotation soon`);
			dueSoon.forEach((secret) => {
				result.recommendations.push(`  - ${secret.secretName}: ${secret.daysUntilRotation} days remaining`);
			});
		}

		if (inOverlap.length > 0) {
			result.recommendations.push(`ℹ️ ${inOverlap.length} secrets in overlap window (cleanup old keys)`);
			inOverlap.forEach((secret) => {
				result.recommendations.push(`  - ${secret.secretName}: overlap ends ${secret.overlapEndsAt?.toISOString()}`);
			});
		}

		// Send alerts if enabled
		if (sendAlerts) {
			await scheduleRotationReminders();

			// Count alerts sent (in a real implementation, this would track actual alerts)
			result.alertsSent = overdue.length + dueSoon.length;

			// Emit metrics for monitoring
			await emitRotationMetrics(overdue.length, dueSoon.length, inOverlap.length);
		}

		// Generate report if enabled
		if (generateReport) {
			const report = await generateRotationReport();

			// In a real implementation, this would save the report or send it via email
			log.info("Secret rotation report generated", {
				reportLength: report.length,
				overdueCount: overdue.length,
				dueSoonCount: dueSoon.length,
			});

			result.reportGenerated = true;
		}

		// Log audit trail for monitoring job
		await logAuditTrail({
			userId: null,
			action: "SECRET_ROTATION_MONITOR",
			resourceType: "AI_SECRET_ROTATION",
			details: {
				checkType,
				overdueSecrets: overdue.length,
				dueSoonSecrets: dueSoon.length,
				inOverlapSecrets: inOverlap.length,
				alertsSent: result.alertsSent,
				reportGenerated: result.reportGenerated,
			},
			success: true,
		});

		// Update job progress
		await job.updateProgress(100);

		log.info("Secret rotation monitor job completed", {
			jobId: job.id,
			...result,
		});

		return result;
	} catch (error) {
		log.error("Secret rotation monitor job failed", {
			jobId: job.id,
			error,
			data: job.data,
		});

		// Log audit trail for failed job
		await logAuditTrail({
			userId: null,
			action: "SECRET_ROTATION_MONITOR_FAILED",
			resourceType: "AI_SECRET_ROTATION",
			details: {
				checkType,
				error: error instanceof Error ? error.message : "Unknown error",
			},
			success: false,
			errorMessage: error instanceof Error ? error.message : "Unknown error",
		});

		throw error;
	}
}

/**
 * Emits metrics for secret rotation monitoring
 */
async function emitRotationMetrics(overdueCount: number, dueSoonCount: number, inOverlapCount: number): Promise<void> {
	try {
		// In a real implementation, this would emit metrics to Prometheus/OpenTelemetry
		// For now, we'll log structured metrics that can be picked up by log aggregation

		log.info("Secret rotation metrics", {
			metric: "ai_secret_rotation_events_total",
			labels: {
				type: "overdue",
			},
			value: overdueCount,
			timestamp: new Date().toISOString(),
		});

		log.info("Secret rotation metrics", {
			metric: "ai_secret_rotation_events_total",
			labels: {
				type: "due_soon",
			},
			value: dueSoonCount,
			timestamp: new Date().toISOString(),
		});

		log.info("Secret rotation metrics", {
			metric: "ai_secret_rotation_events_total",
			labels: {
				type: "in_overlap",
			},
			value: inOverlapCount,
			timestamp: new Date().toISOString(),
		});

		// Emit alert metric if there are overdue secrets
		if (overdueCount > 0) {
			log.warn("Secret rotation alert", {
				metric: "ai_secret_rotation_alert_total",
				labels: {
					severity: "critical",
					type: "overdue",
				},
				value: overdueCount,
				timestamp: new Date().toISOString(),
			});
		}

		// Emit warning metric if there are secrets due soon
		if (dueSoonCount > 0) {
			log.warn("Secret rotation warning", {
				metric: "ai_secret_rotation_alert_total",
				labels: {
					severity: "warning",
					type: "due_soon",
				},
				value: dueSoonCount,
				timestamp: new Date().toISOString(),
			});
		}
	} catch (error) {
		log.error("Failed to emit rotation metrics", { error });
	}
}

/**
 * Gets the schedule for rotation monitoring jobs
 */
export function getRotationMonitorSchedule() {
	return {
		daily: {
			// Run daily at 9 AM
			pattern: "0 9 * * *",
			data: {
				checkType: "daily" as const,
				sendAlerts: true,
				generateReport: false,
			},
			opts: {
				removeOnComplete: 30, // Keep last 30 daily checks
				removeOnFail: 10, // Keep last 10 failed checks
				attempts: 2,
				backoff: {
					type: "exponential",
					delay: 5000,
				},
			},
		},
		weekly: {
			// Run weekly on Monday at 8 AM
			pattern: "0 8 * * 1",
			data: {
				checkType: "weekly" as const,
				sendAlerts: true,
				generateReport: true,
			},
			opts: {
				removeOnComplete: 12, // Keep last 12 weekly reports
				removeOnFail: 5, // Keep last 5 failed checks
				attempts: 3,
				backoff: {
					type: "exponential",
					delay: 10000,
				},
			},
		},
	};
}

/**
 * Creates a manual rotation monitor job
 */
export async function createManualRotationMonitorJob(
	queue: any,
	options: Partial<RotationMonitorJobData> = {},
): Promise<Job<RotationMonitorJobData>> {
	try {
		const jobData: RotationMonitorJobData = {
			checkType: "manual",
			sendAlerts: false,
			generateReport: true,
			...options,
		};

		const job = await queue.add("secret-rotation-monitor", jobData, {
			priority: 5, // Medium priority for manual jobs
			removeOnComplete: 5,
			removeOnFail: 3,
			attempts: 1, // Don't retry manual jobs
		});

		log.info("Manual rotation monitor job created", {
			jobId: job.id,
			data: jobData,
		});

		return job;
	} catch (error) {
		log.error("Failed to create manual rotation monitor job", { error, options });
		throw error;
	}
}

/**
 * Gets rotation monitor job status and history
 */
export async function getRotationMonitorJobStatus(queue: any): Promise<{
	lastDaily?: {
		id: string;
		completedOn: number;
		returnvalue: RotationMonitorJobResult;
	};
	lastWeekly?: {
		id: string;
		completedOn: number;
		returnvalue: RotationMonitorJobResult;
	};
	nextScheduled?: {
		daily: number;
		weekly: number;
	};
	waiting: number;
	active: number;
	completed: number;
	failed: number;
}> {
	try {
		const [waiting, active, completed, failed] = await Promise.all([
			queue.getWaiting(),
			queue.getActive(),
			queue.getCompleted(0, 10), // Get last 10 completed
			queue.getFailed(0, 5), // Get last 5 failed
		]);

		const result: any = {
			waiting: waiting.length,
			active: active.length,
			completed: completed.length,
			failed: failed.length,
		};

		// Find last daily and weekly jobs
		const completedJobs = await queue.getCompleted(0, 50);

		const lastDaily = completedJobs.find((job: any) => job.data?.checkType === "daily" && job.returnvalue);

		const lastWeekly = completedJobs.find((job: any) => job.data?.checkType === "weekly" && job.returnvalue);

		if (lastDaily) {
			result.lastDaily = {
				id: lastDaily.id,
				completedOn: lastDaily.processedOn || lastDaily.finishedOn,
				returnvalue: lastDaily.returnvalue,
			};
		}

		if (lastWeekly) {
			result.lastWeekly = {
				id: lastWeekly.id,
				completedOn: lastWeekly.processedOn || lastWeekly.finishedOn,
				returnvalue: lastWeekly.returnvalue,
			};
		}

		// Calculate next scheduled times (simplified - in production use cron parser)
		const now = new Date();
		const tomorrow9AM = new Date(now);
		tomorrow9AM.setDate(tomorrow9AM.getDate() + 1);
		tomorrow9AM.setHours(9, 0, 0, 0);

		const nextMonday8AM = new Date(now);
		const daysUntilMonday = (1 + 7 - now.getDay()) % 7 || 7;
		nextMonday8AM.setDate(nextMonday8AM.getDate() + daysUntilMonday);
		nextMonday8AM.setHours(8, 0, 0, 0);

		result.nextScheduled = {
			daily: tomorrow9AM.getTime(),
			weekly: nextMonday8AM.getTime(),
		};

		return result;
	} catch (error) {
		log.error("Failed to get rotation monitor job status", { error });
		throw error;
	}
}

/**
 * Validates rotation monitor job data
 */
export function validateRotationMonitorJobData(data: any): RotationMonitorJobData {
	const validated: RotationMonitorJobData = {
		checkType: "manual",
	};

	if (["daily", "weekly", "manual"].includes(data?.checkType)) {
		validated.checkType = data.checkType;
	}

	if (typeof data?.sendAlerts === "boolean") {
		validated.sendAlerts = data.sendAlerts;
	}

	if (typeof data?.generateReport === "boolean") {
		validated.generateReport = data.generateReport;
	}

	return validated;
}
