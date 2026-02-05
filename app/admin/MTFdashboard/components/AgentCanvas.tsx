'use client';

import React, { memo, useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Node,
  Edge,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  applyNodeChanges,
  NodeProps,
  NodeChange,
  Viewport,
  Panel,
  MiniMap,
  useReactFlow,
  MarkerType,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InfoIcon, Maximize2, Zap } from 'lucide-react';
import { useCanvasLayout } from '../hooks/useCanvasLayout';
import { useKeyBindings } from '../hooks/useKeyBindings';
import { GRID_SIZE, MIN_ZOOM, MAX_ZOOM, NODE_TYPE_CONFIG } from '../constants/canvas';
import CustomEdge from './canvas/CustomEdge';
import { AgentNodeDialog } from './canvas/AgentNodeDialog';
import type {
  AgentBlueprintDraft,
  AgentToolDefinition,
  AgentTypeDescriptor,
  OutputParserTemplate,
  AgentToolConfig,
  OutputParserConfig,
} from '../types';

interface AgentCanvasProps {
  draft: AgentBlueprintDraft;
  agentTypes: AgentTypeDescriptor[];
  tools: AgentToolDefinition[];
  modelOptions: Array<{ value: string; label: string }>;
  structuredTemplates: OutputParserTemplate[];
  onDraftChange: (patch: Partial<AgentBlueprintDraft>) => void;
}

interface AgentNodeData {
  draft: AgentBlueprintDraft;
  agentTypes: AgentTypeDescriptor[];
  onChange: (patch: Partial<AgentBlueprintDraft>) => void;
}

interface ModelNodeData {
  draft: AgentBlueprintDraft;
  modelOptions: Array<{ value: string; label: string }>;
  onChange: (patch: Partial<AgentBlueprintDraft>) => void;
}

interface ToolsNodeData {
  draft: AgentBlueprintDraft;
  tools: AgentToolDefinition[];
  onToggleTool: (tool: AgentToolDefinition, enabled: boolean) => void;
}

interface OutputParserNodeData {
  draft: AgentBlueprintDraft;
  templates: OutputParserTemplate[];
  onChange: (config: OutputParserConfig | null) => void;
}

const AgentDetailsNode = memo(function AgentDetailsNodeComponent(props: NodeProps) {
  const data = props.data as unknown as AgentNodeData;
  const currentType = data.agentTypes.find((t) => t.id === data.draft.agentType);
  const config = NODE_TYPE_CONFIG.agentDetails;

  return (
    <Card className="w-[380px] shadow-xl border-2 transition-all hover:shadow-2xl cursor-pointer" style={{ borderColor: config.color }}>
      <CardHeader className="space-y-2 pb-3 bg-gradient-to-br from-primary/5 to-transparent">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <span className="text-3xl">{config.icon}</span>
            <span>{config.label}</span>
          </CardTitle>
          <Badge variant="outline" className="text-xs font-mono">
            {currentType?.label || 'Custom'}
          </Badge>
        </div>
        <div className="text-sm font-medium text-foreground/90 mt-2 line-clamp-1">
          {data.draft.name || 'Sem nome'}
        </div>
        <div className="text-xs text-muted-foreground line-clamp-1">
          {data.draft.model || 'Modelo não definido'}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-4 pb-3">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="space-y-1">
            <div className="text-muted-foreground">Ferramentas</div>
            <div className="font-medium">{(data.draft.toolset || []).length} ativas</div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">Temperature</div>
            <div className="font-medium font-mono">{data.draft.temperature ?? 0.7}</div>
          </div>
        </div>
        <div className="pt-2 border-t text-xs text-muted-foreground flex items-center justify-center gap-1.5">
          <InfoIcon className="h-3 w-3" />
          Clique 2x para editar detalhes
        </div>
      </CardContent>
      <Handle type="source" position={Position.Bottom} className="!w-4 !h-4 !bg-primary !border-2 !border-background" />
    </Card>
  );
});
AgentDetailsNode.displayName = 'AgentDetailsNode';

