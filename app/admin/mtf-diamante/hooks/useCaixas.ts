// app/admin/mtf-diamante/hooks/useCaixas.ts
// React hook for managing caixas (ChatwitInbox) data with React Query (TanStack Query v5)
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { caixasApi } from "../lib/api-clients";
import { mtfDiamanteQueryKeys } from "../lib/query-keys";
import type { ChatwitInbox, CreateCaixaPayload, UpdateCaixaPayload, UseCaixasReturn } from "../lib/types";

// Hook for fetching all caixas WITH AI assistants data
export function useCaixas(isPaused: boolean = false) {
	const { data, error, isLoading } = useQuery({
		queryKey: mtfDiamanteQueryKeys.caixas.all(),
		queryFn: caixasApi.getAll,
		enabled: !isPaused,
		staleTime: 30_000,
		refetchInterval: isPaused ? false : 30_000,
		placeholderData: (prev) => prev,
	});

	return {
		caixas: data ?? [],
		isLoading,
		error,
	};
}

// Hook for creating a new caixa
export function useCreateCaixa() {
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: caixasApi.create,
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.caixas.all() });
		},
	});

	return {
		createCaixa: mutation.mutateAsync,
		isCreating: mutation.isPending,
		error: mutation.error,
		data: mutation.data,
	};
}

// Hook for updating a caixa
export function useUpdateCaixa() {
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: caixasApi.update,
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.caixas.all() });
		},
	});

	return {
		updateCaixa: mutation.mutateAsync,
		isUpdating: mutation.isPending,
		error: mutation.error,
		data: mutation.data,
	};
}

// Combined hook for all caixa operations with optimistic updates and rollback
export function useCaixasManager(isPaused: boolean = false): UseCaixasReturn {
	const { caixas, isLoading, error: fetchError } = useCaixas(isPaused);
	const queryClient = useQueryClient();

	const createMutation = useMutation({
		mutationFn: (vars: { payload: CreateCaixaPayload; optimistic: ChatwitInbox }) =>
			caixasApi.create(vars.payload),
		onMutate: async (vars) => {
			await queryClient.cancelQueries({ queryKey: mtfDiamanteQueryKeys.caixas.all() });
			const previous = queryClient.getQueryData<ChatwitInbox[]>(mtfDiamanteQueryKeys.caixas.all());
			queryClient.setQueryData<ChatwitInbox[]>(
				mtfDiamanteQueryKeys.caixas.all(),
				(current = []) => [...current, vars.optimistic],
			);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous) {
				queryClient.setQueryData(mtfDiamanteQueryKeys.caixas.all(), context.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.caixas.all() });
		},
	});

	const updateMutation = useMutation({
		mutationFn: (vars: { payload: UpdateCaixaPayload; optimistic: ChatwitInbox }) =>
			caixasApi.update(vars.payload),
		onMutate: async (vars) => {
			await queryClient.cancelQueries({ queryKey: mtfDiamanteQueryKeys.caixas.all() });
			const previous = queryClient.getQueryData<ChatwitInbox[]>(mtfDiamanteQueryKeys.caixas.all());
			queryClient.setQueryData<ChatwitInbox[]>(
				mtfDiamanteQueryKeys.caixas.all(),
				(current = []) => current.map((c) => (c.id === vars.optimistic.id ? vars.optimistic : c)),
			);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous) {
				queryClient.setQueryData(mtfDiamanteQueryKeys.caixas.all(), context.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.caixas.all() });
		},
	});

	const deleteMutation = useMutation({
		mutationFn: caixasApi.delete,
		onMutate: async (caixaId: string) => {
			await queryClient.cancelQueries({ queryKey: mtfDiamanteQueryKeys.caixas.all() });
			const previous = queryClient.getQueryData<ChatwitInbox[]>(mtfDiamanteQueryKeys.caixas.all());
			queryClient.setQueryData<ChatwitInbox[]>(
				mtfDiamanteQueryKeys.caixas.all(),
				(current = []) => current.filter((c) => c.id !== caixaId),
			);
			return { previous };
		},
		onError: (_err, _caixaId, context) => {
			if (context?.previous) {
				queryClient.setQueryData(mtfDiamanteQueryKeys.caixas.all(), context.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.caixas.all() });
		},
	});

	const addCaixa = async (optimisticCaixa: ChatwitInbox, apiPayload: CreateCaixaPayload): Promise<void> => {
		await createMutation.mutateAsync({ payload: apiPayload, optimistic: optimisticCaixa });
	};

	const updateCaixaWithRollback = async (updatedCaixa: ChatwitInbox, apiPayload: UpdateCaixaPayload): Promise<void> => {
		await updateMutation.mutateAsync({ payload: apiPayload, optimistic: updatedCaixa });
	};

	const deleteCaixaWithRollback = async (caixaId: string): Promise<void> => {
		await deleteMutation.mutateAsync(caixaId);
	};

	const invalidate = () => queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.caixas.all() });

	return {
		caixas,
		isLoading,
		addCaixa,
		updateCaixa: updateCaixaWithRollback,
		deleteCaixa: deleteCaixaWithRollback,
		error: fetchError,
		mutate: invalidate,
	};
}
