'use client';

/**
 * SessionReplayModal Component
 * 
 * Displays chronological timeline of session execution with detailed logs.
 * Shows node visits, timestamps, durations, delivery modes, and errors.
 * 
 * Validates Requirements: 4.1-4.10
 */

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Play,
  Pause,
  Zap,
  MessageSquare,
  Image as ImageIcon,
  Timer,
} from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

interface SessionReplayModalProps {
  sessionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ExecutionLogEntry {
  timestamp: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  action: string;
  durationMs: number;
  deliveryMode: 'sync' | 'async';
  status: 'ok' | 'error' | 'skipped';
  errorDetail?: string;
}

interface SessionDetail {
  id: string;
  flowId: string;
  flowName: string;
  conversationId: string;
  contactId: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  variables: Record<string, any>;
  executionLog: ExecutionLogEntry[];
  lastNodeVisited?: string;
  inactivityTime?: number;
}

// =============================================================================
// FETCHER
// =============================================================================

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Erro ao carregar detalhes da sessão');
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Erro');
  return json.data;
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getNodeTypeIcon(nodeType: string) {
  switch (nodeType) {
    case 'START':
      return <Play className="w-4 h-4 text-green-500" />;
    case 'INTERACTIVE_MESSAGE':
      return <MessageSquare className="w-4 h-4 text-blue-500" />;
    case 'TEXT_MESSAGE':
      return <MessageSquare className="w-4 h-4 text-gray-500" />;
    case 'MEDIA':
      return <ImageIcon className="w-4 h-4 text-purple-500" />;
    case 'DELAY':
      return <Timer className="w-4 h-4 text-orange-500" />;
    default:
      return <Zap className="w-4 h-4 text-gray-400" />;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'ok':
      return (
        <Badge className="bg-green-500 hover:bg-green-600">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          OK
        </Badge>
      );
    case 'error':
      return (
        <Badge variant="destructive">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Erro
        </Badge>
      );
    case 'skipped':
      return (
        <Badge variant="outline">
          <Pause className="w-3 h-3 mr-1" />
          Ignorado
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function SessionReplayModal({
  sessionId,
  open,
  onOpenChange,
}: SessionReplayModalProps) {
  // Fetch session details
  const { data: session, error, isLoading } = useSWR<SessionDetail>(
    sessionId && open ? `/api/admin/mtf-diamante/flow-analytics/sessions/${sessionId}` : null,
    fetcher
  );

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] sm:max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Replay da Sessão</DialogTitle>
          <DialogDescription>
            Timeline cronológica de execução com logs detalhados
          </DialogDescription>
        </DialogHeader>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="text-center py-12">
            <XCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
            <p className="text-sm text-red-500">Erro ao carregar sessão</p>
            <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
          </div>
        )}

        {/* Session Details */}
        {session && (
          <ScrollArea className="h-[58vh] sm:h-[62vh]">
            <div className="space-y-4 pr-4">
              {/* Session Info */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Flow:</span>
                    <p className="font-medium">{session.flowName}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>
                    <p className="font-medium">{session.status}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Conversa:</span>
                    <code className="text-xs bg-background px-1 py-0.5 rounded">
                      {session.conversationId}
                    </code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Contato:</span>
                    <code className="text-xs bg-background px-1 py-0.5 rounded">
                      {session.contactId}
                    </code>
                  </div>
                </div>
              </div>

              {/* Abandonment Info */}
              {['WAITING_INPUT', 'ERROR'].includes(session.status) && session.lastNodeVisited && (
                <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                        {session.status === 'ERROR' ? 'Sessão com erro' : 'Sessão aguardando entrada'}
                      </p>
                      <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                        Último nó visitado: <span className="font-semibold">{session.lastNodeVisited}</span>
                        {session.inactivityTime && (
                          <> • Tempo de inatividade: {Math.round(session.inactivityTime / 60000)}min</>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <Separator />

              {/* Execution Timeline */}
              <div>
                <h4 className="text-sm font-semibold mb-3">Timeline de Execução</h4>
                <div className="space-y-3">
                  {session.executionLog.map((entry, index) => (
                    <div
                      key={index}
                      className="flex gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      {/* Icon */}
                      <div className="flex-shrink-0 mt-0.5">
                        {getNodeTypeIcon(entry.nodeType)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="text-sm font-medium">{entry.nodeName}</p>
                            <p className="text-xs text-muted-foreground">{entry.nodeType}</p>
                          </div>
                          {getStatusBadge(entry.status)}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTimestamp(entry.timestamp)}
                          </div>
                          <div className="flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            {entry.durationMs}ms
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {entry.deliveryMode}
                          </Badge>
                        </div>

                        {entry.action && (
                          <p className="text-xs text-muted-foreground">
                            Ação: {entry.action}
                          </p>
                        )}

                        {entry.errorDetail && (
                          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded p-2 mt-2">
                            <p className="text-xs text-red-700 dark:text-red-300">
                              {entry.errorDetail}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Session Variables */}
              {session.variables && Object.keys(session.variables).length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-semibold mb-3">Variáveis da Sessão</h4>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <pre className="text-xs overflow-x-auto">
                        {JSON.stringify(session.variables, null, 2)}
                      </pre>
                    </div>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
