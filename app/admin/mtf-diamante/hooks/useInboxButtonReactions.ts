"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { mtfDiamanteQueryKeys } from "../lib/query-keys";

interface ButtonReaction {
	id: string;
	buttonId: string;
	actionType: string;
	actionPayload: {
		emoji?: string;
		textReaction?: string;
		action?: string;
	};
	description?: string;
	inboxId: string;
	createdAt: string;
	updatedAt: string;
}

interface UseInboxButtonReactionsOptions {
	inboxId: string | null;
	paused?: boolean;
}

async function fetchReactions(inboxId: string): Promise<ButtonReaction[]> {
	const url = `/api/admin/mtf-diamante/messages-with-reactions?inboxId=${inboxId}&reactionsOnly=true`;
	if (process.env.NODE_ENV === "development") {
		console.log("🌐 [useInboxButtonReactions] Fetching from:", url);
	}
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Erro ao carregar reações: ${response.status}`);
	}
	const result = await response.json();
	if (process.env.NODE_ENV === "development") {
		console.log("✅ [useInboxButtonReactions] Fetched data:", result);
	}
	return result.reactions ?? [];
}

export function useInboxButtonReactions({ inboxId, paused = false }: UseInboxButtonReactionsOptions) {
	const queryClient = useQueryClient();
	const enabled = !paused && !!inboxId;

	if (process.env.NODE_ENV === "development") {
		console.log("🔍 [useInboxButtonReactions] Hook called:", { inboxId, paused, enabled });
	}

	const { data, error, isLoading } = useQuery({
		queryKey: mtfDiamanteQueryKeys.buttonReactions(inboxId),
		queryFn: () => fetchReactions(inboxId!),
		enabled,
		staleTime: 5 * 60 * 1000, // config data: 5min
		refetchOnWindowFocus: false,
		retry: 3,
	});

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.buttonReactions(inboxId) });

	// Add button reaction
	const addMutation = useMutation({
		mutationFn: async (reactionData: Omit<ButtonReaction, "id" | "createdAt" | "updatedAt">) => {
			if (!inboxId) throw new Error("Inbox ID é obrigatório");
			const response = await fetch("/api/admin/mtf-diamante/button-reactions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ...reactionData, inboxId }),
			});
			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Erro ao adicionar reação");
			}
			const result = await response.json();
			return result.reaction;
		},
		onSuccess: () => {
			toast.success("Reação adicionada com sucesso!");
		},
		onError: (error: Error) => {
			toast.error(error.message);
		},
		onSettled: () => {
			invalidate();
		},
	});

	// Update button reaction
	const updateMutation = useMutation({
		mutationFn: async ({ reactionId, updates }: { reactionId: string; updates: Partial<ButtonReaction> }) => {
			const response = await fetch(`/api/admin/mtf-diamante/button-reactions/${reactionId}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(updates),
			});
			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Erro ao atualizar reação");
			}
			const result = await response.json();
			return result.reaction;
		},
		onSuccess: () => {
			toast.success("Reação atualizada com sucesso!");
		},
		onError: (error: Error) => {
			toast.error(error.message);
		},
		onSettled: () => {
			invalidate();
		},
	});

	// Delete button reaction
	const deleteMutation = useMutation({
		mutationFn: async (reactionId: string) => {
			const response = await fetch(`/api/admin/mtf-diamante/button-reactions/${reactionId}`, {
				method: "DELETE",
			});
			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Erro ao excluir reação");
			}
		},
		onSuccess: () => {
			toast.success("Reação excluída com sucesso!");
		},
		onError: (error: Error) => {
			toast.error(error.message);
		},
		onSettled: () => {
			invalidate();
		},
	});

	// Wrapper functions to maintain same public API
	const addButtonReaction = async (reactionData: Omit<ButtonReaction, "id" | "createdAt" | "updatedAt">) => {
		return addMutation.mutateAsync(reactionData);
	};

	const updateButtonReaction = async (reactionId: string, updates: Partial<ButtonReaction>) => {
		return updateMutation.mutateAsync({ reactionId, updates });
	};

	const deleteButtonReaction = async (reactionId: string) => {
		return deleteMutation.mutateAsync(reactionId);
	};

	return {
		reactions: data ?? [],
		isLoading,
		error,
		mutate: invalidate,
		addButtonReaction,
		updateButtonReaction,
		deleteButtonReaction,
	};
}
