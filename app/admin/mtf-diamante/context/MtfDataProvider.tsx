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
  
  // API Keys (nova)
  apiKeys: any[];

  // Controle geral
  isInitialized: boolean;
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
    swrKey,
    ([base, id]) =>
      fetchInboxView(id && id !== "all" ? `${base}?inboxId=${id}` : base),
    {
      keepPreviousData: true, // Mantém dados anteriores durante navegação
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 1500,
      shouldRetryOnError: (err: any) => Number(err?.status) >= 500, // sem retry para 404
      fallbackData: prevRef.current ?? initialData,
      onSuccess: (d) => { 
        if (d) prevRef.current = d; 
      },
      // Otimizações para navegação fluida
      revalidateIfStale: false, // Não revalida automaticamente dados stale
      revalidateOnMount: true, // Revalida apenas no mount inicial
      focusThrottleInterval: 5000, // Throttle de focus para evitar requests excessivos
    }
  );

  // Estados derivados do BFF com fallback seguro
  const variaveis = bffData?.variaveis ?? prevRef.current?.variaveis ?? [];
  const lotes = bffData?.lotes ?? prevRef.current?.lotes ?? [];
  const caixas = bffData?.caixas ?? prevRef.current?.caixas ?? [];
  const interactiveMessages = bffData?.interactiveMessages ?? prevRef.current?.interactiveMessages ?? [];
  const apiKeys = bffData?.apiKeys ?? prevRef.current?.apiKeys ?? [];
  
  // Estados de loading individuais baseados no SWR
  const loadingVariaveis = isLoading;
  const loadingLotes = isLoading;
  const loadingCaixas = isLoading;
  const isInitialized = !isLoading && !error;
  
  // Debug log para verificar se está funcionando
  useEffect(() => {
    console.log('📊 [MtfDataProvider] Estado atual:', {
      inboxId,
      hasData: !!bffData,
      hasPrevData: !!prevRef.current,
      isLoading,
      error: error?.message,
      variaveis: variaveis.length,
      lotes: lotes.length,
      caixas: caixas.length,
      interactiveMessages: interactiveMessages.length,
      apiKeys: apiKeys.length,
    });
  }, [inboxId, bffData, isLoading, error, variaveis, lotes, caixas, interactiveMessages, apiKeys]);

  // Funções de refresh usando SWR mutate
  const refreshVariaveis = useCallback(() => {
    console.log('🔄 [MtfDataProvider] Refreshing via SWR mutate...');
    return mutate();
  }, [mutate]);

  const refreshLotes = useCallback(() => mutate(), [mutate]);

  const refreshCaixas = useCallback(() => mutate(), [mutate]);

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

  // Optimistic Updates para mensagens interativas
  const optimisticUpdateMessage = useCallback((messageData: any, isEdit: boolean = false) => {
    if (!bffData) return;
    
    const currentMessages = bffData.interactiveMessages || [];
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
    mutate({ ...bffData, interactiveMessages: updatedMessages }, false);
    
    console.log('🚀 [MtfDataProvider] Optimistic update applied:', {
      isEdit,
      messageId: messageData.id,
      totalMessages: updatedMessages.length
    });
  }, [bffData, mutate]);

  // Estado setter para compatibilidade
  const setCaixas = useCallback((newCaixas: MtfCaixa[] | ((prev: MtfCaixa[]) => MtfCaixa[])) => {
    // Como agora o estado vem do SWR, precisamos atualizar via mutate
    console.log('⚠️ [MtfDataProvider] setCaixas called - consider using mutate instead');
    if (typeof newCaixas === 'function') {
      const updated = newCaixas(caixas);
      mutate({ ...bffData, caixas: updated }, false);
    } else {
      mutate({ ...bffData, caixas: newCaixas }, false);
    }
  }, [caixas, bffData, mutate]);

  const contextValue: MtfDataContextType = {
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
    apiKeys,
    isInitialized,
  };

  return (
    <MtfDataContext.Provider value={contextValue}>
      {children}
    </MtfDataContext.Provider>
  );
}
