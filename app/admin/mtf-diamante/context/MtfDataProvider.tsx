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

interface InteractiveMessage {
  id: string;
  [key: string]: any; // Permite outras propriedades
}

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
  // Função para update otimista de caixas
  optimisticAddCaixa: (apiPayload: any, optimisticCaixaData: any) => Promise<any>;

  // Mensagens interativas - NOVA ESTRATÉGIA OTIMIZADA
  interactiveMessages: any[];
  
  // 👇 NOVO: Funções para o fluxo otimizado instantâneo
  saveMessage: (apiPayload: any, isEdit: boolean) => Promise<any>;
  updateMessagesCache: (messageOrId: any, action: 'add' | 'update' | 'remove') => Promise<any>;
  deleteMessage: (messageId: string) => Promise<any>;
  
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

// PONTO-CHAVE 2: Função helper que faz a chamada real à API
async function saveMessageWithReactions(payload: any, isEdit: boolean) {
  const url = '/api/admin/mtf-diamante/messages-with-reactions';
  const method = isEdit ? 'PUT' : 'POST';

  // ✅ FIX: Extrai messageId de várias fontes possíveis para PUT
  if (isEdit) {
    const messageId = payload.editingMessageId || 
                     payload.messageId || 
                     payload.message?.id || 
                     payload.id;
    
    // ✅ FIX: Validação adicional - não aceita IDs temporários para edição
    if (!messageId || messageId.toString().startsWith('temp-')) {
      throw new Error('ID válido é obrigatório para edições. IDs temporários não são permitidos.');
    }
    
    // Garante que o messageId está no payload
    payload.messageId = messageId;
    
    console.log('🔄 [saveMessageWithReactions] PUT request:', {
      messageId,
      isTemporary: messageId.toString().startsWith('temp-'),
      hasMessage: !!payload.message,
      payloadKeys: Object.keys(payload)
    });
  } else {
    console.log('➕ [saveMessageWithReactions] POST request:', {
      hasMessage: !!payload.message,
      payloadKeys: Object.keys(payload),
      tempId: payload.message?.id?.toString().startsWith('temp-') ? payload.message.id : null
    });
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
  
  // Retorna os dados da API para o SWR popular o cache
  return response.json();
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
  const lastUpdateRef = useRef<number>(0);
  
  // 🛡️ CORREÇÃO 1: Proteção mais robusta com timeout maior e verificação de ID
  const recentOptimisticRef = useRef<{
    timestamp: number;
    messageCount: number;
  messageId?: string;
  operation?: 'add' | 'remove';
  isCompleted?: boolean; // Novo flag para indicar conclusão bem-sucedida
  } | null>(null);
  
  // 🛡️ Proteção contra múltiplas chamadas simultâneas à mesma função
  const processingRef = useRef<Set<string>>(new Set());
  
  // Extrair inboxId da URL se estiver em uma página de inbox específica
  const inboxId = pathname?.match(/\/inbox\/([^\/]+)/)?.[1];
  
  // Ref para manter dados anteriores válidos
  const prevRef = useRef<any>(null);
  
  // 🛡️ CORREÇÃO 2: Ref para controlar revalidações pendentes
  const pendingRevalidationRef = useRef<NodeJS.Timeout | null>(null);
  
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
      dedupingInterval: 300, 
      shouldRetryOnError: (err: any) => Number(err?.status) >= 500, // sem retry para 404
      fallbackData: prevRef.current ?? initialData,
      onSuccess: (d) => { 
        if (d && !isPaused) {
          // 🛡️ CORREÇÃO 3: Proteção aprimorada com verificação de ID e timeout maior
          const now = Date.now();
          const recent = recentOptimisticRef.current;
          
          if (recent && !recent.isCompleted) {
            const protectionTime = 15000; // Aumentado para 15 segundos
            const timeElapsed = now - recent.timestamp;
            
            if (timeElapsed < protectionTime) {
              // Verifica se o servidor já tem o estado esperado
              const serverMessageCount = d.interactiveMessages?.length || 0;
              const hasTargetMessage = recent.messageId ? 
                d.interactiveMessages?.some((msg: any) => msg.id === recent.messageId) : 
                false;

              // 👇 LÓGICA DE DEFESA ATUALIZADA E CORRIGIDA (USANDO `operation` EXPLÍCITO)
              let serverSynced = false;
              const wasAddOperation = recent.operation === 'add';
              const wasRemoveOperation = recent.operation === 'remove';

              if (wasAddOperation) {
                // Para ADD, o servidor está sincronizado se a contagem for a esperada E a mensagem existir
                serverSynced = serverMessageCount >= recent.messageCount && hasTargetMessage;
              } else if (wasRemoveOperation) {
                // Para REMOVE, o servidor está sincronizado se a contagem for a esperada E a mensagem NÃO existir mais
                serverSynced = serverMessageCount <= recent.messageCount && !hasTargetMessage;
              }
              // Fim da lógica de defesa
              
              if (serverSynced) {
                console.log('✅ [MtfDataProvider] Servidor sincronizado - aceitando dados:', {
                  serverCount: serverMessageCount,
                  expectedCount: recent.messageCount,
                  operation: wasAddOperation ? 'ADD' : 'REMOVE',
                  protection: 'removed'
                });
                recentOptimisticRef.current = { ...recent, isCompleted: true };
                prevRef.current = d;
              } else {
                console.log('🛡️ [MtfDataProvider] Protegendo contra revalidação prematura:', {
                  serverCount: serverMessageCount,
                  expectedCount: recent.messageCount,
                  timeLeft: Math.round((protectionTime - timeElapsed) / 1000),
                  operation: wasAddOperation ? 'ADD (aguardando)' : 'REMOVE (aguardando)',
                  hasTargetMessage,
                  keepingPrevRef: !!prevRef.current
                });
                // NÃO atualiza prevRef - mantém dados optimistic
                return;
              }
            } else {
              // Timeout de proteção expirou
              console.log('⏰ [MtfDataProvider] Proteção expirou - aceitando dados do servidor');
              recentOptimisticRef.current = null;
              prevRef.current = d;
            }
          } else {
            // Sem operação optimistic recente ou já completada - aceita normalmente
            prevRef.current = d;
          }
        }
      },
      // Otimizações para atualização mais responsiva
      revalidateIfStale: !isPaused,
      revalidateOnMount: true,
      focusThrottleInterval: 2000,
      refreshInterval: isPaused ? 0 : 15000, // Polling mais frequente para mensagens interativas
    }
  );

  // Estados derivados do BFF com fallback seguro e memo para evitar re-renders
  const currentData = useMemo(() => {
    const now = Date.now();
    const recent = recentOptimisticRef.current;
    
    if (isPaused && pausedDataRef.current) {
      return pausedDataRef.current;
    }
    
    // 🛡️ CORREÇÃO 4: Verificação aprimorada com timeout maior
    if (recent && !recent.isCompleted && (now - recent.timestamp) < 15000) {
      if (bffData) {
        const serverMessageCount = bffData.interactiveMessages?.length || 0;
        const hasTargetMessage = recent.messageId ? 
          bffData.interactiveMessages?.some((msg: any) => msg.id === recent.messageId) : 
          false;
          
        if (serverMessageCount < recent.messageCount && !hasTargetMessage) {
          console.log('🛡️ [MtfDataProvider] Mantendo dados optimistic na UI:', {
            serverCount: serverMessageCount,
            expectedCount: recent.messageCount,
            hasTargetMessage,
            preservingOptimistic: true,
            usingPrevRef: !!prevRef.current
          });
          // SEMPRE retorna dados anteriores quando servidor está atrasado
          return prevRef.current || {
            ...bffData,
            interactiveMessages: bffData.interactiveMessages || []
          };
        }
      } else if (prevRef.current) {
        // Se não há bffData mas há dados anteriores, preserva durante proteção
        console.log('🛡️ [MtfDataProvider] Preservando dados anteriores durante proteção optimistic');
        return prevRef.current;
      }
    }
    
    return bffData;
  }, [isPaused, bffData]);
  
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
  const interactiveMessages = useMemo(() => {
    const now = Date.now();
    const recent = recentOptimisticRef.current;
    
    // 🛡️ CORREÇÃO 5: Proteção adicional com verificação de ID
    if (recent && !recent.isCompleted && (now - recent.timestamp) < 15000) {
      // Verificar se currentData tem o número esperado de mensagens OU a mensagem específica
      const currentCount = currentData?.interactiveMessages?.length || 0;
      const prevCount = prevRef.current?.interactiveMessages?.length || 0;
      const currentHasTarget = recent.messageId ? 
        currentData?.interactiveMessages?.some((msg: any) => msg.id === recent.messageId) :
        false;
      const prevHasTarget = recent.messageId ?
        prevRef.current?.interactiveMessages?.some((msg: any) => msg.id === recent.messageId) :
        false;
      
  // 👇 LÓGICA CORRIGIDA: Distinguir entre ADD e REMOVE operations usando `operation`
  const wasAddOperation = recent.operation === 'add';
  const wasRemoveOperation = recent.operation === 'remove';
      
      if (wasAddOperation) {
        // Para ADD: usar currentData se tem mensagens suficientes E tem a mensagem target
        if (currentCount >= recent.messageCount && currentHasTarget) {
          console.log('📋 [MtfDataProvider] ADD sincronizado - usando currentData:', {
            currentCount,
            expectedCount: recent.messageCount,
            hasTargetMessage: currentHasTarget,
            operation: 'ADD',
            protectionActive: true
          });
          return currentData?.interactiveMessages || [];
        } else if (prevCount >= recent.messageCount && prevHasTarget) {
          console.log('📋 [MtfDataProvider] ADD pendente - usando prevRef:', {
            currentCount,
            prevCount,
            expectedCount: recent.messageCount,
            hasTargetMessage: prevHasTarget,
            operation: 'ADD',
            protectionActive: true
          });
          return prevRef.current?.interactiveMessages || [];
        }
      } else if (wasRemoveOperation) {
        // Para REMOVE: usar currentData se tem mensagens reduzidas E NÃO tem a mensagem target
        if (currentCount <= recent.messageCount && !currentHasTarget) {
          console.log('📋 [MtfDataProvider] REMOVE sincronizado - usando currentData:', {
            currentCount,
            expectedCount: recent.messageCount,
            hasTargetMessage: currentHasTarget,
            operation: 'REMOVE',
            protectionActive: true
          });
          return currentData?.interactiveMessages || [];
        } else {
          // Servidor ainda não processou a remoção, manter estado otimista
          console.log('📋 [MtfDataProvider] REMOVE pendente - mantendo estado otimista:', {
            currentCount,
            prevCount,
            expectedCount: recent.messageCount,
            hasTargetMessage: currentHasTarget,
            operation: 'REMOVE',
            protectionActive: true
          });
          // Filtra a mensagem deletada do prevRef para manter o estado otimista
          const result = prevRef.current?.interactiveMessages?.filter((msg: any) => msg.id !== recent.messageId) || [];
          return result;
        }
      }
    }
    
    // Sem proteção ativa ou dados já sincronizados
    const result = currentData?.interactiveMessages ?? prevRef.current?.interactiveMessages ?? [];
    console.log('📋 [MtfDataProvider] interactiveMessages memo atualizado:', {
      isPaused,
      currentDataHasMessages: !!currentData?.interactiveMessages,
      prevRefHasMessages: !!prevRef.current?.interactiveMessages,
      resultCount: result.length,
      protectionActive: !!(recent && !recent.isCompleted && (now - recent.timestamp) < 15000),
      firstMessage: result[0] ? {
        id: result[0].id,
        name: result[0].name || result[0].nome,
        texto: result[0].texto
      } : null
    });
    return result;
  }, [currentData?.interactiveMessages, isPaused]);
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
    
    // 2. Force fresh fetch with cache-busting and nocache
    const bustingUrl = id && id !== "all" 
      ? `${base}?inboxId=${id}&nocache=1&t=${Date.now()}`
      : `${base}?nocache=1&t=${Date.now()}`;
    
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

  // Funções de controle de pausa com debounce
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
      
      // ✅ FIX: Verifica se há operação optimistic recente antes de fazer refetch
      const now = Date.now();
      const recent = recentOptimisticRef.current;
      const hasRecentOptimistic = recent && !recent.isCompleted && (now - recent.timestamp) < 15000; // 15 segundos
      
      // Trigger fresh fetch apenas se necessário E se não há operação optimistic recente
      const shouldRefetch = !bffData || 
        ((Date.now() - (lastUpdateRef.current || 0)) > 5000 && !hasRecentOptimistic); // 5 segundos
      
      if (shouldRefetch) {
        mutate();
        console.log('▶️ [MtfDataProvider] Updates resumed - fetching fresh data');
      } else if (hasRecentOptimistic) {
        console.log('▶️ [MtfDataProvider] Updates resumed - SKIPPING fetch due to recent optimistic update:', {
          messageId: recent?.messageId,
          timeLeft: Math.round((15000 - (now - (recent?.timestamp || 0))) / 1000)
        });
      } else {
        console.log('▶️ [MtfDataProvider] Updates resumed - using cached data');
      }
      
      lastUpdateRef.current = Date.now();
    }
  }, [isPaused, mutate, bffData]);



  // 👇 NOVA FUNÇÃO: Apenas chama a API e retorna a promessa.
  const saveMessage = useCallback(async (
    apiPayload: any, 
    isEdit: boolean
  ): Promise<any> => {
    console.log('🚀 [MtfDataProvider] saveMessage: Iniciando chamada à API...', { isEdit });
    // Apenas chama a função que faz o fetch e aguarda o resultado.
    // O SWR não é manipulado aqui.
    return saveMessageWithReactions(apiPayload, isEdit);
  }, []); // Sem dependências, pois saveMessageWithReactions é externa

  // 👇 NOVA FUNÇÃO OTIMIZADA: Atualiza o cache manualmente sem refetch
  const updateMessagesCache = useCallback((
    messageOrId: any, 
    action: 'add' | 'update' | 'remove'
  ) => {
    console.log(`🔄 [MtfDataProvider] Atualizando cache manualmente: ${action}`);
    
    // ✅ FIX: Ativa proteção contra revalidação prematura
    const now = Date.now();
    const currentCount = currentData?.interactiveMessages?.length || 0;
    
    if (action === 'add') {
      recentOptimisticRef.current = {
        timestamp: now,
        messageCount: currentCount + 1,
  messageId: messageOrId.id,
  operation: 'add',
        isCompleted: false
      };
      console.log('🛡️ [MtfDataProvider] Proteção ativada para nova mensagem:', {
        messageId: messageOrId.id,
        expectedCount: currentCount + 1,
        protectionTime: '15 segundos'
      });
    } else if (action === 'remove') {
      recentOptimisticRef.current = {
        timestamp: now,
        messageCount: currentCount - 1,
        messageId: messageOrId, // ID da mensagem deletada
  operation: 'remove',
        isCompleted: false
      };
      console.log('🛡️ [MtfDataProvider] Proteção ativada para deleção de mensagem:', {
        deletedMessageId: messageOrId,
        expectedCount: currentCount - 1,
        protectionTime: '15 segundos'
      });
    }
    
    return mutate((currentData: any) => {
      // Se não houver dados atuais no cache, não faz nada
      if (!currentData) return currentData;

      let updatedMessages;
      const currentMessages = currentData.interactiveMessages || [];

      switch (action) {
        case 'add':
          // Adiciona a nova mensagem no início da lista
          updatedMessages = [messageOrId, ...currentMessages];
          console.log('➕ [MtfDataProvider] Mensagem adicionada ao cache:', messageOrId.id || messageOrId.name);
          break;
        case 'update':
          // Atualiza uma mensagem existente
          updatedMessages = currentMessages.map((msg: any) => 
            msg.id === messageOrId.id ? messageOrId : msg
          );
          console.log('� [MtfDataProvider] Mensagem atualizada no cache:', messageOrId.id);
          break;
        case 'remove':
          // Remove uma mensagem pelo ID
          updatedMessages = currentMessages.filter((msg: any) => msg.id !== messageOrId);
          console.log('🗑️ [MtfDataProvider] Mensagem removida do cache:', messageOrId);
          break;
        default:
          updatedMessages = currentMessages;
      }

      // Retorna o objeto de dados completo com a lista de mensagens atualizada
      const updatedData = { ...currentData, interactiveMessages: updatedMessages };
      
      // ✅ FIX: Atualiza prevRef para manter consistência
      prevRef.current = updatedData;
      
      return updatedData;

    }, { revalidate: false }); // IMPORTANTE: revalidate: false evita uma busca de rede desnecessária
  }, [mutate, currentData?.interactiveMessages]);

  // 👇 NOVA FUNÇÃO: Deleção simples
  const deleteMessage = useCallback(async (messageId: string): Promise<any> => {
    console.log('🗑️ [MtfDataProvider] deleteMessage: Iniciando deleção...', { messageId });
    
    const response = await fetch(`/api/admin/mtf-diamante/interactive-messages/${messageId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Falha na comunicação com o servidor.' }));
      throw new Error(errorData.error || 'Falha ao excluir a mensagem.');
    }
    
    return { success: true, deletedId: messageId };
  }, []);

  // Função para update otimista de caixas
  const optimisticAddCaixa = useCallback(async (apiPayload: any, optimisticCaixaData: any) => {
    console.log('🚀 [MtfDataProvider] optimisticAddCaixa iniciada');
    
    // Função helper que faz a chamada real à API
    const addCaixaAPI = async (payload: any) => {
      const response = await fetch('/api/admin/mtf-diamante/dialogflow/caixas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      return response.json();
    };

    return mutate(
      addCaixaAPI(apiPayload),
      {
        // Dados otimistas: Como a UI deve ficar IMEDIATAMENTE
        optimisticData: (currentBffData: any) => {
          console.log('📊 [MtfDataProvider] optimisticAddCaixa - optimisticData executada');
          
          if (!currentBffData) {
            console.log('⚠️ [MtfDataProvider] Cache vazio, criando novo com caixa');
            return { ...initialData, caixas: [optimisticCaixaData] };
          }
          
          const currentCaixas = currentBffData.caixas || [];
          const updatedCaixas = [...currentCaixas, optimisticCaixaData];
          
          console.log('📋 [MtfDataProvider] Caixas atualizadas:', {
            antes: currentCaixas.length,
            depois: updatedCaixas.length
          });
          
          return { ...currentBffData, caixas: updatedCaixas };
        },
        
        // Popular cache com dados reais da API
        populateCache: (apiResult, currentBffData) => {
          console.log('🏆 [MtfDataProvider] optimisticAddCaixa - populateCache executada');
          
          const realCaixa = apiResult.caixa;
          const currentCaixas = currentBffData.caixas || [];
          
          // Substituir a caixa otimista pela real
          const updatedCaixas = currentCaixas.map((caixa: any) =>
            caixa.id === optimisticCaixaData.id ? realCaixa : caixa
          );
          
          // Se não encontrou para substituir, adicionar
          if (!updatedCaixas.find((c: any) => c.id === realCaixa.id)) {
            updatedCaixas.push(realCaixa);
          }
          
          return { ...currentBffData, caixas: updatedCaixas };
        },
        
        // Rollback automático em caso de erro
        rollbackOnError: true,
        revalidate: false,
      }
    );
  }, [mutate, initialData]);

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
    saveMessage,
    updateMessagesCache,
    deleteMessage,
    optimisticAddCaixa,
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
    saveMessage,
    updateMessagesCache,
    deleteMessage,
    optimisticAddCaixa,
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