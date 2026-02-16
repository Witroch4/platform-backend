/**
 * Flow Analytics KPI Service
 *
 * Calculates executive-level Key Performance Indicators (KPIs) for Flow Engine analytics.
 * Provides comprehensive metrics including completion rates, abandonment rates, error rates,
 * timing metrics, and interaction metrics.
 *
 * @module lib/flow-analytics/kpi-service
 */

import { getPrismaInstance } from "@/lib/connections";
import type { Prisma } from "@prisma/client";
import { buildWhereClause as buildWhereClauseUtil } from "./filter-utils";

// Re-export for tests
export { buildWhereClause } from "./filter-utils";

/**
 * Dashboard filter options for KPI calculations
 */
export interface DashboardFilters {
	inboxId?: string;
	flowId?: string;
	dateRange?: {
		start: Date;
		end: Date;
		preset?: "today" | "last_7_days" | "last_30_days" | "custom";
	};
	campaign?: string;
	channelType?: "whatsapp" | "instagram" | "facebook";
	status?: string[];
	userTag?: string;
}

/**
 * Executive KPI metrics for flow performance monitoring
 */
export interface ExecutiveKPIs {
	totalExecutions: number;
	completionRate: number;
	abandonmentRate: number;
	avgTimeToCompletion: number; // milliseconds
	avgTimeToAbandonment: number; // milliseconds
	errorRate: number;
	startToEndRate: number;
	startToFirstInteractionRate: number;
	avgClickThroughRate: number;
	avgResponseRateAfterDelay: number;
}

/**
 * Execution log entry structure from FlowSession.executionLog
 */
interface ExecutionLogEntry {
	nodeId: string;
	nodeName?: string;
	nodeType: string;
	timestamp: number;
	durationMs?: number;
	deliveryMode?: "sync" | "async";
	result?: "ok" | "error" | "skipped";
	detail?: string;
	action?: string;
	buttonClicked?: string;
}

/**
 * Calculates all executive KPI metrics for the given filters
 *
 * Handles edge cases:
 * - Empty datasets: Returns 0 for all metrics
 * - Division by zero: Returns 0 instead of NaN or Infinity
 * - Missing data: Uses safe defaults
 *
 * @param filters - Dashboard filter options
 * @returns Promise resolving to ExecutiveKPIs object
 */
