"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useCallback } from "react";
import type { WhatsAppTemplate } from "../lib/types";
import { mtfDiamanteQueryKeys } from "../lib/query-keys";

async function fetchApprovedTemplates(caixaId: string): Promise<WhatsAppTemplate[]> {
	const response = await fetch(`/api/admin/mtf-diamante/templates?caixaId=${caixaId}`, {
		headers: { "Content-Type": "application/json" },
	});

	if (!response.ok) {
		throw new Error("Erro ao carregar templates aprovados");
	}

	const data = await response.json();
	const templates = (data.templates ?? data ?? []) as WhatsAppTemplate[];
	return templates.filter((t) => t.status === "APPROVED");
}

export function useApprovedTemplates(caixaId: string | null = null, isPaused: boolean = false) {
	const queryClient = useQueryClient();

	const { data, error, isLoading } = useQuery({
		queryKey: mtfDiamanteQueryKeys.approvedTemplates(caixaId),
		queryFn: () => fetchApprovedTemplates(caixaId!),
		enabled: !isPaused && !!caixaId,
		staleTime: 5 * 60 * 1000, // 5min — config data, changes by user action
		refetchOnWindowFocus: false,
		refetchOnReconnect: true,
		placeholderData: (prev) => prev,
	});

	const templates = useMemo(() => data ?? [], [data]);

	const mutate = useCallback(
		() => queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.approvedTemplates(caixaId) }),
		[queryClient, caixaId],
	);

	return {
		templates,
		isLoading,
		error,
		mutate,
	};
}

export default useApprovedTemplates;
