import { SWRConfiguration } from 'swr';

/**
 * Configuração global do SWR para otimizar performance e evitar requisições duplicadas
 */
export const swrConfig: SWRConfiguration = {
  // Dedupe requisições idênticas por 2 segundos
  dedupingInterval: 2000,
  
  // Cache por 60 segundos antes de considerar stale
  focusThrottleInterval: 60000,
  
  // Não revalidar automaticamente no foco (reduz requisições desnecessárias)
  revalidateOnFocus: false,
  
  // Não revalidar automaticamente ao reconectar
  revalidateOnReconnect: false,
  
  // Revalidar automaticamente quando a aba ficar visível novamente
  revalidateIfStale: true,
  
  // Timeout de 30 segundos para requisições
  loadingTimeout: 30000,
  
  // Retry até 3 vezes com backoff exponencial
  errorRetryCount: 3,
  errorRetryInterval: 1000,
  
  // Função de retry com backoff exponencial
  onErrorRetry: (error, key, config, revalidate, { retryCount }) => {
    // Não retry para erros 404
    if (error.status === 404) return;
    
    // Não retry após 3 tentativas
    if (retryCount >= 3) return;
    
    // Backoff exponencial: 1s, 2s, 4s
    setTimeout(() => revalidate({ retryCount }), Math.pow(2, retryCount) * 1000);
  },
  
  // Log de erros em desenvolvimento
  onError: (error, key) => {
    if (process.env.NODE_ENV === 'development') {
      console.error('🔥 [SWR] Erro na chave:', key, error);
    }
  },
  
  // Cache em memória por mais tempo
  provider: () => new Map(),
  
  // Revalidar no mount para dados frescos
  revalidateOnMount: true,
};

/**
 * Configuração específica para dados administrativos (cache mais longo)
 */
export const adminSwrConfig: SWRConfiguration = {
  ...swrConfig,
  
  // Cache admin por 5 minutos (dados mudam menos)
  focusThrottleInterval: 300000,
  dedupingInterval: 5000,
  
  // Dados admin são menos críticos para revalidação
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
};

/**
 * Fetcher personalizado com headers otimizados
 */
export const swrFetcher = async (url: string) => {
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Cache-Control': 'no-cache',
    },
  });
  
  // Debug logs em desenvolvimento
  if (process.env.NODE_ENV !== 'production') {
    console.log('[SWR]', url, {
      xcache: response.headers.get('x-cache'),
      serverTiming: response.headers.get('server-timing'),
      etag: response.headers.get('etag'),
      status: response.status,
    });
  }
  
  if (!response.ok && response.status !== 304) {
    const error = new Error('Erro na requisição');
    (error as any).status = response.status;
    throw error;
  }
  
  return response.status === 304 ? null : response.json();
};
