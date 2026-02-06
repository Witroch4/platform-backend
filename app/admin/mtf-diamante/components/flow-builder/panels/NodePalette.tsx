'use client';

import { type DragEvent, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  FLOWBUILDER_ELEMENT_MIME,
  INTERACTIVE_MESSAGE_ELEMENT_ITEMS,
  PALETTE_ITEMS,
  type ElementPaletteItem,
  type FlowNodeType,
  type PaletteItem,
} from '@/types/flow-builder';
import { ScrollArea } from '@/components/ui/scroll-area';

// ---------------------------------------------------------------------------
// Category labels for grouping palette items
// ---------------------------------------------------------------------------
const CATEGORY_LABELS: Record<string, string> = {
  trigger: 'Início',
  message: 'Mensagens',
  reaction: 'Reações',
  action: 'Ações',
  logic: 'Lógica',
};

const CATEGORY_ORDER = ['trigger', 'message', 'reaction', 'action', 'logic'];

// ---------------------------------------------------------------------------
// Single palette item (draggable)
// ---------------------------------------------------------------------------

interface PaletteCardProps {
  item: PaletteItem;
}

function PaletteCard({ item }: PaletteCardProps) {
  const onDragStart = useCallback(
    (event: DragEvent) => {
      event.dataTransfer.setData('application/reactflow', item.type);
      event.dataTransfer.effectAllowed = 'move';
    },
    [item.type]
  );

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-card p-3 cursor-grab',
        'transition-all hover:shadow-md hover:border-primary/40 active:cursor-grabbing',
        'select-none'
      )}
    >
      <span className="text-xl shrink-0">{item.icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{item.label}</p>
        <p className="text-[11px] text-muted-foreground leading-tight truncate">
          {item.description}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Element palette item (draggable into Interactive Message container)
// ---------------------------------------------------------------------------

interface ElementPaletteCardProps {
  item: ElementPaletteItem;
}

function ElementPaletteCard({ item }: ElementPaletteCardProps) {
  const onDragStart = useCallback(
    (event: DragEvent) => {
      event.dataTransfer.setData(FLOWBUILDER_ELEMENT_MIME, item.type);
      event.dataTransfer.effectAllowed = 'move';
    },
    [item.type]
  );

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-card p-3 cursor-grab',
        'transition-all hover:shadow-md hover:border-primary/40 active:cursor-grabbing',
        'select-none'
      )}
    >
      <span className="text-xl shrink-0">{item.icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{item.label}</p>
        <p className="text-[11px] text-muted-foreground leading-tight truncate">
          {item.description}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NodePalette
// ---------------------------------------------------------------------------

interface NodePaletteProps {
  onAddNode?: (type: FlowNodeType) => void;
}

export function NodePalette({ onAddNode }: NodePaletteProps) {
  // Group items by category
  const grouped = CATEGORY_ORDER.reduce<Record<string, PaletteItem[]>>(
    (acc, cat) => {
      acc[cat] = PALETTE_ITEMS.filter((i) => i.category === cat);
      return acc;
    },
    {}
  );

  // Extract Interactive Message node to show at top
  const interactiveMessageNode = PALETTE_ITEMS.find(
    (i) => i.type === 'interactive_message'
  );

  return (
    <div className="w-[220px] shrink-0 rounded-lg border bg-background flex flex-col">
      <div className="px-3 py-2.5 border-b">
        <p className="text-sm font-semibold">Blocos</p>
        <p className="text-[11px] text-muted-foreground">
          Arraste para o canvas
        </p>
      </div>

      <ScrollArea className="flex-1 px-2 py-2">
        <div className="space-y-4">
          {/* 1. Destaque: Nó de Mensagem Interativa */}
          {interactiveMessageNode && (
            <div className="mb-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
                Principal
              </p>
              <PaletteCard item={interactiveMessageNode} />
            </div>
          )}

          {/* 2. Elementos (Mensagem Interativa) */}
          <div className="bg-muted/10 rounded-lg p-2 border border-border/50">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-2 px-1 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Elementos
            </p>
            <div className="space-y-1.5">
              {INTERACTIVE_MESSAGE_ELEMENT_ITEMS.map((item) => (
                <ElementPaletteCard key={item.type} item={item} />
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground leading-tight mt-2 px-1 italic">
              Arraste para uma Mensagem Interativa
            </p>
          </div>

          <div className="border-t border-border/30 my-2" />

          {CATEGORY_ORDER.map((category) => {
            const items = grouped[category].filter(
              (i) => i.type !== 'interactive_message'
            );
            if (!items?.length) return null;
            return (
              <div key={category}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
                  {CATEGORY_LABELS[category]}
                </p>
                <div className="space-y-1.5">
                  {items.map((item) => (
                    <PaletteCard key={item.type} item={item} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

export default NodePalette;
