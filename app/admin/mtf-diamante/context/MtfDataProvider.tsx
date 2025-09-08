//app\admin\mtf-diamante\context\MtfDataProvider.tsx
"use client";

import type React from "react";
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from "react";
import { usePathname } from 'next/navigation';
import { SWRConfig } from 'swr';

// Import SSR helpers
import { createSWRFallback, type MtfInitialData } from '../lib/ssr-helpers';

// Import error handling utilities
import { 
  logError, 
  shouldRetryError, 
  getRetryDelay, 
  fetchWithErrorHandling,
  MtfError,
  type ApiError 
} from '../lib/error-handling';

// Import cleanup utilities
import { deprecated, devLog } from '../lib/cleanup-utils';

// Import dedicated hooks
import { useInteractiveMessages } from '../hooks/useInteractiveMessages';
import { useCaixasManager } from '../hooks/useCaixas';
import { useLotesManager } from '../hooks/useLotes';
import { useVariaveisManager } from '../hooks/useVariaveis';
import { useApiKeysManager } from '../hooks/useApiKeys';
import { useInboxButtonReactions } from '../hooks/useInboxButtonReactions';

// Import types
import type { MtfDataContextType, ChatwitInbox } from '../lib/types';

// Legacy API function for compatibility
async function saveMessageWithReactions(payload: any, isEdit: boolean) {
  const url = '/api/admin/mtf-diamante/messages-with-reactions';
  const method = isEdit ? 'PUT' : 'POST';

  if (isEdit) {
    const messageId = payload.editingMessageId || 
                     payload.messageId || 
                     payload.message?.id || 
                     payload.id;
    
    if (!messageId || messageId.toString().startsWith('temp-')) {
      throw new Error('ID válido é obrigatório para edições. IDs temporários não são permitidos.');
    }
    
    payload.messageId = messageId;
  }

  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Falha na comunicação com o servidor.' }));
    throw new Error(errorData.error || 'Falha ao salvar a mensagem.');
  }
  
  return response.json();
}

const MtfDataContext = createContext<MtfDataContextType | undefined>(undefined);

export function useMtfData() {
  const context = useContext(MtfDataContext);
  if (!context) {
    throw new Error("useMtfData deve ser usado dentro de MtfDataProvider");
  }
  return context;
}

interface MtfDataProviderProps {
  children: React.ReactNode;
  initialData?: MtfInitialData; // Dados iniciais do SSR para evitar flicker
}

/**
 * Simplified MtfDataProvider that orchestrates dedicated hooks
 * 
 * This refactored version:
 * - Removes complex useRef, timers and manual protections
 * - Uses dedicated hooks internally for each data type
 * - Maintains public API compatibility
 * - Implements simplified pause/resume functionality
 */
