//app\admin\mtf-diamante\context\MtfDataProvider.tsx
"use client";

import type React from "react";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import useSWR, { useSWRConfig } from 'swr';
import { swrFetcher } from '@/lib/swr-config';
import { usePathname } from 'next/navigation';

interface MtfDiamanteVariavel {
  id?: string;
  chave: string;
  valor: string;
}

interface MtfDiamanteLote {
  id?: string;
  numero: number;
  nome: string;
  valor: string;
  dataInicio: string;
  dataFim: string;
  isActive: boolean;
}

import type { AgenteDialogflow, ChatwitInbox } from "@/types/dialogflow";

type MtfCaixa = ChatwitInbox;

interface MtfDataContextType {
  // Variáveis
  variaveis: MtfDiamanteVariavel[];
  loadingVariaveis: boolean;
  refreshVariaveis: () => Promise<any>;

  // Lotes
  lotes: MtfDiamanteLote[];
  loadingLotes: boolean;
  refreshLotes: () => Promise<any>;

  // Caixas
  caixas: MtfCaixa[];
  setCaixas: React.Dispatch<React.SetStateAction<MtfCaixa[]>>;
  loadingCaixas: boolean;
  refreshCaixas: () => Promise<any>;
  prefetchInbox: (inboxId: string) => Promise<void>;

  // Mensagens interativas (nova)
  interactiveMessages: any[];
  optimisticUpdateMessage: (messageData: any, isEdit?: boolean) => void;
  
  // Reações de botões (nova)
  buttonReactions: any[];
  
  // API Keys (nova)
  apiKeys: any[];

  // Controle geral
  isInitialized: boolean;
  
  // Controle de pausar atualizações para edição
  pauseUpdates: () => void;
  resumeUpdates: () => void;
  isUpdatesPaused: boolean;
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
  initialData?: any; // Dados iniciais do SSR para evitar flicker
}

