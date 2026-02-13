import { useMemo } from 'react';
import useSWR from 'swr';
import type { FlowNodeType } from '@/types/flow-builder';
import type { ExecutionLogEntry } from '@/types/flow-analytics';

// =============================================================================
// TYPES
// =============================================================================

export interface ButtonMetric {
  buttonId: string;
  buttonText: string;
  clickCount: number;
  impressions: number;
  clickThroughRate: number;
}

export interface SessionSample {
  sessionId: string;
  status: string;
  visitedAt: number;
  action?: string;
}

export interface NodeDetails {
  nodeId: string;
  nodeName: string;
  nodeType: FlowNodeType;
  visitCount: number;
  visitPercentage: number;
  avgTimeBeforeLeaving: number;
  dropOffRate: number;
  healthStatus: 'healthy' | 'moderate' | 'critical';
  isBottleneck: boolean;
  buttonMetrics?: ButtonMetric[];
  sessionSamples?: SessionSample[];
  executionLogSamples?: ExecutionLogEntry[];
}

export interface NodeDetailsResponse {
  success: boolean;
  data: NodeDetails;
  error?: string;
}

export interface NodeDetailsFilters {
  flowId: string;
  nodeId: string;
  inboxId?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
  enabled?: boolean;
}

// =============================================================================
// FETCHER
// =============================================================================

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Erro ao carregar detalhes do nó');
  }
  return res.json();
};

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook para buscar detalhes de um nó específico
 * 
 * @param filters - Filtros para a busca (flowId e nodeId obrigatórios)
 * @returns Detalhes do nó, estado de loading e erro
 */
export function useNodeDetails(filters: NodeDetailsFilters) {
  // Build API URL with filters
  const apiUrl = useMemo(() => {
    if (!filters.enabled) return null;
    if (!filters.flowId || !filters.nodeId) return null;

    const params = new URLSearchParams();
    params.append('flowId', filters.flowId);
    params.append('nodeId', filters.nodeId);
    if (filters.inboxId) params.append('inboxId', filters.inboxId);
    if (filters.dateRange) {
      params.append('startDate', filters.dateRange.start.toISOString());
      params.append('endDate', filters.dateRange.end.toISOString());
    }
    return `/api/admin/mtf-diamante/flow-analytics/node-details?${params.toString()}`;
  }, [filters]);

  // Fetch node details
  const { data, error, isLoading, mutate } = useSWR<NodeDetailsResponse>(
    apiUrl,
    fetcher,
    {
      revalidateOnFocus: false,
      keepPreviousData: false,
    }
  );

  return {
    nodeDetails: data?.data,
    isLoading,
    error,
    mutate,
  };
}
