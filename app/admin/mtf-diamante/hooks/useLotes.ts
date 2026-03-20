// app/admin/mtf-diamante/hooks/useLotes.ts
// React hook for managing lotes data with SWR
import useSWR from "swr";
import { useState } from "react";
import { lotesApi } from "../lib/api-clients";
import type { MtfDiamanteLote, CreateLotePayload, UpdateLotePayload, UseLotesReturn } from "../lib/types";

// Hook for fetching all lotes
export function useLotes(isPaused: boolean = false) {
	const { data, error, isLoading, mutate } = useSWR<MtfDiamanteLote[]>(
		isPaused ? null : "/api/admin/mtf-diamante/lotes",
		lotesApi.getAll,
		{
			revalidateOnFocus: !isPaused,
			revalidateOnReconnect: !isPaused,
			refreshInterval: isPaused ? 0 : 30000, // 30 seconds
			dedupingInterval: 30000,
		},
	);

	return {
		lotes: data ?? [],
		isLoading,
		error,
		mutate,
	};
}

// Hook for creating a new lote
export function useCreateLote() {
	const [isCreating, setIsCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const createNewLote = async (loteData: CreateLotePayload) => {
		setIsCreating(true);
		setError(null);

		try {
			const result = await lotesApi.create(loteData);
			return result;
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : "Erro desconhecido";
			setError(errorMessage);
			throw err;
		} finally {
			setIsCreating(false);
		}
	};

	return {
		createLote: createNewLote,
		isCreating,
		error,
	};
}

// Hook for updating a lote
export function useUpdateLote() {
	const [isUpdating, setIsUpdating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const updateExistingLote = async (payload: UpdateLotePayload) => {
		setIsUpdating(true);
		setError(null);

		try {
			const result = await lotesApi.update(payload);
			return result;
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : "Erro desconhecido";
			setError(errorMessage);
			throw err;
		} finally {
			setIsUpdating(false);
		}
	};

	return {
		updateLote: updateExistingLote,
		isUpdating,
		error,
	};
}

// Hook for deleting a lote
export function useDeleteLote() {
	const [isDeleting, setIsDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const deleteExistingLote = async (id: string) => {
		setIsDeleting(true);
		setError(null);

		try {
			await lotesApi.delete(id);
			return true;
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : "Erro desconhecido";
			setError(errorMessage);
			throw err;
		} finally {
			setIsDeleting(false);
		}
	};

	return {
		deleteLote: deleteExistingLote,
		isDeleting,
		error,
	};
}

// Combined hook for all lote operations with optimistic updates and rollback
export function useLotesManager(isPaused: boolean = false): UseLotesReturn {
	const { lotes, isLoading, error: fetchError, mutate } = useLotes(isPaused);

	/**
	 * Add a new lote with optimistic updates and automatic rollback
	 */
	const addLote = async (optimisticLote: MtfDiamanteLote, apiPayload: CreateLotePayload): Promise<void> => {
		const originalLotes = lotes;

		try {
			// 1. Optimistic update - add lote to the beginning
			await mutate([optimisticLote, ...originalLotes], { revalidate: false });

			// 2. API call
			const result = await lotesApi.create(apiPayload);

			// 3. Update with real data from API (replace temp ID with real ID)
			await mutate(
				(current) => {
					if (!current) return [result];

					return current.map((lote) => (lote.id === optimisticLote.id ? result : lote));
				},
				{ revalidate: false },
			);
		} catch (error) {
			// 4. Rollback on error
			await mutate(originalLotes, { revalidate: false });
			throw error;
		} finally {
			// 5. Final revalidation to ensure consistency
			await mutate();
		}
	};

	/**
	 * Update an existing lote with optimistic updates and automatic rollback
	 */
	const updateLoteWithRollback = async (updatedLote: MtfDiamanteLote, apiPayload: UpdateLotePayload): Promise<void> => {
		const originalLotes = lotes;

		try {
			// 1. Optimistic update - find and replace lote
			await mutate(
				(current) => {
					if (!current) return [updatedLote];

					return current.map((lote) => (lote.id === updatedLote.id ? updatedLote : lote));
				},
				{ revalidate: false },
			);

			// 2. API call
			const result = await lotesApi.update(apiPayload);

			// 3. Update with real data from API
			await mutate(
				(current) => {
					if (!current) return [result];

					return current.map((lote) => (lote.id === result.id ? result : lote));
				},
				{ revalidate: false },
			);
		} catch (error) {
			// 4. Rollback on error
			await mutate(originalLotes, { revalidate: false });
			throw error;
		} finally {
			// 5. Final revalidation to ensure consistency
			await mutate();
		}
	};

	/**
	 * Delete a lote with optimistic updates and automatic rollback
	 */
	const deleteLoteWithRollback = async (loteId: string): Promise<void> => {
		const originalLotes = lotes;

		try {
			// 1. Optimistic update - remove lote from list
			await mutate(
				(current) => {
					if (!current) return [];

					return current.filter((lote) => lote.id !== loteId);
				},
				{ revalidate: false },
			);

			// 2. API call
			await lotesApi.delete(loteId);
		} catch (error) {
			// 3. Rollback on error
			await mutate(originalLotes, { revalidate: false });
			throw error;
		} finally {
			// 4. Final revalidation to ensure consistency
			await mutate();
		}
	};

	return {
		// Data
		lotes,
		isLoading,

		// Operations with optimistic updates and rollback
		addLote,
		updateLote: updateLoteWithRollback,
		deleteLote: deleteLoteWithRollback,

		// Errors
		error: fetchError,

		// Manual refresh
		mutate,
	};
}
