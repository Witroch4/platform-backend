// app/admin/mtf-diamante/hooks/useApiKeys.ts
// React hook for managing API keys data with React Query (TanStack Query v5)
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiKeysApi } from "../lib/api-clients";
import { mtfDiamanteQueryKeys } from "../lib/query-keys";
import type { MtfDiamanteApiKey, CreateApiKeyPayload, UpdateApiKeyPayload, UseApiKeysReturn } from "../lib/types";

// Hook for fetching all API keys
export function useApiKeys(isPaused: boolean = false) {
	const { data, error, isLoading } = useQuery({
		queryKey: mtfDiamanteQueryKeys.apiKeys.all(),
		queryFn: apiKeysApi.getAll,
		enabled: !isPaused,
		staleTime: 5 * 60 * 1000, // config data: 5min
		refetchInterval: isPaused ? false : 30_000,
		placeholderData: (prev) => prev,
	});

	return {
		apiKeys: data ?? [],
		isLoading,
		error,
	};
}

// Hook for creating a new API key
export function useCreateApiKey() {
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: apiKeysApi.create,
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.apiKeys.all() });
		},
	});

	return {
		createApiKey: mutation.mutateAsync,
		isCreating: mutation.isPending,
		error: mutation.error?.message ?? null,
	};
}

// Hook for updating an API key
export function useUpdateApiKey() {
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: apiKeysApi.update,
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.apiKeys.all() });
		},
	});

	return {
		updateApiKey: mutation.mutateAsync,
		isUpdating: mutation.isPending,
		error: mutation.error?.message ?? null,
	};
}

// Hook for deleting an API key
export function useDeleteApiKey() {
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: apiKeysApi.delete,
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.apiKeys.all() });
		},
	});

	return {
		deleteApiKey: mutation.mutateAsync,
		isDeleting: mutation.isPending,
		error: mutation.error?.message ?? null,
	};
}

// Combined hook for all API key operations with optimistic updates and rollback
export function useApiKeysManager(isPaused: boolean = false): UseApiKeysReturn {
	const { apiKeys, isLoading, error: fetchError } = useApiKeys(isPaused);
	const queryClient = useQueryClient();

	const createMutation = useMutation({
		mutationFn: (vars: { payload: CreateApiKeyPayload; optimistic: MtfDiamanteApiKey }) =>
			apiKeysApi.create(vars.payload),
		onMutate: async (vars) => {
			await queryClient.cancelQueries({ queryKey: mtfDiamanteQueryKeys.apiKeys.all() });
			const previous = queryClient.getQueryData<MtfDiamanteApiKey[]>(mtfDiamanteQueryKeys.apiKeys.all());
			queryClient.setQueryData<MtfDiamanteApiKey[]>(
				mtfDiamanteQueryKeys.apiKeys.all(),
				(current = []) => [vars.optimistic, ...current],
			);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous) {
				queryClient.setQueryData(mtfDiamanteQueryKeys.apiKeys.all(), context.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.apiKeys.all() });
		},
	});

	const updateMutation = useMutation({
		mutationFn: (vars: { payload: UpdateApiKeyPayload; optimistic: MtfDiamanteApiKey }) =>
			apiKeysApi.update(vars.payload),
		onMutate: async (vars) => {
			await queryClient.cancelQueries({ queryKey: mtfDiamanteQueryKeys.apiKeys.all() });
			const previous = queryClient.getQueryData<MtfDiamanteApiKey[]>(mtfDiamanteQueryKeys.apiKeys.all());
			queryClient.setQueryData<MtfDiamanteApiKey[]>(
				mtfDiamanteQueryKeys.apiKeys.all(),
				(current = []) => current.map((k) => (k.id === vars.optimistic.id ? vars.optimistic : k)),
			);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous) {
				queryClient.setQueryData(mtfDiamanteQueryKeys.apiKeys.all(), context.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.apiKeys.all() });
		},
	});

	const deleteMutation = useMutation({
		mutationFn: apiKeysApi.delete,
		onMutate: async (apiKeyId: string) => {
			await queryClient.cancelQueries({ queryKey: mtfDiamanteQueryKeys.apiKeys.all() });
			const previous = queryClient.getQueryData<MtfDiamanteApiKey[]>(mtfDiamanteQueryKeys.apiKeys.all());
			queryClient.setQueryData<MtfDiamanteApiKey[]>(
				mtfDiamanteQueryKeys.apiKeys.all(),
				(current = []) => current.filter((k) => k.id !== apiKeyId),
			);
			return { previous };
		},
		onError: (_err, _apiKeyId, context) => {
			if (context?.previous) {
				queryClient.setQueryData(mtfDiamanteQueryKeys.apiKeys.all(), context.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.apiKeys.all() });
		},
	});

	const addApiKey = async (optimisticApiKey: MtfDiamanteApiKey, apiPayload: CreateApiKeyPayload): Promise<void> => {
		await createMutation.mutateAsync({ payload: apiPayload, optimistic: optimisticApiKey });
	};

	const updateApiKeyWithRollback = async (updatedApiKey: MtfDiamanteApiKey, apiPayload: UpdateApiKeyPayload): Promise<void> => {
		await updateMutation.mutateAsync({ payload: apiPayload, optimistic: updatedApiKey });
	};

	const deleteApiKeyWithRollback = async (apiKeyId: string): Promise<void> => {
		await deleteMutation.mutateAsync(apiKeyId);
	};

	const invalidate = () => queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.apiKeys.all() });

	return {
		apiKeys,
		isLoading,
		addApiKey,
		updateApiKey: updateApiKeyWithRollback,
		deleteApiKey: deleteApiKeyWithRollback,
		error: fetchError,
		mutate: invalidate,
	};
}
