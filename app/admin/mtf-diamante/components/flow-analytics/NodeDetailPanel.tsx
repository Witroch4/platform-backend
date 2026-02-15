'use client';

import { useMemo } from 'react';
import { X, Activity, TrendingDown, Clock, Eye, AlertTriangle, MousePointerClick, Loader2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useNodeDetails } from './hooks/useNodeDetails';
import type { FlowNodeType } from '@/types/flow-builder';

// =============================================================================
// TYPES
// =============================================================================

interface NodeDetailPanelProps {
  flowId: string;
  nodeId: string | null;
  inboxId?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
  onClose: () => void;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatTime(milliseconds: number): string {
  if (milliseconds < 1000) return `${milliseconds}ms`;
  if (milliseconds < 60000) return `${(milliseconds / 1000).toFixed(1)}s`;
  if (milliseconds < 3600000) return `${(milliseconds / 60000).toFixed(1)}m`;
  return `${(milliseconds / 3600000).toFixed(1)}h`;
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getNodeTypeLabel(nodeType: FlowNodeType): string {
  const labels: Record<FlowNodeType, string> = {
    start: 'Início',
    interactive_message: 'Mensagem Interativa',
    text_message: 'Mensagem de Texto',
    template: 'Template Oficial',
    button_template: 'Button Template',
    coupon_template: 'Coupon Template',
    call_template: 'Call Template',
    url_template: 'URL Template',
    emoji_reaction: 'Reação com Emoji',
    text_reaction: 'Reação com Texto',
    handoff: 'Transferência',
    add_tag: 'Adicionar Tag',
    end: 'Fim',
    condition: 'Condição',
    delay: 'Espera',
    media: 'Mídia',
    quick_replies: 'Quick Replies',
    carousel: 'Carrossel',
  };
  return labels[nodeType] || nodeType;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function NodeDetailPanel({
  flowId,
  nodeId,
  inboxId,
  dateRange,
  onClose,
}: NodeDetailPanelProps) {
  const isOpen = nodeId !== null;

  // Fetch node details
  const { nodeDetails, isLoading, error } = useNodeDetails({
    flowId,
    nodeId: nodeId || '',
    inboxId,
    dateRange,
    enabled: isOpen,
  });

  // Health status colors
  const healthColors = {
    healthy: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    moderate: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };

  const healthLabels = {
    healthy: 'Saudável',
    moderate: 'Moderado',
    critical: 'Crítico',
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-hidden flex flex-col">
        <SheetHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <SheetTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                {nodeDetails?.nodeName || 'Detalhes do Nó'}
              </SheetTitle>
              <SheetDescription>
                {nodeDetails && `Tipo: ${getNodeTypeLabel(nodeDetails.nodeType)}`}
              </SheetDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-destructive text-center">
                Erro ao carregar detalhes: {error.message}
              </p>
            </div>
          )}

          {!isLoading && !error && nodeDetails && (
            <div className="space-y-6 py-4">
              {/* Health Status */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Status de Saúde</h3>
                <Badge
                  className={cn(
                    'text-sm px-3 py-1',
                    healthColors[nodeDetails.healthStatus]
                  )}
                >
                  {healthLabels[nodeDetails.healthStatus]}
                </Badge>
                {nodeDetails.isBottleneck && (
                  <div className="mt-3 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                          Gargalo Identificado
                        </p>
                        <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">
                          Este nó apresenta alta taxa de abandono (&gt;50%). Considere revisar o conteúdo ou fluxo.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Key Metrics */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Métricas Principais</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Eye className="w-3 h-3" />
                      Visitas
                    </div>
                    <p className="text-2xl font-bold">{nodeDetails.visitCount}</p>
                    <p className="text-xs text-muted-foreground">
                      {nodeDetails.visitPercentage.toFixed(1)}% do total
                    </p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <TrendingDown className="w-3 h-3" />
                      Taxa de Abandono
                    </div>
                    <p className={cn(
                      'text-2xl font-bold',
                      nodeDetails.dropOffRate > 50 ? 'text-red-600 dark:text-red-400' :
                      nodeDetails.dropOffRate > 20 ? 'text-yellow-600 dark:text-yellow-400' :
                      'text-green-600 dark:text-green-400'
                    )}>
                      {nodeDetails.dropOffRate.toFixed(1)}%
                    </p>
                  </div>

                  <div className="space-y-1 col-span-2">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      Tempo Médio Antes de Sair
                    </div>
                    <p className="text-xl font-semibold">
                      {formatTime(nodeDetails.avgTimeBeforeLeaving)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Button Metrics (for INTERACTIVE_MESSAGE nodes) */}
              {nodeDetails.nodeType === 'interactive_message' && nodeDetails.buttonMetrics && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <MousePointerClick className="w-4 h-4" />
                      Métricas de Botões
                    </h3>
                    <div className="space-y-3">
                      {nodeDetails.buttonMetrics.map((button) => (
                        <div
                          key={button.buttonId}
                          className="p-3 bg-muted/50 rounded-lg space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium flex-1">
                              {button.buttonText}
                            </p>
                            <Badge variant="outline" className="text-xs">
                              CTR: {button.clickThroughRate.toFixed(1)}%
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>{button.clickCount} cliques</span>
                            <span>•</span>
                            <span>{button.impressions} impressões</span>
                          </div>
                          {button.clickCount === 0 && button.impressions > 10 && (
                            <div className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
                              <AlertTriangle className="w-3 h-3" />
                              Botão nunca clicado
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Session Samples */}
              {nodeDetails.sessionSamples && nodeDetails.sessionSamples.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-semibold mb-3">
                      Sessões Recentes ({nodeDetails.sessionSamples.length})
                    </h3>
                    <div className="space-y-2">
                      {nodeDetails.sessionSamples.map((session) => (
                        <div
                          key={session.sessionId}
                          className="p-3 bg-muted/30 rounded-lg space-y-2 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <code className="text-xs bg-muted px-2 py-0.5 rounded">
                              {session.sessionId.slice(0, 12)}...
                            </code>
                            <Badge
                              variant={
                                session.status === 'COMPLETED' ? 'default' :
                                session.status === 'ERROR' ? 'destructive' :
                                'secondary'
                              }
                              className="text-xs"
                            >
                              {session.status}
                            </Badge>
                          </div>
                          <div className="text-muted-foreground">
                            <p>Visitou em: {formatTimestamp(session.visitedAt)}</p>
                            {session.action && (
                              <p className="mt-1">Ação: {session.action}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Execution Log Samples */}
              {nodeDetails.executionLogSamples && nodeDetails.executionLogSamples.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-semibold mb-3">
                      Amostras de Execução ({nodeDetails.executionLogSamples.length})
                    </h3>
                    <div className="space-y-2">
                      {nodeDetails.executionLogSamples.map((log, index) => (
                        <div
                          key={index}
                          className="p-3 bg-muted/30 rounded-lg space-y-1 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">
                              {formatTimestamp(log.timestamp)}
                            </span>
                            <Badge
                              variant={
                                log.result === 'ok' ? 'default' :
                                log.result === 'error' ? 'destructive' :
                                'secondary'
                              }
                              className="text-xs"
                            >
                              {log.result}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <span>Duração: {formatTime(log.durationMs)}</span>
                            <span>•</span>
                            <span>Modo: {log.deliveryMode}</span>
                          </div>
                          {log.detail && (
                            <p className="text-muted-foreground mt-1">
                              {log.detail}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
