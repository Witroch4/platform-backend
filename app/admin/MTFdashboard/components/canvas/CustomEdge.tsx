'use client';

import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import { EDGE_COLORS } from '../../constants/canvas';
import type { CanvasConnectionData } from '../../types/canvas';

function CustomEdge({
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
  const edgeData = data as CanvasConnectionData | undefined;
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });

  const status = edgeData?.status || 'idle';
  const label = edgeData?.label;

  // Edge color based on status
  const strokeColor =
    status === 'success'
      ? EDGE_COLORS.success
      : status === 'error'
        ? EDGE_COLORS.error
        : status === 'running'
          ? EDGE_COLORS.running
          : selected
            ? 'hsl(var(--primary))'
            : EDGE_COLORS.default;

  const strokeWidth = selected ? 3 : 2;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth,
          opacity: status === 'idle' ? 0.4 : 1,
        }}
      />

      {/* Edge Label */}
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="px-2 py-1 rounded text-xs font-medium bg-background border shadow-sm"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(CustomEdge);
