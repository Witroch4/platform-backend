// app/admin/mtf-diamante/hooks/useCaixas.ts
// React hook for managing caixas (ChatwitInbox) data with SWR
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import { useSWRConfig } from "swr";
import React from "react";
import { caixasApi } from "../lib/api-clients";
import type { ChatwitInbox, CreateCaixaPayload, UpdateCaixaPayload, UseCaixasReturn } from "../lib/types";

// Hook for fetching all caixas WITH AI assistants data
export function useCaixas(isPaused: boolean = false) {
	const { data, error, isLoading, mutate } = useSWR<ChatwitInbox[]>(
		isPaused ? null : "/api/admin/mtf-diamante/inbox-view?dataType=caixas",
		caixasApi.getAll,
		{
			revalidateOnFocus: !isPaused,
			revalidateOnReconnect: !isPaused,
			refreshInterval: isPaused ? 0 : 30000, // 30 seconds
			dedupingInterval: 25000, // Conforme guia SWR 2.3: dedupe < refresh
			keepPreviousData: true, // Conforme guia SWR 2.3 - sem flash na UI
		},
	);

	return {
		caixas: data || [],
		isLoading,
		error,
		mutate,
	};
}

// Hook for creating a new caixa (conforme guia SWR 2.3 - useSWRMutation)
export function useCreateCaixa() {
	// useSWRMutation para operações remotas conforme guia SWR 2.3
	const { trigger, isMutating, error, data } = useSWRMutation(
		"/api/admin/mtf-diamante/caixas",
		async (_url: string, { arg }: { arg: CreateCaixaPayload }) => {
			return await caixasApi.create(arg);
		},
	);

	return {
		createCaixa: trigger,
		isCreating: isMutating,
		error,
		data,
	};
}

// Hook for updating a caixa (conforme guia SWR 2.3 - useSWRMutation)
export function useUpdateCaixa() {
	// useSWRMutation para operações remotas conforme guia SWR 2.3
	const { trigger, isMutating, error, data } = useSWRMutation(
		"/api/admin/mtf-diamante/caixas/update",
		async (_url: string, { arg }: { arg: UpdateCaixaPayload }) => {
			return await caixasApi.update(arg);
		},
	);

	return {
		updateCaixa: trigger,
		isUpdating: isMutating,
		error,
		data,
	};
}

// (removido) usar deleteCaixa do useCaixasManager

// Combined hook for all caixa operations with optimistic updates and rollback
export function useCaixasManager(isPaused: boolean = false): UseCaixasReturn {
	const { caixas, isLoading, error: fetchError, mutate } = useCaixas(isPaused);
	const { mutate: globalMutate } = useSWRConfig();

	// useSWRMutation hooks para operações remotas (mesma key híbrida para coordenação com useSWR)
	const { trigger: createCaixa } = useSWRMutation(
		"/api/admin/mtf-diamante/inbox-view?dataType=caixas", // mesma key híbrida da lista para cancelar GETs pendentes
		async (_url: string, { arg }: { arg: CreateCaixaPayload }) => {
			return await caixasApi.create(arg);
		},
	);

	const { trigger: updateCaixa } = useSWRMutation(
		"/api/admin/mtf-diamante/inbox-view?dataType=caixas", // mesma key híbrida da lista
		async (_url: string, { arg }: { arg: UpdateCaixaPayload }) => {
			return await caixasApi.update(arg);
		},
	);

	const { trigger: deleteCaixa } = useSWRMutation(
		"/api/admin/mtf-diamante/inbox-view?dataType=caixas", // mesma key híbrida da lista
		async (_url: string, { arg }: { arg: string }) => {
			return await caixasApi.delete(arg);
		},
	);

	/**
	 * Add a new caixa with optimistic updates and automatic rollback
	 * ✅ SIMPLIFICADO: Sem cache Redis - endpoint sempre retorna dados frescos
	 */
	const addCaixa = async (optimisticCaixa: ChatwitInbox, apiPayload: CreateCaixaPayload): Promise<void> => {
		try {
			// ✅ FONTE ÚNICA: inbox-view com dataType=caixas (sempre sem cache)
			const SINGLE_SOURCE_KEY = "/api/admin/mtf-diamante/inbox-view?dataType=caixas";

			await mutate(
				// 👉 UMA ÚNICA PROMISE: criação + retorno do novo estado
				(async () => {
					const curr = caixas || [];
					const created = await caixasApi.create(apiPayload);
					// 🔥 ORDEM NATURAL: adicionar no FINAL da lista
					return [...curr.filter((c) => c.id !== optimisticCaixa.id), created];
				})(),
				{
					// adiciona otimista imediatamente no FINAL
					optimisticData: (curr: ChatwitInbox[] = []) => [...curr, optimisticCaixa],
					rollbackOnError: true,
					populateCache: true,
					revalidate: false,
				},
			);

			console.log(`✅ [addCaixa] Caixa adicionada com sucesso (sem cache Redis)`);
		} catch (error) {
			console.error("[addCaixa] Error creating caixa:", error);
			throw error; // Rethrow para o toast.promise capturar
		}
	};

	/**
	 * Update an existing caixa with optimistic updates and automatic rollback
	 * ✅ SIMPLIFICADO: Sem cache Redis - endpoint sempre retorna dados frescos
	 */
	const updateCaixaWithRollback = async (updatedCaixa: ChatwitInbox, apiPayload: UpdateCaixaPayload): Promise<void> => {
		await mutate(
			// 👉 UMA ÚNICA PROMISE: rede + retorno do novo estado
			(async () => {
				const curr = caixas || [];
				const result = await caixasApi.update(apiPayload);
				return curr.map((caixa) => (caixa.id === result.id ? result : caixa));
			})(),
			{
				// atualiza otimista imediatamente
				optimisticData: (curr: ChatwitInbox[] = []) =>
					curr.map((caixa) => (caixa.id === updatedCaixa.id ? updatedCaixa : caixa)),
				rollbackOnError: true,
				populateCache: true,
				revalidate: false,
			},
		);

		console.log(`✅ [updateCaixa] Caixa atualizada com sucesso (sem cache Redis)`);
	};

	/**
	 * Delete a caixa with optimistic updates and automatic rollback
	 * ✅ SIMPLIFICADO: Sem cache Redis - endpoint sempre retorna dados frescos
	 */
	const deleteCaixaWithRollback = async (caixaId: string): Promise<void> => {
		await mutate(
			// 👉 UMA ÚNICA PROMISE: rede + retorno do novo estado
			(async () => {
				const curr = caixas || [];
				await caixasApi.delete(caixaId);
				return curr.filter((c) => c.id !== caixaId);
			})(),
			{
				// remove otimista imediatamente
				optimisticData: (curr: ChatwitInbox[] = []) => curr.filter((c) => c.id !== caixaId),
				rollbackOnError: true,
				populateCache: true,
				revalidate: false,
			},
		);

		console.log(`✅ [deleteCaixa] Caixa excluída com sucesso (sem cache Redis)`);
	};

	return {
		// Data
		caixas,
		isLoading,

		// Operations with optimistic updates and rollback
		addCaixa,
		updateCaixa: updateCaixaWithRollback,
		deleteCaixa: deleteCaixaWithRollback,

		// Errors
		error: fetchError,

		// Manual refresh
		mutate,
	};
}