export function MtfDataProvider({ children, initialData }: MtfDataProviderProps) {
  const pathname = usePathname();
  
  // Simple pause state management
  const [isPaused, setIsPaused] = useState(false);
  
  // Extract inboxId from URL if on a specific inbox page
  const inboxId = pathname?.match(/\/inbox\/([^\/]+)/)?.[1] || null;
  
  // Use dedicated hooks with pause support
  const messagesHook = useInteractiveMessages(inboxId, isPaused);
  const caixasHook = useCaixasManager(isPaused);
  const lotesHook = useLotesManager(isPaused);
  const variaveisHook = useVariaveisManager(isPaused);
  const apiKeysHook = useApiKeysManager(isPaused);
  const buttonReactionsHook = useInboxButtonReactions({ inboxId, paused: isPaused });
  
  // Pause/Resume functions
  const pauseUpdates = useCallback(() => {
    setIsPaused(true);
  }, []);

  const resumeUpdates = useCallback(() => {
    setIsPaused(false);
    
    // Trigger revalidation when resuming to sync with server
    messagesHook.mutate();
    caixasHook.mutate();
    lotesHook.mutate();
    variaveisHook.mutate();
    apiKeysHook.mutate();
    buttonReactionsHook.mutate();
  }, [messagesHook, caixasHook, lotesHook, variaveisHook, apiKeysHook, buttonReactionsHook]);

  // Legacy compatibility functions (deprecated but maintained)
  const saveMessage = useCallback(deprecated(async (
    apiPayload: any, 
    isEdit: boolean
  ): Promise<any> => {
    return saveMessageWithReactions(apiPayload, isEdit);
  }, 'saveMessage is deprecated', 'addMessage or updateMessage from dedicated hooks'), []);

  const updateMessagesCache = useCallback(deprecated(async (
    messageOrId: any, 
    action: string,
    _reactions?: any[]
  ): Promise<any> => {
    // Simple wrapper that delegates to the appropriate hook method
    try {
      if (action === 'add' && typeof messageOrId === 'object') {
        await messagesHook.addMessage(messageOrId, messageOrId);
      } else if (action === 'update' && typeof messageOrId === 'object') {
        await messagesHook.updateMessage(messageOrId, messageOrId);
      } else if (action === 'remove' && typeof messageOrId === 'string') {
        await messagesHook.deleteMessage(messageOrId);
      }
    } catch (error) {
      devLog.error('Error in updateMessagesCache wrapper:', error);
      throw error;
    }
  }, 'updateMessagesCache is deprecated', 'dedicated hook methods'), [messagesHook]);



  // Refresh functions for backward compatibility
  const refreshMessages = useCallback(() => messagesHook.mutate(), [messagesHook]);
  const refreshCaixas = useCallback(() => caixasHook.mutate(), [caixasHook]);
  const refreshLotes = useCallback(() => lotesHook.mutate(), [lotesHook]);
  const refreshVariaveis = useCallback(() => variaveisHook.mutate(), [variaveisHook]);
  const refreshApiKeys = useCallback(() => apiKeysHook.mutate(), [apiKeysHook]);
  const refreshButtonReactions = useCallback(() => buttonReactionsHook.mutate(), [buttonReactionsHook]);

  // Prefetch function for smooth navigation
  const prefetchInbox = useCallback(async (id: string) => {
    // This could be implemented with SWR's global mutate if needed
    // Feature can be implemented when needed for performance optimization
  }, []);

  // Button reactions compatibility functions
  const addButtonReactionCompat = useCallback(async (optimisticReaction: any, apiPayload: any) => {
    if (!inboxId) throw new Error('Inbox ID é obrigatório');
    
    // Convert from the expected interface to our hook interface
    const reactionData = {
      buttonId: optimisticReaction.buttonId,
      actionType: 'BUTTON_REACTION' as const,
      actionPayload: {
        emoji: optimisticReaction.emoji || null,
        textReaction: optimisticReaction.label || null,
        action: optimisticReaction.action || null
      },
      description: optimisticReaction.label || null,
      inboxId
    };
    
    await buttonReactionsHook.addButtonReaction(reactionData);
  }, [buttonReactionsHook, inboxId]);

  const updateButtonReactionCompat = useCallback(async (updatedReaction: any, apiPayload: any) => {
    if (!updatedReaction.id) return;
    
    const updates = {
      buttonId: updatedReaction.buttonId,
      actionPayload: {
        emoji: updatedReaction.emoji || null,
        textReaction: updatedReaction.label || null,
        action: updatedReaction.action || null
      },
      description: updatedReaction.label || null
    };
    
    await buttonReactionsHook.updateButtonReaction(updatedReaction.id, updates);
  }, [buttonReactionsHook]);

  // Convert button reactions to expected format
  const convertedButtonReactions = useMemo(() => {
    return buttonReactionsHook.reactions.map((reaction: any) => ({
      id: reaction.id,
      messageId: reaction.messageId || reaction.inboxId, // Use messageId first, then inboxId as fallback
      buttonId: reaction.buttonId,
      emoji: reaction.emoji || '',
      label: reaction.description || reaction.textReaction || '',
      action: reaction.actionPayload?.action || reaction.action || '', // Use actionPayload.action first, then direct action field as fallback
      createdAt: reaction.createdAt,
      updatedAt: reaction.updatedAt
    }));
  }, [buttonReactionsHook.reactions]);

  // Optimistic add caixa for backward compatibility
  const optimisticAddCaixa = useCallback(deprecated(async (apiPayload: any, optimisticCaixaData: any) => {
    return caixasHook.addCaixa(optimisticCaixaData, apiPayload);
  }, 'optimisticAddCaixa is deprecated', 'addCaixa from useCaixas hook'), [caixasHook]);

  // Computed state
  const isInitialized = useMemo(() => {
    return !messagesHook.isLoading && 
           !caixasHook.isLoading && 
           !lotesHook.isLoading && 
           !variaveisHook.isLoading && 
           !apiKeysHook.isLoading &&
           !buttonReactionsHook.isLoading;
  }, [
    messagesHook.isLoading,
    caixasHook.isLoading,
    lotesHook.isLoading,
    variaveisHook.isLoading,
    apiKeysHook.isLoading,
    buttonReactionsHook.isLoading
  ]);

  // Context value with maintained API compatibility
  const contextValue: MtfDataContextType = useMemo(() => ({
    // Interactive Messages
    interactiveMessages: messagesHook.messages,
    isLoadingMessages: messagesHook.isLoading,
    addMessage: messagesHook.addMessage,
    updateMessage: messagesHook.updateMessage,
    deleteMessage: messagesHook.deleteMessage,
    
    // Caixas
    caixas: caixasHook.caixas,
    isLoadingCaixas: caixasHook.isLoading,
    addCaixa: caixasHook.addCaixa,
    updateCaixa: caixasHook.updateCaixa,
    deleteCaixa: caixasHook.deleteCaixa,
    
    // Lotes
    lotes: lotesHook.lotes,
    isLoadingLotes: lotesHook.isLoading,
    addLote: lotesHook.addLote,
    updateLote: lotesHook.updateLote,
    deleteLote: lotesHook.deleteLote,
    
    // Variáveis
    variaveis: variaveisHook.variaveis,
    isLoadingVariaveis: variaveisHook.isLoading,
    addVariavel: variaveisHook.addVariavel,
    updateVariavel: variaveisHook.updateVariavel,
    deleteVariavel: variaveisHook.deleteVariavel,
    
    // API Keys
    apiKeys: apiKeysHook.apiKeys,
    isLoadingApiKeys: apiKeysHook.isLoading,
    addApiKey: apiKeysHook.addApiKey,
    updateApiKey: apiKeysHook.updateApiKey,
    deleteApiKey: apiKeysHook.deleteApiKey,
    
    // Button Reactions
    buttonReactions: convertedButtonReactions,
    isLoadingButtonReactions: buttonReactionsHook.isLoading,
    addButtonReaction: addButtonReactionCompat,
    updateButtonReaction: updateButtonReactionCompat,
    deleteButtonReaction: buttonReactionsHook.deleteButtonReaction,
    
    // Pause Control
    isUpdatesPaused: isPaused,
    pauseUpdates,
    resumeUpdates,
    
    // Legacy compatibility functions (deprecated)
    saveMessage,
    updateMessagesCache,
    
    // Refresh functions
    refreshMessages,
    refreshCaixas,
    refreshLotes,
    refreshVariaveis,
    refreshApiKeys,
    refreshButtonReactions,
    
    // Legacy properties for backward compatibility
    loadingVariaveis: variaveisHook.isLoading,
    loadingLotes: lotesHook.isLoading,
    loadingCaixas: caixasHook.isLoading,
    setCaixas: deprecated(() => {
      // No-op function for backward compatibility
    }, 'setCaixas is deprecated', 'dedicated hook methods') as React.Dispatch<React.SetStateAction<ChatwitInbox[]>>,
    prefetchInbox,
    optimisticAddCaixa,
    
    // General state
    isInitialized,
  }), [
    messagesHook,
    caixasHook,
    lotesHook,
    variaveisHook,
    apiKeysHook,
    isPaused,
    pauseUpdates,
    resumeUpdates,
    saveMessage,
    updateMessagesCache,
    refreshMessages,
    refreshCaixas,
    refreshLotes,
    refreshVariaveis,
    refreshApiKeys,
    refreshButtonReactions,
    prefetchInbox,
    optimisticAddCaixa,
    isInitialized,
    addButtonReactionCompat,
    updateButtonReactionCompat,
    convertedButtonReactions,
  ]);

  return (
    <MtfDataContext.Provider value={contextValue}>
      {children}
    </MtfDataContext.Provider>
  );
}