function ModelConfigNode(props: NodeProps) {
  const data = props.data as unknown as ModelNodeData;
  const config = NODE_TYPE_CONFIG.modelConfig;

  // Exibir "ilimitado" quando maxOutputTokens é 0
  const maxTokensDisplay = data.draft.maxOutputTokens === 0
    ? '∞'
    : (data.draft.maxOutputTokens ?? 1024);

  return (
    <Card className="w-[320px] shadow-lg border-2 transition-all hover:shadow-xl cursor-pointer" style={{ borderColor: config.color }}>
      <CardHeader className="py-3 bg-gradient-to-br from-purple-500/5 to-transparent">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <span className="text-2xl">{config.icon}</span>
          {config.label}
        </CardTitle>
        <div className="text-sm font-medium text-foreground/90 mt-2 font-mono">
          {data.draft.model}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-4 pb-3">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="space-y-1">
            <div className="text-muted-foreground">Temperature</div>
            <div className="font-medium font-mono text-base">{data.draft.temperature ?? 0.7}</div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">Max Tokens</div>
            <div className="font-medium font-mono text-base">{maxTokensDisplay}</div>
          </div>
        </div>
        <div className="pt-2 border-t text-xs text-muted-foreground flex items-center justify-center gap-1.5">
          <InfoIcon className="h-3 w-3" />
          Clique 2x para ajustar parâmetros
        </div>
      </CardContent>
      <Handle type="target" position={Position.Top} className="!w-4 !h-4 !bg-muted-foreground !border-2 !border-background" />
      <Handle type="source" position={Position.Bottom} className="!w-4 !h-4 !bg-primary !border-2 !border-background" />
    </Card>
  );
}

const ToolsConfigNode = memo(function ToolsConfigNodeComponent(props: NodeProps) {
  const data = props.data as unknown as ToolsNodeData;
  const activeTools = new Set((data.draft.toolset || []).map((tool) => tool.key));
  const config = NODE_TYPE_CONFIG.toolsConfig;

  return (
    <Card className="w-[340px] shadow-lg border-2 transition-all hover:shadow-xl cursor-pointer" style={{ borderColor: config.color }}>
      <CardHeader className="py-3 bg-gradient-to-br from-orange-500/5 to-transparent">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <span className="text-2xl">{config.icon}</span>
          {config.label}
          <Badge variant="secondary" className="text-xs font-medium ml-auto">
            {activeTools.size}/{data.tools.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-4 pb-3">
        <div className="space-y-2 max-h-[120px] overflow-y-auto">
          {(data.draft.toolset || []).slice(0, 3).map((tool) => (
            <div key={tool.key} className="flex items-center gap-2 text-xs p-2 bg-muted/50 rounded">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="font-medium flex-1 truncate">{tool.name}</span>
            </div>
          ))}
          {(data.draft.toolset || []).length > 3 && (
            <div className="text-xs text-muted-foreground text-center">
              +{(data.draft.toolset || []).length - 3} mais
            </div>
          )}
          {(data.draft.toolset || []).length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-4">
              Nenhuma ferramenta selecionada
            </div>
          )}
        </div>
        <div className="pt-2 border-t text-xs text-muted-foreground flex items-center justify-center gap-1.5">
          <InfoIcon className="h-3 w-3" />
          Clique 2x para gerenciar tools
        </div>
      </CardContent>
      <Handle type="target" position={Position.Top} className="!w-4 !h-4 !bg-muted-foreground !border-2 !border-background" />
    </Card>
  );
});
ToolsConfigNode.displayName = 'ToolsConfigNode';

