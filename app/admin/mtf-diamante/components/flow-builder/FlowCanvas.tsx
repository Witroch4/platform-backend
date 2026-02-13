'use client';

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import React, { useCallback, useMemo, type DragEvent } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  FLOWBUILDER_ELEMENT_MIME,
  FlowNodeType,
  FLOW_CANVAS_CONSTANTS,
  type InteractiveMessageElementType,
} from '@/types/flow-builder';

// Nodes
import { StartNode } from './nodes/StartNode';
import { InteractiveMessageNode } from './nodes/InteractiveMessageNode';
import { TextMessageNode } from './nodes/TextMessageNode';
import { DelayNode } from './nodes/DelayNode';
import { MediaNode } from './nodes/MediaNode';
import {
  EmojiReactionNode,
  TextReactionNode,
  HandoffNode,
  AddTagNode,
  EndConversationNode,
} from './nodes/ReactionNodes';

// Edges
import ButtonEdge from './edges/ButtonEdge';

// =============================================================================
// NODE / EDGE TYPE REGISTRIES
// =============================================================================

const nodeTypes: NodeTypes = {
  [FlowNodeType.START]: StartNode as unknown as NodeTypes[string],
  [FlowNodeType.INTERACTIVE_MESSAGE]: InteractiveMessageNode as unknown as NodeTypes[string],
  [FlowNodeType.TEXT_MESSAGE]: TextMessageNode as unknown as NodeTypes[string],
  [FlowNodeType.DELAY]: DelayNode as unknown as NodeTypes[string],
  [FlowNodeType.MEDIA]: MediaNode as unknown as NodeTypes[string],
  [FlowNodeType.EMOJI_REACTION]: EmojiReactionNode as unknown as NodeTypes[string],
  [FlowNodeType.TEXT_REACTION]: TextReactionNode as unknown as NodeTypes[string],
  [FlowNodeType.HANDOFF]: HandoffNode as unknown as NodeTypes[string],
  [FlowNodeType.ADD_TAG]: AddTagNode as unknown as NodeTypes[string],
  [FlowNodeType.END_CONVERSATION]: EndConversationNode as unknown as NodeTypes[string],
};

const edgeTypes: EdgeTypes = {
  smoothstep: ButtonEdge as unknown as EdgeTypes[string],
  button: ButtonEdge as unknown as EdgeTypes[string],
};

// =============================================================================
// PROPS
// =============================================================================

