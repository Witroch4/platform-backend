'use client';

import { memo, useMemo, useCallback, type DragEvent } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import { FileText, Settings, Check, Clock, XCircle, FileEdit, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type ButtonTemplateNodeData,
  BUTTON_TEMPLATE_LIMITS,
  TEMPLATE_ELEMENT_MIME,
  type TemplateElementType,
} from '@/types/flow-builder';
import { NodeContextMenu } from '../../ui/NodeContextMenu';
import { Badge } from '@/components/ui/badge';
import { generateTemplateButtonId } from '@/lib/flow-builder/templateElements';

type ButtonTemplateNodeProps = NodeProps & {
  data: ButtonTemplateNodeData & { [key: string]: unknown };
};

/**
 * Retorna o ícone do status do template
 */
function getStatusIcon(status: ButtonTemplateNodeData['status']) {
  switch (status) {
    case 'APPROVED':
      return <Check className="h-3 w-3" />;
    case 'PENDING':
      return <Clock className="h-3 w-3" />;
    case 'REJECTED':
      return <XCircle className="h-3 w-3" />;
    case 'DRAFT':
    default:
      return <FileEdit className="h-3 w-3" />;
  }
}

/**
 * Retorna as cores do badge de status
 */
function getStatusColors(status: ButtonTemplateNodeData['status']) {
  switch (status) {
    case 'APPROVED':
      return 'bg-green-100 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-400 dark:border-green-800';
    case 'PENDING':
      return 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-400 dark:border-yellow-800';
    case 'REJECTED':
      return 'bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-400 dark:border-red-800';
    case 'DRAFT':
    default:
      return 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700';
  }
}

/**
 * Retorna o label do status em PT-BR
 */
function getStatusLabel(status: ButtonTemplateNodeData['status']) {
  switch (status) {
    case 'APPROVED':
      return 'Aprovado';
    case 'PENDING':
      return 'Pendente';
    case 'REJECTED':
      return 'Rejeitado';
    case 'DRAFT':
    default:
      return 'Rascunho';
  }
}

/**
 * ButtonTemplateNode - Container para Button Template WhatsApp
 *
 * Mensagem com 1-3 botões QUICK_REPLY.
 * Aceita drop de elementos: body, button_quick_reply
 */
