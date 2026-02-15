'use client';

import { memo, useMemo, useCallback, useState } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import {
  FileText,
  Settings,
  Check,
  Clock,
  XCircle,
  FileEdit,
  RefreshCw,
  Link,
  Phone,
  Copy,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TemplateNodeData, TemplateButton } from '@/types/flow-builder';
import { NodeContextMenu } from '../ui/NodeContextMenu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { generateTemplateButtonId } from '@/lib/flow-builder/templateElements';

type TemplateNodeProps = NodeProps & {
  data: TemplateNodeData & { [key: string]: unknown };
};

/**
 * Retorna o ícone do status do template
 */
function getStatusIcon(status: TemplateNodeData['status']) {
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
function getStatusColors(status: TemplateNodeData['status']) {
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
function getStatusLabel(status: TemplateNodeData['status']) {
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
function getButtonTypeIcon(type: TemplateButton['type']) {
  switch (type) {
    case 'URL':
      return <Link className="h-3 w-3" />;
    case 'PHONE_NUMBER':
      return <Phone className="h-3 w-3" />;
    case 'COPY_CODE':
      return <Copy className="h-3 w-3" />;
    case 'QUICK_REPLY':
    default:
      return <ChevronRight className="h-3 w-3" />;
  }
}

/**
 * TemplateNode - Nó para Templates Oficiais WhatsApp
 *
 * Suporta dois modos:
 * - Import: Selecionar template já aprovado no sistema
 * - Create: Criar template do zero e enviar para Meta aprovar
 *
 * Mostra:
 * - Badge de status (APPROVED/PENDING/REJECTED/DRAFT)
 * - Preview do template (header/body/footer)
 * - Botões com handles de saída (para QUICK_REPLY)
 */
export const TemplateNode = memo(
  ({ id, data, selected }: TemplateNodeProps) => {
    const { setNodes, getNodes, setEdges } = useReactFlow();
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Dados do template
    const status = data.status || 'DRAFT';
    const templateName = data.templateName || data.label || 'Template Oficial';
    const mode = data.mode || 'draft';
    const isConfigured = data.isConfigured && (status !== 'DRAFT' || data.body?.text);

    // Extrai botões
    const buttons = useMemo(() => data.buttons || [], [data.buttons]);

    // Filtra apenas QUICK_REPLY para handles de saída (outros tipos não ramificam)
    const quickReplyButtons = useMemo(
      () => buttons.filter((b) => b.type === 'QUICK_REPLY'),
      [buttons]
    );

    // Duplicar nó
    const handleDuplicate = useCallback(() => {
      const nodes = getNodes();
      const currentNode = nodes.find((n) => n.id === id);
      if (!currentNode) return;

      const newId = `template-${Date.now()}`;
      const currentData = currentNode.data as unknown as TemplateNodeData;

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
          label: `${currentData.label || 'Template Oficial'} (cópia)`,
          templateName: currentData.templateName
            ? `${currentData.templateName}_copy`
            : undefined,
          templateId: undefined, // Remove link to original template
          metaTemplateId: undefined,
          status: 'DRAFT' as const,
          mode: 'create' as const,
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

    // Atualizar status do template (simula refresh da Meta API)
    const handleRefreshStatus = useCallback(async () => {
      if (!data.templateId) return;

      setIsRefreshing(true);
      try {
        // TODO: Chamar API para atualizar status do template
        // const response = await fetch(`/api/admin/mtf-diamante/template-details?id=${data.templateId}`);
        // const result = await response.json();
        // if (result.status) { ... }
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Simula delay
      } finally {
        setIsRefreshing(false);
      }
    }, [data.templateId]);

    // Impede propagação de duplo clique no corpo
    const stopPropagation = (e: React.MouseEvent) => {
      e.stopPropagation();
    };

    return (
      <NodeContextMenu onDuplicate={handleDuplicate} onDelete={handleDelete}>
        <div
          className={cn(
            'w-[340px] rounded-xl shadow-xl transition-all bg-card overflow-hidden',
            'border-[3px]',
            selected
              ? 'ring-2 ring-primary ring-offset-2 border-primary'
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
            <span className="font-semibold text-sm truncate flex-1 select-none">
              {templateName}
            </span>
            {/* Status badge */}
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] px-1.5 py-0.5 font-medium gap-1 border',
                getStatusColors(status)
              )}
            >
              {getStatusIcon(status)}
              {getStatusLabel(status)}
            </Badge>
          </div>

          {/* Conteúdo do template */}
          <div
            className="p-3 bg-slate-50 dark:bg-slate-950/20 min-h-[80px]"
            onDoubleClick={stopPropagation}
          >
            {isConfigured ? (
              <div className="flex flex-col gap-2">
                {/* Header preview */}
                {data.header && data.header.type !== 'NONE' && (
                  <div className="rounded-md border bg-white dark:bg-card px-3 py-2 shadow-sm">
                    {data.header.type === 'TEXT' && data.header.content && (
                      <p className="text-xs font-bold text-foreground/90 uppercase tracking-wide truncate">
                        {data.header.content}
                      </p>
                    )}
                    {(data.header.type === 'IMAGE' ||
                      data.header.type === 'VIDEO') && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {data.header.type === 'IMAGE' ? '🖼️' : '🎬'}
                        <span className="truncate">
                          {data.header.mediaUrl || 'Mídia não configurada'}
                        </span>
                      </div>
                    )}
                    {data.header.type === 'DOCUMENT' && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        📄 <span className="truncate">Documento</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Body preview */}
                {data.body?.text && (
                  <div className="rounded-md border bg-white dark:bg-card px-3 py-3 shadow-sm">
                    <p className="text-sm text-foreground line-clamp-3 whitespace-pre-wrap">
                      {data.body.text}
                    </p>
                    {/* Variables indicator */}
                    {data.body.variables && data.body.variables.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {data.body.variables.map((v) => (
                          <Badge
                            key={v}
                            variant="secondary"
                            className="text-[10px] py-0"
                          >
                            {`{{${v}}}`}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Footer preview */}
                {data.footer?.text && (
                  <div className="rounded-md border bg-white dark:bg-card px-3 py-2 shadow-sm">
                    <p className="text-xs text-muted-foreground italic truncate">
                      {data.footer.text}
                    </p>
                  </div>
                )}

                {/* Buttons preview */}
                {buttons.length > 0 && (
                  <div className="mt-1 flex flex-col gap-1.5">
                    {buttons.map((btn) => (
                      <div key={btn.id} className="relative group">
                        <div className="rounded-md border bg-white dark:bg-card px-3 py-2 shadow-sm flex items-center justify-center gap-2">
                          {getButtonTypeIcon(btn.type)}
                          <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                            {btn.text}
                          </span>
                          {btn.type !== 'QUICK_REPLY' && (
                            <span className="text-[10px] text-muted-foreground">
                              ({btn.type.replace('_', ' ').toLowerCase()})
                            </span>
                          )}
                        </div>

                        {/* Handle de saída por botão QUICK_REPLY */}
                        {btn.type === 'QUICK_REPLY' && (
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
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Refresh status button (only for templates with templateId) */}
                {data.templateId && status === 'PENDING' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRefreshStatus();
                    }}
                    disabled={isRefreshing}
                  >
                    <RefreshCw
                      className={cn('h-3 w-3 mr-1', isRefreshing && 'animate-spin')}
                    />
                    {isRefreshing ? 'Atualizando...' : 'Atualizar status'}
                  </Button>
                )}

                {/* Mode indicator */}
                <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground/60 mt-1">
                  {mode === 'import' && (
                    <>
                      <span>📥</span>
                      <span>Importado</span>
                    </>
                  )}
                  {mode === 'create' && (
                    <>
                      <span>✏️</span>
                      <span>Criado no Flow</span>
                    </>
                  )}
                </div>
              </div>
            ) : (
              /* Estado não configurado */
              <div className="p-4 text-center border-2 border-dashed border-border/40 rounded-lg">
                <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 mx-auto mb-2 flex items-center justify-center">
                  <Settings className="h-5 w-5 text-emerald-500" />
                </div>
                <p className="text-xs text-muted-foreground/70 mb-1">
                  Duplo clique para configurar
                </p>
                <p className="text-[10px] text-muted-foreground/50">
                  Importe um template aprovado ou crie um novo
                </p>
              </div>
            )}
          </div>

          {/* Handle de saída padrão (bottom) - só se não tiver botões QUICK_REPLY */}
          {quickReplyButtons.length === 0 && (
            <Handle
              type="source"
              position={Position.Bottom}
              className="!h-3.5 !w-3.5 !bg-emerald-500 !border-2 !border-white !-bottom-[7px]"
            />
          )}
        </div>
      </NodeContextMenu>
    );
  }
);

TemplateNode.displayName = 'TemplateNode';

export default TemplateNode;
