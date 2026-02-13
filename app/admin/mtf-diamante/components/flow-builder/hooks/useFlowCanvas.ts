'use client';

import { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';
import {
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Connection,
  addEdge,
} from '@xyflow/react';
import type {
  FlowCanvas,
  FlowNode,
  FlowEdge,
  FlowNodeType,
  FlowNodeData,
  FlowCanvasState,
  FlowExportFormat,
} from '@/types/flow-builder';
import {
  createFlowNode,
  createFlowEdge,
  createEmptyFlowCanvas,
  FLOW_CANVAS_CONSTANTS,
} from '@/types/flow-builder';
import { canvasToN8nFormat } from '@/lib/flow-builder/exportImport';

// =============================================================================
// TYPES
// =============================================================================

interface FlowDetail {
  id: string;
  name: string;
  inboxId: string;
  isActive: boolean;
  canvas: FlowCanvas | null;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Erro ao carregar canvas');
  }
  return res.json();
};

const saveCanvas = async (
  url: string,
  { arg }: { arg: { inboxId: string; canvas: FlowCanvas } }
) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(arg),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Erro ao salvar canvas');
  }
  return res.json();
};

// =============================================================================
// HOOK
// =============================================================================

interface UseFlowCanvasOptions {
  autoSave?: boolean;
  autoSaveDelay?: number;
  flowId?: string | null; // ID do flow específico para carregar
}

// Default auto-save delay: 3 seconds
const DEFAULT_AUTO_SAVE_DELAY = 3000;

