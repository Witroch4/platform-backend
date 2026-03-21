"use client";

import { useQuery } from "@tanstack/react-query";
import type { AgentCatalogPayload } from "../types";
import { dashboardQueryKeys } from "../lib/query-keys";

const fetchCatalog = async (): Promise<AgentCatalogPayload> => {
	const res = await fetch("/api/admin/mtf-agents/catalog", { cache: "no-store" });
	if (!res.ok) {
		const detail = await res.json().catch(() => ({}));
		throw new Error(detail?.error || "Falha ao carregar catálogo de agentes");
	}
	return res.json();
};

export function useAgentCatalog() {
	const { data, error, isLoading } = useQuery({
		queryKey: dashboardQueryKeys.agentCatalog(),
		queryFn: fetchCatalog,
		staleTime: 10 * 60 * 1000, // 10min — reference data
		refetchOnWindowFocus: false,
		placeholderData: (prev) => prev,
	});

	return {
		catalog: data,
		isLoading,
		error,
	};
}
