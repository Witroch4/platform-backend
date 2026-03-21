/**
 * Node Details Calculation Service
 *
 * Calculates detailed metrics for a specific node:
 * - All heatmap metrics (visits, drop-off, etc.)
 * - Button-specific metrics for interactive nodes
 * - Session samples that passed through the node
 * - Execution log samples for the node
 *
 * Validates Requirement 2.8: Node detail panel with comprehensive metrics
 */

import type { FlowNodeType as EngineNodeType, ExecutionLogEntry } from "@/types/flow-engine";
import type { FlowNodeType as BuilderNodeType } from "@/types/flow-builder";
import type {
	NodeDetails,
	ButtonMetric,
	SessionSample,
} from "@/app/mtf-diamante/components/flow-analytics/hooks/useNodeDetails";

// =============================================================================
// TYPES
// =============================================================================

export interface FlowSessionInput {
	id: string;
	executionLog: ExecutionLogEntry[];
	status: string;
	createdAt: Date;
	completedAt: Date | null;
	conversationId: string;
}

export interface RuntimeFlowNode {
	id: string;
	nodeType: EngineNodeType;
	config: Record<string, unknown>;
}

export interface RuntimeFlowData {
	nodes: RuntimeFlowNode[];
}

// =============================================================================
// MAIN CALCULATION FUNCTION
// =============================================================================

/**
 * Calculate detailed metrics for a specific node.
 *
 * @param nodeId - ID of the node to analyze
 * @param sessions - Array of flow sessions with execution logs
 * @param flow - Runtime flow definition with nodes
 * @returns Detailed node metrics or null if node not found
 */
