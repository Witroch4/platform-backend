// app/admin/mtf-diamante/hooks/useCaixas.ts
// React hook for managing caixas (ChatwitInbox) data with SWR
import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';
import { useSWRConfig } from 'swr';
import React from 'react';
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
      dedupingInterval: 25000, // Conforme guia SWR 2.3: dedupe < refresh
      keepPreviousData: true, // Conforme guia SWR 2.3 - sem flash na UI
    }
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
    '/api/admin/mtf-diamante/caixas',
    async (_url: string, { arg }: { arg: CreateCaixaPayload }) => {
      return await caixasApi.create(arg);
    }
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
    '/api/admin/mtf-diamante/caixas/update',
    async (_url: string, { arg }: { arg: UpdateCaixaPayload }) => {
      return await caixasApi.update(arg);
    }
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

  // useSWRMutation hooks para operações remotas (mesma key para coordenação com useSWR)
  const { trigger: createCaixa } = useSWRMutation(
    '/api/admin/mtf-diamante/caixas', // mesma key da lista para cancelar GETs pendentes
    async (_url: string, { arg }: { arg: CreateCaixaPayload }) => {
      return await caixasApi.create(arg);
    }
  );

  const { trigger: updateCaixa } = useSWRMutation(
    '/api/admin/mtf-diamante/caixas', // mesma key da lista
    async (_url: string, { arg }: { arg: UpdateCaixaPayload }) => {
      return await caixasApi.update(arg);
    }
  );

  const { trigger: deleteCaixa } = useSWRMutation(
    '/api/admin/mtf-diamante/caixas', // mesma key da lista
    async (_url: string, { arg }: { arg: string }) => {
      return await caixasApi.delete(arg);
    }
  );

  /**
   * Add a new caixa with optimistic updates and automatic rollback
   * Blindado contra janela entre trigger e mutate
   */
  const addCaixa = async (optimisticCaixa: ChatwitInbox, apiPayload: CreateCaixaPayload): Promise<void> => {
    try {
      // use a MESMA key da lista para coordenar com useSWR
      const LIST_KEY = '/api/admin/mtf-diamante/caixas';

      // Executar criação e capturar resultado
      const created = await caixasApi.create(apiPayload);

      await mutate(
        // 👉 Retornar novo estado com item criado
        (curr: ChatwitInbox[] = []) => [created, ...curr.filter(c => c.id !== optimisticCaixa.id)],
        {
          // adiciona otimista imediatamente
          optimisticData: (curr: ChatwitInbox[] = []) => [optimisticCaixa, ...curr],
          rollbackOnError: true,
          // já estamos retornando o novo array; escreva no cache
          populateCache: true,
          // não dispare GET agora
          revalidate: false
        }
      );

      // invalide TODAS as visões relacionadas das caixas
      await globalMutate(
        (key) => {
          if (typeof key !== 'string' || !key) return false;
          return (
            key === LIST_KEY ||                                    // lista base
            key.startsWith('/api/admin/mtf-diamante/caixas?') ||   // variações com query (ex.: withAssistants)
            key.startsWith('/api/admin/mtf-diamante/inbox-view')   // sidebar / agregados
          );
        },
        undefined,
        {
          // regra: listas derivadas revalidam; a base já está correta
          revalidate: (key) => typeof key === 'string' && key.startsWith('/api/admin/mtf-diamante/inbox-view')
        }
      );

      // Hard refresh mesclado — agora comparando com o ID real
      setTimeout(async () => {
        try {
          const fresh = await caixasApi.getAll();
          await mutate(fresh.some(x => x.id === created.id) ? fresh : caixas, { revalidate: false });
        } catch (error) {
          console.warn('[addCaixa] Hard refresh failed:', error);
        }
      }, 800); // Delay para backend propagar

    } catch (error) {
      console.error('[addCaixa] Error creating caixa:', error);
      throw error; // Rethrow para o toast.promise capturar
    }
  };

  /**
   * Update an existing caixa with optimistic updates and automatic rollback
   * Blindado contra janela entre trigger e mutate
   */
  const updateCaixaWithRollback = async (updatedCaixa: ChatwitInbox, apiPayload: UpdateCaixaPayload): Promise<void> => {
    // use a MESMA key da lista para coordenar com useSWR
    const LIST_KEY = '/api/admin/mtf-diamante/caixas';

    await mutate(
      // 👉 UMA ÚNICA PROMISE: rede + retorno do novo estado
      (async () => {
        const curr = caixas || [];
        const result = await caixasApi.update(apiPayload);
        return curr.map(caixa => caixa.id === result.id ? result : caixa);
      })(),
      {
        // atualiza otimista imediatamente
        optimisticData: (curr: ChatwitInbox[] = []) =>
          curr.map(caixa => caixa.id === updatedCaixa.id ? updatedCaixa : caixa),
        rollbackOnError: true,
        // já estamos retornando o novo array; escreva no cache
        populateCache: true,
        // não dispare GET agora
        revalidate: false
      }
    );

    // invalide TODAS as visões relacionadas das caixas
    await globalMutate(
      (key) => {
        if (typeof key !== 'string' || !key) return false;
        return (
          key === LIST_KEY ||                                    // lista base
          key.startsWith('/api/admin/mtf-diamante/caixas?') ||   // variações com query (ex.: withAssistants)
          key.startsWith('/api/admin/mtf-diamante/inbox-view')   // sidebar / agregados
        );
      },
      undefined,
      {
        // regra: listas derivadas revalidam; a base já está correta
        revalidate: (key) => typeof key === 'string' && key.startsWith('/api/admin/mtf-diamante/inbox-view')
      }
    );
  };

  /**
   * Delete a caixa with optimistic updates and automatic rollback
   * Blindado contra janela entre trigger e mutate
   */
  const deleteCaixaWithRollback = async (caixaId: string): Promise<void> => {
    // use a MESMA key da lista para coordenar com useSWR
    const LIST_KEY = '/api/admin/mtf-diamante/caixas';

    await mutate(
      // 👉 UMA ÚNICA PROMISE: rede + retorno do novo estado
      (async () => {
        const curr = caixas || [];
        await caixasApi.delete(caixaId);
        return curr.filter(c => c.id !== caixaId);
      })(),
      {
        // remove otimista imediatamente
        optimisticData: (curr: ChatwitInbox[] = []) =>
          curr.filter(c => c.id !== caixaId),

        rollbackOnError: true,
        // já estamos retornando o novo array; escreva no cache
        populateCache: true,
        // não dispare GET agora
        revalidate: false
      }
    );

    // invalide TODAS as visões relacionadas das caixas E da caixa específica deletada
    await globalMutate(
      (key) => {
        if (typeof key !== 'string' || !key) return false;
        return (
          key === LIST_KEY ||                                    // lista base
          key.startsWith('/api/admin/mtf-diamante/caixas?') ||   // variações com query (ex.: withAssistants)
          key.startsWith('/api/admin/mtf-diamante/inbox-view') ||   // sidebar / agregados
          key.includes(`inboxId=${caixaId}`) ||                 // hooks específicos da caixa deletada
          key.includes(`inbox/${caixaId}`) ||                   // rotas da caixa deletada
          key.includes(caixaId)                                 // qualquer key que contenha o ID da caixa
        );
      },
      undefined,
      {
        // regra: listas derivadas revalidam; específicas da caixa são invalidadas (undefined)
        revalidate: (key) => {
          if (!key || typeof key !== 'string') return false;

          // Se contém o ID da caixa deletada, não revalidar (evita 404s)
          if (key.includes(caixaId)) return false;

          // Revalidar apenas inbox-view geral
          return key.startsWith('/api/admin/mtf-diamante/inbox-view');
        }
      }
    );
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