'use client';

import { memo, useState, useRef, useEffect } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react';
import type { FlowEdgeData } from '@/types/flow-builder';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

function ButtonEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  source,
  target,
  data,
  selected,
}: EdgeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { setEdges, addNodes, addEdges } = useReactFlow();
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const edgeData = data as FlowEdgeData | undefined;
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
  });

  const status = edgeData?.status ?? 'idle';
  const buttonLabel = edgeData?.buttonLabel;

  const strokeColor =
    status === 'success'
      ? 'hsl(142, 71%, 45%)'
      : status === 'error'
        ? 'hsl(0, 84%, 60%)'
        : status === 'active'
          ? 'hsl(217, 91%, 60%)'
          : selected
            ? 'hsl(var(--primary))'
            : 'hsl(var(--muted-foreground) / 0.35)';

  const strokeWidth = selected || isHovered ? 3 : 2;

  // Calcular posição dos botões (mais próximos da linha)
  const buttonX = labelX;
  const buttonY = labelY - 20; // Reduzido de 30 para 20px

  // Limpar timeout quando o componente for desmontado
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    // Pequeno delay antes de esconder para dar tempo de mover para os botões
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 50);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEdges((edges) => edges.filter((edge) => edge.id !== id));
  };

  const handleAddNode = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Para adicionar node no meio, vamos abrir um popover
    // Por enquanto, mostrar toast de aviso
    console.log('Add node between', source, 'and', target);
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth,
          opacity: status === 'idle' ? 0.6 : 1,
          transition: 'stroke 0.2s, opacity 0.2s, stroke-width 0.2s',
        }}
        interactionWidth={20}
      />

      {/* Área invisível para hover (mais fácil de acertar) */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={30}
        stroke="transparent"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: 'pointer' }}
      />

      {/* Label do botão na edge */}
      {buttonLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-background border shadow-sm text-muted-foreground"
          >
            {buttonLabel}
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Botões de ação quando hover */}
      {isHovered && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${buttonX}px, ${buttonY}px)`,
              pointerEvents: 'all',
              zIndex: 1000,
            }}
            className="flex items-center gap-1 bg-background border rounded-lg shadow-lg p-0.5"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 hover:bg-primary/10"
              onClick={handleAddNode}
              title="Adicionar node"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
              onClick={handleDelete}
              title="Deletar conexão"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(ButtonEdge);
