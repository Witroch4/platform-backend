'use client';

import { memo, useCallback } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NodeContextMenu } from '../ui/NodeContextMenu';
import type { TextMessageNodeData } from '@/types/flow-builder';
import { NODE_COLORS, FlowNodeType } from '@/types/flow-builder';

const colors = NODE_COLORS[FlowNodeType.TEXT_MESSAGE];

type TextMessageNodeProps = NodeProps & {
  data: TextMessageNodeData & { [key: string]: unknown };
}

export const TextMessageNode = memo(
  ({ id, data, selected }: TextMessageNodeProps) => {
    const { setNodes, setEdges, getNodes } = useReactFlow();
    const isConfigured = data.isConfigured && data.text;

    const handleDuplicate = useCallback(() => {
      const nodes = getNodes();
      const currentNode = nodes.find(n => n.id === id);
      if (!currentNode) return;

      const newId = `${currentNode.type}-${Date.now()}`;
      const newNode = {
        ...currentNode,
        id: newId,
        position: {
          x: currentNode.position.x + 50,
          y: currentNode.position.y + 50,
        },
        data: {
          ...currentNode.data,
          label: `${currentNode.data.label || 'Cópia'} (cópia)`,
        },
        selected: false,
      };

      setNodes((nodes) => [...nodes, newNode]);
    }, [id, getNodes, setNodes]);

    const handleDelete = useCallback(() => {
      setNodes((nodes) => nodes.filter(n => n.id !== id));
      setEdges((edges) => edges.filter(e => e.source !== id && e.target !== id));
    }, [id, setNodes, setEdges]);

    return (
      <NodeContextMenu onDuplicate={handleDuplicate} onDelete={handleDelete}>
        <div
          className={cn(
            'min-w-[240px] max-w-[300px] rounded-lg border-2 shadow-md transition-all',
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
          className="!h-3 !w-3 !bg-slate-500 !border-2 !border-white"
        />

        {/* Header */}
        <div className="flex items-center gap-2 border-b px-3 py-2 bg-slate-100/50 dark:bg-slate-900/30">
          <MessageCircle className={cn('h-4 w-4', colors.icon)} />
          <span className="font-medium text-sm">
            {data.label || 'Texto Simples'}
          </span>
        </div>

        {/* Corpo */}
        <div className="px-3 py-2">
          {data.text ? (
            <p className="text-sm text-muted-foreground line-clamp-3">
              &ldquo;{data.text}&rdquo;
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Clique duas vezes para configurar
            </p>
          )}
        </div>

        {/* Handle de saída (bottom) */}
        <Handle
          type="source"
          position={Position.Bottom}
          className="!h-3 !w-3 !bg-slate-500 !border-2 !border-white"
        />
      </div>
      </NodeContextMenu>
    );
  }
);

TextMessageNode.displayName = 'TextMessageNode';

export default TextMessageNode;