export function useFlowCanvas(
  inboxId: string | null,
  options: UseFlowCanvasOptions = {}
) {
  const { autoSave = false, autoSaveDelay = DEFAULT_AUTO_SAVE_DELAY, flowId = null } = options;

  // Ref para controlar sincronização inicial
  const initializedRef = useRef(false);
  const flowIdRef = useRef(flowId);

  // Refs para auto-save
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>(''); // JSON hash do último estado salvo
  const isAutoSavingRef = useRef(false);

  // SWR key para canvas visual (mantido para compatibilidade)
  const canvasSwrKey = inboxId
    ? `/api/admin/mtf-diamante/flow-canvas?inboxId=${inboxId}`
    : null;

  // SWR key para flow específico (quando flowId fornecido)
  const flowSwrKey = flowId
    ? `/api/admin/mtf-diamante/flows/${flowId}`
    : null;

  // Fetch canvas visual
  const {
    data: canvasResponse,
    error: canvasError,
    isLoading: isLoadingCanvas,
    mutate: mutateCanvas,
  } = useSWR<{ success: boolean; data: FlowCanvasState | null }>(
    !flowId ? canvasSwrKey : null, // Só busca se não tiver flowId
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
      keepPreviousData: false, // ⚠️ CRÍTICO: não reutilizar dados antigos
    }
  );

  // Fetch flow específico
  const {
    data: flowResponse,
    error: flowError,
    isLoading: isLoadingFlow,
    mutate: mutateFlow,
  } = useSWR<{ success: boolean; data: FlowDetail | null }>(
    flowSwrKey,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
      keepPreviousData: false, // ⚠️ CRÍTICO: não reutilizar dados antigos
    }
  );

  // Save mutation
  const { trigger: triggerSave, isMutating: isSaving } = useSWRMutation(
    '/api/admin/mtf-diamante/flow-canvas',
    saveCanvas
  );

  // SEMPRE inicializar com canvas vazio para evitar mostrar dados antigos
  // O useEffect sincroniza os dados corretos após o carregamento
  const initialCanvas = useMemo(() => {
    return createEmptyFlowCanvas();
  }, []); // Dependências vazias - só roda uma vez

  // Metadados do flow atual
  const currentFlowMeta = useMemo(() => {
    if (flowId && flowResponse?.data) {
      return {
        id: flowResponse.data.id,
        name: flowResponse.data.name,
        isActive: flowResponse.data.isActive,
      };
    }
    return null;
  }, [flowId, flowResponse?.data]);

  // React Flow states - convertendo tipos
  const [nodes, setNodes, onNodesChange] = useNodesState(
    initialCanvas.nodes as unknown as Node[]
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    initialCanvas.edges as unknown as Edge[]
  );

  // Sincronizar estado quando o flowId muda ou quando os dados carregam
  useEffect(() => {
    // ⚠️ CRÍTICO: Se mudou o flowId, RESETAR completamente
    if (flowIdRef.current !== flowId) {
      console.log('[useFlowCanvas] FlowId mudou:', flowIdRef.current, '->', flowId);
      initializedRef.current = false;
      flowIdRef.current = flowId;
      
      // SEMPRE limpar canvas ao mudar flowId
      const empty = createEmptyFlowCanvas();
      setNodes(empty.nodes as unknown as Node[]);
      setEdges(empty.edges as unknown as Edge[]);
      
      // Se não tem flowId (voltou para lista), já está limpo e inicializado
      if (!flowId) {
        initializedRef.current = true;
        return;
      }
      
      // Se tem flowId, NÃO marcar como initialized ainda - esperar dados carregarem
      return;
    }

    // Evitar sincronização duplicada
    if (initializedRef.current) return;

    //============================================================================
    // SINCRONIZAÇÃO: só executar se os dados estiverem carregados
    //============================================================================

    // Se tem flowId, AGUARDAR os dados carregarem do servidor
    if (flowId && !isLoadingFlow && flowResponse) {
      console.log('[useFlowCanvas] Sincronizando flow:', flowId, '- tem canvas?', !!flowResponse.data?.canvas);
      
      if (flowResponse.data?.canvas) {
        // Flow tem canvas salvo - carregar
        const canvas = flowResponse.data.canvas;
        setNodes(canvas.nodes as unknown as Node[]);
        setEdges(canvas.edges as unknown as Edge[]);
        console.log('[useFlowCanvas] Canvas carregado - nós:', canvas.nodes.length);
      } else {
        // Flow novo sem canvas - deixar vazio (já está do reset acima)
        console.log('[useFlowCanvas] Flow novo sem canvas - mantendo vazio');
      }
      initializedRef.current = true;
      return;
    }

    // Se não tem flowId e os dados do canvas carregaram
    if (!flowId && !isLoadingCanvas && canvasResponse?.data?.canvas) {
      console.log('[useFlowCanvas] Sincronizando canvas visual');
      const canvas = canvasResponse.data.canvas;
      setNodes(canvas.nodes as unknown as Node[]);
      setEdges(canvas.edges as unknown as Edge[]);
      initializedRef.current = true;
      return;
    }
  }, [flowId, flowResponse, canvasResponse, isLoadingFlow, isLoadingCanvas, setNodes, setEdges]);

  // Computed states
  const isLoading = isLoadingCanvas || isLoadingFlow;
  const error = canvasError || flowError;
  const canvasVersion = canvasResponse?.data?.version ?? 0;

  // Auto-save state
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<Date | null>(null);

  // ==========================================================================
  // AUTO-SAVE LOGIC
  // ==========================================================================

  // Função interna de save para auto-save (sem validação)
  const performAutoSave = useCallback(async () => {
    if (!inboxId || !flowId || !initializedRef.current) return;
    if (isAutoSavingRef.current) return; // Evitar saves simultâneos

    const currentState = JSON.stringify({ nodes, edges });

    // Só salvar se houver mudanças reais
    if (currentState === lastSavedRef.current) return;

    try {
      isAutoSavingRef.current = true;
      setIsAutoSaving(true);

      const defaultViewport = flowResponse?.data?.canvas?.viewport;
      const canvas: FlowCanvas = {
        nodes: nodes as unknown as FlowNode[],
        edges: edges as unknown as FlowEdge[],
        viewport: defaultViewport ?? FLOW_CANVAS_CONSTANTS.DEFAULT_VIEWPORT,
      };

      const response = await fetch(`/api/admin/mtf-diamante/flows/${flowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canvas }),
      });

      if (response.ok) {
        lastSavedRef.current = currentState;
        setLastAutoSaveTime(new Date());
        console.log('[useFlowCanvas] Auto-save concluído');
      }
    } catch (err) {
      console.error('[useFlowCanvas] Auto-save error:', err);
    } finally {
      isAutoSavingRef.current = false;
      setIsAutoSaving(false);
    }
  }, [inboxId, flowId, nodes, edges, flowResponse?.data?.canvas?.viewport]);

  // Efeito para disparar auto-save com debounce
  useEffect(() => {
    // Não ativar auto-save se:
    // - autoSave está desabilitado
    // - não há flowId (canvas visual legacy)
    // - canvas ainda não foi inicializado
    // - está carregando
    if (!autoSave || !flowId || !initializedRef.current || isLoading) {
      return;
    }

    // Limpar timeout anterior
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Agendar novo auto-save
    autoSaveTimeoutRef.current = setTimeout(() => {
      performAutoSave();
    }, autoSaveDelay);

    // Cleanup
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [autoSave, flowId, nodes, edges, autoSaveDelay, isLoading, performAutoSave]);

  // Atualizar lastSavedRef quando dados são carregados do servidor
  useEffect(() => {
    if (initializedRef.current && flowId) {
      lastSavedRef.current = JSON.stringify({ nodes, edges });
    }
  }, [flowId]); // Só quando flowId muda (dados carregados)

  // Handle connection
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const newEdge = createFlowEdge(
        connection.source!,
        connection.target!,
        connection.sourceHandle ?? undefined,
        connection.sourceHandle
          ? { buttonId: connection.sourceHandle }
          : undefined
      );
      setEdges((eds) => addEdge(newEdge as unknown as Edge, eds));
    },
    [setEdges]
  );

  // Add node
  const addNode = useCallback(
    (type: FlowNodeType, position?: { x: number; y: number }) => {
      const defaultPosition = position ?? {
        x: 250,
        y: (nodes.length + 1) * FLOW_CANVAS_CONSTANTS.NODE_SPACING_Y,
      };
      const newNode = createFlowNode(type, defaultPosition);
      setNodes((nds) => [...nds, newNode as unknown as Node]);
      return newNode.id;
    },
    [nodes.length, setNodes]
  );

  // Update node data
  const updateNodeData = useCallback(
    (nodeId: string, data: Partial<FlowNodeData>) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: { ...node.data, ...data },
            };
          }
          return node;
        })
      );
    },
    [setNodes]
  );

  // Delete node
  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((node) => node.id !== nodeId));
      // Also remove connected edges
      setEdges((eds) =>
        eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
      );
    },
    [setNodes, setEdges]
  );

  // Delete edge
  const deleteEdge = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
    },
    [setEdges]
  );

  // Get current canvas state
  const getCanvasState = useCallback(
    (viewport?: { x: number; y: number; zoom: number }): FlowCanvas => {
      const defaultViewport = flowId
        ? flowResponse?.data?.canvas?.viewport
        : canvasResponse?.data?.canvas?.viewport;

      return {
        nodes: nodes as unknown as FlowNode[],
        edges: edges as unknown as FlowEdge[],
        viewport:
          viewport ??
          defaultViewport ??
          FLOW_CANVAS_CONSTANTS.DEFAULT_VIEWPORT,
      };
    },
    [nodes, edges, flowId, flowResponse?.data?.canvas?.viewport, canvasResponse?.data?.canvas?.viewport]
  );

  // Save canvas
  const saveFlow = useCallback(
    async (viewport?: { x: number; y: number; zoom: number }) => {
      if (!inboxId) return;

      const canvas = getCanvasState(viewport);

      try {
        // Se estiver editando um flow específico, salvar no Flow.canvasJson
        if (flowId) {
          const response = await fetch(`/api/admin/mtf-diamante/flows/${flowId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ canvas }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Falha ao salvar canvas do flow');
          }

          // Atualizar cache do flow específico
          await mutateFlow();
          console.log('[useFlowCanvas] Canvas salvo no flow', flowId);
          return await response.json();
        }

        // Se não tem flowId, usar API antiga (canvas visual da inbox)
        const result = await triggerSave({ inboxId, canvas });
        await mutateCanvas();
        console.log('[useFlowCanvas] Canvas visual salvo na inbox', inboxId);
        return result;
      } catch (err) {
        console.error('[useFlowCanvas] Save error:', err);
        throw err;
      }
    },
    [inboxId, flowId, getCanvasState, triggerSave, mutateCanvas, mutateFlow]
  );

  // Reset canvas
  const resetCanvas = useCallback(() => {
    const empty = createEmptyFlowCanvas();
    setNodes(empty.nodes as unknown as Node[]);
    setEdges(empty.edges as unknown as Edge[]);
    initializedRef.current = true; // Evitar re-sincronização
  }, [setNodes, setEdges]);

  // Load canvas from flow (para trocar entre flows)
  const loadCanvas = useCallback(
    (canvas: FlowCanvas) => {
      setNodes(canvas.nodes as unknown as Node[]);
      setEdges(canvas.edges as unknown as Edge[]);
      initializedRef.current = true;
    },
    [setNodes, setEdges]
  );

  // Find node by ID
  const findNode = useCallback(
    (nodeId: string) => {
      return nodes.find((n) => n.id === nodeId);
    },
    [nodes]
  );

  // Get edges connected to a node
  const getNodeEdges = useCallback(
    (nodeId: string) => {
      return edges.filter(
        (e) => e.source === nodeId || e.target === nodeId
      );
    },
    [edges]
  );

  // ==========================================================================
  // EXPORT/IMPORT FUNCTIONS
  // ==========================================================================

  /**
   * Exporta o flow atual como JSON n8n-style (dispara download)
   */
  const exportFlowAsJson = useCallback(async () => {
    if (!flowId) {
      throw new Error('Nenhum flow selecionado para exportar');
    }

    const response = await fetch(
      `/api/admin/mtf-diamante/flows/${flowId}/export`
    );
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Falha ao exportar flow');
    }

    // Extrair filename do header Content-Disposition
    const contentDisposition = response.headers.get('Content-Disposition');
    const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
    const filename = filenameMatch?.[1] || `flow-export-${Date.now()}.json`;

    // Criar blob e disparar download
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [flowId]);

  /**
   * Importa flow a partir de arquivo JSON
   */
  const importFlowFromJson = useCallback(
    async (
      file: File,
      options?: { newName?: string }
    ): Promise<{ id: string; name: string; nodeCount: number; connectionCount: number }> => {
      if (!inboxId) {
        throw new Error('Nenhuma inbox selecionada');
      }

      const text = await file.text();
      let flowData: unknown;

      try {
        flowData = JSON.parse(text);
      } catch {
        throw new Error('Arquivo JSON inválido');
      }

      const response = await fetch('/api/admin/mtf-diamante/flows/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inboxId,
          flowData,
          newName: options?.newName,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Falha ao importar flow');
      }

      // Revalidar lista de flows
      await mutateCanvas();

      return result.data;
    },
    [inboxId, mutateCanvas]
  );

  /**
   * Retorna o canvas atual em formato n8n (para preview/debug)
   */
  const getCanvasAsN8nFormat = useCallback((): FlowExportFormat => {
    const canvas = getCanvasState();
    return canvasToN8nFormat(canvas, {
      flowId: flowId || undefined,
      flowName: currentFlowMeta?.name || 'Untitled',
      inboxId: inboxId || undefined,
    });
  }, [getCanvasState, flowId, currentFlowMeta?.name, inboxId]);

  return {
    // State
    nodes,
    edges,
    isLoading,
    isSaving,
    isAutoSaving,
    lastAutoSaveTime,
    error,
    canvasVersion,
    currentFlowMeta, // Metadados do flow atual (id, name, isActive)

    // Node operations
    setNodes,
    onNodesChange,
    addNode,
    updateNodeData,
    deleteNode,
    findNode,

    // Edge operations
    setEdges,
    onEdgesChange,
    onConnect,
    deleteEdge,
    getNodeEdges,

    // Canvas operations
    getCanvasState,
    saveFlow,
    resetCanvas,
    loadCanvas, // Nova função para carregar canvas manualmente
    mutate: mutateCanvas,

    // Export/Import operations
    exportFlowAsJson,
    importFlowFromJson,
    getCanvasAsN8nFormat,
  };
}

export type UseFlowCanvasReturn = ReturnType<typeof useFlowCanvas>;
