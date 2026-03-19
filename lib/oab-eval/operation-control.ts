import { getRedisInstance } from "@/lib/connections";
import { sseManager } from "@/lib/sse-manager";
import { createLogger } from "@/lib/utils/logger";
import {
	buildLeadOperationJobId,
	type LeadOperationEvent,
	type LeadOperationProgress,
	type LeadOperationStage,
	type LeadOperationStatus,
	type LeadOperationStatusResponse,
} from "./operation-types";

const log = createLogger("OabOperation");
const redis = getRedisInstance();

const OPERATION_STATE_TTL_SECONDS = 24 * 60 * 60;
const OPERATION_CANCEL_TTL_SECONDS = 6 * 60 * 60;

type StoredLeadOperationState = Omit<LeadOperationStatusResponse, "source"> & {
	timestamp: string;
};

function getLeadOperationStateKey(jobId: string): string {
	return `oab:operation:state:${jobId}`;
}

function getLeadOperationCancelKey(jobId: string): string {
	return `oab:operation:cancel:${jobId}`;
}

function buildStoredState(input: {
	leadId: string;
	jobId: string;
	stage: LeadOperationStage;
	status: LeadOperationStatus;
	progress?: LeadOperationProgress;
	message?: string;
	error?: string;
	queueState?: string | null;
	meta?: Record<string, unknown>;
	timestamp?: string;
}): StoredLeadOperationState {
	const timestamp = input.timestamp ?? new Date().toISOString();

	return {
		leadId: input.leadId,
		jobId: input.jobId,
		stage: input.stage,
		status: input.status,
		progress: input.progress,
		message: input.message,
		error: input.error,
		queueState: input.queueState ?? null,
		meta: input.meta,
		updatedAt: timestamp,
		timestamp,
	};
}

export async function setLeadOperationState(input: {
	leadId: string;
	jobId: string;
	stage: LeadOperationStage;
	status: LeadOperationStatus;
	progress?: LeadOperationProgress;
	message?: string;
	error?: string;
	queueState?: string | null;
	meta?: Record<string, unknown>;
	timestamp?: string;
}): Promise<StoredLeadOperationState> {
	const payload = buildStoredState(input);

	await redis.set(getLeadOperationStateKey(input.jobId), JSON.stringify(payload), "EX", OPERATION_STATE_TTL_SECONDS);
	return payload;
}

export async function getLeadOperationState(jobId: string): Promise<LeadOperationStatusResponse | null> {
	const raw = await redis.get(getLeadOperationStateKey(jobId));
	if (!raw) {
		return null;
	}

	try {
		const parsed = JSON.parse(raw) as StoredLeadOperationState;
		return {
			leadId: parsed.leadId,
			jobId: parsed.jobId,
			stage: parsed.stage,
			status: parsed.status,
			progress: parsed.progress,
			message: parsed.message,
			error: parsed.error,
			queueState: parsed.queueState,
			updatedAt: parsed.updatedAt,
			source: "redis",
			meta: parsed.meta,
		};
	} catch (error) {
		log.warn("Falha ao parsear estado da operação", error as Error);
		return null;
	}
}

export async function clearLeadOperationState(jobId: string): Promise<void> {
	await redis.del(getLeadOperationStateKey(jobId));
}

export async function requestLeadOperationCancel(input: {
	leadId: string;
	stage: LeadOperationStage;
	jobId?: string;
	message?: string;
}): Promise<string> {
	const jobId = input.jobId ?? buildLeadOperationJobId(input.stage, input.leadId);
	const timestamp = new Date().toISOString();
	const payload = {
		leadId: input.leadId,
		jobId,
		stage: input.stage,
		status: "cancel_requested" as const,
		message: input.message ?? "Cancelamento solicitado pelo usuário.",
		timestamp,
	};

	await redis.set(getLeadOperationCancelKey(jobId), JSON.stringify(payload), "EX", OPERATION_CANCEL_TTL_SECONDS);
	await setLeadOperationState({
		leadId: input.leadId,
		jobId,
		stage: input.stage,
		status: "cancel_requested",
		message: payload.message,
		timestamp,
	});

	return jobId;
}

export async function clearLeadOperationCancel(jobId: string): Promise<void> {
	await redis.del(getLeadOperationCancelKey(jobId));
}