const OutputParserNode = memo(function OutputParserNodeComponent(props: NodeProps) {
  const data = props.data as unknown as OutputParserNodeData;
  const currentSchema = data.draft.outputParser?.schema || '';
  const schemaType = data.draft.outputParser?.schemaType || 'json_schema';
  const strict = Boolean(data.draft.outputParser?.strict);
  const autoFix = Boolean(data.draft.outputParser?.autoFixFormat);
  const config = NODE_TYPE_CONFIG.outputParser;

  return (
    <Card className="w-[360px] shadow-lg border-2 transition-all hover:shadow-xl cursor-pointer" style={{ borderColor: config.color }}>
      <CardHeader className="py-3 bg-gradient-to-br from-green-500/5 to-transparent">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <span className="text-2xl">{config.icon}</span>
          {config.label}
        </CardTitle>
        <div className="text-xs text-muted-foreground mt-2 font-mono">
          {schemaType}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-4 pb-3">
        <div className="text-xs bg-muted/50 rounded p-3 font-mono max-h-[100px] overflow-y-auto">
          {currentSchema ? (
            <pre className="whitespace-pre-wrap break-words text-[10px]">
              {currentSchema.substring(0, 200)}
              {currentSchema.length > 200 && '...'}
            </pre>
          ) : (
            <span className="text-muted-foreground">Nenhum schema definido</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="flex items-center gap-2 p-2 bg-muted/30 rounded">
            <div className={`w-2 h-2 rounded-full ${strict ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span className="text-[11px]">Modo Estrito</span>
          </div>
          <div className="flex items-center gap-2 p-2 bg-muted/30 rounded">
            <div className={`w-2 h-2 rounded-full ${autoFix ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span className="text-[11px]">Auto-fix</span>
          </div>
        </div>
        <div className="pt-2 border-t text-xs text-muted-foreground flex items-center justify-center gap-1.5">
          <InfoIcon className="h-3 w-3" />
          Clique 2x para editar schema
        </div>
      </CardContent>
      <Handle type="target" position={Position.Top} className="!w-4 !h-4 !bg-muted-foreground !border-2 !border-background" />
    </Card>
  );
});
OutputParserNode.displayName = 'OutputParserNode';

function AgentCanvasInternal({
  draft,
  agentTypes,
  tools,
  modelOptions,
  structuredTemplates,
  onDraftChange,
}: AgentCanvasProps) {
  const reactFlowInstance = useReactFlow();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [dialogNodeType, setDialogNodeType] = React.useState<string | null>(null);

  const toggleTool = useCallback(
    (tool: AgentToolDefinition, enabled: boolean) => {
      const current = draft.toolset || [];
      const exists = current.find((item) => item.key === tool.key);
      let next: AgentToolConfig[] | null = current;

      if (enabled && !exists) {
        next = [...current, { ...tool, enabled: true }];
      } else if (!enabled && exists) {
        next = current.filter((item) => item.key !== tool.key);
        if (!next.length) {
          next = [];
        }
      } else {
        next = current;
      }

      onDraftChange({ toolset: next });
    },
    [draft.toolset, onDraftChange]
  );

  const updateOutputParser = useCallback(
    (config: OutputParserConfig | null) => {
      onDraftChange({ outputParser: config });
    },
    [onDraftChange]
  );

  const initialNodes: Node[] = useMemo(() => {
    if (draft.canvasState?.nodes && Array.isArray(draft.canvasState.nodes)) {
      return (draft.canvasState.nodes as any[]).map((node) => ({
        id: node.id,
        position: node.position,
        type: node.type,
        data: {},
      }));
    }
    return [
      { id: 'agent', position: { x: 200, y: 20 }, type: 'agentDetails', data: {} },
      { id: 'model', position: { x: 20, y: 320 }, type: 'modelConfig', data: {} },
      { id: 'tools', position: { x: 260, y: 340 }, type: 'toolsConfig', data: {} },
      { id: 'output', position: { x: 520, y: 320 }, type: 'outputParser', data: {} },
    ];
  }, [draft.canvasState?.nodes]);

  const initialEdges: Edge[] = useMemo(() => {
    if (draft.canvasState?.edges && Array.isArray(draft.canvasState.edges)) {
      return (draft.canvasState.edges as any[]).map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'custom',
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        data: { status: 'success' },
      }));
    }
    return [
      {
        id: 'agent-model',
        source: 'agent',
        target: 'model',
        type: 'custom',
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        data: { status: 'success' as const },
      },
      {
        id: 'agent-tools',
        source: 'agent',
        target: 'tools',
        type: 'custom',
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        data: { status: 'success' as const },
      },
      {
        id: 'agent-output',
        source: 'agent',
        target: 'output',
        type: 'custom',
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        data: { status: 'success' as const },
      },
    ];
  }, [draft.canvasState?.edges]);

  const [nodes, setNodes] = useNodesState(initialNodes);
  const [edges, setEdges] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  const updateCanvasState = useCallback(
    (nextNodes: Node[], nextEdges: Edge[], viewport?: Record<string, unknown>) => {
      const sanitizeNodes = nextNodes.map((node) => ({
        id: node.id,
        position: node.position,
        type: node.type,
      }));
      const sanitizeEdges = nextEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
      }));
      const previous = draft.canvasState || {};
      const sameNodes = JSON.stringify(previous.nodes) === JSON.stringify(sanitizeNodes);
      const sameEdges = JSON.stringify(previous.edges) === JSON.stringify(sanitizeEdges);
      const nextViewport = viewport ?? previous.viewport;
      const sameViewport = JSON.stringify(previous.viewport) === JSON.stringify(nextViewport);

      if (sameNodes && sameEdges && sameViewport) return;

      onDraftChange({
        canvasState: {
          nodes: sanitizeNodes,
          edges: sanitizeEdges,
          viewport: nextViewport,
        },
      });
    },
    [draft.canvasState, onDraftChange]
  );

  useEffect(() => {
    if (!draft.canvasState) {
      updateCanvasState(initialNodes, initialEdges);
    }
  }, [draft.canvasState, initialEdges, initialNodes, updateCanvasState]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const updated = applyNodeChanges(changes, nodes);
      setNodes(updated);
      queueMicrotask(() => updateCanvasState(updated, edges));
    },
    [edges, nodes, setNodes, updateCanvasState]
  );

  const handleMoveEnd = useCallback(
    (_event: any, viewport: Viewport) => {
      updateCanvasState(nodes, edges, viewport);
    },
    [nodes, edges, updateCanvasState]
  );

  const { tidyUp } = useCanvasLayout(nodes as any, edges as any, setNodes as any);

  // Handle node double click
  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setDialogNodeType(node.type || null);
      setDialogOpen(true);
    },
    []
  );

  // Keyboard shortcuts
  useKeyBindings({
    'ctrl+1': () => reactFlowInstance.fitView({ padding: 0.2 }),
    '0': () => reactFlowInstance.zoomTo(1),
    '+': () => reactFlowInstance.zoomIn(),
    '-': () => reactFlowInstance.zoomOut(),
    'shift+alt+t': () => tidyUp(),
  });

  const edgeTypes = useMemo<Record<string, any>>(
    () => ({
      custom: CustomEdge,
    }),
    []
  );

  const nodeTypes = useMemo(
    () => ({
      agentDetails: (props: NodeProps) => (
        <AgentDetailsNode
          {...props}
          data={{
            draft,
            agentTypes,
            onChange: onDraftChange,
          }}
        />
      ),
      modelConfig: (props: NodeProps) => (
        <ModelConfigNode
          {...props}
          data={{
            draft,
            modelOptions,
            onChange: onDraftChange,
          }}
        />
      ),
      toolsConfig: (props: NodeProps) => (
        <ToolsConfigNode
          {...props}
          data={{
            draft,
            tools,
            onToggleTool: toggleTool,
          }}
        />
      ),
      outputParser: (props: NodeProps) => (
        <OutputParserNode
          {...props}
          data={{
            draft,
            templates: structuredTemplates,
            onChange: updateOutputParser,
          }}
        />
      ),
    }),
    [agentTypes, draft, modelOptions, onDraftChange, structuredTemplates, toggleTool, tools, updateOutputParser]
  );

  return (
    <>
      <div className="h-[600px] rounded-lg border-2 bg-background/50 backdrop-blur shadow-xl overflow-hidden">
        <ReactFlow
          nodes={nodes.map((node) => ({
            ...node,
            data: { ...node.data },
          }))}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={() => undefined}
          onMoveEnd={handleMoveEnd}
          onNodeDoubleClick={handleNodeDoubleClick}
          fitView
          fitViewOptions={{ padding: 0.3, maxZoom: 1.2 }}
          panOnScroll
          panOnDrag
          zoomOnScroll
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          snapToGrid
          snapGrid={[GRID_SIZE, GRID_SIZE]}
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
        >
        <Background gap={GRID_SIZE} size={1} color="hsl(var(--muted-foreground))" />
        <Controls position="bottom-right" showInteractive={false} />
        <MiniMap
          position="bottom-left"
          nodeStrokeWidth={3}
          zoomable
          pannable
          className="!bg-background/80 !border-2"
        />
        <Panel position="top-left" className="flex gap-2">
          <div className="bg-background/95 backdrop-blur border-2 rounded-lg shadow-lg px-3 py-2 text-xs font-medium flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-primary" />
            Canvas LangGraph - Configuração Visual do Agente IA
          </div>
          <Button
            onClick={tidyUp}
            size="sm"
            variant="secondary"
            className="shadow-lg font-medium"
          >
            <Maximize2 className="h-3.5 w-3.5 mr-1.5" />
            Auto Layout
          </Button>
        </Panel>
        <Panel position="top-right" className="bg-background/95 backdrop-blur border-2 rounded-lg shadow-lg px-3 py-2 text-[10px] text-muted-foreground space-y-1">
          <div className="font-mono">⌨️ Atalhos:</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            <span>Ctrl+1</span><span className="text-foreground/60">Ajustar Zoom</span>
            <span>Shift+Alt+T</span><span className="text-foreground/60">Auto Layout</span>
            <span>+/-</span><span className="text-foreground/60">Zoom In/Out</span>
          </div>
        </Panel>
      </ReactFlow>
    </div>

    <AgentNodeDialog
      open={dialogOpen}
      onOpenChange={setDialogOpen}
      draft={draft}
      agentTypes={agentTypes}
      tools={tools}
      modelOptions={modelOptions}
      structuredTemplates={structuredTemplates}
      onSave={onDraftChange}
    />
    </>
  );
}

export function AgentCanvas(props: AgentCanvasProps) {
  return (
    <ReactFlowProvider>
      <AgentCanvasInternal {...props} />
    </ReactFlowProvider>
  );
}
