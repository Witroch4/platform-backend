'use client';

import { memo, useCallback, useState } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import { Clock, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NodeContextMenu } from '../ui/NodeContextMenu';
import type { DelayNodeData } from '@/types/flow-builder';
import { NODE_COLORS, FlowNodeType } from '@/types/flow-builder';

const colors = NODE_COLORS[FlowNodeType.DELAY];

type DelayNodeProps = NodeProps & {
  data: DelayNodeData & { [key: string]: unknown };
}

export const DelayNode = memo(
  ({ id, data, selected }: DelayNodeProps) => {
    const { setNodes, setEdges, getNodes } = useReactFlow();
    const [localSeconds, setLocalSeconds] = useState(data.delaySeconds || 5);
    const isConfigured = data.isConfigured && localSeconds > 0;

    // Sync local state to node data
    const updateNodeData = useCallback((seconds: number) => {
      const clampedSeconds = Math.max(1, Math.min(30, seconds));
      setLocalSeconds(clampedSeconds);
      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === id
            ? { ...node, data: { ...node.data, delaySeconds: clampedSeconds, isConfigured: true } }
            : node
        )
      );
    }, [id, setNodes]);

    const handleDuplicate = useCallback(() => {
      const nodes = getNodes();
      const currentNode = nodes.find(n => n.id === id);
      if (!currentNode) return;

      const newId = `delay-${Date.now()}`;
      const newNode = {
        ...currentNode,
        id: newId,
        position: {
          x: currentNode.position.x + 50,
          y: currentNode.position.y + 50,
        },
        data: {
          ...currentNode.data,
          label: `${currentNode.data.label || 'Esperar'} (cópia)`,
        },
        selected: false,
      };

      setNodes((nodes) => [...nodes, newNode]);
    }, [id, getNodes, setNodes]);

    const handleDelete = useCallback(() => {
      setNodes((nodes) => nodes.filter(n => n.id !== id));
      setEdges((edges) => edges.filter(e => e.source !== id && e.target !== id));
    }, [id, setNodes, setEdges]);

    const increment = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      updateNodeData(localSeconds + 1);
    }, [localSeconds, updateNodeData]);

    const decrement = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      updateNodeData(localSeconds - 1);
    }, [localSeconds, updateNodeData]);

    return (
      <NodeContextMenu onDuplicate={handleDuplicate} onDelete={handleDelete}>
        <div
          className={cn(
            'min-w-[200px] max-w-[240px] rounded-lg border-2 shadow-md transition-all',
            colors.bg,
            colors.border,
            selected && 'ring-2 ring-primary ring-offset-2',
            !isConfigured && 'border-dashed opacity-80'
          )}
        >
          {/* Handle de entrada (top) */}
          <Handle
            type="target"
            position={Position.Top}
            className="!h-3 !w-3 !bg-cyan-500 !border-2 !border-white"
          />

          {/* Header */}
          <div className="flex items-center gap-2 border-b px-3 py-2 bg-cyan-100/50 dark:bg-cyan-900/30">
            <Clock className={cn('h-4 w-4', colors.icon)} />
            <span className="font-medium text-sm">
              {data.label || 'Esperar'}
            </span>
          </div>

          {/* Corpo com controle de tempo */}
          <div className="px-3 py-4">
            <div className="flex items-center justify-center gap-3">
              {/* Botão Decrementar */}
              <button
                onClick={decrement}
                disabled={localSeconds <= 1}
                className={cn(
                  'nodrag p-2 rounded-full border-2 transition-all',
                  'bg-white dark:bg-cyan-900 hover:bg-cyan-100 dark:hover:bg-cyan-800',
                  'border-cyan-300 dark:border-cyan-700',
                  'disabled:opacity-40 disabled:cursor-not-allowed'
                )}
              >
                <Minus className="h-4 w-4 text-cyan-600" />
              </button>

              {/* Display de segundos */}
              <div className="flex flex-col items-center min-w-[80px]">
                <span className="text-3xl font-bold text-cyan-700 dark:text-cyan-300 tabular-nums">
                  {localSeconds}
                </span>
                <span className="text-xs text-muted-foreground mt-1">
                  {localSeconds === 1 ? 'segundo' : 'segundos'}
                </span>
              </div>

              {/* Botão Incrementar */}
              <button
                onClick={increment}
                disabled={localSeconds >= 30}
                className={cn(
                  'nodrag p-2 rounded-full border-2 transition-all',
                  'bg-white dark:bg-cyan-900 hover:bg-cyan-100 dark:hover:bg-cyan-800',
                  'border-cyan-300 dark:border-cyan-700',
                  'disabled:opacity-40 disabled:cursor-not-allowed'
                )}
              >
                <Plus className="h-4 w-4 text-cyan-600" />
              </button>
            </div>

            {/* Barra de progresso visual */}
            <div className="mt-3 h-2 bg-cyan-100 dark:bg-cyan-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-cyan-600 transition-all duration-300"
                style={{ width: `${(localSeconds / 30) * 100}%` }}
              />
            </div>
            <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
              <span>1s</span>
              <span>máx: 30s</span>
            </div>
          </div>

          {/* Handle de saída (bottom) */}
          <Handle
            type="source"
            position={Position.Bottom}
            className="!h-3 !w-3 !bg-cyan-500 !border-2 !border-white"
          />
        </div>
      </NodeContextMenu>
    );
  }
);

DelayNode.displayName = 'DelayNode';

export default DelayNode;
