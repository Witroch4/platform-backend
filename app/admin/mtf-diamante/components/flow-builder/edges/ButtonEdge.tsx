'use client';

import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import type { FlowEdgeData } from '@/types/flow-builder';

function ButtonEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
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

  const strokeWidth = selected ? 3 : 2;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth,
          opacity: status === 'idle' ? 0.6 : 1,
          transition: 'stroke 0.2s, opacity 0.2s',
        }}
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
    </>
  );
}

export default memo(ButtonEdge);