interface FlowCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  /** Called when a palette item is dropped on the canvas */
  onDrop?: (type: FlowNodeType, position: { x: number; y: number }) => void;
  /** Called when an Interactive Message element block is dropped */
  onDropElement?: (
    elementType: InteractiveMessageElementType,
    position: { x: number; y: number },
    targetNodeId: string | null
  ) => void;
  /** Called when user double-clicks a node (opens config) */
  onNodeDoubleClick?: (nodeId: string) => void;
  /** Called when a node is selected/deselected */
  onNodeSelect?: (nodeId: string | null) => void;
  /** Called when user drags from a handle and drops on empty canvas (no connection) */
  onConnectEnd?: (
    sourceNodeId: string,
    sourceHandleId: string,
    screenX: number,
    screenY: number,
    flowPosition: { x: number; y: number }
  ) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function FlowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onDrop,
  onDropElement,
  onNodeDoubleClick,
  onNodeSelect,
  onConnectEnd,
}: FlowCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();

  // Track connect-start info for the onConnectEnd handler
  const connectStartRef = React.useRef<{
    nodeId: string;
    handleId: string;
  } | null>(null);

  // Track if a connection was successfully made (to avoid showing popover)
  const connectionMadeRef = React.useRef(false);

  const handleConnectStart = useCallback(
    (_event: MouseEvent | TouchEvent, params: { nodeId: string | null; handleId: string | null }) => {
      connectionMadeRef.current = false; // Reset flag when starting a new connection
      if (params.nodeId && params.handleId) {
        connectStartRef.current = {
          nodeId: params.nodeId,
          handleId: params.handleId,
        };
      }
    },
    []
  );

  // Wrap onConnect to track successful connections
  const handleConnect = useCallback(
    (connection: Parameters<OnConnect>[0]) => {
      connectionMadeRef.current = true; // Mark that connection was successful
      onConnect(connection);
    },
    [onConnect]
  );

  const handleConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      const start = connectStartRef.current;
      connectStartRef.current = null;

      // If connection was successfully made, don't show popover
      if (connectionMadeRef.current) {
        connectionMadeRef.current = false;
        return;
      }

      if (!start || !onConnectEnd) return;

      // Get mouse position
      const clientX =
        'clientX' in event ? event.clientX : event.changedTouches?.[0]?.clientX ?? 0;
      const clientY =
        'clientY' in event ? event.clientY : event.changedTouches?.[0]?.clientY ?? 0;

      // Check if connection ended on a valid target (handle or node)
      const target = document.elementFromPoint(clientX, clientY);

      // If dropped on a handle, let the default connection behavior happen
      if (target?.closest('.react-flow__handle')) return;

      // If dropped on an existing node (not handle), let default connection attempt
      if (target?.closest('.react-flow__node')) return;

      // Only show popover if dropped on empty canvas
      const flowPos = screenToFlowPosition({ x: clientX, y: clientY });
      onConnectEnd(start.nodeId, start.handleId, clientX, clientY, flowPos);
    },
    [onConnectEnd, screenToFlowPosition]
  );

  // ---------------------------------------------------------------------------
  // Drag & Drop from palette
  // ---------------------------------------------------------------------------
  const handleDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();

      // Element blocks (dropped into an Interactive Message container)
      const elementType = event.dataTransfer.getData(
        FLOWBUILDER_ELEMENT_MIME
      ) as InteractiveMessageElementType;

      if (elementType) {
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });

        // Robust detection using document.elementFromPoint
        // This handles cases where event.target might be the drag source or a portal
        const target = document.elementFromPoint(event.clientX, event.clientY);
        const nodeEl = target?.closest('.react-flow__node') as HTMLElement | null;
        
        const targetNodeId =
          nodeEl?.getAttribute('data-id') ??
          nodeEl?.dataset?.id ??
          nodeEl?.getAttribute('data-nodeid') ??
          null;

        onDropElement?.(elementType, position, targetNodeId);
        return;
      }

      const type = event.dataTransfer.getData('application/reactflow') as FlowNodeType;
      if (!type) return;

      // Convert screen (client) coords directly to flow coords
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      onDrop?.(type, position);
    },
    [onDrop, onDropElement, screenToFlowPosition]
  );

  // ---------------------------------------------------------------------------
  // Node double‑click → open config panel
  // ---------------------------------------------------------------------------
  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onNodeDoubleClick?.(node.id);
    },
    [onNodeDoubleClick]
  );

  // ---------------------------------------------------------------------------
  // Selection change
  // ---------------------------------------------------------------------------
  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: Node[] }) => {
      if (selectedNodes.length === 1) {
        onNodeSelect?.(selectedNodes[0].id);
      } else {
        onNodeSelect?.(null);
      }
    },
    [onNodeSelect]
  );

  // ---------------------------------------------------------------------------
  // MiniMap color mapper
  // ---------------------------------------------------------------------------
  const miniMapNodeColor = useCallback((node: Node) => {
    switch (node.type) {
      case FlowNodeType.START:
        return '#22c55e';
      case FlowNodeType.INTERACTIVE_MESSAGE:
        return '#3b82f6';
      case FlowNodeType.TEXT_MESSAGE:
        return '#64748b';
      case FlowNodeType.EMOJI_REACTION:
        return '#eab308';
      case FlowNodeType.TEXT_REACTION:
        return '#8b5cf6';
      case FlowNodeType.HANDOFF:
        return '#f97316';
      case FlowNodeType.ADD_TAG:
        return '#ec4899';
      case FlowNodeType.END_CONVERSATION:
        return '#ef4444';
      default:
        return '#94a3b8';
    }
  }, []);

  // Stable default edge options
  const defaultEdgeOptions = useMemo(
    () => ({
      type: 'smoothstep' as const,
      animated: false,
    }),
    []
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onNodeDoubleClick={handleNodeDoubleClick}
        onSelectionChange={handleSelectionChange}
        snapToGrid
        snapGrid={[FLOW_CANVAS_CONSTANTS.GRID_SIZE, FLOW_CANVAS_CONSTANTS.GRID_SIZE]}
        minZoom={FLOW_CANVAS_CONSTANTS.MIN_ZOOM}
        maxZoom={FLOW_CANVAS_CONSTANTS.MAX_ZOOM}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        className="bg-muted/10"
        deleteKeyCode={['Backspace', 'Delete']}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={FLOW_CANVAS_CONSTANTS.GRID_SIZE}
          size={1}
          className="!bg-background"
        />
        <Controls
          showZoom
          showFitView
          showInteractive={false}
          className="!bg-background !border !shadow-md"
        />
        <MiniMap
          nodeColor={miniMapNodeColor}
          maskColor="hsl(var(--background) / 0.7)"
          className="!bg-background !border !shadow-md"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}

export default FlowCanvas;
