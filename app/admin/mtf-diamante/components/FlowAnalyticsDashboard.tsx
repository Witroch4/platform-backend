'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BarChart3,
  Activity,
  List,
  RefreshCcw,
  Zap,
  Play,
  Pause,
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
  Loader2,
  Search,
  Eye,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import useSWR, { mutate } from 'swr';
import { cn } from '@/lib/utils';
import { ExecutiveKPICards } from './flow-analytics/ExecutiveKPICards';
import { HeatmapVisualization } from './flow-analytics/HeatmapVisualization';
import { GlobalFilters } from './flow-analytics/GlobalFilters';
import { FunnelChart } from './flow-analytics/FunnelChart';
import { SessionReplayModal } from './flow-analytics/SessionReplayModal';
import { AlertsPanel } from './flow-analytics/AlertsPanel';
import { ErrorBoundary } from './flow-analytics/ErrorBoundary';
import type { DashboardFilters } from '@/types/flow-analytics';

// =============================================================================
// TYPES
// =============================================================================

interface FlowAnalyticsDashboardProps {
  inboxId: string;
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
// HELPER FUNCTIONS
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
      return (
        <Badge className="bg-blue-500 hover:bg-blue-600">
          <Play className="w-3 h-3 mr-1" />
          Executando
        </Badge>
      );
    case 'WAITING_INPUT':
      return (
        <Badge className="bg-yellow-500 hover:bg-yellow-600">
          <Pause className="w-3 h-3 mr-1" />
          Aguardando
        </Badge>
      );
    case 'COMPLETED':
      return (
        <Badge className="bg-green-500 hover:bg-green-600">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Concluído
        </Badge>
      );
    case 'ERROR':
      return (
        <Badge variant="destructive">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Erro/Abortado
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function FlowAnalyticsDashboard({ inboxId }: FlowAnalyticsDashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get active tab from URL or default to 'overview'
  const activeTab = searchParams?.get('tab') || 'overview';

  // State for filters
  const [filters, setFilters] = useState<DashboardFilters>({
    inboxId,
  });

  // State for session management
  const [sessionFilter, setSessionFilter] = useState('active');
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [sessionSearch, setSessionSearch] = useState('');
  const [replaySessionId, setReplaySessionId] = useState<string | null>(null);
  const [replayModalOpen, setReplayModalOpen] = useState(false);

  // ==========================================================================
  // DATA FETCHING
  // ==========================================================================

  const sessionsKey = `/api/admin/mtf-diamante/flow-admin?inboxId=${inboxId}&dataType=sessions&status=${sessionFilter}`;

  const { data: sessions, isLoading: loadingSessions } = useSWR<FlowSession[]>(
    sessionsKey,
    fetcher,
    {
      refreshInterval: 5000,
    }
  );

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleTabChange = useCallback(
    (tab: string) => {
      const params = new URLSearchParams(searchParams?.toString() || '');
      params.set('tab', tab);
      router.push(`?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleFiltersChange = useCallback((newFilters: Partial<DashboardFilters>) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters,
    }));
  }, []);

  const handleAbortSession = useCallback(
    async (sessionId: string) => {
      try {
        const res = await fetch('/api/admin/mtf-diamante/flow-admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'abort_session',
            inboxId,
            sessionId,
          }),
        });
        const json = await res.json();

        if (!json.success) throw new Error(json.error);

        toast.success(json.message);
        mutate(sessionsKey);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Erro ao abortar sessão');
      }
    },
    [inboxId, sessionsKey]
  );

  const handleAbortSelected = useCallback(async () => {
    if (selectedSessions.length === 0) return;

    try {
      const res = await fetch('/api/admin/mtf-diamante/flow-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'abort_sessions',
          inboxId,
          sessionIds: selectedSessions,
        }),
      });
      const json = await res.json();

      if (!json.success) throw new Error(json.error);

      toast.success(json.message);
      mutate(sessionsKey);
      setSelectedSessions([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao abortar sessões');
    }
  }, [inboxId, selectedSessions, sessionsKey]);

  const toggleSessionSelection = useCallback((sessionId: string) => {
    setSelectedSessions((prev) =>
      prev.includes(sessionId)
        ? prev.filter((id) => id !== sessionId)
        : [...prev, sessionId]
    );
  }, []);

  const toggleAllSessions = useCallback(() => {
    if (!sessions) return;
    const activeIds = sessions
      .filter((s) => ['ACTIVE', 'WAITING_INPUT'].includes(s.status))
      .map((s) => s.id);
    if (selectedSessions.length === activeIds.length) {
      setSelectedSessions([]);
    } else {
      setSelectedSessions(activeIds);
    }
  }, [sessions, selectedSessions.length]);

  const refreshAll = useCallback(() => {
    mutate(sessionsKey);
    toast.success('Dados atualizados');
  }, [sessionsKey]);

  const handleViewReplay = useCallback((sessionId: string) => {
    setReplaySessionId(sessionId);
    setReplayModalOpen(true);
  }, []);

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      try {
        const res = await fetch('/api/admin/mtf-diamante/flow-admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'delete_session',
            inboxId,
            sessionId,
          }),
        });
        const json = await res.json();

        if (!json.success) throw new Error(json.error);

        toast.success(json.message);
        mutate(sessionsKey);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Erro ao excluir sessão');
      }
    },
    [inboxId, sessionsKey]
  );

  // Filter sessions by search
  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    if (!sessionSearch.trim()) return sessions;

    const search = sessionSearch.toLowerCase();
    return sessions.filter(
      (s) =>
        s.conversationId.toLowerCase().includes(search) ||
        s.contactId.toLowerCase().includes(search) ||
        s.flowName.toLowerCase().includes(search)
    );
  }, [sessions, sessionSearch]);

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
            Flow Analytics Dashboard
          </h2>
          <p className="text-sm text-muted-foreground">
            Análise completa de performance e qualidade dos flows
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshAll}>
          <RefreshCcw className="w-4 h-4 mr-1" />
          Atualizar
        </Button>
      </div>

      {/* Global Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Filtros Globais</CardTitle>
        </CardHeader>
        <CardContent>
          <GlobalFilters
            inboxId={inboxId}
            filters={filters}
            onFiltersChange={handleFiltersChange}
          />
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="overview">
            <BarChart3 className="w-4 h-4 mr-1" />
            Visão Geral
          </TabsTrigger>
          <TabsTrigger value="heatmap" disabled={!filters.flowId}>
            <Activity className="w-4 h-4 mr-1" />
            Heatmap
            {!filters.flowId && (
              <Badge variant="secondary" className="ml-2 text-xs">
                Selecione um flow
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sessions">
            <List className="w-4 h-4 mr-1" />
            Sessões
            {sessions && sessions.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {sessions.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4 space-y-6">
          <ErrorBoundary fallbackTitle="Erro ao carregar KPIs" fallbackMessage="Não foi possível carregar os indicadores">
            <div>
              <h3 className="text-lg font-semibold mb-4">KPIs Executivos</h3>
              <ExecutiveKPICards filters={filters} />
            </div>
          </ErrorBoundary>

          {/* Alerts Panel */}
          <ErrorBoundary fallbackTitle="Erro ao carregar alertas" fallbackMessage="Não foi possível carregar os alertas de qualidade">
            <AlertsPanel filters={filters} />
          </ErrorBoundary>

          {/* Funnel Visualization */}
          <ErrorBoundary fallbackTitle="Erro ao carregar funil" fallbackMessage="Não foi possível carregar o funil de conversão">
            {filters.flowId ? (
              <FunnelChart flowId={filters.flowId} filters={filters} />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Funil de Conversão</CardTitle>
                  <CardDescription>
                    Selecione um flow nos filtros globais para visualizar o funil
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[200px] flex items-center justify-center bg-muted/20 rounded-lg border-2 border-dashed">
                    <p className="text-sm text-muted-foreground">
                      Selecione um flow para ver a progressão de usuários
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </ErrorBoundary>

          {/* Placeholder for future charts */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tendências Temporais</CardTitle>
              <CardDescription>
                Gráficos de tendência serão adicionados em breve
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[200px] flex items-center justify-center bg-muted/20 rounded-lg border-2 border-dashed">
                <p className="text-sm text-muted-foreground">
                  Gráficos de linha e barra em desenvolvimento
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Heatmap Tab */}
        <TabsContent value="heatmap" className="mt-4">
          <ErrorBoundary fallbackTitle="Erro ao carregar heatmap" fallbackMessage="Não foi possível carregar o heatmap de comportamento">
            {filters.flowId ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Heatmap de Comportamento</CardTitle>
                  <CardDescription>
                    Visualização de visitas, abandono e gargalos por nó
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <HeatmapVisualization
                    flowId={filters.flowId}
                    inboxId={inboxId}
                    dateRange={filters.dateRange}
                  />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-12">
                    <Activity className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground">
                      Selecione um flow nos filtros globais para visualizar o heatmap
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </ErrorBoundary>
        </TabsContent>

        {/* Sessions Tab */}
        <TabsContent value="sessions" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-4">
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

                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Buscar por ID de conversa, contato ou flow..."
                    value={sessionSearch}
                    onChange={(e) => setSessionSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingSessions ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : !filteredSessions?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  {sessionSearch ? 'Nenhuma sessão encontrada para a busca' : 'Nenhuma sessão encontrada'}
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]">
                          <Checkbox
                            checked={
                              filteredSessions.filter((s) =>
                                ['ACTIVE', 'WAITING_INPUT'].includes(s.status)
                              ).length > 0 &&
                              selectedSessions.length ===
                                filteredSessions.filter((s) =>
                                  ['ACTIVE', 'WAITING_INPUT'].includes(s.status)
                                ).length
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
                      {filteredSessions.map((session) => (
                        <TableRow key={session.id}>
                          <TableCell>
                            {['ACTIVE', 'WAITING_INPUT'].includes(session.status) && (
                              <Checkbox
                                checked={selectedSessions.includes(session.id)}
                                onCheckedChange={() => toggleSessionSelection(session.id)}
                              />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{session.flowName}</TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">
                              {session.conversationId.slice(0, 12)}...
                            </code>
                          </TableCell>
                          <TableCell>{getStatusBadge(session.status)}</TableCell>
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
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewReplay(session.id)}
                                title="Ver replay"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              {['ACTIVE', 'WAITING_INPUT'].includes(session.status) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleAbortSession(session.id)}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  title="Abortar sessão"
                                >
                                  <XCircle className="w-4 h-4" />
                                </Button>
                              )}
                              {['COMPLETED', 'ERROR'].includes(session.status) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteSession(session.id)}
                                  className="text-gray-600 hover:text-gray-700 hover:bg-gray-50"
                                  title="Excluir sessão"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
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
      </Tabs>

      {/* Session Replay Modal */}
      <SessionReplayModal
        sessionId={replaySessionId}
        open={replayModalOpen}
        onOpenChange={setReplayModalOpen}
      />
    </div>
  );
}

export default FlowAnalyticsDashboard;