export function calculateNodeDetails(
	nodeId: string,
	sessions: FlowSessionInput[],
	flow: RuntimeFlowData,
): NodeDetails | null {
	// Find node in flow definition
	const node = flow.nodes.find((n) => n.id === nodeId);
	if (!node) {
		return null;
	}

	// Initialize metrics
	let visitCount = 0;
	let dropOffs = 0;
	let totalTimeBeforeLeaving = 0;
	const sessionSamples: SessionSample[] = [];
	const executionLogSamples: ExecutionLogEntry[] = [];

	// Button tracking for interactive messages
	const buttonStats = new Map<string, { clicks: number; impressions: number; text: string }>();

	// Track START node visits for percentage calculation
	let startNodeVisits = 0;

	// Process each session
	for (const session of sessions) {
		const log = session.executionLog;

		// Count START visits
		if (log.some((entry) => entry.nodeId === "START")) {
			startNodeVisits++;
		}

		// Check if this session visited the target node
		const nodeVisits = log.filter((entry) => entry.nodeId === nodeId);

		if (nodeVisits.length > 0) {
			visitCount++;

			// Collect session sample (limit to 10)
			if (sessionSamples.length < 10) {
				const firstVisit = nodeVisits[0];
				sessionSamples.push({
					sessionId: session.id,
					status: session.status,
					visitedAt: firstVisit.timestamp,
					action: firstVisit.detail,
				});
			}

			// Collect execution log samples (limit to 10)
			if (executionLogSamples.length < 10) {
				executionLogSamples.push(...nodeVisits.slice(0, 10 - executionLogSamples.length));
			}

			// Track button impressions for interactive messages
			if (node.nodeType === "INTERACTIVE_MESSAGE") {
				const buttons = extractButtons(node.config);
				for (const button of buttons) {
					const stats = buttonStats.get(button.id) || { clicks: 0, impressions: 0, text: button.text };
					stats.impressions++;
					buttonStats.set(button.id, stats);
				}
			}

			// Check if session dropped off at this node
			const lastEntry = log[log.length - 1];
			if (session.status !== "COMPLETED" && lastEntry.nodeId === nodeId) {
				dropOffs++;

				const timeBeforeLeaving = session.completedAt
					? new Date(session.completedAt).getTime() - lastEntry.timestamp
					: Date.now() - lastEntry.timestamp;

				totalTimeBeforeLeaving += timeBeforeLeaving;
			}

			// Track button clicks for interactive messages
			if (node.nodeType === "INTERACTIVE_MESSAGE") {
				// Find the next action after this node
				const nodeIndex = log.findIndex((entry) => entry.nodeId === nodeId);
				if (nodeIndex >= 0 && nodeIndex < log.length - 1) {
					const nextEntry = log[nodeIndex + 1];
					// Check if next entry detail contains button information
					if (nextEntry.detail && nextEntry.detail.includes("button:")) {
						const buttonId = nextEntry.detail.replace("button:", "").trim();
						const stats = buttonStats.get(buttonId);
						if (stats) {
							stats.clicks++;
						}
					}
				}
			}
		}
	}

	// Use START visits or total sessions for percentage calculation
	const baselineVisits = startNodeVisits > 0 ? startNodeVisits : sessions.length;

	// Calculate metrics
	const dropOffRate = visitCount > 0 ? (dropOffs / visitCount) * 100 : 0;
	const avgTimeBeforeLeaving = dropOffs > 0 ? totalTimeBeforeLeaving / dropOffs : 0;
	const visitPercentage = baselineVisits > 0 ? (visitCount / baselineVisits) * 100 : 0;
	const healthStatus = getHealthStatus(dropOffRate);
	const isBottleneck = dropOffRate > 50;

	// Calculate button metrics for interactive messages
	let buttonMetrics: ButtonMetric[] | undefined;
	if (node.nodeType === "INTERACTIVE_MESSAGE" && buttonStats.size > 0) {
		buttonMetrics = Array.from(buttonStats.entries()).map(([buttonId, stats]) => ({
			buttonId,
			buttonText: stats.text,
			clickCount: stats.clicks,
			impressions: stats.impressions,
			clickThroughRate: stats.impressions > 0 ? (stats.clicks / stats.impressions) * 100 : 0,
		}));
	}

	return {
		nodeId,
		nodeName: getNodeName(node),
		nodeType: convertNodeType(node.nodeType),
		visitCount,
		visitPercentage,
		avgTimeBeforeLeaving,
		dropOffRate,
		healthStatus,
		isBottleneck,
		buttonMetrics,
		sessionSamples,
		executionLogSamples,
	};
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Extract node name from node configuration.
 */
function getNodeName(node: RuntimeFlowNode): string {
	const config = node.config;

	if (config.name && typeof config.name === "string") {
		return config.name;
	}

	if (config.label && typeof config.label === "string") {
		return config.label;
	}

	if (config.text && typeof config.text === "string") {
		return config.text.substring(0, 50);
	}

	return `${node.nodeType}_${node.id.substring(0, 8)}`;
}

/**
 * Extract buttons from interactive message node configuration.
 */
function extractButtons(config: Record<string, unknown>): Array<{ id: string; text: string }> {
	const buttons: Array<{ id: string; text: string }> = [];

	// Try different button field locations
	if (Array.isArray(config.buttons)) {
		for (const button of config.buttons) {
			if (typeof button === "object" && button !== null) {
				const btn = button as Record<string, unknown>;
				if (btn.id && btn.title) {
					buttons.push({
						id: String(btn.id),
						text: String(btn.title),
					});
				}
			}
		}
	}

	// Try action.buttons
	if (config.action && typeof config.action === "object") {
		const action = config.action as Record<string, unknown>;
		if (Array.isArray(action.buttons)) {
			for (const button of action.buttons) {
				if (typeof button === "object" && button !== null) {
					const btn = button as Record<string, unknown>;
					if (btn.id && btn.title) {
						buttons.push({
							id: String(btn.id),
							text: String(btn.title),
						});
					}
				}
			}
		}
	}

	return buttons;
}

/**
 * Determine health status based on drop-off rate.
 */
function getHealthStatus(dropOffRate: number): "healthy" | "moderate" | "critical" {
	if (dropOffRate < 20) {
		return "healthy";
	}
	if (dropOffRate < 50) {
		return "moderate";
	}
	return "critical";
}

/**
 * Convert engine node type to builder node type.
 */
function convertNodeType(engineType: EngineNodeType): BuilderNodeType {
	// Map engine types (uppercase) to builder types (lowercase enum)
	const typeMap: Record<string, BuilderNodeType> = {
		START: "start" as BuilderNodeType,
		END: "end" as BuilderNodeType,
		TEXT_MESSAGE: "text_message" as BuilderNodeType,
		INTERACTIVE_MESSAGE: "interactive_message" as BuilderNodeType,
		MEDIA: "media" as BuilderNodeType,
		DELAY: "delay" as BuilderNodeType,
		CONDITION: "condition" as BuilderNodeType,
		ADD_TAG: "add_tag" as BuilderNodeType,
		TRANSFER: "handoff" as BuilderNodeType,
		REACTION: "emoji_reaction" as BuilderNodeType,
	};

	return typeMap[engineType] || ("text_message" as BuilderNodeType);
}
