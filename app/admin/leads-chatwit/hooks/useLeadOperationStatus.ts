"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { LeadChatwit } from "../types";
import {
	buildLeadOperationJobId,
	isTerminalLeadOperationStatus,
	type LeadOperationEvent,
	type LeadOperationStage,
	type LeadOperationStatusResponse,
} from "@/lib/oab-eval/operation-types";
import { leadsQueryKeys } from "../lib/query-keys";

function readJsonOrThrow<T>(value: unknown): T {
	return value as T;
}

async function fetchJson<T>(input: RequestInfo | URL): Promise<T> {
	const response = await fetch(input);
	if (!response.ok) {
		const payload = await response.json().catch(() => null);
		throw new Error(payload?.error || `Falha na requisição (${response.status})`);
	}
	return readJsonOrThrow<T>(await response.json());
}

export function leadOperationStatusQueryKey(leadId: string, stage: LeadOperationStage) {
	return leadsQueryKeys.operationStatus(leadId, stage);
}

export function leadChatwitDetailQueryKey(leadId: string) {
	return leadsQueryKeys.detail(leadId);
}

export async function fetchLeadOperationStatus(
	leadId: string,
	stage: LeadOperationStage,
): Promise<LeadOperationStatusResponse> {
	const params = new URLSearchParams({ leadId, stage });
	return fetchJson<LeadOperationStatusResponse>(`/api/admin/leads-chatwit/operations/status?${params.toString()}`);
}

export async function fetchLeadChatwitDetail(leadId: string): Promise<LeadChatwit> {
	return fetchJson<LeadChatwit>(`/api/admin/leads-chatwit/leads?id=${encodeURIComponent(leadId)}`);
}

interface UseLeadOperationStatusOptions {
	leadId: string;
	stage: LeadOperationStage;
	enabled?: boolean;
	pollIntervalMs?: number;
}

export function useLeadOperationStatus({
	leadId,
	stage,
	enabled = true,
	pollIntervalMs = 5000,
}: UseLeadOperationStatusOptions) {
	const queryClient = useQueryClient();
	const [isSseDisconnected, setIsSseDisconnected] = useState(false);

	const queryKey = useMemo(() => leadOperationStatusQueryKey(leadId, stage), [leadId, stage]);

	useEffect(() => {
		if (!leadId) {
			return;
		}

		const handleConnectionStatus = (event: Event) => {
			const customEvent = event as CustomEvent<{ status?: string }>;
			if (customEvent.detail?.status === "disconnected") {
				setIsSseDisconnected(true);
				return;
			}

			if (customEvent.detail?.status === "connected") {
				setIsSseDisconnected(false);
				void queryClient.invalidateQueries({ queryKey });
			}
		};

		const handleLeadOperation = (event: Event) => {
			const operation = (event as CustomEvent<LeadOperationEvent>).detail;
			if (!operation || operation.leadId !== leadId || operation.stage !== stage) {
				return;
			}

			queryClient.setQueryData<LeadOperationStatusResponse>(queryKey, {
				leadId,
				jobId: operation.jobId || buildLeadOperationJobId(stage, leadId),
				stage,
				status: operation.status,
				progress: operation.progress,
				message: operation.message,
				error: operation.error,
				queueState: operation.queueState ?? null,
				updatedAt: operation.timestamp,
				source: "redis",
				meta: operation.meta,
			});
		};

		const handleLeadUpdate = (event: Event) => {
			const customEvent = event as CustomEvent<{ leadId?: string }>;
			if (customEvent.detail?.leadId !== leadId) {
				return;
			}

			void queryClient.invalidateQueries({ queryKey });
			void queryClient.invalidateQueries({ queryKey: leadChatwitDetailQueryKey(leadId) });
		};

		window.addEventListener("lead-operations-connection", handleConnectionStatus as EventListener);
		window.addEventListener("lead-operation", handleLeadOperation as EventListener);
		window.addEventListener("lead-update", handleLeadUpdate as EventListener);

		return () => {
			window.removeEventListener("lead-operations-connection", handleConnectionStatus as EventListener);
			window.removeEventListener("lead-operation", handleLeadOperation as EventListener);
			window.removeEventListener("lead-update", handleLeadUpdate as EventListener);
		};
	}, [leadId, stage, queryClient, queryKey]);

	const query = useQuery({
		queryKey,
		queryFn: () => fetchLeadOperationStatus(leadId, stage),
		enabled: enabled && !!leadId,
		staleTime: isSseDisconnected ? 0 : 5000,
		refetchOnWindowFocus: false,
		refetchInterval: (currentQuery) => {
			if (!enabled || !isSseDisconnected) {
				return false;
			}

			const currentStatus = currentQuery.state.data?.status;
			if (currentStatus && isTerminalLeadOperationStatus(currentStatus)) {
				return false;
			}

			return pollIntervalMs;
		},
	});

	return {
		...query,
		operation: query.data ?? null,
		isSseDisconnected,
		isTerminal: query.data ? isTerminalLeadOperationStatus(query.data.status) : false,
	};
}