export async function calculateExecutiveKPIs(filters: DashboardFilters): Promise<ExecutiveKPIs> {
	const prisma = getPrismaInstance();
	const whereClause = buildWhereClauseUtil(filters);

	try {
		// Fetch all required counts in parallel for performance
		const [totalSessions, completedSessions, errorSessions, activeSessions, waitingInputSessions, sessionsWithTiming] =
			await Promise.all([
				// Total executions
				prisma.flowSession.count({ where: whereClause }),

				// Completed sessions
				prisma.flowSession.count({
					where: { ...whereClause, status: "COMPLETED" },
				}),

				// Error sessions
				prisma.flowSession.count({
					where: { ...whereClause, status: "ERROR" },
				}),

				// Active sessions
				prisma.flowSession.count({
					where: { ...whereClause, status: "ACTIVE" },
				}),

				// Waiting input sessions
				prisma.flowSession.count({
					where: { ...whereClause, status: "WAITING_INPUT" },
				}),

				// Sessions with timing data for detailed calculations
				prisma.flowSession.findMany({
					where: whereClause,
					select: {
						id: true,
						status: true,
						createdAt: true,
						completedAt: true,
						executionLog: true,
					},
				}),
			]);

		// Handle empty dataset
		if (totalSessions === 0) {
			return {
				totalExecutions: 0,
				completionRate: 0,
				abandonmentRate: 0,
				avgTimeToCompletion: 0,
				avgTimeToAbandonment: 0,
				errorRate: 0,
				startToEndRate: 0,
				startToFirstInteractionRate: 0,
				avgClickThroughRate: 0,
				avgResponseRateAfterDelay: 0,
			};
		}

		// Calculate basic rates
		const completionRate = (completedSessions / totalSessions) * 100;
		const errorRate = (errorSessions / totalSessions) * 100;

		// Abandonment = sessions that are not completed and not in error
		// (ACTIVE and WAITING_INPUT are considered abandoned if they're old enough)
		const abandonedSessions = totalSessions - completedSessions - errorSessions;
		const abandonmentRate = (abandonedSessions / totalSessions) * 100;

		// Calculate timing metrics
		let totalCompletionTime = 0;
		let completionCount = 0;
		let totalAbandonmentTime = 0;
		let abandonmentCount = 0;
		let startToEndCount = 0;
		let startToFirstInteractionCount = 0;
		let totalButtonClicks = 0;
		let totalInteractiveMessages = 0;
		let totalDelayNodes = 0;
		let responsesAfterDelay = 0;

		for (const session of sessionsWithTiming) {
			const executionLog = session.executionLog as unknown as ExecutionLogEntry[];

			// Calculate time to completion
			if (session.status === "COMPLETED" && session.completedAt) {
				const timeToComplete = session.completedAt.getTime() - session.createdAt.getTime();
				totalCompletionTime += timeToComplete;
				completionCount++;
			}

			// Calculate time to abandonment (for non-completed, non-error sessions)
			if (session.status !== "COMPLETED" && session.status !== "ERROR") {
				const timeToAbandon = (session.completedAt || new Date()).getTime() - session.createdAt.getTime();
				totalAbandonmentTime += timeToAbandon;
				abandonmentCount++;
			}

			// Analyze execution log for additional metrics
			if (Array.isArray(executionLog) && executionLog.length > 0) {
				const hasStartNode = executionLog.some((entry) => entry.nodeType === "START");
				const hasEndNode = executionLog.some((entry) => entry.nodeType === "END");

				// Start-to-end rate: sessions that visited both START and END nodes
				if (hasStartNode && hasEndNode) {
					startToEndCount++;
				}

				// Start-to-first-interaction rate: sessions that went from START to any interactive node
				if (hasStartNode) {
					const hasInteraction = executionLog.some(
						(entry) =>
							entry.nodeType === "INTERACTIVE_MESSAGE" ||
							entry.nodeType === "TEXT_MESSAGE" ||
							entry.nodeType === "MEDIA",
					);
					if (hasInteraction) {
						startToFirstInteractionCount++;
					}
				}

				// Count interactive messages and button clicks
				for (const entry of executionLog) {
					if (entry.nodeType === "INTERACTIVE_MESSAGE") {
						totalInteractiveMessages++;
						if (entry.buttonClicked || entry.action === "button_click") {
							totalButtonClicks++;
						}
					}

					// Count delay nodes and responses after them
					if (entry.nodeType === "DELAY") {
						totalDelayNodes++;
						// Check if there's a next node after this delay
						const currentIndex = executionLog.indexOf(entry);
						if (currentIndex < executionLog.length - 1) {
							responsesAfterDelay++;
						}
					}
				}
			}
		}

		// Calculate averages with division by zero protection
		const avgTimeToCompletion = completionCount > 0 ? totalCompletionTime / completionCount : 0;

		const avgTimeToAbandonment = abandonmentCount > 0 ? totalAbandonmentTime / abandonmentCount : 0;

		const startToEndRate = totalSessions > 0 ? (startToEndCount / totalSessions) * 100 : 0;

		const startToFirstInteractionRate = totalSessions > 0 ? (startToFirstInteractionCount / totalSessions) * 100 : 0;

		const avgClickThroughRate = totalInteractiveMessages > 0 ? (totalButtonClicks / totalInteractiveMessages) * 100 : 0;

		const avgResponseRateAfterDelay = totalDelayNodes > 0 ? (responsesAfterDelay / totalDelayNodes) * 100 : 0;

		return {
			totalExecutions: totalSessions,
			completionRate: Math.round(completionRate * 100) / 100, // Round to 2 decimals
			abandonmentRate: Math.round(abandonmentRate * 100) / 100,
			avgTimeToCompletion: Math.round(avgTimeToCompletion),
			avgTimeToAbandonment: Math.round(avgTimeToAbandonment),
			errorRate: Math.round(errorRate * 100) / 100,
			startToEndRate: Math.round(startToEndRate * 100) / 100,
			startToFirstInteractionRate: Math.round(startToFirstInteractionRate * 100) / 100,
			avgClickThroughRate: Math.round(avgClickThroughRate * 100) / 100,
			avgResponseRateAfterDelay: Math.round(avgResponseRateAfterDelay * 100) / 100,
		};
	} catch (error) {
		console.error("[KPI Service] Error calculating executive KPIs:", error);
		throw new Error(`Failed to calculate KPIs: ${error instanceof Error ? error.message : "Unknown error"}`);
	}
}
