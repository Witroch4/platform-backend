// app/admin/mtf-diamante/hooks/useInteractiveMessages.ts
// Dedicated hook for managing interactive messages with React Query (TanStack Query v5)

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import type {
	InteractiveMessage,
	UseInteractiveMessagesReturn,
	CreateMessagePayload,
	UpdateMessagePayload,
} from "../lib/types";
import { interactiveMessagesApi } from "../lib/api-clients";
import { mtfDiamanteQueryKeys } from "../lib/query-keys";

interface UseInteractiveMessagesOptions {
	isPaused?: boolean;
	refreshInterval?: number;
	revalidateOnFocus?: boolean;
	revalidateOnReconnect?: boolean;
	keepPreviousData?: boolean;
}

/**
 * Hook for managing interactive messages with optimistic updates
 *
 * @param inboxId - The inbox ID to filter messages (null for all messages)
 * @param isPaused - Whether to pause automatic revalidations
 * @param options - Additional configuration options
 * @returns Hook return object with messages data and mutation functions
 */
export function useInteractiveMessages(
	inboxId: string | null = null,
	isPaused: boolean = false,
	options: UseInteractiveMessagesOptions = {},
): UseInteractiveMessagesReturn {
	const queryClient = useQueryClient();
	const queryKey = mtfDiamanteQueryKeys.interactiveMessages(inboxId ?? undefined);

	// Smart polling: refetchInterval as function adapts based on data freshness
	const baseInterval = options.refreshInterval ?? 30_000;

	const { data, error, isLoading } = useQuery({
		queryKey,
		queryFn: () => interactiveMessagesApi.getAll(inboxId!),
		enabled: !isPaused && !!inboxId,
		staleTime: 0, // real-time data
		refetchInterval: isPaused
			? false
			: (query) => {
					// Smart polling: faster when data recently changed
					if (query.state.dataUpdatedAt > Date.now() - 10_000) return 5_000;
					return baseInterval;
				},
		refetchOnWindowFocus: options.revalidateOnFocus ?? true,
		refetchOnReconnect: options.revalidateOnReconnect ?? true,
		placeholderData: options.keepPreviousData !== false ? (prev) => prev : undefined,
	});

	const messages = useMemo(() => data ?? [], [data]);

	const createMutation = useMutation({
		mutationFn: (vars: { payload: CreateMessagePayload; optimistic: InteractiveMessage }) =>
			interactiveMessagesApi.create(vars.payload),
		onMutate: async (vars) => {
			await queryClient.cancelQueries({ queryKey });
			const previous = queryClient.getQueryData<InteractiveMessage[]>(queryKey);
			queryClient.setQueryData<InteractiveMessage[]>(
				queryKey,
				(current = []) => [vars.optimistic, ...current],
			);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous) {
				queryClient.setQueryData(queryKey, context.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey });
		},
	});

	const updateMutation = useMutation({
		mutationFn: (vars: { payload: UpdateMessagePayload; optimistic: InteractiveMessage }) =>
			interactiveMessagesApi.update(vars.payload),
		onMutate: async (vars) => {
			await queryClient.cancelQueries({ queryKey });
			const previous = queryClient.getQueryData<InteractiveMessage[]>(queryKey);
			queryClient.setQueryData<InteractiveMessage[]>(
				queryKey,
				(current = []) => current.map((msg) => (msg.id === vars.optimistic.id ? vars.optimistic : msg)),
			);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous) {
				queryClient.setQueryData(queryKey, context.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey });
		},
	});

	const deleteMutation = useMutation({
		mutationFn: interactiveMessagesApi.delete,
		onMutate: async (messageId: string) => {
			await queryClient.cancelQueries({ queryKey });
			const previous = queryClient.getQueryData<InteractiveMessage[]>(queryKey);
			queryClient.setQueryData<InteractiveMessage[]>(
				queryKey,
				(current = []) => current.filter((msg) => msg.id !== messageId),
			);
			return { previous };
		},
		onError: (_err, _messageId, context) => {
			if (context?.previous) {
				queryClient.setQueryData(queryKey, context.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey });
		},
	});

	const addMessage = async (optimisticMessage: InteractiveMessage, apiPayload: CreateMessagePayload): Promise<void> => {
		await createMutation.mutateAsync({ payload: apiPayload, optimistic: optimisticMessage });
	};

	const updateMessage = async (updatedMessage: InteractiveMessage, apiPayload: UpdateMessagePayload): Promise<void> => {
		await updateMutation.mutateAsync({ payload: apiPayload, optimistic: updatedMessage });
	};

	const deleteMessage = async (messageId: string): Promise<void> => {
		await deleteMutation.mutateAsync(messageId);
	};

	const invalidate = () => queryClient.invalidateQueries({ queryKey });

	return useMemo(
		() => ({
			messages,
			isLoading,
			error,
			addMessage,
			updateMessage,
			deleteMessage,
			mutate: invalidate,
		}),
		[messages, isLoading, error, addMessage, updateMessage, deleteMessage, invalidate],
	);
}

export default useInteractiveMessages;
