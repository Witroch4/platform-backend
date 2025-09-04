// app/admin/mtf-diamante/hooks/useCaixas.ts
// React hook for managing caixas (ChatwitInbox) data with SWR
import useSWR from 'swr';
import { useState } from 'react';
import { caixasApi } from '../lib/api-clients';
import type { ChatwitInbox, CreateCaixaPayload, UpdateCaixaPayload, UseCaixasReturn } from '../lib/types';

// Hook for fetching all caixas
export function useCaixas(isPaused: boolean = false) {
  const { data, error, isLoading, mutate } = useSWR<ChatwitInbox[]>(
    isPaused ? null : '/api/admin/mtf-diamante/caixas',
    caixasApi.getAll,
    {
      revalidateOnFocus: !isPaused,
      revalidateOnReconnect: !isPaused,
      refreshInterval: isPaused ? 0 : 30000, // 30 seconds
      dedupingInterval: 30000,
    }
  );

  return {
    caixas: data || [],
    isLoading,
    error,
    mutate,
  };
}

// Hook for creating a new caixa
export function useCreateCaixa() {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createNewCaixa = async (caixaData: CreateCaixaPayload) => {
    setIsCreating(true);
    setError(null);

    try {
      const result = await caixasApi.create(caixaData);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      throw err;
    } finally {
      setIsCreating(false);
    }
  };

  return {
    createCaixa: createNewCaixa,
    isCreating,
    error,
  };
}

// Hook for updating a caixa
export function useUpdateCaixa() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateExistingCaixa = async (payload: UpdateCaixaPayload) => {
    setIsUpdating(true);
    setError(null);

    try {
      const result = await caixasApi.update(payload);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      throw err;
    } finally {
      setIsUpdating(false);
    }
  };

  return {
    updateCaixa: updateExistingCaixa,
    isUpdating,
    error,
  };
}

// Hook for deleting a caixa
export function useDeleteCaixa() {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteExistingCaixa = async (id: string) => {
    setIsDeleting(true);
    setError(null);

    try {
      await caixasApi.delete(id);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      throw err;
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    deleteCaixa: deleteExistingCaixa,
    isDeleting,
    error,
  };
}

// Combined hook for all caixa operations with optimistic updates and rollback
export function useCaixasManager(isPaused: boolean = false): UseCaixasReturn {
  const { caixas, isLoading, error: fetchError, mutate } = useCaixas(isPaused);

  /**
   * Add a new caixa with optimistic updates and automatic rollback
   */
  const addCaixa = async (optimisticCaixa: ChatwitInbox, apiPayload: CreateCaixaPayload): Promise<void> => {
    const originalCaixas = caixas;
    
    try {
      // 1. Optimistic update - add caixa to the beginning
      await mutate([optimisticCaixa, ...originalCaixas], { revalidate: false });
      
      // 2. API call
      const result = await caixasApi.create(apiPayload);
      
      // 3. Update with real data from API (replace temp ID with real ID)
      await mutate((current) => {
        if (!current) return [result];
        
        return current.map(caixa => 
          caixa.id === optimisticCaixa.id ? result : caixa
        );
      }, { revalidate: false });
      
    } catch (error) {
      // 4. Rollback on error
      await mutate(originalCaixas, { revalidate: false });
      throw error;
    } finally {
      // 5. Final revalidation to ensure consistency
      await mutate();
    }
  };

  /**
   * Update an existing caixa with optimistic updates and automatic rollback
   */
  const updateCaixaWithRollback = async (updatedCaixa: ChatwitInbox, apiPayload: UpdateCaixaPayload): Promise<void> => {
    const originalCaixas = caixas;
    
    try {
      // 1. Optimistic update - find and replace caixa
      await mutate((current) => {
        if (!current) return [updatedCaixa];
        
        return current.map(caixa => 
          caixa.id === updatedCaixa.id ? updatedCaixa : caixa
        );
      }, { revalidate: false });
      
      // 2. API call
      const result = await caixasApi.update(apiPayload);
      
      // 3. Update with real data from API
      await mutate((current) => {
        if (!current) return [result];
        
        return current.map(caixa => 
          caixa.id === result.id ? result : caixa
        );
      }, { revalidate: false });
      
    } catch (error) {
      // 4. Rollback on error
      await mutate(originalCaixas, { revalidate: false });
      throw error;
    } finally {
      // 5. Final revalidation to ensure consistency
      await mutate();
    }
  };

  /**
   * Delete a caixa with optimistic updates and automatic rollback
   */
  const deleteCaixaWithRollback = async (caixaId: string): Promise<void> => {
    const originalCaixas = caixas;
    
    try {
      // 1. Optimistic update - remove caixa from list
      await mutate((current) => {
        if (!current) return [];
        
        return current.filter(caixa => caixa.id !== caixaId);
      }, { revalidate: false });
      
      // 2. API call
      await caixasApi.delete(caixaId);
      
    } catch (error) {
      // 3. Rollback on error
      await mutate(originalCaixas, { revalidate: false });
      throw error;
    } finally {
      // 4. Final revalidation to ensure consistency
      await mutate();
    }
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