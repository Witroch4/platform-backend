'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';

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
  dataInicio: Date;
  dataFim: Date;
  isActive: boolean;
}

interface AgenteDialogflow {
  id: string;
  nome: string;
  projectId: string;
  region: string;
  ativo: boolean;
}

interface MtfCaixa {
  id: string;
  nome: string;
  inboxId: string;
  inboxName: string;
  chatwitAccountId: string;
  channelType: string;
  agentes: AgenteDialogflow[];
}

interface MtfDataContextType {
  // Variáveis
  variaveis: MtfDiamanteVariavel[];
  loadingVariaveis: boolean;
  refreshVariaveis: () => Promise<void>;
  
  // Lotes
  lotes: MtfDiamanteLote[];
  loadingLotes: boolean;
  refreshLotes: () => Promise<void>;
  
  // Caixas
  caixas: MtfCaixa[];
  loadingCaixas: boolean;
  refreshCaixas: () => Promise<void>;
  
  // Controle geral
  isInitialized: boolean;
}

const MtfDataContext = createContext<MtfDataContextType | undefined>(undefined);

export function useMtfData() {
  const context = useContext(MtfDataContext);
  if (!context) {
    throw new Error('useMtfData deve ser usado dentro de MtfDataProvider');
  }
  return context;
}

interface MtfDataProviderProps {
  children: React.ReactNode;
}

export function MtfDataProvider({ children }: MtfDataProviderProps) {
  // Estados para variáveis
  const [variaveis, setVariaveis] = useState<MtfDiamanteVariavel[]>([]);
  const [loadingVariaveis, setLoadingVariaveis] = useState(true);
  
  // Estados para lotes
  const [lotes, setLotes] = useState<MtfDiamanteLote[]>([]);
  const [loadingLotes, setLoadingLotes] = useState(true);
  
  // Estados para caixas
  const [caixas, setCaixas] = useState<MtfCaixa[]>([]);
  const [loadingCaixas, setLoadingCaixas] = useState(true);
  
  // Controle de inicialização
  const [isInitialized, setIsInitialized] = useState(false);

  // Cache em memória para evitar requisições desnecessárias
  const [lastFetchTimes, setLastFetchTimes] = useState({
    variaveis: 0,
    lotes: 0,
    caixas: 0
  });

  // Refs para controlar se já foi carregado inicialmente
  const hasLoadedVariaveis = useRef(false);
  const hasLoadedLotes = useRef(false);
  const hasLoadedCaixas = useRef(false);

  const CACHE_DURATION = 10 * 60 * 1000; // 10 minutos

  // Função para buscar variáveis
  const fetchVariaveis = useCallback(async (forceRefresh = false) => {
    const now = Date.now();
    const shouldFetch = forceRefresh || (now - lastFetchTimes.variaveis > CACHE_DURATION);
    
    // Se já carregou e não é force refresh, não busca novamente
    if (!shouldFetch && hasLoadedVariaveis.current) {
      return;
    }

    setLoadingVariaveis(true);
    try {
      const response = await fetch('/api/admin/mtf-diamante/variaveis');
      if (response.ok) {
        const data = await response.json();
        setVariaveis(data.variaveis || []);
        setLastFetchTimes(prev => ({ ...prev, variaveis: now }));
        hasLoadedVariaveis.current = true;
      }
    } catch (error) {
      console.error('Erro ao buscar variáveis:', error);
    } finally {
      setLoadingVariaveis(false);
    }
  }, [lastFetchTimes.variaveis]);

  // Função para buscar lotes
  const fetchLotes = useCallback(async (forceRefresh = false) => {
    const now = Date.now();
    const shouldFetch = forceRefresh || (now - lastFetchTimes.lotes > CACHE_DURATION);
    
    // Se já carregou e não é force refresh, não busca novamente
    if (!shouldFetch && hasLoadedLotes.current) {
      return;
    }

    setLoadingLotes(true);
    try {
      const response = await fetch('/api/admin/mtf-diamante/lotes');
      if (response.ok) {
        const data = await response.json();
        setLotes(data.lotes || []);
        setLastFetchTimes(prev => ({ ...prev, lotes: now }));
        hasLoadedLotes.current = true;
      }
    } catch (error) {
      console.error('Erro ao buscar lotes:', error);
    } finally {
      setLoadingLotes(false);
    }
  }, [lastFetchTimes.lotes]);

  // Função para buscar caixas
  const fetchCaixas = useCallback(async (forceRefresh = false) => {
    const now = Date.now();
    const shouldFetch = forceRefresh || (now - lastFetchTimes.caixas > CACHE_DURATION);
    
    // Se já carregou e não é force refresh, não busca novamente
    if (!shouldFetch && hasLoadedCaixas.current) {
      return;
    }

    setLoadingCaixas(true);
    try {
      const response = await fetch('/api/admin/mtf-diamante/dialogflow/caixas');
      if (response.ok) {
        const data = await response.json();
        setCaixas(data.caixas || []);
        setLastFetchTimes(prev => ({ ...prev, caixas: now }));
        hasLoadedCaixas.current = true;
      }
    } catch (error) {
      console.error('Erro ao buscar caixas:', error);
    } finally {
      setLoadingCaixas(false);
    }
  }, [lastFetchTimes.caixas]);

  // Funções de refresh públicas
  const refreshVariaveis = useCallback(() => fetchVariaveis(true), [fetchVariaveis]);
  const refreshLotes = useCallback(() => fetchLotes(true), [fetchLotes]);
  const refreshCaixas = useCallback(() => fetchCaixas(true), [fetchCaixas]);

  // Inicialização dos dados - apenas uma vez
  useEffect(() => {
    const initializeData = async () => {
      await Promise.all([
        fetchVariaveis(),
        fetchLotes(),
        fetchCaixas()
      ]);
      setIsInitialized(true);
    };

    initializeData();
  }, []); // Removidas as dependências que causavam re-renders infinitos

  const contextValue: MtfDataContextType = {
    variaveis,
    loadingVariaveis,
    refreshVariaveis,
    lotes,
    loadingLotes,
    refreshLotes,
    caixas,
    loadingCaixas,
    refreshCaixas,
    isInitialized
  };

  return (
    <MtfDataContext.Provider value={contextValue}>
      {children}
    </MtfDataContext.Provider>
  );
}