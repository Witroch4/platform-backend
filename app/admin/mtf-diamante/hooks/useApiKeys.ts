// app/admin/mtf-diamante/hooks/useApiKeys.ts
// React hook for managing API keys data with SWR
import useSWR from 'swr';
import { useState } from 'react';
import { apiKeysApi } from '../lib/api-clients';
import type { MtfDiamanteApiKey, CreateApiKeyPayload, UpdateApiKeyPayload, UseApiKeysReturn } from '../lib/types';

// Hook for fetching all API keys
export function useApiKeys(isPaused: boolean = false) {
  const { data, error, isLoading, mutate } = useSWR<MtfDiamanteApiKey[]>(
    isPaused ? null : '/api/admin/mtf-diamante/api-keys',
    apiKeysApi.getAll,
    {
      revalidateOnFocus: !isPaused,
      revalidateOnReconnect: !isPaused,
      refreshInterval: isPaused ? 0 : 30000, // 30 seconds
      dedupingInterval: 30000,
    }
  );

  return {
    apiKeys: data || [],
    isLoading,
    error,
    mutate,
  };
}

// Hook for creating a new API key
export function useCreateApiKey() {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createNewApiKey = async (apiKeyData: CreateApiKeyPayload) => {
    setIsCreating(true);
    setError(null);

    try {
      const result = await apiKeysApi.create(apiKeyData);
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
    createApiKey: createNewApiKey,
    isCreating,
    error,
  };
}

// Hook for updating an API key
export function useUpdateApiKey() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateExistingApiKey = async (payload: UpdateApiKeyPayload) => {
    setIsUpdating(true);
    setError(null);

    try {
      const result = await apiKeysApi.update(payload);
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
    updateApiKey: updateExistingApiKey,
    isUpdating,
    error,
  };
}

// Hook for deleting an API key
export function useDeleteApiKey() {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteExistingApiKey = async (id: string) => {
    setIsDeleting(true);
    setError(null);

    try {
      await apiKeysApi.delete(id);
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
    deleteApiKey: deleteExistingApiKey,
    isDeleting,
    error,
  };
}

// Combined hook for all API key operations with optimistic updates and rollback
export function useApiKeysManager(isPaused: boolean = false): UseApiKeysReturn {
  const { apiKeys, isLoading, error: fetchError, mutate } = useApiKeys(isPaused);

  /**
   * Add a new API key with optimistic updates and automatic rollback
   */
  const addApiKey = async (optimisticApiKey: MtfDiamanteApiKey, apiPayload: CreateApiKeyPayload): Promise<void> => {
    const originalApiKeys = apiKeys;
    
    try {
      // 1. Optimistic update - add API key to the beginning
      await mutate([optimisticApiKey, ...originalApiKeys], { revalidate: false });
      
      // 2. API call
      const result = await apiKeysApi.create(apiPayload);
      
      // 3. Update with real data from API (replace temp ID with real ID)
      await mutate((current) => {
        if (!current) return [result];
        
        return current.map(apiKey => 
          apiKey.id === optimisticApiKey.id ? result : apiKey
        );
      }, { revalidate: false });
      
    } catch (error) {
      // 4. Rollback on error
      await mutate(originalApiKeys, { revalidate: false });
      throw error;
    } finally {
      // 5. Final revalidation to ensure consistency
      await mutate();
    }
  };

  /**
   * Update an existing API key with optimistic updates and automatic rollback
   */
  const updateApiKeyWithRollback = async (updatedApiKey: MtfDiamanteApiKey, apiPayload: UpdateApiKeyPayload): Promise<void> => {
    const originalApiKeys = apiKeys;
    
    try {
      // 1. Optimistic update - find and replace API key
      await mutate((current) => {
        if (!current) return [updatedApiKey];
        
        return current.map(apiKey => 
          apiKey.id === updatedApiKey.id ? updatedApiKey : apiKey
        );
      }, { revalidate: false });
      
      // 2. API call
      const result = await apiKeysApi.update(apiPayload);
      
      // 3. Update with real data from API
      await mutate((current) => {
        if (!current) return [result];
        
        return current.map(apiKey => 
          apiKey.id === result.id ? result : apiKey
        );
      }, { revalidate: false });
      
    } catch (error) {
      // 4. Rollback on error
      await mutate(originalApiKeys, { revalidate: false });
      throw error;
    } finally {
      // 5. Final revalidation to ensure consistency
      await mutate();
    }
  };

  /**
   * Delete an API key with optimistic updates and automatic rollback
   */
  const deleteApiKeyWithRollback = async (apiKeyId: string): Promise<void> => {
    const originalApiKeys = apiKeys;
    
    try {
      // 1. Optimistic update - remove API key from list
      await mutate((current) => {
        if (!current) return [];
        
        return current.filter(apiKey => apiKey.id !== apiKeyId);
      }, { revalidate: false });
      
      // 2. API call
      await apiKeysApi.delete(apiKeyId);
      
    } catch (error) {
      // 3. Rollback on error
      await mutate(originalApiKeys, { revalidate: false });
      throw error;
    } finally {
      // 4. Final revalidation to ensure consistency
      await mutate();
    }
  };

  return {
    // Data
    apiKeys,
    isLoading,
    
    // Operations with optimistic updates and rollback
    addApiKey,
    updateApiKey: updateApiKeyWithRollback,
    deleteApiKey: deleteApiKeyWithRollback,
    
    // Errors
    error: fetchError,
    
    // Manual refresh
    mutate,
  };
}