export const ButtonTemplateNode = memo(({ id, data, selected }: ButtonTemplateNodeProps) => {
  const { setNodes, getNodes, setEdges } = useReactFlow();

  // Dados do template
  const status = data.status || 'DRAFT';
  const templateName = data.templateName || data.label || 'Button Template';
  const hasBody = data.body?.text && data.body.text.trim().length > 0;
  const buttons = useMemo(() => data.buttons || [], [data.buttons]);
  const isConfigured = data.isConfigured && hasBody;
  const canAddMoreButtons = buttons.length < BUTTON_TEMPLATE_LIMITS.maxButtons;

  // Drag & Drop handlers
  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const elementType = e.dataTransfer.types.includes(TEMPLATE_ELEMENT_MIME);
    if (elementType) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const elementType = e.dataTransfer.getData(TEMPLATE_ELEMENT_MIME) as TemplateElementType;
      if (!elementType) return;

      // Validate element type for this container
      if (elementType !== 'body' && elementType !== 'button_quick_reply') {
        return;
      }

      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== id) return node;
          const currentData = node.data as unknown as ButtonTemplateNodeData;

          if (elementType === 'body') {
            // Add or update body
            return {
              ...node,
              data: {
                ...currentData,
                body: currentData.body || { text: '', variables: [] },
              },
            };
          }

          if (elementType === 'button_quick_reply') {
            const currentButtons = currentData.buttons || [];
            if (currentButtons.length >= BUTTON_TEMPLATE_LIMITS.maxButtons) return node;

            const newButton = {
              id: generateTemplateButtonId(),
              text: `Botão ${currentButtons.length + 1}`,
            };

            return {
              ...node,
              data: {
                ...currentData,
                buttons: [...currentButtons, newButton],
              },
            };
          }

          return node;
        })
      );
    },
    [id, setNodes]
  );

  // Duplicar nó
  const handleDuplicate = useCallback(() => {
    const nodes = getNodes();
    const currentNode = nodes.find((n) => n.id === id);
    if (!currentNode) return;

    const newId = `button_template-${Date.now()}`;
    const currentData = currentNode.data as unknown as ButtonTemplateNodeData;

    // Clone buttons with new IDs
    const clonedButtons = (currentData.buttons || []).map((btn) => ({
      ...btn,
      id: generateTemplateButtonId(),
    }));

    const newNode = {
      ...currentNode,
      id: newId,
      position: {
        x: currentNode.position.x + 50,
        y: currentNode.position.y + 50,
      },
      data: {
        ...currentNode.data,
        label: `${currentData.label || 'Button Template'} (cópia)`,
        templateName: currentData.templateName ? `${currentData.templateName}_copy` : undefined,
        metaTemplateId: undefined,
        status: 'DRAFT' as const,
        buttons: clonedButtons,
      },
      selected: false,
    };

    setNodes((nodes) => [...nodes, newNode]);
  }, [id, getNodes, setNodes]);

  // Deletar nó
  const handleDelete = useCallback(() => {
    setNodes((nodes) => nodes.filter((n) => n.id !== id));
    setEdges((edges) => edges.filter((e) => e.source !== id && e.target !== id));
  }, [id, setNodes, setEdges]);

  return (
    <NodeContextMenu onDuplicate={handleDuplicate} onDelete={handleDelete}>
      <div
        className={cn(
          'w-[340px] rounded-xl shadow-xl transition-all bg-card overflow-hidden',
          'border-[3px]',
          selected
            ? 'ring-2 ring-primary ring-offset-2 border-primary'
            : 'border-sky-500/60 hover:border-sky-500'
        )}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Handle de entrada (top) */}
        <Handle
          type="target"
          position={Position.Top}
          className="!h-3.5 !w-3.5 !bg-sky-500 !border-2 !border-white !-top-[7px]"
        />

        {/* Header do nó */}
        <div className="flex items-center gap-2 px-3 py-2.5 bg-gradient-to-r from-sky-500 to-sky-600 text-white">
          <FileText className="h-4 w-4 shrink-0" />
          <span className="font-semibold text-sm truncate flex-1 select-none">{templateName}</span>
          {/* Status badge */}
          <Badge
            variant="outline"
            className={cn('text-[10px] px-1.5 py-0.5 font-medium gap-1 border', getStatusColors(status))}
          >
            {getStatusIcon(status)}
            {getStatusLabel(status)}
          </Badge>
        </div>

        {/* Conteúdo do template */}
        <div className="p-3 bg-slate-50 dark:bg-slate-950/20 min-h-[100px]">
          {isConfigured ? (
            <div className="flex flex-col gap-2">
              {/* Body preview */}
              {hasBody && (
                <div className="rounded-md border bg-white dark:bg-card px-3 py-3 shadow-sm">
                  <p className="text-sm text-foreground line-clamp-3 whitespace-pre-wrap">{data.body.text}</p>
                  {/* Variables indicator */}
                  {data.body.variables && data.body.variables.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {data.body.variables.map((v) => (
                        <Badge key={v} variant="secondary" className="text-[10px] py-0">
                          {`{{${v}}}`}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Buttons preview */}
              {buttons.length > 0 && (
                <div className="mt-1 flex flex-col gap-1.5">
                  {buttons.map((btn) => (
                    <div key={btn.id} className="relative group">
                      <div className="rounded-md border bg-white dark:bg-card px-3 py-2 shadow-sm flex items-center justify-center gap-2">
                        <ChevronRight className="h-3 w-3" />
                        <span className="text-sm font-semibold text-sky-600 dark:text-sky-400">{btn.text}</span>
                      </div>

                      {/* Handle de saída por botão */}
                      <Handle
                        type="source"
                        position={Position.Right}
                        id={btn.id}
                        className="!h-3.5 !w-3.5 !bg-sky-500 !border-2 !border-white hover:!bg-sky-600 !transition-colors !-right-[7px]"
                        style={{
                          top: '50%',
                          right: '-7px',
                          transform: 'translateY(-50%)',
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Add button hint */}
              {canAddMoreButtons && (
                <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground/60 mt-1 border border-dashed border-muted-foreground/20 rounded-md py-1.5">
                  <Plus className="h-3 w-3" />
                  <span>Arraste botão para adicionar ({BUTTON_TEMPLATE_LIMITS.maxButtons - buttons.length} restantes)</span>
                </div>
              )}
            </div>
          ) : (
            /* Estado não configurado */
            <div className="p-4 text-center border-2 border-dashed border-border/40 rounded-lg">
              <div className="w-10 h-10 rounded-full bg-sky-100 dark:bg-sky-900/30 mx-auto mb-2 flex items-center justify-center">
                <Settings className="h-5 w-5 text-sky-500" />
              </div>
              <p className="text-xs text-muted-foreground/70 mb-1">Arraste elementos para configurar</p>
              <p className="text-[10px] text-muted-foreground/50">Body (texto) + Botões (max {BUTTON_TEMPLATE_LIMITS.maxButtons})</p>
            </div>
          )}
        </div>

        {/* Handle de saída padrão (bottom) - só se não tiver botões */}
        {buttons.length === 0 && (
          <Handle
            type="source"
            position={Position.Bottom}
            className="!h-3.5 !w-3.5 !bg-sky-500 !border-2 !border-white !-bottom-[7px]"
          />
        )}
      </div>
    </NodeContextMenu>
  );
});

ButtonTemplateNode.displayName = 'ButtonTemplateNode';

export default ButtonTemplateNode;
