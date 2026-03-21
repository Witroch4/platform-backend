"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
		staleTime: 5 * 60 * 1000,
		placeholderData: (prev) => prev,
	});

	const createMutation = useMutation({
		mutationFn: async (payload: AgentBlueprintDraft) => {
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
			return result.blueprint as AgentBlueprint;
		},
		onMutate: async (payload) => {
			await queryClient.cancelQueries({ queryKey: dashboardQueryKeys.agentBlueprints() });
			const previous = queryClient.getQueryData<BlueprintResponse>(dashboardQueryKeys.agentBlueprints());
			queryClient.setQueryData<BlueprintResponse>(
				dashboardQueryKeys.agentBlueprints(),
				(current) => ({
					blueprints: [
						...(current?.blueprints ?? []),
						{ id: `temp-${crypto.randomUUID()}`, ...payload, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as AgentBlueprint,
					],
				}),
			);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous) {
				queryClient.setQueryData(dashboardQueryKeys.agentBlueprints(), context.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.agentBlueprints() });
		},
	});

	const updateMutation = useMutation({
		mutationFn: async ({ id, payload }: { id: string; payload: Partial<AgentBlueprintDraft> }) => {
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
			return result.blueprint as AgentBlueprint;
		},
		onMutate: async ({ id, payload }) => {
			await queryClient.cancelQueries({ queryKey: dashboardQueryKeys.agentBlueprints() });
			const previous = queryClient.getQueryData<BlueprintResponse>(dashboardQueryKeys.agentBlueprints());
			queryClient.setQueryData<BlueprintResponse>(
				dashboardQueryKeys.agentBlueprints(),
				(current) => ({
					blueprints: (current?.blueprints ?? []).map((bp) =>
						bp.id === id ? { ...bp, ...payload, updatedAt: new Date().toISOString() } as AgentBlueprint : bp,
					),
				}),
			);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous) {
				queryClient.setQueryData(dashboardQueryKeys.agentBlueprints(), context.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.agentBlueprints() });
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async (id: string) => {
			const res = await fetch(`/api/admin/mtf-agents/${id}`, { method: "DELETE" });
			if (!res.ok) {
				const detail = await res.json().catch(() => ({}));
				throw new Error(detail?.error || "Falha ao remover agente");
			}
			return true;
		},
		onMutate: async (id) => {
			await queryClient.cancelQueries({ queryKey: dashboardQueryKeys.agentBlueprints() });
			const previous = queryClient.getQueryData<BlueprintResponse>(dashboardQueryKeys.agentBlueprints());
			queryClient.setQueryData<BlueprintResponse>(
				dashboardQueryKeys.agentBlueprints(),
				(current) => ({
					blueprints: (current?.blueprints ?? []).filter((bp) => bp.id !== id),
				}),
			);
			return { previous };
		},
		onError: (_err, _id, context) => {
			if (context?.previous) {
				queryClient.setQueryData(dashboardQueryKeys.agentBlueprints(), context.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.agentBlueprints() });
		},
	});

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.agentBlueprints() });

	return {
		blueprints: data?.blueprints ?? [],
		isLoading,
		error,
		mutate: invalidate,
		createBlueprint: createMutation.mutateAsync,
		updateBlueprint: (id: string, payload: Partial<AgentBlueprintDraft>) =>
			updateMutation.mutateAsync({ id, payload }),
		deleteBlueprint: deleteMutation.mutateAsync,
	};
}
