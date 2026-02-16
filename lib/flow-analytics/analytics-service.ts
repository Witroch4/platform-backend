// Analytics Service Layer
// Core service functions for flow analytics calculations

import { getPrismaInstance } from "@/lib/connections";
import type { DashboardFilters, ExecutiveKPIs, ExecutionLogEntry } from "@/types/flow-analytics";
import { buildWhereClause } from "./filter-utils";

const prisma = getPrismaInstance();

// Type for session data from database
interface SessionData {
	id: string;
	status: string;
	createdAt: Date;
	completedAt: Date | null;
	executionLog: any;
}

/**
 * Calculate Executive KPI metrics
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9
 */
export async function calculateExecutiveKPIs(filters: DashboardFilters): Promise<ExecutiveKPIs> {
	// Note: FlowSession model doesn't exist in current schema
	// This is a placeholder implementation that will work once the model is added
	// For now, return empty data
	const sessions: SessionData[] = [];

	// TODO: Uncomment when FlowSession model is available in Prisma schema
	// const whereClause = buildWhereClause(filters);
	// const sessions = await prisma.flowSession.findMany({
	//   where: whereClause,
	//   select: {
	//     id: true,
	//     status: true,
	//     createdAt: true,
	//     completedAt: true,
	//     executionLog: true,
	//   },
	// });

	const totalExecutions = sessions.length;

	// Handle empty dataset
	if (totalExecutions === 0) {
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

	// Count sessions by status
	const completedSessions = sessions.filter((s) => s.status === "COMPLETED");
	const errorSessions = sessions.filter((s) => s.status === "ERROR");
	const activeSessions = sessions.filter((s) => s.status === "ACTIVE" || s.status === "WAITING_INPUT");

	// Calculate rates
	const completionRate = (completedSessions.length / totalExecutions) * 100;
	const errorRate = (errorSessions.length / totalExecutions) * 100;
	const abandonmentRate = (activeSessions.length / totalExecutions) * 100;

	// Calculate average time to completion
	let totalCompletionTime = 0;
	let completionCount = 0;
	for (const session of completedSessions) {
		if (session.completedAt) {
			const duration = session.completedAt.getTime() - session.createdAt.getTime();
			totalCompletionTime += duration;
			completionCount++;
		}
	}
	const avgTimeToCompletion = completionCount > 0 ? totalCompletionTime / completionCount : 0;

	// Calculate average time to abandonment (for non-completed sessions)
	let totalAbandonmentTime = 0;
	let abandonmentCount = 0;
	const now = Date.now();
	for (const session of activeSessions) {
		const duration = now - session.createdAt.getTime();
		totalAbandonmentTime += duration;
		abandonmentCount++;
	}
	const avgTimeToAbandonment = abandonmentCount > 0 ? totalAbandonmentTime / abandonmentCount : 0;

	// Calculate start-to-end rate (sessions that reached END node)
	let startToEndCount = 0;
	for (const session of sessions) {
		const log = session.executionLog as ExecutionLogEntry[];
		if (log.some((entry) => entry.nodeId === "END" || entry.nodeId.includes("END"))) {
			startToEndCount++;
		}
	}
	const startToEndRate = (startToEndCount / totalExecutions) * 100;

	// Calculate start-to-first-interaction rate
	let firstInteractionCount = 0;
	for (const session of sessions) {
		const log = session.executionLog as ExecutionLogEntry[];
		if (log.length > 1) {
			// More than just START node
			firstInteractionCount++;
		}
	}
	const startToFirstInteractionRate = (firstInteractionCount / totalExecutions) * 100;

	// Calculate average click-through rate (placeholder - will be implemented in node metrics)
	const avgClickThroughRate = 0;

	// Calculate average response rate after delay (placeholder - will be implemented in node metrics)
	const avgResponseRateAfterDelay = 0;

	return {
		totalExecutions,
		completionRate,
		abandonmentRate,
		avgTimeToCompletion,
		avgTimeToAbandonment,
		errorRate,
		startToEndRate,
		startToFirstInteractionRate,
		avgClickThroughRate,
		avgResponseRateAfterDelay,
	};
}

/**
 * Get flow name by ID
 */
export async function getFlowName(flowId: string): Promise<string> {
	// TODO: Uncomment when Flow model is available
	// const flow = await prisma.flow.findUnique({
	//   where: { id: flowId },
	//   select: { name: true },
	// });
	// return flow?.name || 'Unknown Flow';

	return "Unknown Flow";
}

/**
 * Get flow by ID with nodes
 */
export async function getFlowWithNodes(flowId: string) {
	// TODO: Uncomment when Flow model is available
	// return await prisma.flow.findUnique({
	//   where: { id: flowId },
	//   include: {
	//     nodes: true,
	//     edges: true,
	//   },
	// });

	return null;
}

/**
 * Find node name from flow nodes
 */
export function findNodeName(nodes: any[], nodeId: string): string {
	const node = nodes.find((n: any) => n.id === nodeId);
	if (node) {
		// Try to extract name from config
		if (typeof node.config === "object" && node.config !== null) {
			if ("name" in node.config) return node.config.name as string;
			if ("label" in node.config) return node.config.label as string;
		}
		// Fallback to nodeType
		return node.nodeType || nodeId;
	}
	return nodeId;
}

/**
 * Find node type from flow nodes
 */
export function findNodeType(nodes: any[], nodeId: string): string {
	const node = nodes.find((n: any) => n.id === nodeId);
	return node?.nodeType || "UNKNOWN";
}

/**
 * Check if a session is stuck (inactive for > 30 minutes)
 */
export function isSessionStuck(session: { status: string; updatedAt: Date }): boolean {
	if (session.status !== "ACTIVE" && session.status !== "WAITING_INPUT") {
		return false;
	}

	const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
	return session.updatedAt < thirtyMinutesAgo;
}
