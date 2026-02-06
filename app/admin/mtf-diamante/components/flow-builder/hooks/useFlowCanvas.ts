'use client';

import { useCallback, useMemo } from 'react';
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
}

export function useFlowCanvas(
  inboxId: string | null,
  options: UseFlowCanvasOptions = {}
) {
  const { autoSave = false } = options;

  // SWR key
  const swrKey = inboxId
    ? `/api/admin/mtf-diamante/flow-canvas?inboxId=${inboxId}`
    : null;

  // Fetch canvas
  const {
    data: response,
    error,
    isLoading,
    mutate,
  } = useSWR<{ success: boolean; data: FlowCanvasState | null }>(
    swrKey,
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

  // Initial canvas data
  const initialCanvas = useMemo(() => {
    if (response?.data?.canvas) {
      return response.data.canvas;
    }
    return createEmptyFlowCanvas();
  }, [response?.data?.canvas]);

  // React Flow states - convertendo tipos
  const [nodes, setNodes, onNodesChange] = useNodesState(
    initialCanvas.nodes as unknown as Node[]
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    initialCanvas.edges as unknown as Edge[]
  );

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
      return {
        nodes: nodes as unknown as FlowNode[],
        edges: edges as unknown as FlowEdge[],
        viewport:
          viewport ??
          response?.data?.canvas?.viewport ??
          FLOW_CANVAS_CONSTANTS.DEFAULT_VIEWPORT,
      };
    },
    [nodes, edges, response?.data?.canvas?.viewport]
  );

  // Save canvas
  const saveFlow = useCallback(
    async (viewport?: { x: number; y: number; zoom: number }) => {
      if (!inboxId) return;

      const canvas = getCanvasState(viewport);

      try {
        const result = await triggerSave({ inboxId, canvas });
        // Atualizar cache local
        await mutate();
        return result;
      } catch (err) {
        console.error('[useFlowCanvas] Save error:', err);
        throw err;
      }
    },
    [inboxId, getCanvasState, triggerSave, mutate]
  );

  // Reset canvas
  const resetCanvas = useCallback(() => {
    const empty = createEmptyFlowCanvas();
    setNodes(empty.nodes as unknown as Node[]);
    setEdges(empty.edges as unknown as Edge[]);
  }, [setNodes, setEdges]);

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
    canvasVersion: response?.data?.version ?? 0,

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
    mutate,
  };
}

export type UseFlowCanvasReturn = ReturnType<typeof useFlowCanvas>;
