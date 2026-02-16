"use client";

import useSWR from "swr";
import { useCallback } from "react";
import type { AgentBlueprint, AgentBlueprintDraft } from "../types";

interface BlueprintResponse {
	blueprints: AgentBlueprint[];
}

const fetcher = async (url: string) => {
	const res = await fetch(url, { cache: "no-store" });
	if (!res.ok) {
		const detail = await res.json().catch(() => ({}));
		throw new Error(detail?.error || "Falha ao carregar agentes");
	}
	return res.json();
};

export function useAgentBlueprints() {
	const { data, error, isLoading, mutate } = useSWR<BlueprintResponse>("/api/admin/mtf-agents", fetcher, {
		keepPreviousData: true,
	});

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
			await mutate();
			return result.blueprint as AgentBlueprint;
		},
		[mutate],
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
			await mutate();
			return result.blueprint as AgentBlueprint;
		},
		[mutate],
	);

	const deleteBlueprint = useCallback(
		async (id: string) => {
			const res = await fetch(`/api/admin/mtf-agents/${id}`, { method: "DELETE" });
			if (!res.ok) {
				const detail = await res.json().catch(() => ({}));
				throw new Error(detail?.error || "Falha ao remover agente");
			}
			await mutate();
			return true;
		},
		[mutate],
	);

	return {
		blueprints: data?.blueprints ?? [],
		isLoading,
		error,
		mutate,
		createBlueprint,
		updateBlueprint,
		deleteBlueprint,
	};
}
