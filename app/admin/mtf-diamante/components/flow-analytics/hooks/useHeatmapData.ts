import { useMemo } from 'react';
import useSWR from 'swr';
import type { FlowNodeType } from '@/types/flow-builder';

// =============================================================================
// TYPES
// =============================================================================

export interface NodeHeatmapData {
  nodeId: string;
  nodeName: string;
  nodeType: FlowNodeType;
  visitCount: number;
  visitPercentage: number; // relative to START
  avgTimeBeforeLeaving: number; // milliseconds
  dropOffRate: number;
  healthStatus: 'healthy' | 'moderate' | 'critical';
  isBottleneck: boolean;
}

interface RuntimeFlowNode {
  id: string;
  type: FlowNodeType;
  position: { x: number; y: number };
  data: {
    label: string;
    [key: string]: unknown;
  };
}

interface RuntimeFlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface RuntimeFlow {
  id: string;
  name: string;
  nodes: RuntimeFlowNode[];
  edges: RuntimeFlowEdge[];
}

export interface HeatmapResponse {
  success: boolean;
  data: {
    flow: RuntimeFlow;
    heatmap: NodeHeatmapData[];
  };
  error?: string;
}

export interface HeatmapFilters {
  flowId: string;
  inboxId?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

// =============================================================================
// FETCHER
// =============================================================================

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Erro ao carregar dados');
  }
  return res.json();
};

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook para buscar dados de heatmap do flow
 * 
 * @param filters - Filtros para a busca (flowId obrigatório)
 * @returns Dados do heatmap, estado de loading e erro
 */
export function useHeatmapData(filters: HeatmapFilters) {
  // Build API URL with filters
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.append('flowId', filters.flowId);
    if (filters.inboxId) params.append('inboxId', filters.inboxId);
    if (filters.dateRange) {
      params.append('startDate', filters.dateRange.start.toISOString());
      params.append('endDate', filters.dateRange.end.toISOString());
    }
    return `/api/admin/mtf-diamante/flow-analytics/heatmap?${params.toString()}`;
  }, [filters]);

  // Fetch heatmap data
  const { data, error, isLoading, mutate } = useSWR<HeatmapResponse>(
    apiUrl,
    fetcher,
    {
      refreshInterval: 60000, // Refresh every 60 seconds
      revalidateOnFocus: true,
      keepPreviousData: true,
    }
  );

  return {
    flow: data?.data?.flow,
    heatmap: data?.data?.heatmap || [],
    isLoading,
    error,
    mutate,
  };
}
