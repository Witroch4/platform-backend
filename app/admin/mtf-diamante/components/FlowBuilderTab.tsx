'use client';

import { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import type { Node } from '@xyflow/react';
import { FlowCanvas } from './flow-builder/FlowCanvas';
import { NodePalette } from './flow-builder/panels/NodePalette';
import { NodeDetailDialog } from './flow-builder/panels/NodeDetailDialog';
import { FlowSelector } from './flow-builder/panels/FlowSelector';
import { ExportImportPanel } from './flow-builder/panels/ExportImportPanel';
import {
  HandlePopover,
  useHandlePopover,
} from './flow-builder/panels/HandlePopover';
import { useFlowCanvas } from './flow-builder/hooks/useFlowCanvas';
import { useMtfData } from '@/app/admin/mtf-diamante/context/SwrProvider';
import {
  FlowNodeType,
  validateFlowCanvas,
  createEmptyFlowCanvas,
  type FlowCanvas as FlowCanvasType,
  type FlowNodeData,
  type InteractiveMessageElementType,
  type InteractiveMessageNodeData,
} from '@/types/flow-builder';
import {
  createInteractiveMessageElement,
  elementsToLegacyFields,
  getInteractiveMessageButtonElements,
  getInteractiveMessageElements,
  hasConfiguredBody,
} from '@/lib/flow-builder/interactiveMessageElements';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Save,
  RotateCcw,
  AlertTriangle,
  Loader2,
  LayoutGrid,
  Import,
  FileJson,
  ChevronLeft,
  Workflow,
  Cloud,
  CloudOff,
} from 'lucide-react';
import { toast } from 'sonner';
import dagre from '@dagrejs/dagre';
import useSWR from 'swr';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

// =============================================================================
// INNER CANVAS (needs ReactFlowProvider parent)
// =============================================================================

interface FlowBuilderInnerProps {
  caixaId: string;
}

