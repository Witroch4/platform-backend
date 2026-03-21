// app/admin/mtf-diamante/hooks/useVariaveis.ts
// React hook for managing variáveis data with React Query (TanStack Query v5)
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { variaveisApi } from "../lib/api-clients";
import { mtfDiamanteQueryKeys } from "../lib/query-keys";
import type {
	MtfDiamanteVariavel,
	CreateVariavelPayload,
	UpdateVariavelPayload,
	UseVariaveisReturn,
} from "../lib/types";

// Hook for fetching all variáveis
export function useVariaveis(isPaused: boolean = false) {
	const { data, error, isLoading } = useQuery({
		queryKey: mtfDiamanteQueryKeys.variaveis.all(),
		queryFn: variaveisApi.getAll,
		enabled: !isPaused,
		staleTime: 30_000,
		refetchInterval: isPaused ? false : 30_000,
		placeholderData: (prev) => prev,
	});

	return {
		variaveis: data ?? [],
		isLoading,
		error,
	};
}

// Hook for creating a new variável
export function useCreateVariavel() {
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: variaveisApi.create,
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.variaveis.all() });
		},
	});

	return {
		createVariavel: mutation.mutateAsync,
		isCreating: mutation.isPending,
		error: mutation.error?.message ?? null,
	};
}

// Hook for updating a variável
export function useUpdateVariavel() {
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: variaveisApi.update,
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.variaveis.all() });
		},
	});

	return {
		updateVariavel: mutation.mutateAsync,
		isUpdating: mutation.isPending,
		error: mutation.error?.message ?? null,
	};
}

// Hook for deleting a variável
export function useDeleteVariavel() {
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: variaveisApi.delete,
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.variaveis.all() });
		},
	});

	return {
		deleteVariavel: mutation.mutateAsync,
		isDeleting: mutation.isPending,
		error: mutation.error?.message ?? null,
	};
}

// Combined hook for all variável operations with optimistic updates and rollback
export function useVariaveisManager(isPaused: boolean = false): UseVariaveisReturn {
	const { variaveis, isLoading, error: fetchError } = useVariaveis(isPaused);
	const queryClient = useQueryClient();

	const createMutation = useMutation({
		mutationFn: (vars: { payload: CreateVariavelPayload; optimistic: MtfDiamanteVariavel }) =>
			variaveisApi.create(vars.payload),
		onMutate: async (vars) => {
			await queryClient.cancelQueries({ queryKey: mtfDiamanteQueryKeys.variaveis.all() });
			const previous = queryClient.getQueryData<MtfDiamanteVariavel[]>(mtfDiamanteQueryKeys.variaveis.all());
			queryClient.setQueryData<MtfDiamanteVariavel[]>(
				mtfDiamanteQueryKeys.variaveis.all(),
				(current = []) => [vars.optimistic, ...current],
			);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous) {
				queryClient.setQueryData(mtfDiamanteQueryKeys.variaveis.all(), context.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.variaveis.all() });
		},
	});

	const updateMutation = useMutation({
		mutationFn: (vars: { payload: UpdateVariavelPayload; optimistic: MtfDiamanteVariavel }) =>
			variaveisApi.update(vars.payload),
		onMutate: async (vars) => {
			await queryClient.cancelQueries({ queryKey: mtfDiamanteQueryKeys.variaveis.all() });
			const previous = queryClient.getQueryData<MtfDiamanteVariavel[]>(mtfDiamanteQueryKeys.variaveis.all());
			queryClient.setQueryData<MtfDiamanteVariavel[]>(
				mtfDiamanteQueryKeys.variaveis.all(),
				(current = []) => current.map((v) => (v.id === vars.optimistic.id ? vars.optimistic : v)),
			);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous) {
				queryClient.setQueryData(mtfDiamanteQueryKeys.variaveis.all(), context.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.variaveis.all() });
		},
	});

	const deleteMutation = useMutation({
		mutationFn: variaveisApi.delete,
		onMutate: async (variavelId: string) => {
			await queryClient.cancelQueries({ queryKey: mtfDiamanteQueryKeys.variaveis.all() });
			const previous = queryClient.getQueryData<MtfDiamanteVariavel[]>(mtfDiamanteQueryKeys.variaveis.all());
			queryClient.setQueryData<MtfDiamanteVariavel[]>(
				mtfDiamanteQueryKeys.variaveis.all(),
				(current = []) => current.filter((v) => v.id !== variavelId),
			);
			return { previous };
		},
		onError: (_err, _variavelId, context) => {
			if (context?.previous) {
				queryClient.setQueryData(mtfDiamanteQueryKeys.variaveis.all(), context.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.variaveis.all() });
		},
	});

	const addVariavel = async (optimisticVariavel: MtfDiamanteVariavel, apiPayload: CreateVariavelPayload): Promise<void> => {
		await createMutation.mutateAsync({ payload: apiPayload, optimistic: optimisticVariavel });
	};

	const updateVariavelWithRollback = async (updatedVariavel: MtfDiamanteVariavel, apiPayload: UpdateVariavelPayload): Promise<void> => {
		await updateMutation.mutateAsync({ payload: apiPayload, optimistic: updatedVariavel });
	};

	const deleteVariavelWithRollback = async (variavelId: string): Promise<void> => {
		await deleteMutation.mutateAsync(variavelId);
	};

	const invalidate = () => queryClient.invalidateQueries({ queryKey: mtfDiamanteQueryKeys.variaveis.all() });

	return {
		variaveis,
		isLoading,
		addVariavel,
		updateVariavel: updateVariavelWithRollback,
		deleteVariavel: deleteVariavelWithRollback,
		error: fetchError,
		mutate: invalidate,
	};
}
