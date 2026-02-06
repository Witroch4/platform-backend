'use client';

import { memo, useCallback } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import { Play, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NodeContextMenu } from '../ui/NodeContextMenu';
import type { StartNodeData } from '@/types/flow-builder';
import { NODE_COLORS, FlowNodeType } from '@/types/flow-builder';

const colors = NODE_COLORS[FlowNodeType.START];

type StartNodeProps = NodeProps & {
  data: StartNodeData & { [key: string]: unknown };
};

export const StartNode = memo(({ id, data, selected }: StartNodeProps) => {
  const { setNodes, getNodes } = useReactFlow();

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

  return (
    <NodeContextMenu onDuplicate={handleDuplicate}>
      <div
        className={cn(
          'min-w-[200px] rounded-xl border-2 shadow-lg transition-all bg-card',
          selected
            ? 'ring-2 ring-primary ring-offset-2 border-green-500'
            : 'border-green-400 dark:border-green-700'
        )}
      >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full shrink-0',
            'bg-green-500 text-white shadow-sm'
          )}
        >
          <Play className="h-4 w-4 ml-0.5" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">
            {data.label || 'Início'}
          </p>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Pencil className="h-3 w-3" />
            Clique 2x para editar nome
          </p>
        </div>
      </div>

      {/* Handle de saída (bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !bg-green-500 !border-2 !border-white"
      />
    </div>
    </NodeContextMenu>
  );
});

StartNode.displayName = 'StartNode';

export default StartNode;