function FlowBuilderInner({ caixaId }: FlowBuilderInnerProps) {
  // Estado do flow selecionado
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    updateNodeData,
    deleteNode,
    saveFlow,
    resetCanvas,
    loadCanvas,
    isLoading,
    isSaving,
    isAutoSaving,
    lastAutoSaveTime,
    error,
    canvasVersion,
    currentFlowMeta,
    setNodes,
    // Export/Import
    exportFlowAsJson,
    importFlowFromJson,
    getCanvasAsN8nFormat,
  } = useFlowCanvas(caixaId, { flowId: selectedFlowId, autoSave: true });

  const { interactiveMessages } = useMtfData();
  const reactFlowInstance = useReactFlow();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Check if there are reactions to import (only when canvas is empty)
  const { data: importStatus, mutate: mutateImportStatus } = useSWR<{
    success: boolean;
    data: {
      hasExistingCanvas: boolean;
      canImport: boolean;
      stats: { messages: number; reactions: number };
    };
  }>(
    canvasVersion === 0 && !selectedFlowId
      ? `/api/admin/mtf-diamante/flow-canvas/import?inboxId=${caixaId}`
      : null,
    async (url: string) => {
      const res = await fetch(url);
      return res.json();
    },
    { revalidateOnFocus: false }
  );

  const canImport = importStatus?.data?.canImport ?? false;
  const importStats = importStatus?.data?.stats;

  // Handle popover state (appears when dragging from handle to empty canvas)
  const { popoverState, openPopover, closePopover } = useHandlePopover();
  const pendingConnectionRef = useRef<{
    sourceNodeId: string;
    sourceHandleId: string;
    flowPosition: { x: number; y: number };
  } | null>(null);

  // Selected node
  const selectedNode = useMemo(
    () => (selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null),
    [selectedNodeId, nodes]
  );

  // Formatted messages for the detail dialog
  const messagesForDialog = useMemo(
    () =>
      (interactiveMessages ?? []).map((m) => ({
        id: m.id ?? '',
        name: m.name ?? 'Sem nome',
        body: m.body as { text?: string } | undefined,
        header: m.header as { type?: string; text?: string } | undefined,
        footer: m.footer as { text?: string } | undefined,
        action: m.action as Record<string, unknown> | undefined,
      })),
    [interactiveMessages]
  );

  // ---------------------------------------------------------------------------
  // Flow Selection Handlers
  // ---------------------------------------------------------------------------

  /** Selecionar um flow para edição */
  const handleSelectFlow = useCallback((flowId: string | null) => {
    setSelectedFlowId(flowId);
    if (flowId) {
      setIsEditing(true);
    }
  }, []);

  /** Criar novo flow - inicia edição com canvas vazio */
  const handleCreateNew = useCallback(() => {
    setIsEditing(true);
    // O canvas será inicializado pelo useFlowCanvas quando o flow for criado
  }, []);

  /** Voltar para a lista de flows */
  const handleBackToList = useCallback(() => {
    setIsEditing(false);
    setSelectedFlowId(null);
    setSelectedNodeId(null);
    setDialogOpen(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /** Drop from palette → create node at position (already in flow coords from FlowCanvas) */
  const handleDrop = useCallback(
    (type: FlowNodeType, position: { x: number; y: number }) => {
      addNode(type, position);
    },
    [addNode]
  );

  /** Drop element block → append into Interactive Message container */
  const handleDropElement = useCallback(
    (
      elementType: InteractiveMessageElementType,
      _position: { x: number; y: number },
      targetNodeId: string | null
    ) => {
      if (!targetNodeId) {
        toast.error('Solte o bloco dentro da mensagem', {
          description: 'Arraste o elemento e solte em cima de um nó de Mensagem Interativa.',
        });
        return;
      }

      const targetNode = nodes.find((n) => n.id === targetNodeId) ?? null;
      if (!targetNode || targetNode.type !== FlowNodeType.INTERACTIVE_MESSAGE) {
        toast.error('Destino inválido', {
          description: 'Os elementos só podem ser soltos dentro de uma Mensagem Interativa.',
        });
        return;
      }

      const targetData = targetNode.data as unknown as InteractiveMessageNodeData;
      if (targetData.messageId) {
        toast.error('Mensagem vinculada', {
          description: 'Troque para "Criar mensagem" no editor para usar blocos.',
        });
        return;
      }

      const currentElements = getInteractiveMessageElements(targetData);

      // Regras simples (WhatsApp):
      // - Apenas 1 header (texto OU imagem, nunca os dois)
      // - header/footer/body (1 cada, exceto header que já checado acima)
      // - botões (máximo 3)
      if (elementType !== 'button') {
        // Para headers, verificar se JÁ existe QUALQUER tipo de header (text ou image)
        if (elementType === 'header_text' || elementType === 'header_image') {
          const hasAnyHeader = currentElements.some((e) => e.type === 'header_text' || e.type === 'header_image');
          if (hasAnyHeader) {
            toast.error('Header já existe', {
              description: 'Apenas UM header por mensagem (é permitido texto OU imagem, não os dois). Delete o existente primeiro.',
            });
            return;
          }
        } else if (currentElements.some((e) => e.type === elementType)) {
          // Para body/footer, verificar se já existe
          toast.error('Elemento já existe', {
            description: 'Este tipo de elemento já está na mensagem.',
          });
          return;
        }
      } else {
        const existingButtons = getInteractiveMessageButtonElements(currentElements);
        if (existingButtons.length >= 3) {
          toast.error('Limite de botões', {
            description: 'Máximo de 3 botões por mensagem.',
          });
          return;
        }
      }

      const newElement = createInteractiveMessageElement(elementType);
      const nextElements = [...currentElements, newElement];
      const legacy = elementsToLegacyFields(nextElements);

      updateNodeData(targetNodeId, {
        elements: nextElements,
        ...legacy,
        isConfigured: hasConfiguredBody(nextElements),
      } as unknown as Partial<FlowNodeData>);
    },
    [nodes, updateNodeData]
  );

  /** Double-click → open detail dialog (skip nodes with inline-only editing) */
  const handleNodeDoubleClick = useCallback((nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // Delay nodes have full inline editing — no detail dialog needed
    if (node.type === FlowNodeType.DELAY) return;

    setSelectedNodeId(nodeId);
    setDialogOpen(true);
  }, [nodes]);

  const handleNodeSelect = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  const handleUpdateNodeData = useCallback(
    (nodeId: string, data: Partial<FlowNodeData>) => {
      updateNodeData(nodeId, data);
    },
    [updateNodeData]
  );

  const handleCloseDialog = useCallback((open: boolean) => {
    setDialogOpen(open);
    if (!open) setSelectedNodeId(null);
  }, []);

  /**
   * When user drags from a handle and releases on empty canvas,
   * open the popover so they can pick a reaction node type.
   */
  const handleConnectEnd = useCallback(
    (
      sourceNodeId: string,
      sourceHandleId: string,
      screenX: number,
      screenY: number,
      flowPosition: { x: number; y: number }
    ) => {
      pendingConnectionRef.current = { sourceNodeId, sourceHandleId, flowPosition };
      openPopover(sourceNodeId, sourceHandleId, screenX, screenY);
    },
    [openPopover]
  );

  /**
   * User picked a node type from the handle popover → create node + edge
   */
  const handlePopoverSelect = useCallback(
    (type: FlowNodeType) => {
      const pending = pendingConnectionRef.current;
      if (!pending) return;

      // Create new node at the drop position (offset a bit down)
      const newNodeId = addNode(type, {
        x: pending.flowPosition.x - 140,
        y: pending.flowPosition.y + 20,
      });

      // Connect source → new node
      if (newNodeId) {
        onConnect({
          source: pending.sourceNodeId,
          target: newNodeId,
          sourceHandle: pending.sourceHandleId,
          targetHandle: null,
        });
      }

      pendingConnectionRef.current = null;
      closePopover();
    },
    [addNode, onConnect, closePopover]
  );

  /** Save with validation + viewport capture */
  const handleSave = useCallback(async () => {
    // Capture live viewport from ReactFlow instance
    const viewport = reactFlowInstance.getViewport();

    const canvas: FlowCanvasType = {
      nodes: nodes as unknown as FlowCanvasType['nodes'],
      edges: edges as unknown as FlowCanvasType['edges'],
      viewport,
    };
    const validation = validateFlowCanvas(canvas);

    // Mostrar erros (impede salvar)
    if (!validation.valid) {
      toast.error('Não foi possível salvar', {
        description: validation.errors.join('\n'),
      });
      return;
    }

    // Mostrar warnings (não impede salvar)
    if (validation.warnings && validation.warnings.length > 0) {
      toast.warning('Atenção', {
        description: validation.warnings.join('\n'),
      });
    }

    const promise = saveFlow(viewport);
    toast.promise(promise, {
      loading: 'Salvando fluxo…',
      success: 'Fluxo salvo com sucesso!',
      error: (err) => err?.message ?? 'Erro ao salvar fluxo',
    });
  }, [nodes, edges, saveFlow, reactFlowInstance]);

  /** Auto-layout with Dagre */
  const handleAutoLayout = useCallback(() => {
    const graph = new dagre.graphlib.Graph();
    graph.setDefaultEdgeLabel(() => ({}));
    graph.setGraph({
      rankdir: 'TB',
      nodesep: 80,
      ranksep: 120,
      edgesep: 40,
    });

    for (const node of nodes) {
      graph.setNode(node.id, { width: 300, height: 180 });
    }
    for (const edge of edges) {
      graph.setEdge(edge.source, edge.target);
    }

    dagre.layout(graph);

    setNodes((nds) =>
      nds.map((node) => {
        const pos = graph.node(node.id);
        return {
          ...node,
          position: { x: pos.x - 150, y: pos.y - 90 },
        };
      })
    );

    // Fit view after layout
    setTimeout(() => reactFlowInstance.fitView({ padding: 0.3 }), 50);
    toast.success('Layout organizado automaticamente');
  }, [nodes, edges, setNodes, reactFlowInstance]);

  /** Reset canvas */
  const handleReset = useCallback(() => {
    resetCanvas();
    setSelectedNodeId(null);
    setDialogOpen(false);
    setShowResetDialog(false);
    toast.success('Canvas reiniciado');
  }, [resetCanvas]);

  /** Import existing reactions */
  const handleImport = useCallback(async () => {
    setIsImporting(true);
    try {
      const res = await fetch('/api/admin/mtf-diamante/flow-canvas/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inboxId: caixaId }),
      });
      const result = await res.json();

      if (!result.success) {
        throw new Error(result.error || 'Erro ao importar');
      }

      // Refresh the canvas
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao importar reações');
    } finally {
      setIsImporting(false);
      setShowImportDialog(false);
    }
  }, [caixaId]);

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-200px)] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando fluxo…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[calc(100vh-200px)] items-center justify-center">
        <div className="text-center space-y-2">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
          <p className="text-sm text-destructive">Erro ao carregar fluxo</p>
          <p className="text-xs text-muted-foreground">{String(error)}</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Flow Selection View (quando não está editando)
  // ---------------------------------------------------------------------------

  if (!isEditing) {
    return (
      <div className="px-1">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">Flow Builder</h3>
        </div>

        <div className="max-w-md">
          <FlowSelector
            inboxId={caixaId}
            selectedFlowId={selectedFlowId}
            onSelectFlow={handleSelectFlow}
            onCreateNew={handleCreateNew}
          />

          {selectedFlowId && (
            <div className="mt-4">
              <Button
                onClick={() => setIsEditing(true)}
                className="w-full"
              >
                <Workflow className="h-4 w-4 mr-2" />
                Editar flow selecionado
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Flow Editor View (quando está editando)
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-1 pb-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={handleBackToList}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>

          <Separator orientation="vertical" className="h-5" />

          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {currentFlowMeta?.name || 'Novo Flow'}
            </span>
            {canvasVersion > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                v{canvasVersion}
              </Badge>
            )}
          </div>

          {/* Auto-save indicator */}
          {selectedFlowId && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {isAutoSaving ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : lastAutoSaveTime ? (
                <>
                  <Cloud className="h-3 w-3 text-green-500" />
                  <span>Salvo</span>
                </>
              ) : (
                <>
                  <CloudOff className="h-3 w-3" />
                  <span>Não salvo</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Export/Import JSON */}
          <ExportImportPanel
            onExport={exportFlowAsJson}
            onImport={importFlowFromJson}
            getN8nPreview={getCanvasAsN8nFormat}
            hasSelectedFlow={!!selectedFlowId}
            disabled={isSaving}
            onImportSuccess={(flowId) => {
              setSelectedFlowId(flowId);
              setIsEditing(true);
            }}
          />

          <Separator orientation="vertical" className="h-5" />

          {/* Import button - only shows when canvas is empty and there are reactions */}
          {canImport && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
              onClick={() => setShowImportDialog(true)}
              disabled={isSaving || isImporting}
            >
              <Import className="h-3.5 w-3.5 mr-1" />
              Importar ({importStats?.reactions ?? 0} reações)
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setShowResetDialog(true)}
            disabled={isSaving}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Reiniciar
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={handleAutoLayout}
            disabled={isSaving || nodes.length < 2}
          >
            <LayoutGrid className="h-3.5 w-3.5 mr-1" />
            Organizar
          </Button>

          <Button
            variant="default"
            size="sm"
            className="h-8 text-xs"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1" />
            )}
            Salvar
          </Button>
        </div>
      </div>

      {/* Main content: Palette | Canvas */}
      <div className="flex h-[calc(100vh-240px)] gap-3">
        <NodePalette />

        <div className="flex-1 rounded-lg border bg-muted/20 overflow-hidden">
          <FlowCanvas
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={handleDrop}
            onDropElement={handleDropElement}
            onNodeDoubleClick={handleNodeDoubleClick}
            onNodeSelect={handleNodeSelect}
            onConnectEnd={handleConnectEnd}
          />
        </div>
      </div>

      {/* Node Detail Dialog (opens on double-click) */}
      <NodeDetailDialog
        node={selectedNode}
        open={dialogOpen}
        onOpenChange={handleCloseDialog}
        onUpdateNodeData={handleUpdateNodeData}
        interactiveMessages={messagesForDialog}
      />

      {/* Handle Popover (appears when dragging from handle to empty canvas) */}
      <HandlePopover
        anchorX={popoverState.anchorX}
        anchorY={popoverState.anchorY}
        open={popoverState.open}
        onClose={closePopover}
        onSelectType={handlePopoverSelect}
      />

      {/* Reset confirmation */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reiniciar canvas?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os nós e conexões serão removidos. Esta ação não pode ser
              desfeita a menos que você tenha salvo anteriormente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>
              Reiniciar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import confirmation */}
      <AlertDialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FileJson className="h-5 w-5 text-blue-500" />
              Importar reações existentes
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Foram encontradas <strong>{importStats?.messages ?? 0} mensagens interativas</strong> e{' '}
                <strong>{importStats?.reactions ?? 0} reações de botões</strong> configuradas nesta caixa.
              </p>
              <p>
                O sistema irá criar automaticamente os nós e conexões no Flow Builder
                com base nessas configurações existentes.
              </p>
              <p className="text-sm text-muted-foreground">
                Após importar, você poderá reorganizar visualmente o fluxo usando
                o botão "Organizar".
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isImporting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleImport}
              disabled={isImporting}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Import className="h-4 w-4 mr-2" />
                  Importar
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// =============================================================================
// EXPORTED TAB (wraps with ReactFlowProvider)
// =============================================================================

interface FlowBuilderTabProps {
  caixaId: string;
}

export function FlowBuilderTab({ caixaId }: FlowBuilderTabProps) {
  return (
    <ReactFlowProvider>
      <FlowBuilderInner caixaId={caixaId} />
    </ReactFlowProvider>
  );
}

export default FlowBuilderTab;
