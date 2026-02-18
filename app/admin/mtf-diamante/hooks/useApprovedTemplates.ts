// app/admin/mtf-diamante/hooks/useApprovedTemplates.ts
// Dedicated hook for fetching approved WhatsApp templates with SWR

import useSWR from "swr";
import { useMemo } from "react";
import type { UseApprovedTemplatesReturn, WhatsAppTemplate } from "../lib/types";

/**
 * Fetcher for approved templates
 */
async function fetchApprovedTemplates(url: string): Promise<WhatsAppTemplate[]> {
	const response = await fetch(url, {
		headers: { "Content-Type": "application/json" },
	});

	if (!response.ok) {
		throw new Error("Erro ao carregar templates aprovados");
	}

	const data = await response.json();

	// Filter only approved templates
	const templates = (data.templates || data || []) as WhatsAppTemplate[];
	return templates.filter((t) => t.status === "APPROVED");
}

/**
 * Hook for fetching approved WhatsApp templates
 *
 * @param caixaId - The inbox ID to filter templates (null disables fetching)
 * @param isPaused - Whether to pause automatic revalidations
 * @returns Hook return object with templates data
 */
export function useApprovedTemplates(
	caixaId: string | null = null,
	isPaused: boolean = false,
): UseApprovedTemplatesReturn {
	// Build SWR key - null disables fetching
	const swrKey = !isPaused && caixaId ? `/api/admin/mtf-diamante/templates?caixaId=${caixaId}` : null;

	const { data, error, isLoading, mutate } = useSWR(swrKey, fetchApprovedTemplates, {
		revalidateOnFocus: false,
		revalidateOnReconnect: true,
		dedupingInterval: 30000, // 30s - templates don't change frequently
		keepPreviousData: true,
	});

	// Memoized templates array
	const templates = useMemo(() => data || [], [data]);

	return {
		templates,
		isLoading,
		error,
		mutate,
	};
}

export default useApprovedTemplates;
