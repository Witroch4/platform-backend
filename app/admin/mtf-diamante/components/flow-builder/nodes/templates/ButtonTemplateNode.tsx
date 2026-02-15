'use client';

import { memo, useMemo, useCallback, useState, type DragEvent } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import { FileText, Settings, Check, Clock, XCircle, FileEdit, Plus, X, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type ButtonTemplateNodeData,
  type InteractiveMessageElement,
  type InteractiveMessageHeaderTextElement,
  type InteractiveMessageBodyElement,
  BUTTON_TEMPLATE_LIMITS,
  CHANNEL_CHAR_LIMITS,
} from '@/types/flow-builder';
import {
  getInteractiveMessageElements,
  hasConfiguredBody,
  elementsToLegacyFields,
  generateElementId,
} from '@/lib/flow-builder/interactiveMessageElements';
import { NodeContextMenu } from '../../ui/NodeContextMenu';
import { Badge } from '@/components/ui/badge';
import { EditableText } from '../../ui/EditableText';

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
 * Edição inline igual à Mensagem Interativa.
 * Aceita drop de elementos: header_text, header_image, body, button
 * Limite: máximo 10 botões (conforme API WhatsApp)
 */
export const ButtonTemplateNode = memo(({ id, data, selected }: ButtonTemplateNodeProps) => {
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
  const templateName = data.templateName || data.label || 'Button Template';

  // Template bloqueado para edição (APPROVED ou PENDING)
  const isLocked = status === 'APPROVED' || status === 'PENDING';

  // Extrair elementos do array unificado
  const headerTextElement = useMemo(() => {
    return elements.find((e) => e.type === 'header_text') as InteractiveMessageHeaderTextElement | undefined;
  }, [elements]);

  const headerImage = useMemo(() => {
    const el = elements.find((e) => e.type === 'header_image');
    return el && 'url' in el ? { url: el.url ?? '', caption: el.caption ?? '' } : null;
  }, [elements]);

  const bodyElement = useMemo(() => {
    return elements.find((e) => e.type === 'body') as InteractiveMessageBodyElement | undefined;
  }, [elements]);

  const buttons = useMemo(
    () => elements.filter((e) => e.type === 'button'),
    [elements]
  );

  const showContent = elements.length > 0;
  const isConfigured = hasConfiguredBody(elements);
  const canAddMoreButtons = buttons.length < BUTTON_TEMPLATE_LIMITS.maxButtons;

  // Atualiza o conteúdo de um elemento
  const updateElementContent = useCallback((elementId: string, newContent: Partial<InteractiveMessageElement>) => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === id) {
          const currentData = node.data as unknown as ButtonTemplateNodeData;
          const currentElements = currentData.elements && currentData.elements.length > 0
            ? [...currentData.elements]
            : getInteractiveMessageElements(currentData as unknown as Record<string, unknown>);

          const elementIndex = currentElements.findIndex(el => el.id === elementId);
          if (elementIndex !== -1) {
            const el = currentElements[elementIndex];
            currentElements[elementIndex] = { ...el, ...newContent } as InteractiveMessageElement;
          }

          return {
            ...node,
            data: {
              ...currentData,
              elements: currentElements,
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
          const currentData = node.data as unknown as ButtonTemplateNodeData;
          const currentElements = currentData.elements && currentData.elements.length > 0
            ? [...currentData.elements]
            : getInteractiveMessageElements(currentData as unknown as Record<string, unknown>);

          const nextElements = currentElements.filter(el => el.id !== elementId);
          const legacy = elementsToLegacyFields(nextElements);

          return {
            ...node,
            data: {
              ...currentData,
              elements: nextElements,
              ...legacy,
              isConfigured: hasConfiguredBody(nextElements),
            },
          };
        }
        return node;
      })
    );
  }, [id, setNodes]);

  // Duplicar botão
  const handleDuplicateElement = useCallback((elementId: string) => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === id) {
          const currentData = node.data as unknown as ButtonTemplateNodeData;
          const currentElements = currentData.elements && currentData.elements.length > 0
            ? [...currentData.elements]
            : getInteractiveMessageElements(currentData as unknown as Record<string, unknown>);

          const elementToDuplicate = currentElements.find(el => el.id === elementId);
          if (!elementToDuplicate || elementToDuplicate.type !== 'button') return node;

          const buttonCount = currentElements.filter(e => e.type === 'button').length;
          if (buttonCount >= BUTTON_TEMPLATE_LIMITS.maxButtons) return node;

          const duplicatedElement: InteractiveMessageElement = {
            ...elementToDuplicate,
            id: generateElementId(elementToDuplicate.type),
          };

          if ('title' in duplicatedElement && duplicatedElement.title) {
            duplicatedElement.title = `${duplicatedElement.title} (cópia)`;
          }

          const elementIndex = currentElements.findIndex(el => el.id === elementId);
          const nextElements = [
            ...currentElements.slice(0, elementIndex + 1),
            duplicatedElement,
            ...currentElements.slice(elementIndex + 1),
          ];
          const legacy = elementsToLegacyFields(nextElements);

          return {
            ...node,
            data: {
              ...currentData,
              elements: nextElements,
              ...legacy,
              isConfigured: hasConfiguredBody(nextElements),
            },
          };
        }
        return node;
      })
    );
  }, [id, setNodes]);

  // Atualiza título do botão
  const updateButtonTitle = useCallback((btnId: string, newTitle: string) => {
    updateElementContent(btnId, { title: newTitle });
  }, [updateElementContent]);

  // Duplicar nó
  const handleDuplicate = useCallback(() => {
    const nodes = getNodes();
    const currentNode = nodes.find((n) => n.id === id);
    if (!currentNode) return;

    const newId = `button_template-${Date.now()}`;
    const currentData = currentNode.data as unknown as ButtonTemplateNodeData;

    const sourceElements = getInteractiveMessageElements(currentData as unknown as Record<string, unknown>);
    const clonedElements = sourceElements.map(el => ({
      ...el,
      id: generateElementId(el.type),
    }));
    const legacyFields = elementsToLegacyFields(clonedElements);

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
        elements: clonedElements,
        ...legacyFields,
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
              ? 'border-sky-500 scale-[1.02] shadow-2xl ring-2 ring-sky-200'
              : 'border-sky-500/60 hover:border-sky-500'
        )}
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
            isDragOver ? "bg-sky-50/50 dark:bg-sky-900/10" : ""
          )}
          onDoubleClick={stopPropagation}
        >
          {showContent || isDragOver ? (
            <div className="flex flex-col gap-1 p-2">

              {/* Header text */}
              {headerTextElement && (
                <NodeContextMenu onDelete={isLocked ? undefined : () => handleRemoveElement(headerTextElement.id)}>
                  <div className={cn('relative group rounded-md border bg-white dark:bg-card px-3 py-2 shadow-sm', isLocked && 'opacity-80')}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <EditableText
                          value={headerTextElement.text}
                          onChange={(val) => updateElementContent(headerTextElement.id, { text: val })}
                          label="Cabeçalho"
                          placeholder="Cabeçalho (vazio)"
                          className="text-xs font-bold text-foreground/90 uppercase tracking-wide"
                          minRows={1}
                          maxLength={CHANNEL_CHAR_LIMITS.whatsapp.headerText}
                          readOnly={isLocked}
                        />
                      </div>
                      {!isLocked && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveElement(headerTextElement.id);
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

              {/* Header image */}
              {headerImage && (
                <NodeContextMenu
                  onDelete={() => {
                    const el = elements.find(e => e.type === 'header_image');
                    if (el) handleRemoveElement(el.id);
                  }}
                >
                  <div className="relative group rounded-md border bg-white dark:bg-card overflow-hidden shadow-sm">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const el = elements.find(e => e.type === 'header_image');
                        if (el) handleRemoveElement(el.id);
                      }}
                      className="absolute top-2 left-2 z-10 p-1 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    {headerImage.url ? (
                      <div className="h-24 w-full bg-cover bg-center" style={{ backgroundImage: `url(${headerImage.url})` }} />
                    ) : (
                      <div className="h-16 w-full flex items-center justify-center bg-muted/30">
                        <span className="text-xs text-muted-foreground">Imagem não configurada</span>
                      </div>
                    )}
                  </div>
                </NodeContextMenu>
              )}

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

              {/* Botões */}
              {buttons.length > 0 && (
                <div className="mt-1 flex flex-col gap-1.5">
                  {buttons.map((btn) => (
                    <NodeContextMenu
                      key={btn.id}
                      onDuplicate={isLocked ? undefined : () => handleDuplicateElement(btn.id)}
                      onDelete={isLocked ? undefined : () => handleRemoveElement(btn.id)}
                    >
                      <div className="relative group">
                        <div className={cn('rounded-md border bg-white dark:bg-card px-3 py-2 shadow-sm transition-colors hover:border-sky-300 focus-within:ring-2 focus-within:ring-sky-400 focus-within:border-transparent', isLocked && 'opacity-80')}>
                          <div className="flex items-center">
                            <div className="flex items-center justify-center text-center flex-1">
                              <input
                                type="text"
                                className={cn(
                                  "nodrag w-full bg-transparent border-none p-0 text-sm font-semibold focus:outline-none focus:ring-0 text-center placeholder:text-sky-300",
                                  ('title' in btn ? btn.title.length : 0) > CHANNEL_CHAR_LIMITS.whatsapp.buttonTitle
                                    ? "text-red-500 dark:text-red-400"
                                    : "text-sky-600 dark:text-sky-400",
                                  isLocked && "cursor-not-allowed"
                                )}
                                value={'title' in btn ? btn.title : ''}
                                onChange={(e) => updateButtonTitle(btn.id, e.target.value)}
                                placeholder="Nome do botão"
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
                                  handleRemoveElement(btn.id);
                                }}
                                className="ml-2 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20 text-muted-foreground hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                          {/* Contador de caracteres */}
                          {(() => {
                            const btnTitle = 'title' in btn ? btn.title : '';
                            const btnLength = btnTitle.length;
                            const btnLimit = CHANNEL_CHAR_LIMITS.whatsapp.buttonTitle;
                            const isOver = btnLength > btnLimit;
                            const isNear = btnLength >= btnLimit * 0.9;
                            return (
                              <div className="flex items-center gap-1 mt-1">
                                <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={cn(
                                      "h-full transition-all duration-200 rounded-full",
                                      isOver ? "bg-red-500" : isNear ? "bg-amber-500" : "bg-sky-400"
                                    )}
                                    style={{ width: `${Math.min((btnLength / btnLimit) * 100, 100)}%` }}
                                  />
                                </div>
                                <span
                                  className={cn(
                                    "text-[10px] tabular-nums",
                                    isOver ? "text-red-500 font-bold" : isNear ? "text-amber-500" : "text-muted-foreground/60"
                                  )}
                                >
                                  {btnLength}/{btnLimit}
                                </span>
                              </div>
                            );
                          })()}
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
                    </NodeContextMenu>
                  ))}
                </div>
              )}

              {/* Hint para adicionar mais botões (só quando não bloqueado) */}
              {canAddMoreButtons && !isLocked && (
                <div className={cn(
                  "w-full transition-all duration-300 ease-in-out overflow-hidden",
                  isDragOver ? "h-12 opacity-100 mt-1" : "h-0 opacity-0"
                )}>
                  <div className="h-full w-full border-2 border-dashed border-sky-400 bg-sky-100/30 rounded-md flex items-center justify-center animate-pulse">
                    <span className="text-xs font-medium text-sky-600">Solte aqui</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Estado não configurado */
            <div className="p-6 text-center border-2 border-dashed border-border/40 m-2 rounded-lg pointer-events-none">
              <div className="w-10 h-10 rounded-full bg-sky-100 dark:bg-sky-900/30 mx-auto mb-2 flex items-center justify-center">
                <Plus className="h-5 w-5 text-sky-500" />
              </div>
              <p className="text-xs text-muted-foreground/70">
                Arraste blocos aqui
              </p>
              <p className="text-[10px] text-muted-foreground/50 mt-1">
                Body + Botões (max {BUTTON_TEMPLATE_LIMITS.maxButtons})
              </p>
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
