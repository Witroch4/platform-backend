'use client';

import { memo, useMemo, useCallback, useState, type DragEvent } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import { Phone, Check, Clock, XCircle, FileEdit, Plus, X, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type CallTemplateNodeData,
  type InteractiveMessageElement,
  type InteractiveMessageBodyElement,
  type InteractiveMessageButtonPhoneElement,
  CALL_TEMPLATE_LIMITS,
  CHANNEL_CHAR_LIMITS,
} from '@/types/flow-builder';
import {
  getInteractiveMessageElements,
  hasConfiguredBody,
  generateElementId,
} from '@/lib/flow-builder/interactiveMessageElements';
import { NodeContextMenu } from '../../ui/NodeContextMenu';
import { Badge } from '@/components/ui/badge';
import { EditableText } from '../../ui/EditableText';

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
 * Edição inline igual à Mensagem Interativa.
 * Aceita drop de elementos: body, button_phone
 * Limite: máximo 1 botão PHONE_NUMBER (conforme API WhatsApp)
 */
export const CallTemplateNode = memo(({ id, data, selected }: CallTemplateNodeProps) => {
  const { setNodes, getNodes, setEdges } = useReactFlow();
  const [isDragOver, setIsDragOver] = useState(false);

  // Usa o sistema unificado de elements
  const elements = useMemo(() => getInteractiveMessageElements(data as unknown as Record<string, unknown>), [data]);

  // Drag & Drop handlers
  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDragOver) setIsDragOver(true);
  }, [isDragOver]);

  const handleDragLeave = useCallback((e: DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    setIsDragOver(false);
  }, []);

  // Dados do template
  const status = data.status || 'DRAFT';
  const templateName = data.templateName || data.label || 'Call Template';

  // Template bloqueado para edição (APPROVED ou PENDING)
  const isLocked = status === 'APPROVED' || status === 'PENDING';

  // Extrair elementos do array unificado
  const bodyElement = useMemo(() => {
    return elements.find((e) => e.type === 'body') as InteractiveMessageBodyElement | undefined;
  }, [elements]);

  const phoneElement = useMemo(() => {
    return elements.find((e) => e.type === 'button_phone') as InteractiveMessageButtonPhoneElement | undefined;
  }, [elements]);

  const showContent = elements.length > 0;
  const isValidPhone = phoneElement?.phoneNumber ? isValidPhoneNumber(phoneElement.phoneNumber) : false;
  const isConfigured = hasConfiguredBody(elements) && phoneElement?.phoneNumber && isValidPhone;
  const hasPhoneButton = !!phoneElement;

  // Atualiza o conteúdo de um elemento
  const updateElementContent = useCallback((elementId: string, newContent: Partial<InteractiveMessageElement>) => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === id) {
          const currentData = node.data as unknown as CallTemplateNodeData;
          const currentElements = currentData.elements && currentData.elements.length > 0
            ? [...currentData.elements]
            : getInteractiveMessageElements(currentData as unknown as Record<string, unknown>);

          const elementIndex = currentElements.findIndex(el => el.id === elementId);
          if (elementIndex !== -1) {
            const el = currentElements[elementIndex];
            currentElements[elementIndex] = { ...el, ...newContent } as InteractiveMessageElement;
          }

          // Sincronizar com campos legados
          const bodyEl = currentElements.find(e => e.type === 'body');
          const phoneEl = currentElements.find(e => e.type === 'button_phone') as InteractiveMessageButtonPhoneElement | undefined;

          return {
            ...node,
            data: {
              ...currentData,
              elements: currentElements,
              body: bodyEl && 'text' in bodyEl ? { text: bodyEl.text } : currentData.body,
              phoneNumber: phoneEl?.phoneNumber ?? currentData.phoneNumber,
              buttonText: phoneEl?.title ?? currentData.buttonText,
              isConfigured: !!(bodyEl && 'text' in bodyEl && bodyEl.text.trim() && phoneEl?.phoneNumber && isValidPhoneNumber(phoneEl.phoneNumber)),
            },
          };
        }
        return node;
      })
    );
  }, [id, setNodes]);

  // Remove elemento
  const handleRemoveElement = useCallback((elementId: string) => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === id) {
          const currentData = node.data as unknown as CallTemplateNodeData;
          const currentElements = currentData.elements && currentData.elements.length > 0
            ? [...currentData.elements]
            : getInteractiveMessageElements(currentData as unknown as Record<string, unknown>);

          const nextElements = currentElements.filter(el => el.id !== elementId);

          // Sincronizar com campos legados
          const bodyEl = nextElements.find(e => e.type === 'body');
          const phoneEl = nextElements.find(e => e.type === 'button_phone') as InteractiveMessageButtonPhoneElement | undefined;

          return {
            ...node,
            data: {
              ...currentData,
              elements: nextElements,
              body: bodyEl && 'text' in bodyEl ? { text: bodyEl.text } : undefined,
              phoneNumber: phoneEl?.phoneNumber ?? undefined,
              buttonText: phoneEl?.title ?? undefined,
              isConfigured: !!(bodyEl && 'text' in bodyEl && bodyEl.text.trim() && phoneEl?.phoneNumber),
            },
          };
        }
        return node;
      })
    );
  }, [id, setNodes]);

  // Duplicar nó
  const handleDuplicate = useCallback(() => {
    const nodes = getNodes();
    const currentNode = nodes.find((n) => n.id === id);
    if (!currentNode) return;

    const newId = `call_template-${Date.now()}`;
    const currentData = currentNode.data as unknown as CallTemplateNodeData;

    const sourceElements = getInteractiveMessageElements(currentData as unknown as Record<string, unknown>);
    const clonedElements = sourceElements.map(el => ({
      ...el,
      id: generateElementId(el.type),
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
        label: `${currentData.label || 'Call Template'} (cópia)`,
        templateName: currentData.templateName ? `${currentData.templateName}_copy` : undefined,
        metaTemplateId: undefined,
        status: 'DRAFT' as const,
        elements: clonedElements,
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

  // Impede propagação de duplo clique no corpo
  const stopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <NodeContextMenu onDuplicate={handleDuplicate} onDelete={handleDelete}>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'w-[340px] rounded-xl shadow-xl transition-all bg-card overflow-hidden',
          'border-[3px]',
          selected
            ? 'ring-2 ring-primary ring-offset-2 border-primary'
            : isDragOver
              ? 'border-fuchsia-500 scale-[1.02] shadow-2xl ring-2 ring-fuchsia-200'
              : 'border-fuchsia-500/60 hover:border-fuchsia-500'
        )}
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
          <Badge
            variant="outline"
            className={cn('text-[10px] px-1.5 py-0.5 font-medium gap-1 border', getStatusColors(status))}
          >
            {getStatusIcon(status)}
            {getStatusLabel(status)}
            {isLocked && <Lock className="h-2.5 w-2.5 ml-0.5" />}
          </Badge>
        </div>

        {/* Conteúdo do template - edição inline */}
        <div
          className={cn(
            "p-0 bg-slate-50 dark:bg-slate-950/20 min-h-[60px] transition-all",
            isDragOver ? "bg-fuchsia-50/50 dark:bg-fuchsia-900/10" : ""
          )}
          onDoubleClick={stopPropagation}
        >
          {showContent || isDragOver ? (
            <div className="flex flex-col gap-1 p-2">
              {/* Body */}
              {bodyElement && (
                <NodeContextMenu onDelete={isLocked ? undefined : () => handleRemoveElement(bodyElement.id)}>
                  <div className={cn('relative group rounded-md border bg-white dark:bg-card px-3 py-3 shadow-sm min-h-[40px]', isLocked && 'opacity-80')}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <EditableText
                          value={bodyElement.text}
                          onChange={(val) => updateElementContent(bodyElement.id, { text: val })}
                          label="Corpo da mensagem"
                          placeholder="Digite a mensagem..."
                          className="text-sm"
                          minRows={2}
                          maxLength={CHANNEL_CHAR_LIMITS.whatsapp.body}
                          readOnly={isLocked}
                        />
                      </div>
                      {!isLocked && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveElement(bodyElement.id);
                          }}
                          className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20 text-muted-foreground hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </NodeContextMenu>
              )}

              {/* Botão PHONE */}
              {phoneElement && (
                <NodeContextMenu onDelete={isLocked ? undefined : () => handleRemoveElement(phoneElement.id)}>
                  <div className={cn('relative group', isLocked && 'opacity-80')}>
                    {/* Número de telefone */}
                    <div
                      className={cn(
                        'rounded-md border-2 border-dashed px-3 py-2 shadow-sm mb-1',
                        isValidPhone || !phoneElement.phoneNumber
                          ? 'border-fuchsia-300 dark:border-fuchsia-700 bg-fuchsia-50 dark:bg-fuchsia-950/30'
                          : 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30'
                      )}
                    >
                      <p className="text-[10px] text-muted-foreground mb-1">Número de telefone (E.164):</p>
                      <input
                        type="text"
                        className={cn(
                          "nodrag w-full bg-transparent border-none p-0 text-sm font-mono font-bold focus:outline-none focus:ring-0 placeholder:text-fuchsia-300",
                          isValidPhone || !phoneElement.phoneNumber
                            ? "text-fuchsia-700 dark:text-fuchsia-400"
                            : "text-red-500 dark:text-red-400",
                          isLocked && "cursor-not-allowed"
                        )}
                        value={phoneElement.phoneNumber || ''}
                        onChange={(e) => updateElementContent(phoneElement.id, { phoneNumber: e.target.value })}
                        placeholder="+5511999999999"
                        disabled={isLocked}
                        readOnly={isLocked}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter') e.currentTarget.blur();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.currentTarget.focus();
                        }}
                      />
                      {phoneElement.phoneNumber && !isValidPhone && (
                        <p className="text-[10px] text-red-500 mt-1">
                          Formato inválido. Use E.164: +5511999999999
                        </p>
                      )}
                    </div>

                    {/* Botão de ligar */}
                    <div className="rounded-md border bg-white dark:bg-card px-3 py-2 shadow-sm transition-colors hover:border-fuchsia-300 focus-within:ring-2 focus-within:ring-fuchsia-400 focus-within:border-transparent">
                      <div className="flex items-center">
                        <Phone className="h-3 w-3 mr-2 text-fuchsia-500" />
                        <div className="flex items-center justify-center text-center flex-1">
                          <input
                            type="text"
                            className={cn(
                              "nodrag w-full bg-transparent border-none p-0 text-sm font-semibold focus:outline-none focus:ring-0 text-center placeholder:text-fuchsia-300",
                              (phoneElement.title?.length ?? 0) > CALL_TEMPLATE_LIMITS.buttonTextMaxLength
                                ? "text-red-500 dark:text-red-400"
                                : "text-fuchsia-600 dark:text-fuchsia-400",
                              isLocked && "cursor-not-allowed"
                            )}
                            value={phoneElement.title || ''}
                            onChange={(e) => updateElementContent(phoneElement.id, { title: e.target.value })}
                            placeholder="Texto do botão"
                            disabled={isLocked}
                            readOnly={isLocked}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === 'Enter') e.currentTarget.blur();
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              e.currentTarget.focus();
                            }}
                          />
                        </div>
                        {!isLocked && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveElement(phoneElement.id);
                            }}
                            className="ml-2 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20 text-muted-foreground hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      {/* Contador de caracteres */}
                      {(() => {
                        const titleLength = phoneElement.title?.length ?? 0;
                        const titleLimit = CALL_TEMPLATE_LIMITS.buttonTextMaxLength;
                        const isOver = titleLength > titleLimit;
                        const isNear = titleLength >= titleLimit * 0.9;
                        return (
                          <div className="flex items-center gap-1 mt-1">
                            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full transition-all duration-200 rounded-full",
                                  isOver ? "bg-red-500" : isNear ? "bg-amber-500" : "bg-fuchsia-400"
                                )}
                                style={{ width: `${Math.min((titleLength / titleLimit) * 100, 100)}%` }}
                              />
                            </div>
                            <span
                              className={cn(
                                "text-[10px] tabular-nums",
                                isOver ? "text-red-500 font-bold" : isNear ? "text-amber-500" : "text-muted-foreground/60"
                              )}
                            >
                              {titleLength}/{titleLimit}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </NodeContextMenu>
              )}

              {/* Info sobre botão call */}
              {isConfigured && (
                <p className="text-[10px] text-muted-foreground/60 text-center italic mt-1">
                  O botão inicia uma ligação diretamente do WhatsApp
                </p>
              )}

              {/* Hint para adicionar elementos */}
              {!hasPhoneButton && (
                <div className={cn(
                  "w-full transition-all duration-300 ease-in-out overflow-hidden",
                  isDragOver ? "h-12 opacity-100 mt-1" : "h-0 opacity-0"
                )}>
                  <div className="h-full w-full border-2 border-dashed border-fuchsia-400 bg-fuchsia-100/30 rounded-md flex items-center justify-center animate-pulse">
                    <span className="text-xs font-medium text-fuchsia-600">Solte aqui</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Estado não configurado */
            <div className="p-6 text-center border-2 border-dashed border-border/40 m-2 rounded-lg pointer-events-none">
              <div className="w-10 h-10 rounded-full bg-fuchsia-100 dark:bg-fuchsia-900/30 mx-auto mb-2 flex items-center justify-center">
                <Plus className="h-5 w-5 text-fuchsia-500" />
              </div>
              <p className="text-xs text-muted-foreground/70">
                Arraste blocos aqui
              </p>
              <p className="text-[10px] text-muted-foreground/50 mt-1">
                Body + Número de telefone (E.164)
              </p>
            </div>
          )}
        </div>

        {/* Handle de saída (bottom) */}
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
