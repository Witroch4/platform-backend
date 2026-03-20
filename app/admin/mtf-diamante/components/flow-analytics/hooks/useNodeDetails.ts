import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FlowNodeType } from "@/types/flow-builder";
import type { ExecutionLogEntry } from "@/types/flow-analytics";
import { mtfDiamanteQueryKeys } from "../../../lib/query-keys";

// =============================================================================
// TYPES
// =============================================================================

export interface ButtonMetric {
	buttonId: string;
	buttonText: string;
	clickCount: number;
	impressions: number;
	clickThroughRate: number;
}

export interface SessionSample {
	sessionId: string;
	status: string;
	visitedAt: number;
	action?: string;
}

export interface NodeDetails {
	nodeId: string;
	nodeName: string;
	nodeType: FlowNodeType;
	visitCount: number;
	visitPercentage: number;
	avgTimeBeforeLeaving: number;
	dropOffRate: number;
	healthStatus: "healthy" | "moderate" | "critical";
	isBottleneck: boolean;
	buttonMetrics?: ButtonMetric[];
	sessionSamples?: SessionSample[];
	executionLogSamples?: ExecutionLogEntry[];
}

export interface NodeDetailsResponse {
	success: boolean;
	data: NodeDetails;
	error?: string;
}

export interface NodeDetailsFilters {
	flowId: string;
	nodeId: string;
	inboxId?: string;
	dateRange?: {
		start: Date;
		end: Date;
	};
	enabled?: boolean;
}

// =============================================================================
// FETCHER
// =============================================================================

const fetchNodeDetails = async (url: string): Promise<NodeDetailsResponse> => {
	const res = await fetch(url);
	if (!res.ok) {
		const error = await res.json();
		throw new Error(error.error || "Erro ao carregar detalhes do nó");
	}
	return res.json();
};

// =============================================================================
// HOOK
// =============================================================================

export function useNodeDetails(filters: NodeDetailsFilters) {
	const queryClient = useQueryClient();

	// Build API URL with filters
	const apiUrl = useMemo(() => {
		if (!filters.enabled) return null;
		if (!filters.flowId || !filters.nodeId) return null;

		const params = new URLSearchParams();
		params.append("flowId", filters.flowId);
		params.append("nodeId", filters.nodeId);
		if (filters.inboxId) params.append("inboxId", filters.inboxId);
		if (filters.dateRange) {
			params.append("startDate", filters.dateRange.start.toISOString());
			params.append("endDate", filters.dateRange.end.toISOString());
		}
		return `/api/admin/mtf-diamante/flow-analytics/node-details?${params.toString()}`;
	}, [filters]);

	// Fetch node details
	const { data, error, isLoading } = useQuery<NodeDetailsResponse>({
		queryKey: mtfDiamanteQueryKeys.analytics.nodeDetails(filters.flowId, filters.nodeId),
		queryFn: () => fetchNodeDetails(apiUrl!),
		enabled: !!apiUrl,
		refetchOnWindowFocus: false,
	});

	return {
		nodeDetails: data?.data,
		isLoading,
		error,
		mutate: () => queryClient.invalidateQueries({
			queryKey: mtfDiamanteQueryKeys.analytics.nodeDetails(filters.flowId, filters.nodeId),
		}),
	};
}
