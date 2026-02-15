'use client';

import { memo, useCallback, type DragEvent } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import { Phone, Settings, Check, Clock, XCircle, FileEdit } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type CallTemplateNodeData,
  CALL_TEMPLATE_LIMITS,
  TEMPLATE_ELEMENT_MIME,
  type TemplateElementType,
} from '@/types/flow-builder';
import { NodeContextMenu } from '../../ui/NodeContextMenu';
import { Badge } from '@/components/ui/badge';

type CallTemplateNodeProps = NodeProps & {
  data: CallTemplateNodeData & { [key: string]: unknown };
};

/**
 * Retorna o ícone do status do template
 */
function getStatusIcon(status: CallTemplateNodeData['status']) {
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
function getStatusColors(status: CallTemplateNodeData['status']) {
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
function getStatusLabel(status: CallTemplateNodeData['status']) {
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
 * Valida formato de telefone E.164
 */
function isValidPhoneNumber(phone: string): boolean {
  return CALL_TEMPLATE_LIMITS.phoneNumberPattern.test(phone);
}

/**
 * CallTemplateNode - Container para Call Template WhatsApp
 *
 * Mensagem com botão PHONE_NUMBER para ligação direta.
 * Aceita drop de elementos: body, button_phone
 */
export const CallTemplateNode = memo(({ id, data, selected }: CallTemplateNodeProps) => {
  const { setNodes, getNodes, setEdges } = useReactFlow();

  // Dados do template
  const status = data.status || 'DRAFT';
  const templateName = data.templateName || data.label || 'Call Template';
  const hasBody = data.body?.text && data.body.text.trim().length > 0;
  const hasPhone = data.phoneNumber && data.phoneNumber.trim().length > 0;
  const buttonText = data.buttonText || 'Ligar';
  const isConfigured = data.isConfigured && hasBody && hasPhone;
  const isValidPhone = hasPhone && isValidPhoneNumber(data.phoneNumber);

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
      if (elementType !== 'body' && elementType !== 'button_phone') {
        return;
      }

      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== id) return node;
          const currentData = node.data as unknown as CallTemplateNodeData;

          if (elementType === 'body') {
            return {
              ...node,
              data: {
                ...currentData,
                body: currentData.body || { text: '', variables: [] },
              },
            };
          }

          if (elementType === 'button_phone') {
            return {
              ...node,
              data: {
                ...currentData,
                phoneNumber: currentData.phoneNumber || '',
                buttonText: currentData.buttonText || 'Ligar',
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

    const newId = `call_template-${Date.now()}`;
    const currentData = currentNode.data as unknown as CallTemplateNodeData;

    const newNode = {
      ...currentNode,
      id: newId,
      position: {
        x: currentNode.position.x + 50,
        y: currentNode.position.y + 50,
      },
      data: {
        ...currentNode.data,
        label: `${currentData.label || 'Call Template'} (cópia)`,
        templateName: currentData.templateName ? `${currentData.templateName}_copy` : undefined,
        metaTemplateId: undefined,
        status: 'DRAFT' as const,
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
            : 'border-fuchsia-500/60 hover:border-fuchsia-500'
        )}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Handle de entrada (top) */}
        <Handle
          type="target"
          position={Position.Top}
          className="!h-3.5 !w-3.5 !bg-fuchsia-500 !border-2 !border-white !-top-[7px]"
        />

        {/* Header do nó */}
        <div className="flex items-center gap-2 px-3 py-2.5 bg-gradient-to-r from-fuchsia-500 to-fuchsia-600 text-white">
          <Phone className="h-4 w-4 shrink-0" />
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

              {/* Phone number preview */}
              {hasPhone && (
                <div
                  className={cn(
                    'rounded-md border-2 border-dashed px-3 py-2 shadow-sm',
                    isValidPhone
                      ? 'border-fuchsia-300 dark:border-fuchsia-700 bg-fuchsia-50 dark:bg-fuchsia-950/30'
                      : 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30'
                  )}
                >
                  <p className="text-[10px] text-muted-foreground mb-1">Número de telefone:</p>
                  <p
                    className={cn(
                      'text-sm font-mono font-bold truncate',
                      isValidPhone
                        ? 'text-fuchsia-700 dark:text-fuchsia-400'
                        : 'text-red-700 dark:text-red-400'
                    )}
                  >
                    {data.phoneNumber}
                  </p>
                  {!isValidPhone && (
                    <p className="text-[10px] text-red-500 mt-1">
                      Formato inválido. Use E.164: +5511999999999
                    </p>
                  )}
                </div>
              )}

              {/* Button preview */}
              <div className="rounded-md border bg-white dark:bg-card px-3 py-2 shadow-sm flex items-center justify-center gap-2">
                <Phone className="h-3 w-3" />
                <span className="text-sm font-semibold text-fuchsia-600 dark:text-fuchsia-400">{buttonText}</span>
                <span className="text-[10px] text-muted-foreground">(ligar)</span>
              </div>

              {/* Info about call button */}
              <p className="text-[10px] text-muted-foreground/60 text-center italic">
                O botão inicia uma ligação diretamente do WhatsApp
              </p>
            </div>
          ) : (
            /* Estado não configurado */
            <div className="p-4 text-center border-2 border-dashed border-border/40 rounded-lg">
              <div className="w-10 h-10 rounded-full bg-fuchsia-100 dark:bg-fuchsia-900/30 mx-auto mb-2 flex items-center justify-center">
                <Settings className="h-5 w-5 text-fuchsia-500" />
              </div>
              <p className="text-xs text-muted-foreground/70 mb-1">Arraste elementos para configurar</p>
              <p className="text-[10px] text-muted-foreground/50">Body (texto) + Número de telefone (E.164)</p>
            </div>
          )}
        </div>

        {/* Handle de saída (bottom) - Call templates don't branch */}
        <Handle
          type="source"
          position={Position.Bottom}
          className="!h-3.5 !w-3.5 !bg-fuchsia-500 !border-2 !border-white !-bottom-[7px]"
        />
      </div>
    </NodeContextMenu>
  );
});

CallTemplateNode.displayName = 'CallTemplateNode';

export default CallTemplateNode;