/**
 * Provider wrapper with SWRConfig for centralized error handling and fallback data
 * 
 * Features:
 * - Centralized error handling with logging
 * - SSR support with fallback data
 * - Intelligent retry strategy
 * - Global SWR configuration
 */
export function MtfDataProviderWithSWR({ children, initialData }: MtfDataProviderProps) {
  // Create fallback data for SWR from initialData
  const fallbackData = useMemo(() => createSWRFallback(initialData), [initialData]);

  // Global SWR configuration with enhanced error handling
  const swrConfig = useMemo(() => ({
    // Enhanced default fetcher with error handling
    fetcher: async (url: string) => {
      const response = await fetchWithErrorHandling(url, {}, {
        operation: `SWR fetch: ${url}`,
      });
      return response.json();
    },
    
    // Fallback data for SSR
    fallback: fallbackData,
    
    // Enhanced global error handling
    onError: (error: ApiError, key: string) => {
      // Use structured logging
      logError(error, {
        key,
        operation: 'SWR Data Fetch',
        additionalData: {
          url: key,
          timestamp: new Date().toISOString(),
        },
      });
      
      // Show user-friendly notifications for critical errors
      if (error.status && error.status >= 500) {
        // In a real implementation, you would use a toast system here
        // Example: toast(createErrorToast(error));
        console.warn('⚠️ Erro interno do servidor. Os dados podem estar desatualizados.');
      } else if (!error.status) {
        // Network errors
        console.warn('⚠️ Erro de conexão. Verificando conectividade...');
      }
      
      // Additional error context for debugging
      if (process.env.NODE_ENV === 'development') {
        console.group(`🔍 [SWR Error Debug] ${key}`);
        console.error('Error details:', error);
        console.error('Stack trace:', error.stack);
        console.groupEnd();
      }
    },
    
    // Intelligent retry strategy
    shouldRetryOnError: (error: ApiError) => {
      return shouldRetryError(error);
    },
    
    // Enhanced retry configuration with exponential backoff
    errorRetryCount: 3,
    errorRetryInterval: 2000, // Base retry interval (will be enhanced in onErrorRetry)
    
    // Global revalidation settings
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    revalidateIfStale: true,
    
    // Deduplication settings
    dedupingInterval: 2000, // 2 seconds
    
    // Loading timeout
    loadingTimeout: 15000, // 15 seconds (increased for better UX)
    
    // Enhanced success callback
    onSuccess: (data: any, key: string) => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ [SWR Success] ${key}`, {
          dataType: Array.isArray(data) ? 'array' : typeof data,
          dataLength: Array.isArray(data) ? data.length : 'N/A',
          timestamp: new Date().toISOString(),
        });
      }
    },
    
    // Loading state callback with enhanced logging
    onLoadingSlow: (key: string) => {
      console.warn(`⏳ [SWR Slow Loading] ${key} está demorando mais que o esperado`);
      
      // In production, you might want to track this metric
      if (process.env.NODE_ENV === 'production') {
        // Example: analytics.track('SWR Slow Loading', { key });
      }
    },
    
    // Enhanced mutation error handling with exponential backoff
    onErrorRetry: (error: ApiError, key: string, config: any, revalidate: any, { retryCount }: any) => {
      // Don't retry on 404
      if (error.status === 404) return;
      
      // Don't retry after 3 attempts
      if (retryCount >= 3) return;
      
      // Calculate delay with exponential backoff
      const delay = getRetryDelay(retryCount, 1000);
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔄 [SWR Retry] ${key} - Attempt ${retryCount + 1}/3 in ${delay}ms`);
      }
      
      // Retry with calculated delay
      setTimeout(() => revalidate({ retryCount }), delay);
    },
    
    // Focus revalidation throttling
    focusThrottleInterval: 5000, // 5 seconds
    
    // Keep previous data during revalidation for better UX
    keepPreviousData: true,
  }), [fallbackData]);

  return (
    <SWRConfig value={swrConfig}>
      <MtfDataProvider initialData={initialData}>
        {children}
      </MtfDataProvider>
    </SWRConfig>
  );
}

// Export the SWR-wrapped version as default for better DX
export default MtfDataProviderWithSWR;