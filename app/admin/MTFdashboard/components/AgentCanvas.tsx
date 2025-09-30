'use client';

import { memo, useCallback, useEffect, useMemo } from 'react';
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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { InfoIcon } from 'lucide-react';
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

  return (
    <Card className="w-[280px] shadow-md border-dashed border-primary/40">
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            🤖 Agente IA
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {currentType?.label || 'Custom'}
          </Badge>
        </div>
        <div className="space-y-2">
          <Label htmlFor="agent-name">Nome</Label>
          <Input
            id="agent-name"
            value={data.draft.name}
            onChange={(event) => data.onChange({ name: event.target.value })}
            placeholder="Perito em Correção de ..."
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label>Tipo de agente</Label>
          <Select
            value={data.draft.agentType}
            onValueChange={(value) => data.onChange({ agentType: value as AgentBlueprintDraft['agentType'] })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione um tipo" />
            </SelectTrigger>
            <SelectContent>
              {data.agentTypes.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {currentType?.description ? (
            <p className="text-[11px] text-muted-foreground leading-snug">
              {currentType.description}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="agent-system">Prompt principal</Label>
          <Textarea
            id="agent-system"
            className="min-h-[120px] resize-none"
            value={data.draft.systemPrompt || ''}
            placeholder="Defina o papel, tom e políticas do agente aqui..."
            onChange={(event) => data.onChange({ systemPrompt: event.target.value })}
          />
          <p className="text-[11px] text-muted-foreground leading-snug flex items-center gap-1">
            <InfoIcon className="h-3 w-3" />
            Este é o prompt herdado pelo LangGraph antes das execuções.
          </p>
        </div>
      </CardContent>
      <Handle type="source" position={Position.Bottom} className="!bg-primary" />
    </Card>
  );
});
AgentDetailsNode.displayName = 'AgentDetailsNode';

const ModelConfigNode = memo(function ModelConfigNodeComponent(props: NodeProps) {
  const data = props.data as unknown as ModelNodeData;
  return (
    <Card className="w-[240px]">
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-semibold">Modelo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label>Modelo base</Label>
          <Select
            value={data.draft.model}
            onValueChange={(value) => data.onChange({ model: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Escolha um modelo" />
            </SelectTrigger>
            <SelectContent>
              {data.modelOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="temperature">Temperature</Label>
            <Input
              id="temperature"
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={data.draft.temperature ?? 0.7}
              onChange={(event) =>
                data.onChange({ temperature: Number.parseFloat(event.target.value) })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maxTokens">Tokens</Label>
            <Input
              id="maxTokens"
              type="number"
              min="64"
              value={data.draft.maxOutputTokens ?? 1024}
              onChange={(event) =>
                data.onChange({ maxOutputTokens: Number.parseInt(event.target.value, 10) })
              }
            />
          </div>
        </div>
      </CardContent>
      <Handle type="target" position={Position.Top} className="!bg-muted" />
      <Handle type="source" position={Position.Bottom} className="!bg-primary" />
    </Card>
  );
});
ModelConfigNode.displayName = 'ModelConfigNode';

const ToolsConfigNode = memo(function ToolsConfigNodeComponent(props: NodeProps) {
  const data = props.data as unknown as ToolsNodeData;
  const activeTools = new Set((data.draft.toolset || []).map((tool) => tool.key));

  return (
    <Card className="w-[260px]">
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          Ferramentas
          <Badge variant="secondary" className="text-[10px] font-normal">
            {activeTools.size} selecionada{activeTools.size === 1 ? '' : 's'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[180px]">
          <div className="space-y-3 px-4 py-3">
            {data.tools.map((tool) => {
              const checked = activeTools.has(tool.key);
              return (
                <label key={tool.key} className="flex items-start gap-3">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) => data.onToggleTool(tool, Boolean(value))}
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-tight">{tool.name}</p>
                    {tool.description ? (
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        {tool.description}
                      </p>
                    ) : null}
                  </div>
                </label>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
      <Handle type="target" position={Position.Top} className="!bg-muted" />
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

  const applyTemplate = (template: OutputParserTemplate) => {
    data.onChange({
      schemaType: template.schemaType,
      schema: template.schema,
      name: template.name,
    });
  };

  return (
    <Card className="w-[320px]">
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-semibold">Structured Output Parser</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label>Schema type</Label>
          <Select
            value={schemaType}
            onValueChange={(value) => data.onChange({
              ...(data.draft.outputParser ?? { schema: '' }),
              schemaType: value as OutputParserConfig['schemaType'],
            })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="json_schema">JSON Schema</SelectItem>
              <SelectItem value="zod">Zod schema</SelectItem>
              <SelectItem value="structured">Structured Output (OpenAI)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Input Schema</Label>
            {data.templates.length ? (
              <Select onValueChange={(value) => {
                const template = data.templates.find((item) => item.id === value);
                if (template) applyTemplate(template);
              }}>
                <SelectTrigger className="h-8 w-[180px] text-xs">
                  <SelectValue placeholder="Modelos prontos" />
                </SelectTrigger>
                <SelectContent>
                  {data.templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
          <Textarea
            className="h-[180px] font-mono text-xs"
            value={currentSchema}
            onChange={(event) =>
              data.onChange({
                ...(data.draft.outputParser ?? { schemaType }),
                schema: event.target.value,
              })
            }
            placeholder="Cole aqui o JSON Schema do parser desejado"
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Strict mode</Label>
            <Switch
              checked={strict}
              onCheckedChange={(value) =>
                data.onChange({
                  ...(data.draft.outputParser ?? { schemaType, schema: currentSchema }),
                  strict: Boolean(value),
                })
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Auto-fix</Label>
            <Switch
              checked={autoFix}
              onCheckedChange={(value) =>
                data.onChange({
                  ...(data.draft.outputParser ?? { schemaType, schema: currentSchema }),
                  autoFixFormat: Boolean(value),
                })
              }
            />
          </div>
        </div>
      </CardContent>
      <Handle type="target" position={Position.Top} className="!bg-muted" />
    </Card>
  );
});
OutputParserNode.displayName = 'OutputParserNode';

export function AgentCanvas({
  draft,
  agentTypes,
  tools,
  modelOptions,
  structuredTemplates,
  onDraftChange,
}: AgentCanvasProps) {
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
    [draft.toolset, onDraftChange],
  );

  const updateOutputParser = useCallback(
    (config: OutputParserConfig | null) => {
      onDraftChange({ outputParser: config });
    },
    [onDraftChange],
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
      { id: 'agent', position: { x: 180, y: 20 }, type: 'agentDetails', data: {} },
      { id: 'model', position: { x: 20, y: 240 }, type: 'modelConfig', data: {} },
      { id: 'tools', position: { x: 220, y: 260 }, type: 'toolsConfig', data: {} },
      { id: 'output', position: { x: 440, y: 240 }, type: 'outputParser', data: {} },
    ];
  }, [draft.canvasState?.nodes]);

  const initialEdges: Edge[] = useMemo(() => {
    if (draft.canvasState?.edges && Array.isArray(draft.canvasState.edges)) {
      return (draft.canvasState.edges as any[]).map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        animated: true,
      }));
    }
    return [
      { id: 'agent-model', source: 'agent', target: 'model', animated: true },
      { id: 'agent-tools', source: 'agent', target: 'tools', animated: true },
      { id: 'agent-output', source: 'agent', target: 'output', animated: true },
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
    [draft.canvasState, onDraftChange],
  );

  useEffect(() => {
    if (!draft.canvasState) {
      updateCanvasState(initialNodes, initialEdges);
    }
  }, [draft.canvasState, initialEdges, initialNodes, updateCanvasState]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => {
        const updated = applyNodeChanges(changes, nds);
        updateCanvasState(updated, edges);
        return updated;
      });
    },
    [edges, setNodes, updateCanvasState],
  );

  const handleMoveEnd = useCallback(
    (_event: any, viewport: Viewport) => {
      updateCanvasState(nodes, edges, viewport);
    },
    [nodes, edges, updateCanvasState],
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
    [agentTypes, draft, modelOptions, onDraftChange, structuredTemplates, toggleTool, tools, updateOutputParser],
  );

  return (
    <div className="h-[540px] rounded-lg border bg-card">
      <ReactFlow
        nodes={nodes.map((node) => ({
          ...node,
          data: { ...node.data },
        }))}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={() => undefined}
        onMoveEnd={handleMoveEnd}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        panOnScroll
        panOnDrag
        zoomOnScroll
        minZoom={0.4}
        maxZoom={1.4}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} />
        <Controls position="bottom-left" />
        <Panel position="top-left" className="bg-background/80 backdrop-blur rounded-md shadow px-3 py-2 text-xs">
          Canvas LangGraph – arraste os blocos para ajustar o diagrama. Cada nó reflete as configs salvas.
        </Panel>
      </ReactFlow>
    </div>
  );
}
