// app/admin/mtf-diamante/hooks/useLotes.ts
// React hook for managing lotes data with React Query (TanStack Query v5)
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { lotesApi } from "../lib/api-clients";
import { mtfDiamanteQueryKeys } from "../lib/query-keys";
import type { MtfDiamanteLote, CreateLotePayload, UpdateLotePayload, UseLotesReturn } from "../lib/types";

// Hook for fetching all lotes
export function useLotes(isPaused: boolean = false) {
	const { data, error, isLoading } = useQuery({
		queryKey: mtfDiamanteQueryKeys.lotes.all(),
		queryFn: lotesApi.getAll,
		enabled: !isPaused,
		staleTime: 30_000,
		refetchInterval: isPaused ? false : 30_000,
		placeholderData: (prev) => prev,
	});

	return {
		lotes: data ?? [],
		isLoading,
		error,
	};
}

// Hook for creating a new lote
export function useCreateLote() {
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: lotesApi.create,
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.lotes.all() });
		},
	});

	return {
		createLote: mutation.mutateAsync,
		isCreating: mutation.isPending,
		error: mutation.error?.message ?? null,
	};
}

// Hook for updating a lote
export function useUpdateLote() {
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: lotesApi.update,
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.lotes.all() });
		},
	});

	return {
		updateLote: mutation.mutateAsync,
		isUpdating: mutation.isPending,
		error: mutation.error?.message ?? null,
	};
}

// Hook for deleting a lote
export function useDeleteLote() {
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: lotesApi.delete,
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.lotes.all() });
		},
	});

	return {
		deleteLote: mutation.mutateAsync,
		isDeleting: mutation.isPending,
		error: mutation.error?.message ?? null,
	};
}

// Combined hook for all lote operations with optimistic updates and rollback
export function useLotesManager(isPaused: boolean = false): UseLotesReturn {
	const { lotes, isLoading, error: fetchError } = useLotes(isPaused);
	const queryClient = useQueryClient();

	const createMutation = useMutation({
		mutationFn: (vars: { payload: CreateLotePayload; optimistic: MtfDiamanteLote }) =>
			lotesApi.create(vars.payload),
		onMutate: async (vars) => {
			await queryClient.cancelQueries({ queryKey: mtfDiamanteQueryKeys.lotes.all() });
			const previous = queryClient.getQueryData<MtfDiamanteLote[]>(mtfDiamanteQueryKeys.lotes.all());
			queryClient.setQueryData<MtfDiamanteLote[]>(
				mtfDiamanteQueryKeys.lotes.all(),
				(current = []) => [vars.optimistic, ...current],
			);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous) {
				queryClient.setQueryData(mtfDiamanteQueryKeys.lotes.all(), context.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.lotes.all() });
		},
	});

	const updateMutation = useMutation({
		mutationFn: (vars: { payload: UpdateLotePayload; optimistic: MtfDiamanteLote }) =>
			lotesApi.update(vars.payload),
		onMutate: async (vars) => {
			await queryClient.cancelQueries({ queryKey: mtfDiamanteQueryKeys.lotes.all() });
			const previous = queryClient.getQueryData<MtfDiamanteLote[]>(mtfDiamanteQueryKeys.lotes.all());
			queryClient.setQueryData<MtfDiamanteLote[]>(
				mtfDiamanteQueryKeys.lotes.all(),
				(current = []) => current.map((lote) => (lote.id === vars.optimistic.id ? vars.optimistic : lote)),
			);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous) {
				queryClient.setQueryData(mtfDiamanteQueryKeys.lotes.all(), context.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.lotes.all() });
		},
	});

	const deleteMutation = useMutation({
		mutationFn: lotesApi.delete,
		onMutate: async (loteId: string) => {
			await queryClient.cancelQueries({ queryKey: mtfDiamanteQueryKeys.lotes.all() });
			const previous = queryClient.getQueryData<MtfDiamanteLote[]>(mtfDiamanteQueryKeys.lotes.all());
			queryClient.setQueryData<MtfDiamanteLote[]>(
				mtfDiamanteQueryKeys.lotes.all(),
				(current = []) => current.filter((lote) => lote.id !== loteId),
			);
			return { previous };
		},
		onError: (_err, _loteId, context) => {
			if (context?.previous) {
				queryClient.setQueryData(mtfDiamanteQueryKeys.lotes.all(), context.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.lotes.all() });
		},
	});

	const addLote = async (optimisticLote: MtfDiamanteLote, apiPayload: CreateLotePayload): Promise<void> => {
		await createMutation.mutateAsync({ payload: apiPayload, optimistic: optimisticLote });
	};

	const updateLoteWithRollback = async (updatedLote: MtfDiamanteLote, apiPayload: UpdateLotePayload): Promise<void> => {
		await updateMutation.mutateAsync({ payload: apiPayload, optimistic: updatedLote });
	};

	const deleteLoteWithRollback = async (loteId: string): Promise<void> => {
		await deleteMutation.mutateAsync(loteId);
	};

	const invalidate = () => queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.lotes.all() });

	return {
		lotes,
		isLoading,
		addLote,
		updateLote: updateLoteWithRollback,
		deleteLote: deleteLoteWithRollback,
		error: fetchError,
		mutate: invalidate,
	};
}
