import type { Node, Edge, NodeProps, EdgeProps } from '@xyflow/react';

// ========================================
// Node Types
// ========================================

export enum CanvasNodeType {
  AgentDetails = 'agentDetails',
  ModelConfig = 'modelConfig',
  ToolsConfig = 'toolsConfig',
  OutputParser = 'outputParser',
}

export interface CanvasNodeData extends Record<string, unknown> {
  id: string;
  label: string;
  description?: string;
  type: CanvasNodeType;

  // Execution state
  execution?: {
    status?: 'idle' | 'running' | 'success' | 'error' | 'waiting';
    running?: boolean;
    message?: string;
  };

  // Validation
  issues?: {
    errors: string[];
    warnings: string[];
    visible: boolean;
  };

  // Render options
  render: {
    type: CanvasNodeType;
    options: Record<string, unknown>;
  };
}

// ========================================
// Edge Types
// ========================================

export interface CanvasConnectionData extends Record<string, unknown> {
  label?: string;
  status?: 'success' | 'error' | 'running' | 'idle';
}

// ========================================
// Canvas Types
// ========================================

export type CanvasNode = Node<Record<string, unknown>>;
export type CanvasConnection = Edge<Record<string, unknown>>;

export type CanvasNodeProps = NodeProps;
export type CanvasEdgeProps = EdgeProps;

// ========================================
// Execution Types
// ========================================

export type ExecutionStatus =
  | 'idle'
  | 'running'
  | 'success'
  | 'error'
  | 'waiting';

// ========================================
// Layout Types
// ========================================

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NodeLayoutResult {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface CanvasLayoutResult {
  nodes: NodeLayoutResult[];
  boundingBox: BoundingBox;
}

export type CanvasLayoutTarget = 'selection' | 'all';

// ========================================
// Event Types
// ========================================

export interface CanvasEvents {
  'nodes:select': { ids: string[]; panIntoView?: boolean };
  'nodes:delete': { ids: string[] };
  'nodes:duplicate': { ids: string[] };
  'connection:create': { connection: CanvasConnection };
  'connection:delete': { id: string };
  'layout:apply': { target: CanvasLayoutTarget };
}
