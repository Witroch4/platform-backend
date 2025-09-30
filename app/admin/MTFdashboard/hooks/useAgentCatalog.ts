'use client';

import useSWR from 'swr';
import type { AgentCatalogPayload } from '../types';

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail?.error || 'Falha ao carregar catálogo de agentes');
  }
  return res.json();
};

export function useAgentCatalog() {
  const { data, error, isLoading } = useSWR<AgentCatalogPayload>('/api/admin/mtf-agents/catalog', fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });

  return {
    catalog: data,
    isLoading,
    error,
  };
}

