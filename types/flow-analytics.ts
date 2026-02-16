// Flow Analytics Types
// Types for the Flow Admin Quality Dashboard analytics system

import type { FlowNodeType } from "./flow-engine";

// ============================================================================
// Dashboard Filters
// ============================================================================

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

// ============================================================================
// Executive KPI Metrics
// ============================================================================

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

// ============================================================================
// Node Heatmap Data
// ============================================================================

export interface NodeHeatmapData {
	nodeId: string;
	nodeName: string;
	nodeType: FlowNodeType;
	visitCount: number;
	visitPercentage: number; // relative to START
	avgTimeBeforeLeaving: number; // milliseconds
	dropOffRate: number;
	healthStatus: "healthy" | "moderate" | "critical";
	isBottleneck: boolean;
}

// ============================================================================
// Funnel Step Data
// ============================================================================

export interface FunnelStep {
	stepIndex: number;
	nodeId: string;
	nodeName: string;
	sessionCount: number;
	percentage: number; // relative to START
	dropOffCount: number;
	dropOffPercentage: number;
}

// ============================================================================
// Path Analysis Data
// ============================================================================

export interface FlowPath {
	pathId: string;
	nodeSequence: string[]; // array of nodeIds
	sessionCount: number;
	completionRate: number;
	avgExecutionTime: number;
	abandonmentRate: number;
	pathType: "most_used" | "most_converted" | "most_abandoned" | "normal";
}

// ============================================================================
// Session Replay Entry
// ============================================================================

export interface SessionReplayEntry {
	timestamp: number;
	nodeId: string;
	nodeName: string;
	nodeType: FlowNodeType;
	action: string;
	durationMs: number;
	deliveryMode: "sync" | "async";
	result: "ok" | "error" | "skipped";
	detail?: string;
	variables?: Record<string, unknown>;
}

// ============================================================================
// Quality Alert
// ============================================================================

export interface QualityAlert {
	id: string;
	type: "critical_dropoff" | "unused_button" | "stuck_session" | "recurring_error" | "performance_degradation";
	severity: "critical" | "warning" | "info";
	flowId: string;
	flowName: string;
	nodeId?: string;
	nodeName?: string;
	message: string;
	metric: number;
	threshold: number;
	createdAt: Date;
	dismissedAt?: Date;
	dismissReason?: string;
}

// ============================================================================
// Flow Health Score
// ============================================================================

export interface FlowHealthScore {
	flowId: string;
	flowName: string;
	score: number; // 0-100
	classification: "excellent" | "good" | "fair" | "poor";
	completionRateScore: number;
	abandonmentRateScore: number;
	errorRateScore: number;
	executionTimeScore: number;
	trend: "improving" | "stable" | "declining";
	sparklineData: number[]; // last 7 days
}

// ============================================================================
// Node Type Metrics
// ============================================================================

export interface NodeTypeMetrics {
	nodeType: FlowNodeType;
	totalNodes: number;
	avgProcessingTime: number;
	successRate: number;
	specificMetrics: InteractiveMetrics | DelayMetrics | MediaMetrics;
}

export interface InteractiveMetrics {
	totalButtons: number;
	avgCTR: number;
	unusedButtons: Array<{ buttonId: string; buttonText: string; nodeId: string }>;
	noClickPercentage: number;
}

export interface DelayMetrics {
	avgDelayDuration: number;
	abandonmentDuringDelay: number;
	delayComparisonByDuration: Array<{ durationMs: number; abandonmentRate: number }>;
}

export interface MediaMetrics {
	deliverySuccessRate: number;
	continuationRate: number;
	avgTimeAfterMedia: number;
}

// ============================================================================
// Temporal Analysis Data
// ============================================================================

export interface TemporalMetrics {
	dimension: "hour" | "day_of_week" | "campaign" | "inbox";
	data: Array<{
		label: string;
		executionCount: number;
		completionRate: number;
		avgExecutionTime: number;
	}>;
	peakPeriods: string[];
	bestConversionPeriods: string[];
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiSuccessResponse<T> {
	success: true;
	data: T;
}

export interface ApiErrorResponse {
	success: false;
	error: string;
	code?: string;
	details?: unknown;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============================================================================
// Execution Log Entry (from FlowSession.executionLog)
// ============================================================================

export interface ExecutionLogEntry {
	nodeId: string;
	timestamp: number;
	durationMs: number;
	deliveryMode: "sync" | "async";
	result: "ok" | "error" | "skipped";
	detail?: string;
	action?: string;
}
