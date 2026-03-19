export const LEAD_OPERATION_STAGES = ["transcription", "mirror", "analysis"] as const;

export type LeadOperationStage = (typeof LEAD_OPERATION_STAGES)[number];

export const LEAD_OPERATION_STATUSES = [
	"idle",
	"queued",
	"processing",
	"completed",
	"failed",
	"cancel_requested",
	"canceled",
	"disconnected",
	"inconsistent",
] as const;

export type LeadOperationStatus = (typeof LEAD_OPERATION_STATUSES)[number];

export type LeadOperationProgress = number | Record<string, unknown> | null;

export interface LeadOperationEvent {
	type: "leadOperation";
	leadId: string;
	jobId: string;
	stage: LeadOperationStage;
	status: LeadOperationStatus;
	progress?: LeadOperationProgress;
	message?: string;
	error?: string;
	queueState?: string | null;
	timestamp: string;
	meta?: Record<string, unknown>;
}

export interface LeadOperationStatusResponse {
	leadId: string;
	jobId: string;
	stage: LeadOperationStage;
	status: LeadOperationStatus;
	progress?: LeadOperationProgress;
	message?: string;
	error?: string;
	queueState?: string | null;
	updatedAt?: string;
	source: "bullmq" | "redis" | "database";
	meta?: Record<string, unknown>;
}

export function buildLeadOperationJobId(stage: LeadOperationStage, leadId: string): string {
	return `oab:${stage}:${leadId}`;
}

export function buildLeadOperationStatusUrl(leadId: string, stage: LeadOperationStage): string {
	const params = new URLSearchParams({ leadId, stage });
	return `/api/admin/leads-chatwit/operations/status?${params.toString()}`;
}

export function buildLeadOperationCancelUrl(): string {
	return "/api/admin/leads-chatwit/operations/cancel";
}

export function mapBullMqStateToLeadOperationStatus(state: string | null | undefined): LeadOperationStatus | null {
	switch (state) {
		case "waiting":
		case "delayed":
		case "prioritized":
		case "waiting-children":
			return "queued";
		case "active":
			return "processing";
		case "completed":
			return "completed";
		case "failed":
			return "failed";
		default:
			return null;
	}
}

export function isTerminalLeadOperationStatus(status: LeadOperationStatus): boolean {
	return status === "completed" || status === "failed" || status === "canceled" || status === "inconsistent";
}
