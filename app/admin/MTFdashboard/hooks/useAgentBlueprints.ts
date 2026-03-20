"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { AgentBlueprint, AgentBlueprintDraft } from "../types";
import { dashboardQueryKeys } from "../lib/query-keys";

interface BlueprintResponse {
	blueprints: AgentBlueprint[];
}

const fetchBlueprints = async (): Promise<BlueprintResponse> => {
	const res = await fetch("/api/admin/mtf-agents", { cache: "no-store" });
	if (!res.ok) {
		const detail = await res.json().catch(() => ({}));
		throw new Error(detail?.error || "Falha ao carregar agentes");
	}
	return res.json();
};

export function useAgentBlueprints() {
	const queryClient = useQueryClient();

	const { data, error, isLoading } = useQuery({
		queryKey: dashboardQueryKeys.agentBlueprints(),
		queryFn: fetchBlueprints,
		staleTime: 5 * 60 * 1000, // 5min — config data
		placeholderData: (prev) => prev,
	});

	const invalidate = useCallback(
		() => queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.agentBlueprints() }),
		[queryClient],
	);

	// Mutations kept as useCallback for Phase 1 compatibility — will migrate to useMutation in Phase 3
	const createBlueprint = useCallback(
		async (payload: AgentBlueprintDraft) => {
			const res = await fetch("/api/admin/mtf-agents", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			if (!res.ok) {
				const detail = await res.json().catch(() => ({}));
				throw new Error(detail?.error || "Falha ao criar agente");
			}
			const result = await res.json();
			await invalidate();
			return result.blueprint as AgentBlueprint;
		},
		[invalidate],
	);

	const updateBlueprint = useCallback(
		async (id: string, payload: Partial<AgentBlueprintDraft>) => {
			const res = await fetch(`/api/admin/mtf-agents/${id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			if (!res.ok) {
				const detail = await res.json().catch(() => ({}));
				throw new Error(detail?.error || "Falha ao atualizar agente");
			}
			const result = await res.json();
			await invalidate();
			return result.blueprint as AgentBlueprint;
		},
		[invalidate],
	);

	const deleteBlueprint = useCallback(
		async (id: string) => {
			const res = await fetch(`/api/admin/mtf-agents/${id}`, { method: "DELETE" });
			if (!res.ok) {
				const detail = await res.json().catch(() => ({}));
				throw new Error(detail?.error || "Falha ao remover agente");
			}
			await invalidate();
			return true;
		},
		[invalidate],
	);

	return {
		blueprints: data?.blueprints ?? [],
		isLoading,
		error,
		mutate: invalidate,
		createBlueprint,
		updateBlueprint,
		deleteBlueprint,
	};
}
