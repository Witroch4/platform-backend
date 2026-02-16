'use client';

import { memo, useMemo, useCallback, useState, type DragEvent } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import {
  FileText, Check, Clock, XCircle, FileEdit, Plus, X, Lock, RefreshCw,
  Link, Phone, PhoneCall, Clipboard
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTemplateStatusRefresh } from '../../hooks/useTemplateStatusRefresh';
import { cn } from '@/lib/utils';
import {
  type WhatsAppTemplateNodeData,
  type InteractiveMessageElement,
  type InteractiveMessageHeaderTextElement,
  type InteractiveMessageBodyElement,
  type InteractiveMessageFooterElement,
  type InteractiveMessageButtonElement,
  WHATSAPP_TEMPLATE_LIMITS,
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

type WhatsAppTemplateNodeProps = NodeProps & {
  data: WhatsAppTemplateNodeData & { [key: string]: unknown };
};

// Tipo estendido para botões com campos específicos
interface ExtendedButtonElement extends InteractiveMessageButtonElement {
  buttonType?: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE' | 'VOICE_CALL';
  url?: string;
  phoneNumber?: string;
  couponCode?: string;
  ttlMinutes?: number;
}

/**
 * Retorna o ícone do status do template
 */
function getStatusIcon(status: WhatsAppTemplateNodeData['status']) {
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
function getStatusColors(status: WhatsAppTemplateNodeData['status']) {
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
function getStatusLabel(status: WhatsAppTemplateNodeData['status']) {
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
 * Retorna o ícone do tipo de botão
 */
function getButtonTypeIcon(buttonType?: string) {
  switch (buttonType) {
    case 'URL':
      return <Link className="h-3 w-3" />;
    case 'PHONE_NUMBER':
      return <Phone className="h-3 w-3" />;
    case 'VOICE_CALL':
      return <PhoneCall className="h-3 w-3" />;
    case 'COPY_CODE':
      return <Clipboard className="h-3 w-3" />;
    default:
      return null;
  }
}

/**
 * Retorna as cores do tipo de botão
 */
function getButtonTypeColors(buttonType?: string) {
  switch (buttonType) {
    case 'URL':
      return 'border-rose-200 hover:border-rose-300 text-rose-600 dark:text-rose-400';
    case 'PHONE_NUMBER':
      return 'border-fuchsia-200 hover:border-fuchsia-300 text-fuchsia-600 dark:text-fuchsia-400';
    case 'VOICE_CALL':
      return 'border-violet-200 hover:border-violet-300 text-violet-600 dark:text-violet-400';
    case 'COPY_CODE':
      return 'border-lime-200 hover:border-lime-300 text-lime-600 dark:text-lime-400';
    default:
      return 'border-sky-200 hover:border-sky-300 text-sky-600 dark:text-sky-400';
  }
}

/**
 * Mapeia element.type → buttonType para renderização correta dos campos específicos
 */
function getButtonTypeFromElementType(type: string): 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE' | 'VOICE_CALL' {
  switch (type) {
    case 'button_url': return 'URL';
    case 'button_phone': return 'PHONE_NUMBER';
    case 'button_copy_code': return 'COPY_CODE';
    case 'button_voice_call': return 'VOICE_CALL';
    default: return 'QUICK_REPLY';
  }
}

/**
 * Valida os limites de botões conforme regras da Meta
 */
function validateButtonLimits(buttons: ExtendedButtonElement[]) {
  const counts = {
    COPY_CODE: buttons.filter(b => getButtonTypeFromElementType(b.type) === 'COPY_CODE').length,
    URL: buttons.filter(b => getButtonTypeFromElementType(b.type) === 'URL').length,
    PHONE_NUMBER: buttons.filter(b => getButtonTypeFromElementType(b.type) === 'PHONE_NUMBER').length,
    VOICE_CALL: buttons.filter(b => getButtonTypeFromElementType(b.type) === 'VOICE_CALL').length,
    QUICK_REPLY: buttons.filter(b => getButtonTypeFromElementType(b.type) === 'QUICK_REPLY').length,
    total: buttons.length,
  };

  const errors: string[] = [];

  if (counts.total > WHATSAPP_TEMPLATE_LIMITS.maxButtons) {
    errors.push(`Máximo ${WHATSAPP_TEMPLATE_LIMITS.maxButtons} botões`);
  }
  if (counts.COPY_CODE > WHATSAPP_TEMPLATE_LIMITS.maxCopyCodeButtons) {
    errors.push('Máximo 1 botão Copiar Código');
  }
  if (counts.URL > WHATSAPP_TEMPLATE_LIMITS.maxUrlButtons) {
    errors.push('Máximo 2 botões URL');
  }
  if (counts.PHONE_NUMBER > WHATSAPP_TEMPLATE_LIMITS.maxPhoneButtons) {
    errors.push('Máximo 1 botão Ligar');
  }
  if (counts.VOICE_CALL > WHATSAPP_TEMPLATE_LIMITS.maxVoiceCallButtons) {
    errors.push('Máximo 1 botão Ligar WhatsApp');
  }
  if (counts.PHONE_NUMBER > 0 && counts.VOICE_CALL > 0) {
    errors.push('Não pode ter Ligar e Ligar WhatsApp juntos');
  }

  return { valid: errors.length === 0, errors, counts };
}

/**
 * WhatsAppTemplateNode - Container unificado para Templates WhatsApp
 *
 * Aceita TODOS os tipos de botão: QUICK_REPLY, URL, PHONE_NUMBER, COPY_CODE, VOICE_CALL
 * Valida limites em tempo real conforme regras da Meta API.
 */
export const WhatsAppTemplateNode = memo(({ id, data, selected }: WhatsAppTemplateNodeProps) => {
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
  const templateName = data.templateName || data.label || 'Template WhatsApp';

  // Template bloqueado para edição (APPROVED ou PENDING)
  const isLocked = status === 'APPROVED' || status === 'PENDING';

  // Hook de refresh de status (polling automático para PENDING)
  const { isRefreshing, refreshStatus, canRefresh } = useTemplateStatusRefresh({
    nodeId: id,
    metaTemplateId: data.metaTemplateId,
    templateName: data.templateName,
    status,
  });

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

  const footerElement = useMemo(() => {
    return elements.find((e) => e.type === 'footer') as InteractiveMessageFooterElement | undefined;
  }, [elements]);

  // Todos os botões (qualquer tipo)
  const buttons = useMemo(() => {
    const allButtons = elements.filter((e) =>
      e.type === 'button' ||
      e.type === 'button_url' ||
      e.type === 'button_phone' ||
      e.type === 'button_voice_call' ||
      e.type === 'button_copy_code'
    ) as ExtendedButtonElement[];
    return allButtons;
  }, [elements]);

  // Validação de limites
  const validation = useMemo(() => validateButtonLimits(buttons), [buttons]);

  const showContent = elements.length > 0;
  const isConfigured = hasConfiguredBody(elements);
  const canAddMoreButtons = buttons.length < WHATSAPP_TEMPLATE_LIMITS.maxButtons;

  // Atualiza o conteúdo de um elemento
  const updateElementContent = useCallback((elementId: string, newContent: Partial<InteractiveMessageElement>) => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === id) {
          const currentData = node.data as unknown as WhatsAppTemplateNodeData;
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
          const currentData = node.data as unknown as WhatsAppTemplateNodeData;
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
          const currentData = node.data as unknown as WhatsAppTemplateNodeData;
          const currentElements = currentData.elements && currentData.elements.length > 0
            ? [...currentData.elements]
            : getInteractiveMessageElements(currentData as unknown as Record<string, unknown>);

          const elementToDuplicate = currentElements.find(el => el.id === elementId);
          if (!elementToDuplicate) return node;

          // Verifica se pode adicionar mais botões
          const buttonCount = currentElements.filter(e =>
            e.type === 'button' || e.type === 'button_url' || e.type === 'button_phone' ||
            e.type === 'button_voice_call' || e.type === 'button_copy_code'
          ).length;
          if (buttonCount >= WHATSAPP_TEMPLATE_LIMITS.maxButtons) return node;

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

    const newId = `whatsapp_template-${Date.now()}`;
    const currentData = currentNode.data as unknown as WhatsAppTemplateNodeData;

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
        label: `${currentData.label || 'Template WhatsApp'} (cópia)`,
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
          'w-[440px] rounded-xl shadow-xl transition-all bg-card overflow-hidden',
          'border-[3px]',
          selected
            ? 'ring-2 ring-primary ring-offset-2 border-primary'
            : isDragOver
              ? 'border-emerald-500 scale-[1.02] shadow-2xl ring-2 ring-emerald-200'
              : !validation.valid
                ? 'border-red-400 hover:border-red-500'
                : 'border-emerald-500/60 hover:border-emerald-500'
        )}
      >
        {/* Handle de entrada (top) */}
        <Handle
          type="target"
          position={Position.Top}
          className="!h-3.5 !w-3.5 !bg-emerald-500 !border-2 !border-white !-top-[7px]"
        />

        {/* Header do nó */}
        <div className="flex items-center gap-2 px-3 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white">
          <FileText className="h-4 w-4 shrink-0" />
          <span className="font-semibold text-sm truncate flex-1 select-none">{templateName}</span>
          {canRefresh && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                refreshStatus();
              }}
              disabled={isRefreshing}
              className="p-1 rounded hover:bg-white/20 transition-colors disabled:opacity-50"
              title="Verificar status na Meta"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
            </button>
          )}
          <Badge
            variant="outline"
            className={cn('text-[10px] px-1.5 py-0.5 font-medium gap-1 border', getStatusColors(status))}
          >
            {getStatusIcon(status)}
            {getStatusLabel(status)}
            {isLocked && <Lock className="h-2.5 w-2.5 ml-0.5" />}
          </Badge>
        </div>

        {/* Contador de botões */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-slate-100 dark:bg-slate-900/50 border-b text-[10px]">
          <span className={cn(
            "font-medium",
            !validation.valid ? "text-red-500" : validation.counts.total >= 8 ? "text-amber-500" : "text-muted-foreground"
          )}>
            {validation.counts.total}/{WHATSAPP_TEMPLATE_LIMITS.maxButtons} botões
          </span>
          <div className="flex items-center gap-2">
            {validation.counts.COPY_CODE > 0 && (
              <span className="text-lime-600">🎫{validation.counts.COPY_CODE}</span>
            )}
            {validation.counts.URL > 0 && (
              <span className="text-rose-600">🔗{validation.counts.URL}/2</span>
            )}
            {validation.counts.PHONE_NUMBER > 0 && (
              <span className="text-fuchsia-600">📞{validation.counts.PHONE_NUMBER}</span>
            )}
            {validation.counts.VOICE_CALL > 0 && (
              <span className="text-violet-600">📱{validation.counts.VOICE_CALL}</span>
            )}
            {validation.counts.QUICK_REPLY > 0 && (
              <span className="text-sky-600">🔘{validation.counts.QUICK_REPLY}</span>
            )}
          </div>
        </div>

        {/* Erros de validação */}
        {!validation.valid && (
          <div className="px-3 py-1.5 bg-red-50 dark:bg-red-950/20 border-b border-red-200 dark:border-red-900">
            {validation.errors.map((error, i) => (
              <p key={i} className="text-[10px] text-red-600 dark:text-red-400">{error}</p>
            ))}
          </div>
        )}

        {/* Conteúdo do template - edição inline */}
        <div
          className={cn(
            "p-0 bg-slate-50 dark:bg-slate-950/20 min-h-[60px] transition-all",
            isDragOver ? "bg-emerald-50/50 dark:bg-emerald-900/10" : ""
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

              {/* Footer */}
              {footerElement && (
                <NodeContextMenu onDelete={isLocked ? undefined : () => handleRemoveElement(footerElement.id)}>
                  <div className={cn('relative group rounded-md border border-dashed bg-slate-50 dark:bg-slate-900/50 px-3 py-2 shadow-sm', isLocked && 'opacity-80')}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <EditableText
                          value={footerElement.text}
                          onChange={(val) => updateElementContent(footerElement.id, { text: val })}
                          label="Rodapé"
                          placeholder="Rodapé (opcional)"
                          className="text-[11px] text-muted-foreground italic"
                          minRows={1}
                          maxLength={CHANNEL_CHAR_LIMITS.whatsapp.footer}
                          readOnly={isLocked}
                        />
                      </div>
                      {!isLocked && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveElement(footerElement.id);
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
                <div className="mt-2 flex flex-col gap-2">
                  {buttons.map((btn) => {
                    const btnType = getButtonTypeFromElementType(btn.type);
                    const btnColors = getButtonTypeColors(btnType);
                    const btnIcon = getButtonTypeIcon(btnType);

                    return (
                      <NodeContextMenu
                        key={btn.id}
                        onDuplicate={isLocked ? undefined : () => handleDuplicateElement(btn.id)}
                        onDelete={isLocked ? undefined : () => handleRemoveElement(btn.id)}
                      >
                        <div className="relative group">
                          <div className={cn(
                            'rounded-md border bg-white dark:bg-card px-3 py-2 shadow-sm transition-colors',
                            btnColors,
                            isLocked && 'opacity-80'
                          )}>
                            <div className="flex items-center gap-2">
                              {/* Ícone do tipo */}
                              {btnIcon && (
                                <span className="shrink-0">{btnIcon}</span>
                              )}

                              {/* Input do título */}
                              <div className="flex-1">
                                <input
                                  type="text"
                                  className={cn(
                                    "nodrag w-full bg-transparent border-none p-0 text-sm font-semibold focus:outline-none focus:ring-0 placeholder:opacity-50",
                                    ('title' in btn ? btn.title.length : 0) > CHANNEL_CHAR_LIMITS.whatsapp.buttonTitle
                                      ? "text-red-500 dark:text-red-400"
                                      : "",
                                    isLocked && "cursor-not-allowed"
                                  )}
                                  value={'title' in btn ? btn.title : ''}
                                  onChange={(e) => updateButtonTitle(btn.id, e.target.value)}
                                  placeholder={
                                    btnType === 'URL' ? 'Acessar site' :
                                    btnType === 'PHONE_NUMBER' ? 'Ligar' :
                                    btnType === 'VOICE_CALL' ? 'Ligar WhatsApp' :
                                    btnType === 'COPY_CODE' ? 'Copiar código' :
                                    'Nome do botão'
                                  }
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

                              {/* Botão remover */}
                              {!isLocked && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveElement(btn.id);
                                  }}
                                  className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20 text-muted-foreground hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </div>

                            {/* Campo específico do tipo */}
                            {btnType === 'URL' && (
                              <input
                                type="url"
                                className="nodrag w-full bg-slate-50 dark:bg-slate-900 border rounded px-2 py-1.5 mt-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400"
                                value={btn.url || ''}
                                onChange={(e) => updateElementContent(btn.id, { url: e.target.value } as Partial<InteractiveMessageElement>)}
                                placeholder="https://..."
                                disabled={isLocked}
                              />
                            )}
                            {btnType === 'PHONE_NUMBER' && (
                              <input
                                type="tel"
                                className="nodrag w-full bg-slate-50 dark:bg-slate-900 border rounded px-2 py-1.5 mt-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-fuchsia-400"
                                value={btn.phoneNumber || ''}
                                onChange={(e) => updateElementContent(btn.id, { phoneNumber: e.target.value } as Partial<InteractiveMessageElement>)}
                                placeholder="+5511999999999"
                                disabled={isLocked}
                              />
                            )}
                            {btnType === 'COPY_CODE' && (
                              <input
                                type="text"
                                className="nodrag w-full bg-slate-50 dark:bg-slate-900 border rounded px-2 py-1.5 mt-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-lime-400"
                                value={btn.couponCode || ''}
                                onChange={(e) => updateElementContent(btn.id, { couponCode: e.target.value } as Partial<InteractiveMessageElement>)}
                                placeholder="CUPOM123"
                                maxLength={15}
                                disabled={isLocked}
                              />
                            )}
                            {btnType === 'VOICE_CALL' && (
                              <Select
                                value={String(btn.ttlMinutes || 10080)}
                                onValueChange={(v) => updateElementContent(btn.id, { ttlMinutes: Number(v) } as Partial<InteractiveMessageElement>)}
                                disabled={isLocked}
                              >
                                <SelectTrigger className="nodrag h-7 mt-1.5 text-xs bg-slate-50 dark:bg-slate-900 border-violet-200 focus:ring-violet-400">
                                  <SelectValue placeholder="Validade" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="1440">Válido por 1 dia</SelectItem>
                                  <SelectItem value="4320">Válido por 3 dias</SelectItem>
                                  <SelectItem value="10080">Válido por 7 dias</SelectItem>
                                  <SelectItem value="20160">Válido por 14 dias</SelectItem>
                                </SelectContent>
                              </Select>
                            )}

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
                                        isOver ? "bg-red-500" : isNear ? "bg-amber-500" : "bg-emerald-400"
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
                            className="!h-3.5 !w-3.5 !bg-emerald-500 !border-2 !border-white hover:!bg-emerald-600 !transition-colors !-right-[7px]"
                            style={{
                              top: '50%',
                              right: '-7px',
                              transform: 'translateY(-50%)',
                            }}
                          />
                        </div>
                      </NodeContextMenu>
                    );
                  })}
                </div>
              )}

              {/* Hint para adicionar mais botões (só quando não bloqueado) */}
              {canAddMoreButtons && !isLocked && (
                <div className={cn(
                  "w-full transition-all duration-300 ease-in-out overflow-hidden",
                  isDragOver ? "h-12 opacity-100 mt-1" : "h-0 opacity-0"
                )}>
                  <div className="h-full w-full border-2 border-dashed border-emerald-400 bg-emerald-100/30 rounded-md flex items-center justify-center animate-pulse">
                    <span className="text-xs font-medium text-emerald-600">Solte aqui</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Estado não configurado */
            <div className="p-6 text-center border-2 border-dashed border-border/40 m-2 rounded-lg pointer-events-none">
              <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 mx-auto mb-2 flex items-center justify-center">
                <Plus className="h-5 w-5 text-emerald-500" />
              </div>
              <p className="text-xs text-muted-foreground/70">
                Arraste blocos aqui
              </p>
              <p className="text-[10px] text-muted-foreground/50 mt-1">
                Body + Botões (max {WHATSAPP_TEMPLATE_LIMITS.maxButtons})
              </p>
            </div>
          )}
        </div>

        {/* Handle de saída padrão (bottom) - só se não tiver botões */}
        {buttons.length === 0 && (
          <Handle
            type="source"
            position={Position.Bottom}
            className="!h-3.5 !w-3.5 !bg-emerald-500 !border-2 !border-white !-bottom-[7px]"
          />
        )}
      </div>
    </NodeContextMenu>
  );
});

WhatsAppTemplateNode.displayName = 'WhatsAppTemplateNode';

export default WhatsAppTemplateNode;
