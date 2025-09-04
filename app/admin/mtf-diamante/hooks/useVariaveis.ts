// app/admin/mtf-diamante/hooks/useVariaveis.ts
// React hook for managing variáveis data with SWR
import useSWR from 'swr';
import { useState } from 'react';
import { variaveisApi } from '../lib/api-clients';
import type { MtfDiamanteVariavel, CreateVariavelPayload, UpdateVariavelPayload, UseVariaveisReturn } from '../lib/types';

// Hook for fetching all variáveis
export function useVariaveis(isPaused: boolean = false) {
  const { data, error, isLoading, mutate } = useSWR<MtfDiamanteVariavel[]>(
    isPaused ? null : '/api/admin/mtf-diamante/variaveis',
    variaveisApi.getAll,
    {
      revalidateOnFocus: !isPaused,
      revalidateOnReconnect: !isPaused,
      refreshInterval: isPaused ? 0 : 30000, // 30 seconds
      dedupingInterval: 30000,
    }
  );

  return {
    variaveis: data || [],
    isLoading,
    error,
    mutate,
  };
}

// Hook for creating a new variável
export function useCreateVariavel() {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createNewVariavel = async (variavelData: CreateVariavelPayload) => {
    setIsCreating(true);
    setError(null);

    try {
      const result = await variaveisApi.create(variavelData);
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
    createVariavel: createNewVariavel,
    isCreating,
    error,
  };
}

// Hook for updating a variável
export function useUpdateVariavel() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateExistingVariavel = async (payload: UpdateVariavelPayload) => {
    setIsUpdating(true);
    setError(null);

    try {
      const result = await variaveisApi.update(payload);
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
    updateVariavel: updateExistingVariavel,
    isUpdating,
    error,
  };
}

// Hook for deleting a variável
export function useDeleteVariavel() {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteExistingVariavel = async (id: string) => {
    setIsDeleting(true);
    setError(null);

    try {
      await variaveisApi.delete(id);
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
    deleteVariavel: deleteExistingVariavel,
    isDeleting,
    error,
  };
}

// Combined hook for all variável operations with optimistic updates and rollback
export function useVariaveisManager(isPaused: boolean = false): UseVariaveisReturn {
  const { variaveis, isLoading, error: fetchError, mutate } = useVariaveis(isPaused);

  /**
   * Add a new variável with optimistic updates and automatic rollback
   */
  const addVariavel = async (optimisticVariavel: MtfDiamanteVariavel, apiPayload: CreateVariavelPayload): Promise<void> => {
    const originalVariaveis = variaveis;
    
    try {
      // 1. Optimistic update - add variável to the beginning
      await mutate([optimisticVariavel, ...originalVariaveis], { revalidate: false });
      
      // 2. API call
      const result = await variaveisApi.create(apiPayload);
      
      // 3. Update with real data from API (replace temp ID with real ID)
      await mutate((current) => {
        if (!current) return [result];
        
        return current.map(variavel => 
          variavel.id === optimisticVariavel.id ? result : variavel
        );
      }, { revalidate: false });
      
    } catch (error) {
      // 4. Rollback on error
      await mutate(originalVariaveis, { revalidate: false });
      throw error;
    } finally {
      // 5. Final revalidation to ensure consistency
      await mutate();
    }
  };

  /**
   * Update an existing variável with optimistic updates and automatic rollback
   */
  const updateVariavelWithRollback = async (updatedVariavel: MtfDiamanteVariavel, apiPayload: UpdateVariavelPayload): Promise<void> => {
    const originalVariaveis = variaveis;
    
    try {
      // 1. Optimistic update - find and replace variável
      await mutate((current) => {
        if (!current) return [updatedVariavel];
        
        return current.map(variavel => 
          variavel.id === updatedVariavel.id ? updatedVariavel : variavel
        );
      }, { revalidate: false });
      
      // 2. API call
      const result = await variaveisApi.update(apiPayload);
      
      // 3. Update with real data from API
      await mutate((current) => {
        if (!current) return [result];
        
        return current.map(variavel => 
          variavel.id === result.id ? result : variavel
        );
      }, { revalidate: false });
      
    } catch (error) {
      // 4. Rollback on error
      await mutate(originalVariaveis, { revalidate: false });
      throw error;
    } finally {
      // 5. Final revalidation to ensure consistency
      await mutate();
    }
  };

  /**
   * Delete a variável with optimistic updates and automatic rollback
   */
  const deleteVariavelWithRollback = async (variavelId: string): Promise<void> => {
    const originalVariaveis = variaveis;
    
    try {
      // 1. Optimistic update - remove variável from list
      await mutate((current) => {
        if (!current) return [];
        
        return current.filter(variavel => variavel.id !== variavelId);
      }, { revalidate: false });
      
      // 2. API call
      await variaveisApi.delete(variavelId);
      
    } catch (error) {
      // 3. Rollback on error
      await mutate(originalVariaveis, { revalidate: false });
      throw error;
    } finally {
      // 4. Final revalidation to ensure consistency
      await mutate();
    }
  };

  return {
    // Data
    variaveis,
    isLoading,
    
    // Operations with optimistic updates and rollback
    addVariavel,
    updateVariavel: updateVariavelWithRollback,
    deleteVariavel: deleteVariavelWithRollback,
    
    // Errors
    error: fetchError,
    
    // Manual refresh
    mutate,
  };
}