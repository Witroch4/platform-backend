'use client';

import { useCallback, useMemo, useEffect, useRef } from 'react';
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
} from '@/types/flow-builder';
import {
  createFlowNode,
  createFlowEdge,
  createEmptyFlowCanvas,
  FLOW_CANVAS_CONSTANTS,
} from '@/types/flow-builder';

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

export function useFlowCanvas(
  inboxId: string | null,
  options: UseFlowCanvasOptions = {}
) {
  const { autoSave = false, flowId = null } = options;

  // Ref para controlar sincronização inicial
  const initializedRef = useRef(false);
  const flowIdRef = useRef(flowId);

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
    }
  );

  // Save mutation
  const { trigger: triggerSave, isMutating: isSaving } = useSWRMutation(
    '/api/admin/mtf-diamante/flow-canvas',
    saveCanvas
  );

  // Determinar dados iniciais baseado no modo (canvas vs flow)
  const initialCanvas = useMemo(() => {
    if (flowId && flowResponse?.data?.canvas) {
      return flowResponse.data.canvas;
    }
    if (!flowId && canvasResponse?.data?.canvas) {
      return canvasResponse.data.canvas;
    }
    return createEmptyFlowCanvas();
  }, [flowId, flowResponse?.data?.canvas, canvasResponse?.data?.canvas]);

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
    // Se mudou o flowId, resetar flag de inicialização
    if (flowIdRef.current !== flowId) {
      initializedRef.current = false;
      flowIdRef.current = flowId;
    }

    // Evitar sincronização duplicada
    if (initializedRef.current) return;

    // Se tem flowId e os dados do flow carregaram
    if (flowId && flowResponse?.data?.canvas) {
      const canvas = flowResponse.data.canvas;
      setNodes(canvas.nodes as unknown as Node[]);
      setEdges(canvas.edges as unknown as Edge[]);
      initializedRef.current = true;
      return;
    }

    // Se não tem flowId e os dados do canvas carregaram
    if (!flowId && canvasResponse?.data?.canvas) {
      const canvas = canvasResponse.data.canvas;
      setNodes(canvas.nodes as unknown as Node[]);
      setEdges(canvas.edges as unknown as Edge[]);
      initializedRef.current = true;
      return;
    }

    // Se não tem dados, inicializar com canvas vazio (apenas uma vez)
    if (!flowId && canvasResponse && !canvasResponse.data && !initializedRef.current) {
      const empty = createEmptyFlowCanvas();
      setNodes(empty.nodes as unknown as Node[]);
      setEdges(empty.edges as unknown as Edge[]);
      initializedRef.current = true;
    }
  }, [flowId, flowResponse, canvasResponse, setNodes, setEdges]);

  // Computed states
  const isLoading = isLoadingCanvas || isLoadingFlow;
  const error = canvasError || flowError;
  const canvasVersion = canvasResponse?.data?.version ?? 0;

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
        const result = await triggerSave({ inboxId, canvas });
        // Atualizar cache local
        await mutateCanvas();
        if (flowId) {
          await mutateFlow();
        }
        return result;
      } catch (err) {
        console.error('[useFlowCanvas] Save error:', err);
        throw err;
      }
    },
    [inboxId, getCanvasState, triggerSave, mutateCanvas, mutateFlow, flowId]
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

  return {
    // State
    nodes,
    edges,
    isLoading,
    isSaving,
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
  };
}

export type UseFlowCanvasReturn = ReturnType<typeof useFlowCanvas>;