export function MtfDataProvider({ children, initialData }: MtfDataProviderProps) {
  const pathname = usePathname();
  const { mutate: globalMutate } = useSWRConfig();
  
  // Estado para controlar pausar atualizações durante edição
  const [isPaused, setIsPaused] = useState(false);
  const pausedDataRef = useRef<any>(null);
  
  // Extrair inboxId da URL se estiver em uma página de inbox específica
  const inboxId = pathname?.match(/\/inbox\/([^\/]+)/)?.[1];
  
  // Ref para manter dados anteriores válidos
  const prevRef = useRef<any>(null);
  
  // Fetcher resiliente que trata 404s sem derrubar a UI
  const fetchInboxView = useCallback(async (url: string) => {
    const r = await fetch(url, { 
      headers: { 
        'Accept': 'application/json',
        'x-skip-cache': '0' 
      } 
    });
    
    if (r.status === 404) {
      // Caixa ainda não pronta / cache frio / id trocando -> não derruba a UI
      console.log('⚠️ [MtfDataProvider] 404 tratado graciosamente para:', url);
      return { interactiveMessages: [], caixas: [], lotes: [], variaveis: [], apiKeys: [] };
    }
    
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      const err: any = new Error(text || `HTTP ${r.status}`);
      err.status = r.status;
      throw err; // 5xx etc: mantém erro para retry/backoff
    }
    
    return r.json();
  }, []);
  
  // Construir chave SWR - sempre busca os dados base.
  // Quando não houver inboxId, usamos "all" para carregar variáveis, caixas e chaves.
  const swrKey = [
    `/api/admin/mtf-diamante/inbox-view`,
    inboxId || "all",
  ] as const;
  
  // Usar SWR para gerenciar o estado e cache automaticamente
  const { data: bffData, error, isLoading, mutate } = useSWR(
    isPaused ? null : swrKey, // Pausar fetches quando isPaused é true
    ([base, id]) =>
      fetchInboxView(id && id !== "all" ? `${base}?inboxId=${id}` : base),
    {
      keepPreviousData: true, // Mantém dados anteriores durante navegação
      revalidateOnFocus: !isPaused, // Não revalidar quando pausado
      revalidateOnReconnect: !isPaused, // Não revalidar quando pausado
      dedupingInterval: 500, // 🔄 Reduzido de 1500ms para 500ms
      shouldRetryOnError: (err: any) => Number(err?.status) >= 500, // sem retry para 404
      fallbackData: prevRef.current ?? initialData,
      onSuccess: (d) => { 
        if (d && !isPaused) {
          prevRef.current = d; 
        }
      },
      // Otimizações para atualização mais responsiva
      revalidateIfStale: !isPaused, // Não revalidar quando pausado
      revalidateOnMount: true, // Revalida apenas no mount inicial
      focusThrottleInterval: 2000, // 🔄 Reduzido de 5000ms para 2000ms
      refreshInterval: isPaused ? 0 : 30000, // Parar polling quando pausado
    }
  );

  // Estados derivados do BFF com fallback seguro e memo para evitar re-renders
  // Quando pausado, usar dados pausados preservados
  const currentData = isPaused && pausedDataRef.current ? pausedDataRef.current : bffData;
  
  const variaveis = useMemo(() => 
    currentData?.variaveis ?? prevRef.current?.variaveis ?? [],
    [currentData?.variaveis, isPaused]
  );
  const lotes = useMemo(() => 
    currentData?.lotes ?? prevRef.current?.lotes ?? [],
    [currentData?.lotes, isPaused]
  );
  const caixas = useMemo(() => 
    currentData?.caixas ?? prevRef.current?.caixas ?? [],
    [currentData?.caixas, isPaused]
  );
  const interactiveMessages = useMemo(() => 
    currentData?.interactiveMessages ?? prevRef.current?.interactiveMessages ?? [],
    [currentData?.interactiveMessages, isPaused]
  );
  const buttonReactions = useMemo(() => 
    currentData?.buttonReactions ?? prevRef.current?.buttonReactions ?? [],
    [currentData?.buttonReactions, isPaused]
  );
  const apiKeys = useMemo(() => 
    currentData?.apiKeys ?? prevRef.current?.apiKeys ?? [],
    [currentData?.apiKeys, isPaused]
  );
  
  // Estados de loading individuais baseados no SWR
  const loadingVariaveis = isLoading;
  const loadingLotes = isLoading;
  const loadingCaixas = isLoading;
  const isInitialized = !isLoading && !error;
  
  // Debug log para verificar se está funcionando - só quando dados mudam efetivamente
  useEffect(() => {
    if (bffData || error) {
      console.log('📊 [MtfDataProvider] Estado atualizado:', {
        inboxId,
        hasData: !!bffData,
        isLoading,
        error: error?.message,
        totalData: {
          variaveis: variaveis.length,
          lotes: lotes.length,
          caixas: caixas.length,
          interactiveMessages: interactiveMessages.length,
          buttonReactions: buttonReactions.length,
          apiKeys: apiKeys.length,
        }
      });
    }
  }, [bffData, error, inboxId]);

  // Funções de refresh usando SWR mutate
  const refreshVariaveis = useCallback(() => {
    console.log('🔄 [MtfDataProvider] Refreshing variaveis via SWR mutate...');
    return mutate();
  }, [mutate]);

  const refreshLotes = useCallback(() => {
    console.log('🔄 [MtfDataProvider] Refreshing lotes via SWR mutate...');
    return mutate();
  }, [mutate]);

  const refreshCaixas = useCallback(() => {
    console.log('🔄 [MtfDataProvider] Refreshing caixas via SWR mutate...');
    // Force immediate revalidation with multiple strategies
    const [base, id] = swrKey;
    
    // 1. Invalidate current cache
    mutate(undefined, false);
    
    // 2. Force fresh fetch with cache-busting
    const bustingUrl = id && id !== "all" 
      ? `${base}?inboxId=${id}&t=${Date.now()}`
      : `${base}?t=${Date.now()}`;
    
    // 3. Fetch fresh data and update cache
    return mutate(
      fetchInboxView(bustingUrl),
      { 
        revalidate: true,
        populateCache: true,
        rollbackOnError: false 
      }
    );
  }, [mutate, swrKey, fetchInboxView]);

  // Prefetch de uma inbox específica para navegação fluida
  const prefetchInbox = useCallback(async (id: string) => {
    const key = [
      `/api/admin/mtf-diamante/inbox-view`,
      id,
    ] as const;
    await globalMutate(
      key,
      () => fetchInboxView(`/api/admin/mtf-diamante/inbox-view?inboxId=${id}`),
      { revalidate: false }
    );
  }, [globalMutate, fetchInboxView]);

  // Funções de controle de pausa
  const pauseUpdates = useCallback(() => {
    if (!isPaused && (bffData || prevRef.current)) {
      // Preservar estado atual antes de pausar
      pausedDataRef.current = bffData || prevRef.current;
      setIsPaused(true);
      console.log('⏸️ [MtfDataProvider] Updates paused - preserving current data');
    }
  }, [isPaused, bffData]);

  const resumeUpdates = useCallback(() => {
    if (isPaused) {
      setIsPaused(false);
      pausedDataRef.current = null;
      // Trigger fresh fetch when resuming
      mutate();
      console.log('▶️ [MtfDataProvider] Updates resumed - fetching fresh data');
    }
  }, [isPaused, mutate]);

  // Optimistic Updates para mensagens interativas
  const optimisticUpdateMessage = useCallback((messageData: any, isEdit: boolean = false) => {
    const dataToUpdate = isPaused && pausedDataRef.current ? pausedDataRef.current : bffData;
    if (!dataToUpdate) return;
    
    const currentMessages = dataToUpdate.interactiveMessages || [];
    let updatedMessages;
    
    if (isEdit) {
      // Atualizar mensagem existente
      updatedMessages = currentMessages.map((msg: any) => 
        msg.id === messageData.id ? { ...msg, ...messageData } : msg
      );
    } else {
      // Adicionar nova mensagem
      const newMessage = {
        id: `temp-${Date.now()}`, // ID temporário
        ...messageData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      updatedMessages = [...currentMessages, newMessage];
    }
    
    // Atualizar cache local imediatamente (optimistic)
    const newData = { ...dataToUpdate, interactiveMessages: updatedMessages };
    if (isPaused) {
      pausedDataRef.current = newData;
    } else {
      mutate(newData, false);
    }
    
    console.log('🚀 [MtfDataProvider] Optimistic update applied:', {
      isEdit,
      messageId: messageData.id,
      totalMessages: updatedMessages.length
    });
  }, [bffData, mutate]);

  // Estado setter para compatibilidade
  const setCaixas = useCallback((newCaixas: MtfCaixa[] | ((prev: MtfCaixa[]) => MtfCaixa[])) => {
    const dataToUpdate = isPaused && pausedDataRef.current ? pausedDataRef.current : bffData;
    console.log('⚠️ [MtfDataProvider] setCaixas called - consider using mutate instead');
    
    if (typeof newCaixas === 'function') {
      const updated = newCaixas(caixas);
      const newData = { ...dataToUpdate, caixas: updated };
      if (isPaused) {
        pausedDataRef.current = newData;
      } else {
        mutate(newData, false);
      }
    } else {
      const newData = { ...dataToUpdate, caixas: newCaixas };
      if (isPaused) {
        pausedDataRef.current = newData;
      } else {
        mutate(newData, false);
      }
    }
  }, [caixas, bffData, isPaused, mutate]);

  const contextValue: MtfDataContextType = useMemo(() => ({
    variaveis,
    loadingVariaveis,
    refreshVariaveis,
    lotes,
    loadingLotes,
    refreshLotes,
    caixas,
    setCaixas,
    loadingCaixas,
    refreshCaixas,
    prefetchInbox,
    interactiveMessages,
    optimisticUpdateMessage,
    buttonReactions,
    apiKeys,
    isInitialized,
    pauseUpdates,
    resumeUpdates,
    isUpdatesPaused: isPaused,
  }), [
    variaveis,
    loadingVariaveis,
    refreshVariaveis,
    lotes,
    loadingLotes,
    refreshLotes,
    caixas,
    setCaixas,
    loadingCaixas,
    refreshCaixas,
    prefetchInbox,
    interactiveMessages,
    optimisticUpdateMessage,
    buttonReactions,
    apiKeys,
    isInitialized,
    pauseUpdates,
    resumeUpdates,
    isPaused,
  ]);

  return (
    <MtfDataContext.Provider value={contextValue}>
      {children}
    </MtfDataContext.Provider>
  );
}
