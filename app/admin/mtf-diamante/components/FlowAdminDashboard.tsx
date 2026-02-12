'use client';

import { useState, useCallback } from 'react';
import useSWR, { mutate } from 'swr';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  GitBranch,
  Loader2,
  Pause,
  Play,
  RefreshCcw,
  Trash2,
  XCircle,
  Zap,
  Timer,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// =============================================================================
// TYPES
// =============================================================================

interface FlowStats {
  totalFlows: number;
  activeFlows: number;
  totalSessions: number;
  activeSessions: number;
  waitingSessions: number;
  completedSessions: number;
  errorSessions: number;
}

interface FlowDetail {
  id: string;
  name: string;
  isActive: boolean;
  nodeCount: number;
  edgeCount: number;
  sessionCount: number;
  activeSessionCount: number;
  createdAt: string;
  updatedAt: string;
}

interface FlowSession {
  id: string;
  flowId: string;
  flowName: string;
  conversationId: string;
  contactId: string;
  inboxId: string;
  status: string;
  currentNodeId: string | null;
  createdAt: string;
  completedAt: string | null;
  variables: unknown;
}

// =============================================================================
// FETCHER
// =============================================================================

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Erro ao carregar dados');
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Erro');
  return json.data;
};

// =============================================================================
// HELPERS
// =============================================================================

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(startStr: string, endStr: string | null) {
  const start = new Date(startStr).getTime();
  const end = endStr ? new Date(endStr).getTime() : Date.now();
  const diff = end - start;

  if (diff < 60000) return `${Math.round(diff / 1000)}s`;
  if (diff < 3600000) return `${Math.round(diff / 60000)}m`;
  return `${Math.round(diff / 3600000)}h`;
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'ACTIVE':
      return <Badge className="bg-blue-500 hover:bg-blue-600"><Play className="w-3 h-3 mr-1" />Executando</Badge>;
    case 'WAITING_INPUT':
      return <Badge className="bg-yellow-500 hover:bg-yellow-600"><Pause className="w-3 h-3 mr-1" />Aguardando</Badge>;
    case 'COMPLETED':
      return <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" />Concluído</Badge>;
    case 'ERROR':
      return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Erro/Abortado</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

interface FlowAdminDashboardProps {
  inboxId: string;
}

export function FlowAdminDashboard({ inboxId }: FlowAdminDashboardProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [sessionFilter, setSessionFilter] = useState('active');
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [actionDialog, setActionDialog] = useState<{
    type: 'abort_session' | 'abort_sessions' | 'abort_all_flow' | 'force_delete' | 'cleanup' | null;
    flowId?: string;
    flowName?: string;
    sessionId?: string;
  }>({ type: null });
  const [isProcessing, setIsProcessing] = useState(false);

  // ==========================================================================
  // DATA FETCHING
  // ==========================================================================

  const statsKey = `/api/admin/mtf-diamante/flow-admin?inboxId=${inboxId}&dataType=stats`;
  const flowsKey = `/api/admin/mtf-diamante/flow-admin?inboxId=${inboxId}&dataType=flows`;
  const sessionsKey = `/api/admin/mtf-diamante/flow-admin?inboxId=${inboxId}&dataType=sessions&status=${sessionFilter}`;

  const { data: stats, isLoading: loadingStats } = useSWR<FlowStats>(statsKey, fetcher, {
    refreshInterval: 10000,
  });

  const { data: flows, isLoading: loadingFlows } = useSWR<FlowDetail[]>(flowsKey, fetcher, {
    refreshInterval: 15000,
  });

  const { data: sessions, isLoading: loadingSessions } = useSWR<FlowSession[]>(sessionsKey, fetcher, {
    refreshInterval: 5000,
  });

  // ==========================================================================
  // ACTIONS
  // ==========================================================================

  const executeAction = useCallback(async (action: string, payload: Record<string, unknown>) => {
    setIsProcessing(true);
    try {
      const res = await fetch('/api/admin/mtf-diamante/flow-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, inboxId, ...payload }),
      });
      const json = await res.json();

      if (!json.success) throw new Error(json.error);

      toast.success(json.message);

      // Revalidar dados
      mutate(statsKey);
      mutate(flowsKey);
      mutate(sessionsKey);
      setSelectedSessions([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao executar ação');
    } finally {
      setIsProcessing(false);
      setActionDialog({ type: null });
    }
  }, [inboxId, statsKey, flowsKey, sessionsKey]);

  const handleAbortSession = (sessionId: string) => {
    setActionDialog({ type: 'abort_session', sessionId });
  };

  const handleAbortSelected = () => {
    if (selectedSessions.length === 0) return;
    setActionDialog({ type: 'abort_sessions' });
  };

  const handleAbortAllFlowSessions = (flowId: string, flowName: string) => {
    setActionDialog({ type: 'abort_all_flow', flowId, flowName });
  };

  const handleForceDeleteFlow = (flowId: string, flowName: string) => {
    setActionDialog({ type: 'force_delete', flowId, flowName });
  };

  const handleCleanup = () => {
    setActionDialog({ type: 'cleanup' });
  };

  const confirmAction = () => {
    switch (actionDialog.type) {
      case 'abort_session':
        executeAction('abort_session', { sessionId: actionDialog.sessionId });
        break;
      case 'abort_sessions':
        executeAction('abort_sessions', { sessionIds: selectedSessions });
        break;
      case 'abort_all_flow':
        executeAction('abort_all_flow_sessions', { flowId: actionDialog.flowId });
        break;
      case 'force_delete':
        executeAction('force_delete_flow', { flowId: actionDialog.flowId });
        break;
      case 'cleanup':
        executeAction('cleanup_old_sessions', { hoursThreshold: 24 });
        break;
    }
  };

  const toggleSessionSelection = (sessionId: string) => {
    setSelectedSessions(prev =>
      prev.includes(sessionId)
        ? prev.filter(id => id !== sessionId)
        : [...prev, sessionId]
    );
  };

  const toggleAllSessions = () => {
    if (!sessions) return;
    const activeIds = sessions.filter(s => ['ACTIVE', 'WAITING_INPUT'].includes(s.status)).map(s => s.id);
    if (selectedSessions.length === activeIds.length) {
      setSelectedSessions([]);
    } else {
      setSelectedSessions(activeIds);
    }
  };

  const refreshAll = () => {
    mutate(statsKey);
    mutate(flowsKey);
    mutate(sessionsKey);
    toast.success('Dados atualizados');
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            Flow Engine Admin
          </h2>
          <p className="text-sm text-muted-foreground">
            Gerencie flows e sessões em tempo real
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCcw className="w-4 h-4 mr-1" />
            Atualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCleanup}
            className="text-orange-600 border-orange-300 hover:bg-orange-50"
          >
            <Timer className="w-4 h-4 mr-1" />
            Limpar antigas (&gt;24h)
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Flows</span>
            </div>
            <p className="text-2xl font-bold">
              {loadingStats ? <Loader2 className="w-5 h-5 animate-spin" /> : stats?.totalFlows ?? 0}
            </p>
            <p className="text-xs text-green-600">{stats?.activeFlows ?? 0} ativos</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Sessões</span>
            </div>
            <p className="text-2xl font-bold">
              {loadingStats ? <Loader2 className="w-5 h-5 animate-spin" /> : stats?.totalSessions ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card className={cn(stats?.activeSessions && stats.activeSessions > 0 && 'border-blue-500')}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Play className="w-4 h-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Executando</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">
              {loadingStats ? <Loader2 className="w-5 h-5 animate-spin" /> : stats?.activeSessions ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card className={cn(stats?.waitingSessions && stats.waitingSessions > 0 && 'border-yellow-500')}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Pause className="w-4 h-4 text-yellow-500" />
              <span className="text-xs text-muted-foreground">Aguardando</span>
            </div>
            <p className="text-2xl font-bold text-yellow-600">
              {loadingStats ? <Loader2 className="w-5 h-5 animate-spin" /> : stats?.waitingSessions ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Concluídas</span>
            </div>
            <p className="text-2xl font-bold text-green-600">
              {loadingStats ? <Loader2 className="w-5 h-5 animate-spin" /> : stats?.completedSessions ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card className={cn(stats?.errorSessions && stats.errorSessions > 0 && 'border-red-500')}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-xs text-muted-foreground">Erros</span>
            </div>
            <p className="text-2xl font-bold text-red-600">
              {loadingStats ? <Loader2 className="w-5 h-5 animate-spin" /> : stats?.errorSessions ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Flows | Sessions */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">
            <BarChart3 className="w-4 h-4 mr-1" />
            Flows
          </TabsTrigger>
          <TabsTrigger value="sessions">
            <Activity className="w-4 h-4 mr-1" />
            Sessões
            {(stats?.activeSessions ?? 0) + (stats?.waitingSessions ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-2">
                {(stats?.activeSessions ?? 0) + (stats?.waitingSessions ?? 0)}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Flows Tab */}
        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Flows Configurados</CardTitle>
              <CardDescription>
                Gerencie flows e suas sessões ativas
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingFlows ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : !flows?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum flow configurado
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead className="text-center">Nós</TableHead>
                        <TableHead className="text-center">Sessões</TableHead>
                        <TableHead className="text-center">Ativas</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {flows.map((flow) => (
                        <TableRow key={flow.id}>
                          <TableCell className="font-medium">
                            {flow.name}
                            <div className="text-xs text-muted-foreground">
                              {formatDate(flow.updatedAt)}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {flow.nodeCount}
                          </TableCell>
                          <TableCell className="text-center">
                            {flow.sessionCount}
                          </TableCell>
                          <TableCell className="text-center">
                            {flow.activeSessionCount > 0 ? (
                              <Badge className="bg-yellow-500">{flow.activeSessionCount}</Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {flow.isActive ? (
                              <Badge className="bg-green-500">Ativo</Badge>
                            ) : (
                              <Badge variant="secondary">Inativo</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {flow.activeSessionCount > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleAbortAllFlowSessions(flow.id, flow.name)}
                                  className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                >
                                  <XCircle className="w-4 h-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleForceDeleteFlow(flow.id, flow.name)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sessions Tab */}
        <TabsContent value="sessions" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Sessões do Flow Engine</CardTitle>
                  <CardDescription>
                    Monitore e gerencie sessões em execução
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={sessionFilter} onValueChange={setSessionFilter}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Filtrar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativas/Aguardando</SelectItem>
                      <SelectItem value="completed">Concluídas</SelectItem>
                      <SelectItem value="error">Com erro</SelectItem>
                      <SelectItem value="all">Todas</SelectItem>
                    </SelectContent>
                  </Select>
                  {selectedSessions.length > 0 && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleAbortSelected}
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Abortar ({selectedSessions.length})
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingSessions ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : !sessions?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma sessão encontrada
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]">
                          <Checkbox
                            checked={
                              sessions.filter(s => ['ACTIVE', 'WAITING_INPUT'].includes(s.status)).length > 0 &&
                              selectedSessions.length === sessions.filter(s => ['ACTIVE', 'WAITING_INPUT'].includes(s.status)).length
                            }
                            onCheckedChange={toggleAllSessions}
                          />
                        </TableHead>
                        <TableHead>Flow</TableHead>
                        <TableHead>Conversa</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Contato</TableHead>
                        <TableHead>Duração</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sessions.map((session) => (
                        <TableRow key={session.id}>
                          <TableCell>
                            {['ACTIVE', 'WAITING_INPUT'].includes(session.status) && (
                              <Checkbox
                                checked={selectedSessions.includes(session.id)}
                                onCheckedChange={() => toggleSessionSelection(session.id)}
                              />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            {session.flowName}
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">
                              {session.conversationId.slice(0, 12)}...
                            </code>
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(session.status)}
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">
                              {session.contactId.slice(0, 8)}
                            </code>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm">
                              <Clock className="w-3 h-3 text-muted-foreground" />
                              {formatDuration(session.createdAt, session.completedAt)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatDate(session.createdAt)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {['ACTIVE', 'WAITING_INPUT'].includes(session.status) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleAbortSession(session.id)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Confirmation Dialog */}
      <AlertDialog open={actionDialog.type !== null} onOpenChange={(open) => !open && setActionDialog({ type: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionDialog.type === 'abort_session' && 'Abortar sessão?'}
              {actionDialog.type === 'abort_sessions' && `Abortar ${selectedSessions.length} sessões?`}
              {actionDialog.type === 'abort_all_flow' && `Abortar sessões do flow "${actionDialog.flowName}"?`}
              {actionDialog.type === 'force_delete' && `Excluir flow "${actionDialog.flowName}"?`}
              {actionDialog.type === 'cleanup' && 'Limpar sessões antigas?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionDialog.type === 'abort_session' && 'A sessão será marcada como abortada e não poderá continuar.'}
              {actionDialog.type === 'abort_sessions' && `${selectedSessions.length} sessões serão abortadas. Esta ação não pode ser desfeita.`}
              {actionDialog.type === 'abort_all_flow' && 'Todas as sessões ativas deste flow serão abortadas.'}
              {actionDialog.type === 'force_delete' && (
                <>
                  <strong className="text-destructive">ATENÇÃO:</strong> O flow será excluído permanentemente.
                  Todas as sessões ativas serão abortadas e todos os dados relacionados serão removidos.
                </>
              )}
              {actionDialog.type === 'cleanup' && 'Sessões em estado ACTIVE ou WAITING_INPUT há mais de 24 horas serão abortadas automaticamente.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAction}
              disabled={isProcessing}
              className={cn(
                actionDialog.type === 'force_delete' && 'bg-destructive hover:bg-destructive/90'
              )}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                'Confirmar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default FlowAdminDashboard;
