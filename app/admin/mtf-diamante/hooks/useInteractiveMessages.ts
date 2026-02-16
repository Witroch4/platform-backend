// app/admin/mtf-diamante/hooks/useInteractiveMessages.ts
// Dedicated hook for managing interactive messages with SWR - Optimized version

import useSWR from "swr";
import { useCallback, useMemo } from "react";
import type {
	InteractiveMessage,
	UseInteractiveMessagesReturn,
	SWRHookOptions,
	CreateMessagePayload,
	UpdateMessagePayload,
} from "../lib/types";
import { interactiveMessagesApi } from "../lib/api-clients";
import {
	useOptimizedSWRConfig,
	useOptimizedMutation,
	useCacheKey,
	performanceTracker,
	useSmartPolling,
} from "../lib/performance-utils";

/**
 * Hook for managing interactive messages with optimistic updates
 *
 * @param inboxId - The inbox ID to filter messages (null for all messages)
 * @param isPaused - Whether to pause automatic revalidations
 * @param options - Additional SWR configuration options
 * @returns Hook return object with messages data and mutation functions
 */
export function useInteractiveMessages(
	inboxId: string | null = null,
	isPaused: boolean = false,
	options: SWRHookOptions = {},
): UseInteractiveMessagesReturn {
	// Smart polling configuration
	const smartPolling = useSmartPolling(options.refreshInterval ?? 30000);

	// Optimized cache key with memoization
	const swrKey = useCacheKey("interactive-messages", [inboxId]);

	// Optimized SWR configuration
	const swrConfig = useOptimizedSWRConfig("interactive-messages", isPaused, {
		refreshInterval: isPaused ? 0 : smartPolling.getPollingInterval(),
		revalidateOnFocus: !isPaused && (options.revalidateOnFocus ?? true),
		revalidateOnReconnect: !isPaused && (options.revalidateOnReconnect ?? true),
		keepPreviousData: options.keepPreviousData ?? true,
	});

	// Use SWR hook with optimized configuration
	// Don't make requests when paused OR when there's no inboxId (global context)
	const { data, error, isLoading, mutate } = useSWR(
		isPaused || !inboxId ? null : swrKey,
		() => interactiveMessagesApi.getAll(inboxId!), // inboxId is guaranteed to be non-null here due to the condition above
		swrConfig,
	);

	// Memoized messages array to prevent unnecessary re-renders
	const messages = useMemo(() => data || [], [data]);

	/**
	 * Add a new message with optimistic updates - Performance optimized
	 */
	const addMessage = useCallback(
		async (optimisticMessage: InteractiveMessage, apiPayload: CreateMessagePayload): Promise<void> => {
			const operationId = performanceTracker.startOperation("add-message");
			const originalMessages = messages;

			try {
				// 1. Optimistic update - add message to the beginning
				await mutate([optimisticMessage, ...originalMessages], { revalidate: false });

				// 2. API call with performance tracking
				const result = await interactiveMessagesApi.create(apiPayload);

				// 3. Update with real data from API (replace temp ID with real ID)
				await mutate(
					(current?: InteractiveMessage[]) => {
						if (!current) return [result];

						return current.map((msg: InteractiveMessage) => (msg.id === optimisticMessage.id ? result : msg));
					},
					{ revalidate: false },
				);

				performanceTracker.endOperation(operationId, true);
			} catch (error) {
				// 4. Rollback on error
				await mutate(originalMessages, { revalidate: false });
				performanceTracker.endOperation(operationId, false, error instanceof Error ? error.message : "Unknown error");
				throw error;
			} finally {
				// 5. Final revalidation to ensure consistency (debounced)
				setTimeout(() => mutate(), 100);
			}
		},
		[messages, mutate],
	);

	/**
	 * Update an existing message with optimistic updates - Performance optimized
	 */
	const updateMessage = useCallback(
		async (updatedMessage: InteractiveMessage, apiPayload: UpdateMessagePayload): Promise<void> => {
			const operationId = performanceTracker.startOperation("update-message");
			const originalMessages = messages;

			try {
				// 1. Optimistic update - find and replace message
				await mutate(
					(current?: InteractiveMessage[]) => {
						if (!current) return [updatedMessage];

						return current.map((msg: InteractiveMessage) => (msg.id === updatedMessage.id ? updatedMessage : msg));
					},
					{ revalidate: false },
				);

				// 2. API call with performance tracking
				const result = await interactiveMessagesApi.update(apiPayload);

				// 3. Update with real data from API
				await mutate(
					(current?: InteractiveMessage[]) => {
						if (!current) return [result];

						return current.map((msg: InteractiveMessage) => (msg.id === result.id ? result : msg));
					},
					{ revalidate: false },
				);

				performanceTracker.endOperation(operationId, true);
			} catch (error) {
				// 4. Rollback on error
				await mutate(originalMessages, { revalidate: false });
				performanceTracker.endOperation(operationId, false, error instanceof Error ? error.message : "Unknown error");
				throw error;
			} finally {
				// 5. Final revalidation to ensure consistency (debounced)
				setTimeout(() => mutate(), 100);
			}
		},
		[messages, mutate],
	);

	/**
	 * Delete a message with optimistic updates - Performance optimized
	 */
	const deleteMessage = useCallback(
		async (messageId: string): Promise<void> => {
			const operationId = performanceTracker.startOperation("delete-message");
			const originalMessages = messages;

			try {
				// 1. Optimistic update - remove message from list
				await mutate(
					(current?: InteractiveMessage[]) => {
						if (!current) return [];

						return current.filter((msg: InteractiveMessage) => msg.id !== messageId);
					},
					{ revalidate: false },
				);

				// 2. API call with performance tracking
				await interactiveMessagesApi.delete(messageId);

				performanceTracker.endOperation(operationId, true);
			} catch (error) {
				// 3. Rollback on error
				await mutate(originalMessages, { revalidate: false });
				performanceTracker.endOperation(operationId, false, error instanceof Error ? error.message : "Unknown error");
				throw error;
			} finally {
				// 4. Final revalidation to ensure consistency (debounced)
				setTimeout(() => mutate(), 100);
			}
		},
		[messages, mutate],
	);

	// Memoized return object to prevent unnecessary re-renders
	return useMemo(
		() => ({
			messages,
			isLoading,
			error,
			addMessage,
			updateMessage,
			deleteMessage,
			mutate,
		}),
		[messages, isLoading, error, addMessage, updateMessage, deleteMessage, mutate],
	);
}

export default useInteractiveMessages;