export async function isLeadOperationCancelRequested(jobId: string): Promise<boolean> {
	const value = await redis.exists(getLeadOperationCancelKey(jobId));
	return value === 1;
}

export async function emitLeadOperationEvent(input: {
	leadId: string;
	jobId: string;
	stage: LeadOperationStage;
	status: LeadOperationStatus;
	progress?: LeadOperationProgress;
	message?: string;
	error?: string;
	queueState?: string | null;
	meta?: Record<string, unknown>;
	timestamp?: string;
}): Promise<LeadOperationEvent> {
	const timestamp = input.timestamp ?? new Date().toISOString();

	await setLeadOperationState({
		leadId: input.leadId,
		jobId: input.jobId,
		stage: input.stage,
		status: input.status,
		progress: input.progress,
		message: input.message,
		error: input.error,
		queueState: input.queueState,
		meta: input.meta,
		timestamp,
	});

	const event: LeadOperationEvent = {
		type: "leadOperation",
		leadId: input.leadId,
		jobId: input.jobId,
		stage: input.stage,
		status: input.status,
		progress: input.progress,
		message: input.message,
		error: input.error,
		queueState: input.queueState ?? null,
		meta: input.meta,
		timestamp,
	};

	await sseManager.sendNotification(input.leadId, event);
	return event;
}

export class LeadOperationCanceledError extends Error {
	public readonly code = "LEAD_OPERATION_CANCELED";

	constructor(
		public readonly leadId: string,
		public readonly stage: LeadOperationStage,
		public readonly jobId: string,
		message = "Operação cancelada pelo usuário.",
	) {
		super(message);
		this.name = "LeadOperationCanceledError";
	}
}

export function isLeadOperationCanceledError(error: unknown): error is LeadOperationCanceledError {
	return error instanceof LeadOperationCanceledError;
}

export function combineAbortSignals(signals: Array<AbortSignal | null | undefined>): AbortSignal | undefined {
	const activeSignals = signals.filter(Boolean) as AbortSignal[];

	if (activeSignals.length === 0) return undefined;
	if (activeSignals.length === 1) return activeSignals[0];

	if (typeof AbortSignal.any === "function") {
		return AbortSignal.any(activeSignals);
	}

	const controller = new AbortController();
	const abort = (signal: AbortSignal) => {
		if (!controller.signal.aborted) {
			controller.abort(signal.reason);
		}
	};

	for (const signal of activeSignals) {
		if (signal.aborted) {
			abort(signal);
			break;
		}
		signal.addEventListener("abort", () => abort(signal), { once: true });
	}

	return controller.signal;
}

export function createLeadOperationCancelMonitor(input: {
	leadId: string;
	stage: LeadOperationStage;
	jobId: string;
	upstreamSignal?: AbortSignal;
	pollIntervalMs?: number;
}) {
	const controller = new AbortController();
	const pollIntervalMs = Math.max(250, input.pollIntervalMs ?? 1000);
	let timeoutId: NodeJS.Timeout | null = null;

	const abort = (reason: unknown) => {
		if (!controller.signal.aborted) {
			controller.abort(reason);
		}
	};

	const onUpstreamAbort = () => {
		abort(input.upstreamSignal?.reason ?? new Error("Operação abortada."));
	};

	if (input.upstreamSignal) {
		if (input.upstreamSignal.aborted) {
			onUpstreamAbort();
		} else {
			input.upstreamSignal.addEventListener("abort", onUpstreamAbort, { once: true });
		}
	}

	const poll = async () => {
		if (controller.signal.aborted) return;

		try {
			if (await isLeadOperationCancelRequested(input.jobId)) {
				abort(new LeadOperationCanceledError(input.leadId, input.stage, input.jobId));
				return;
			}
		} catch (error) {
			log.warn("Falha ao consultar pedido de cancelamento", error as Error);
		}

		timeoutId = setTimeout(() => {
			void poll();
		}, pollIntervalMs);
	};

	void poll();

	return {
		signal: controller.signal,
		async cleanup() {
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = null;
			}
			if (input.upstreamSignal) {
				input.upstreamSignal.removeEventListener("abort", onUpstreamAbort);
			}
		},
	};
}
