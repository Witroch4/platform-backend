'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Bot,
  Brain,
  CheckCircle,
  Clock,
  Cpu,
  FileText,
  LineChart,
  Pause,
  RefreshCw,
  Server,
  Shield,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
} from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ChartConfig } from '@/components/ui/chart';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

// --- Types -----------------------------------------------------------------------------------------------------------------
type DashboardAlert = {
  type?: string;
  severity?: string;
  title?: string;
  message?: string;
  timestamp?: string;
};

type DashboardResponse = {
  timestamp: string;
  timeRange: '1h' | '24h' | '7d' | '30d';
  systemOverview?: {
    status?: string;
    healthScore?: number;
    uptime?: number;
    version?: string;
    environment?: string;
    components?: Record<string, string>;
  };
  performance?: {
    current?: {
      workerProcessingTime?: number;
      webhookResponseTime?: number;
      databaseQueryTime?: number;
      cacheHitRate?: number;
      errorRate?: number;
    };
  };
  alerts?: DashboardAlert[];
};

type QueuePerformance = {
  queueName: string;
  throughput: {
    jobsPerMinute: number;
    jobsPerHour: number;
  };
  averageProcessingTime: number;
  averageWaitTime: number;
  successRate: number;
  errorRate: number;
  retryRate: number;
  timestamp: string;
};

type QueueHealth = {
  queueName: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
  timestamp: string;
};

type QueueOverviewItem = {
  name: string;
  health: QueueHealth;
  performance: QueuePerformance | null;
};

type QueuesResponse = {
  overview: {
    totalQueues: number;
    totalJobs: number;
    activeJobs: number;
    failedJobs: number;
  };
  queues: QueueOverviewItem[];
  timeWindow: string;
  timestamp: string;
};

type QueueManagementStatus = {
  name: string;
  status: 'healthy' | 'warning' | 'critical' | 'active' | 'paused' | 'error';
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  throughput?: number;
  avgProcessingTime?: number;
  errorRate?: number;
};

type QueueDisplay = {
  name: string;
  status: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
  performance: QueuePerformance | null;
  throughput?: number;
  avgProcessingTime?: number;
  errorRate?: number;
};

type InstagramSummary = {
  success: boolean;
  data?: {
    performance?: {
      translations?: {
        total?: number;
        successRate?: number;
        failed?: number;
      };
      worker?: {
        avgProcessingTime?: number;
      };
      queue?: {
        waiting?: number;
        failed?: number;
      };
    };
    timeWindow?: string;
    timestamp?: string;
  };
};

type CostOverview = {
  summary?: {
    today?: {
      usd: number;
      brl: number;
      events: number;
      change: number;
    };
    month?: {
      usd: number;
      brl: number;
      events: number;
      change: number;
    };
  };
  systemHealth?: {
    totalProcessedEvents: number;
    pendingEvents: number;
    processingRate: number;
  };
  lastUpdated?: string;
};

type QueueFilter = 'all' | 'healthy' | 'warning' | 'critical' | 'paused';
type ChartMetric = 'waiting' | 'active' | 'failed' | 'throughput';

// --- Helpers ----------------------------------------------------------------------------------------------------------------
const numberFormatter = new Intl.NumberFormat('pt-BR');
const percentageFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  maximumFractionDigits: 1,
});
const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});
const currencyBRLFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 2,
});

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Failed to fetch ${url}`);
  }
  return (await response.json()) as T;
};

const formatUptime = (seconds?: number) => {
  if (seconds === undefined) return '--';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
};

const formatDuration = (ms?: number) => {
  if (ms === undefined) return '--';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${Math.round(remaining)}s`;
};

const formatPercent = (value?: number) => {
  if (value === undefined || Number.isNaN(value)) return '--';
  return percentageFormatter.format(value / 100);
};

const componentStatusBadge: Record<string, string> = {
  HEALTHY: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
  WARNING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  DEGRADED: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  CRITICAL: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  LIMITED: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300',
};

const queueStatusStyles = {
  healthy: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  paused: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
} as const;

const navigationSections = [
  {
    title: 'Filas BullMQ',
    description: 'Ferramentas para acompanhar saúde, auditoria e produção das filas.',
    links: [
      {
        href: '/admin/monitoring/queue-management',
        label: 'Visão Geral das Filas',
        description: 'Status em tempo real, ações de pausa e limpeza.',
        Icon: Activity,
      },
      {
        href: '/admin/monitoring/queue-management/audit-logs',
        label: 'Logs de Auditoria',
        description: 'Histórico detalhado das operações nas filas.',
        Icon: FileText,
      },
      {
        href: '/admin/monitoring/queue-management/production-monitoring',
        label: 'Monitoramento de Produção',
        description: 'Recursos focados em filas críticas e SLAs.',
        Icon: Shield,
      },
    ],
  },
  {
    title: 'Integração de IA',
    description: 'Controle das filas e intents que alimentam experiências com IA.',
    links: [
      {
        href: '/admin/monitoring/ai-integration/queues',
        label: 'Filas de IA',
        description: 'Mensagens, DLQ e inspeção de jobs de IA.',
        Icon: Brain,
      },
      {
        href: '/admin/monitoring/ai-integration/intents',
        label: 'Gestão de Intents',
        description: 'Cadastro, teste e analytics dos intents.',
        Icon: Bot,
      },
    ],
  },
  {
    title: 'Analytics & Custos',
    description: 'Indicadores avançados e monitoramento de custos de execução.',
    links: [
      {
        href: '/admin/monitoring/analytics',
        label: 'Analytics das Filas',
        description: 'Tendências e exportação de métricas históricas.',
        Icon: LineChart,
      },
      {
        href: '/admin',
        label: 'Dashboard Administrativo',
        description: 'Resumo financeiro, custos e integrações.',
        Icon: BarChart3,
      },
    ],
  },
];

const timeRangeOptions: Array<{ value: '1h' | '24h' | '7d' | '30d'; label: string }> = [
  { value: '1h', label: '1H' },
  { value: '24h', label: '24H' },
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
];

const chartMetricOptions: Array<{ value: ChartMetric; label: string }> = [
  { value: 'waiting', label: 'Jobs aguardando' },
  { value: 'active', label: 'Jobs ativos' },
  { value: 'failed', label: 'Jobs com falha' },
  { value: 'throughput', label: 'Throughput (jobs/min)' },
];

const queueFilterOptions: Array<{ value: QueueFilter; label: string }> = [
  { value: 'all', label: 'Resumo' },
  { value: 'healthy', label: 'Saudáveis' },
  { value: 'warning', label: 'Atenção' },
  { value: 'critical', label: 'Críticas' },
  { value: 'paused', label: 'Pausadas' },
];

// --- Component --------------------------------------------------------------------------------------------------------------
export default function MonitoringLandingPage() {
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const [chartMetric, setChartMetric] = useState<ChartMetric>('waiting');
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const queueWindowMinutes = useMemo(() => {
    switch (timeRange) {
      case '1h':
        return 60;
      case '7d':
        return 7 * 24 * 60;
      case '30d':
        return 30 * 24 * 60;
      default:
        return 24 * 60;
    }
  }, [timeRange]);

  const {
    data: dashboardData,
    error: dashboardError,
    isLoading: dashboardLoading,
    mutate: refreshDashboard,
  } = useSWR<DashboardResponse>(
    `/api/admin/monitoring/dashboard?timeRange=${timeRange}`,
    fetcher,
    {
      refreshInterval: 60_000,
      revalidateOnFocus: false,
    },
  );

  const {
    data: queueMonitoringData,
    error: queueMonitoringError,
    isLoading: queueMonitoringLoading,
    mutate: refreshQueueMonitoring,
  } = useSWR<QueuesResponse>(
    `/api/admin/monitoring/queues?timeWindow=${queueWindowMinutes}`,
    fetcher,
    {
      refreshInterval: 15_000,
      revalidateOnFocus: false,
    },
  );

  const {
    data: queueManagementData,
    error: queueManagementError,
    isLoading: queueManagementLoading,
    mutate: refreshQueueManagement,
  } = useSWR<QueueManagementStatus[]>(
    '/api/admin/queue-management/queues',
    fetcher,
    {
      refreshInterval: 15_000,
      revalidateOnFocus: false,
    },
  );

  const {
    data: instagramData,
    error: instagramError,
    isLoading: instagramLoading,
    mutate: refreshInstagram,
  } = useSWR<InstagramSummary>(
    `/api/admin/monitoring/instagram-translation?action=summary&timeWindow=${Math.max(queueWindowMinutes, 60)}`,
    fetcher,
    {
      refreshInterval: 60_000,
      revalidateOnFocus: false,
    },
  );

  const {
    data: costData,
    error: costError,
    isLoading: costLoading,
    mutate: refreshCost,
  } = useSWR<CostOverview>('/api/admin/cost-monitoring/overview', fetcher, {
    refreshInterval: 5 * 60_000,
    revalidateOnFocus: false,
  });

  const queuePerformanceMap = useMemo(() => {
    if (!queueMonitoringData?.queues?.length) return new Map<string, QueueOverviewItem>();
    return new Map(queueMonitoringData.queues.map((queue) => [queue.name, queue]));
  }, [queueMonitoringData]);

  const displayQueues = useMemo<QueueDisplay[]>(() => {
    const baseQueues = queueManagementData ?? [];

    if (baseQueues.length === 0 && queueMonitoringData?.queues?.length) {
      return queueMonitoringData.queues.map((queue) => ({
        name: queue.name,
        status: 'healthy',
        waiting: queue.health.waiting,
        active: queue.health.active,
        completed: queue.health.completed,
        failed: queue.health.failed,
        delayed: queue.health.delayed,
        paused: queue.health.paused,
        performance: queue.performance,
        throughput: queue.performance?.throughput.jobsPerMinute,
        avgProcessingTime: queue.performance?.averageProcessingTime,
        errorRate: queue.performance?.errorRate,
      }));
    }

    return baseQueues.map((queue) => {
      const perf = queuePerformanceMap.get(queue.name);
      return {
        name: queue.name,
        status: queue.status,
        waiting: queue.waiting,
        active: queue.active,
        completed: queue.completed,
        failed: queue.failed,
        delayed: queue.delayed,
        paused: queue.status === 'paused',
        performance: perf?.performance ?? null,
        throughput: perf?.performance?.throughput.jobsPerMinute ?? queue.throughput,
        avgProcessingTime: perf?.performance?.averageProcessingTime ?? queue.avgProcessingTime,
        errorRate: perf?.performance?.errorRate ?? queue.errorRate,
      } satisfies QueueDisplay;
    });
  }, [queueManagementData, queueMonitoringData, queuePerformanceMap]);

  const queueAggregates = useMemo(() => {
    return displayQueues.reduce(
      (acc, queue) => ({
        waiting: acc.waiting + queue.waiting,
        active: acc.active + queue.active,
        completed: acc.completed + queue.completed,
        failed: acc.failed + queue.failed,
        delayed: acc.delayed + queue.delayed,
      }),
      { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
    );
  }, [displayQueues]);

  const sortedQueues = useMemo(() => {
    return [...displayQueues].sort((a, b) => b.waiting - a.waiting);
  }, [displayQueues]);

  const getFilteredQueues = (filter: QueueFilter) => {
    switch (filter) {
      case 'healthy':
        return sortedQueues.filter((queue) => (queue.paused ? false : queue.status === 'healthy' || queue.status === 'active'));
      case 'warning':
        return sortedQueues.filter((queue) => queue.status === 'warning');
      case 'critical':
        return sortedQueues.filter((queue) => queue.status === 'critical' || queue.status === 'error' || queue.failed > 0);
      case 'paused':
        return sortedQueues.filter((queue) => queue.paused || queue.status === 'paused');
      default:
        return sortedQueues;
    }
  };

  const chartData = useMemo(() => {
    return sortedQueues.map((queue) => ({
      queue: queue.name,
      waiting: queue.waiting,
      active: queue.active,
      failed: queue.failed,
      throughput: queue.performance?.throughput.jobsPerMinute ?? queue.throughput ?? 0,
    }));
  }, [sortedQueues]);

  const systemStatus = (dashboardData?.systemOverview?.status || 'UNKNOWN').toUpperCase();
  const systemBadgeClass = componentStatusBadge[systemStatus] || componentStatusBadge.HEALTHY;
  const systemHealthScore = dashboardData?.systemOverview?.healthScore ?? 0;
  const systemUptime = formatUptime(dashboardData?.systemOverview?.uptime);

  const instagramSummary = instagramData?.data;
  const instagramPerformance = instagramSummary?.performance;
  const instagramTotal = instagramPerformance?.translations?.total ?? 0;
  const instagramSuccessRate = instagramPerformance?.translations?.successRate ?? 0;
  const instagramWaiting = instagramPerformance?.queue?.waiting ?? 0;
  const instagramFailed = instagramPerformance?.translations?.failed ?? instagramPerformance?.queue?.failed ?? 0;
  const instagramAvgTime = instagramPerformance?.worker?.avgProcessingTime;

  const costSummaryToday = costData?.summary?.today;
  const costChange = costSummaryToday?.change ?? 0;
  const costChangePositive = costChange >= 0;

  const componentEntries = Object.entries(dashboardData?.systemOverview?.components ?? {});
  const alerts = dashboardData?.alerts ?? [];

  const chartConfig: ChartConfig = {
    waiting: { label: 'Jobs aguardando', color: 'hsl(var(--primary))' },
    active: { label: 'Jobs ativos', color: 'hsl(var(--chart-2))' },
    failed: { label: 'Jobs com falha', color: 'hsl(var(--destructive))' },
    throughput: { label: 'Throughput', color: 'hsl(var(--chart-4))' },
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await Promise.all([
        refreshDashboard(),
        refreshQueueMonitoring(),
        refreshQueueManagement(),
        refreshInstagram(),
        refreshCost(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const hasAnyError = dashboardError || queueMonitoringError || queueManagementError || instagramError || costError;
  const isQueuesLoading = queueManagementLoading && displayQueues.length === 0;
  const filteredQueues = getFilteredQueues(queueFilter);

  return (
    <div className="flex flex-1 flex-col gap-6 pb-10">
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Monitoramento Operacional</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Consolidação das filas BullMQ, integrações de IA e custos em tempo real.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="inline-flex rounded-full border border-border bg-card p-1 shadow-sm">
              {timeRangeOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={timeRange === option.value ? 'default' : 'ghost'}
                  
                  onClick={() => setTimeRange(option.value)}
                  className="px-3"
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              
              className="flex items-center gap-2"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </div>
      </div>

      {hasAnyError && (
        <div className="px-4 lg:px-6">
          <Alert variant="destructive">
            <AlertTitle>Falha ao carregar alguns dados</AlertTitle>
            <AlertDescription>
              {(dashboardError || queueMonitoringError || queueManagementError || instagramError || costError)?.message ||
                'Tente atualizar novamente ou verifique os logs.'}
            </AlertDescription>
          </Alert>
        </div>
      )}

      <section>
        <div className="@xl/main:grid-cols-2 @5xl/main:grid-cols-4 grid grid-cols-1 gap-4 px-4 *:bg-gradient-to-t *:from-primary/5 *:to-card *:shadow-xs dark:*:from-primary/10 lg:px-6">
          <Card className="@container/card" data-slot="card">
            <CardHeader className="relative">
              <CardDescription>Status do Sistema</CardDescription>
              <CardTitle className="@[250px]/card:text-3xl text-2xl font-semibold uppercase tracking-wider">
                {systemStatus}
              </CardTitle>
              <div className="absolute right-4 top-4">
                <Badge variant="outline" className={`flex gap-1 rounded-lg text-xs ${systemBadgeClass}`}>
                  {systemHealthScore.toFixed(1)}%
                </Badge>
              </div>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1 text-sm">
              <div className="text-muted-foreground">Uptime: {systemUptime}</div>
              <div className="text-muted-foreground">
                Versão {dashboardData?.systemOverview?.version ?? '--'} · Ambiente{' '}
                {dashboardData?.systemOverview?.environment ?? '--'}
              </div>
            </CardFooter>
          </Card>

          <Card className="@container/card" data-slot="card">
            <CardHeader className="relative">
              <CardDescription>Filas Monitoradas</CardDescription>
              <CardTitle className="@[250px]/card:text-3xl text-2xl font-semibold tabular-nums">
                {numberFormatter.format(displayQueues.length)}
              </CardTitle>
              <div className="absolute right-4 top-4">
                <Badge variant="outline" className="flex gap-1 rounded-lg text-xs text-amber-700 dark:text-amber-300">
                  Falhas {numberFormatter.format(queueAggregates.failed)}
                </Badge>
              </div>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1 text-sm text-muted-foreground">
              <div>Aguardando: {numberFormatter.format(queueAggregates.waiting)}</div>
              <div>Ativos: {numberFormatter.format(queueAggregates.active)} · Concluídos: {numberFormatter.format(queueAggregates.completed)}</div>
              {queueAggregates.delayed > 0 && (
                <div>Atrasados: {numberFormatter.format(queueAggregates.delayed)}</div>
              )}
            </CardFooter>
          </Card>

          <Card className="@container/card" data-slot="card">
            <CardHeader className="relative">
              <CardDescription>Worker de Tradução Instagram</CardDescription>
              <CardTitle className="@[250px]/card:text-3xl text-2xl font-semibold tabular-nums">
                {numberFormatter.format(instagramTotal)}
              </CardTitle>
              <div className="absolute right-4 top-4">
                <Badge variant="outline" className="flex gap-1 rounded-lg text-xs">
                  Sucesso {formatPercent(instagramSuccessRate)}
                </Badge>
              </div>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1 text-sm text-muted-foreground">
              <div>Fila: {numberFormatter.format(instagramWaiting)} aguardando</div>
              <div>Falhas: {numberFormatter.format(instagramFailed)}</div>
              <div>Tempo médio: {formatDuration(instagramAvgTime)}</div>
            </CardFooter>
          </Card>

          <Card className="@container/card" data-slot="card">
            <CardHeader className="relative">
              <CardDescription>Custos Diários</CardDescription>
              <CardTitle className="@[250px]/card:text-3xl text-2xl font-semibold tabular-nums">
                {currencyFormatter.format(costSummaryToday?.usd ?? 0)}
              </CardTitle>
              <div className="absolute right-4 top-4">
                <Badge
                  variant="outline"
                  className={`flex items-center gap-1 rounded-lg text-xs ${
                    costChangePositive
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {costChangePositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {costChange.toFixed(1)}%
                </Badge>
              </div>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1 text-sm text-muted-foreground">
              <div>BRL: {currencyBRLFormatter.format(costSummaryToday?.brl ?? 0)}</div>
              <div>Eventos: {numberFormatter.format(costSummaryToday?.events ?? 0)}</div>
              <div>
                Processamento OK: {(costData?.systemHealth?.processingRate ?? 0).toFixed(1)}%
              </div>
            </CardFooter>
          </Card>
        </div>
      </section>

      <section className="grid gap-6 px-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:px-6">
        <Card className="@container/card">
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Total de Jobs por Fila</CardTitle>
              <CardDescription className="mt-1">
                Visualize o volume recente por fila monitorada. Atualizado a cada ciclo de coleta.
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <ToggleGroup
                type="single"
                value={chartMetric}
                onValueChange={(value) => value && setChartMetric(value as ChartMetric)}
                className="hidden rounded-full border border-border bg-card p-1 shadow-sm sm:flex"
              >
                {chartMetricOptions.map((option) => (
                  <ToggleGroupItem key={option.value} value={option.value} className="px-4 text-xs">
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <Select value={chartMetric} onValueChange={(value) => setChartMetric(value as ChartMetric)}>
                <SelectTrigger className="w-48 sm:hidden" >
                  <SelectValue placeholder="Selecione a métrica" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {chartMetricOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="rounded-lg text-sm">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-6 pt-0 sm:px-6">
            {queueMonitoringLoading && chartData.length === 0 ? (
              <div className="flex h-64 items-center justify-center">
                <Skeleton className="h-48 w-full" />
              </div>
            ) : chartData.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                Nenhuma fila disponível para gerar o gráfico neste intervalo.
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="aspect-auto h-[300px] w-full">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="fillPrimary" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-waiting, hsl(var(--primary)))" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="var(--color-waiting, hsl(var(--primary)))" stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id="fillSecondary" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-active, hsl(var(--chart-2)))" stopOpacity={0.7} />
                      <stop offset="95%" stopColor="var(--color-active, hsl(var(--chart-2)))" stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id="fillDanger" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-failed, hsl(var(--destructive)))" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="var(--color-failed, hsl(var(--destructive)))" stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id="fillThroughput" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-throughput, hsl(var(--chart-4)))" stopOpacity={0.7} />
                      <stop offset="95%" stopColor="var(--color-throughput, hsl(var(--chart-4)))" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeWidth={0.5} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="queue"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={10}
                    tickFormatter={(value) => value}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        formatter={(value: any) => (
                          <div className="flex w-full items-center justify-between gap-4">
                            <span className="text-muted-foreground">{chartMetricOptions.find((m) => m.value === chartMetric)?.label}</span>
                            <span className="font-semibold">{numberFormatter.format(typeof value === 'string' ? parseFloat(value) || 0 : typeof value === 'number' ? value : 0)}</span>
                          </div>
                        )}
                      />
                    }
                  />
                  <Area
                    dataKey={chartMetric}
                    type="monotone"
                    strokeWidth={2}
                    stroke={
                      chartMetric === 'waiting'
                        ? 'var(--color-waiting, hsl(var(--primary)))'
                        : chartMetric === 'active'
                          ? 'var(--color-active, hsl(var(--chart-2)))'
                          : chartMetric === 'failed'
                            ? 'var(--color-failed, hsl(var(--destructive)))'
                            : 'var(--color-throughput, hsl(var(--chart-4)))'
                    }
                    fill={
                      chartMetric === 'waiting'
                        ? 'url(#fillPrimary)'
                        : chartMetric === 'active'
                          ? 'url(#fillSecondary)'
                          : chartMetric === 'failed'
                            ? 'url(#fillDanger)'
                            : 'url(#fillThroughput)'
                    }
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="@container/card">
          <CardHeader>
            <CardTitle>Componentes do Sistema</CardTitle>
            <CardDescription>
              Status reportado pelos serviços principais e tempos médios de resposta.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboardLoading && componentEntries.length === 0 ? (
              <Skeleton className="h-48 w-full" />
            ) : componentEntries.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Nenhuma informação de componentes disponível.
              </div>
            ) : (
              <div className="space-y-2">
                {componentEntries.map(([component, status]) => {
                  const badgeClass = componentStatusBadge[status] ?? componentStatusBadge.LIMITED;
                  return (
                    <div
                      key={component}
                      className="flex items-center justify-between rounded-xl border border-border/70 bg-card/80 px-3 py-2"
                    >
                      <span className="text-sm font-medium capitalize text-foreground">
                        {component.replace(/-/g, ' ')}
                      </span>
                      <Badge variant="outline" className={`rounded-full px-3 py-1 text-xs ${badgeClass}`}>
                        {status}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
          <CardFooter className="flex-col items-start gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4" /> Tempo worker:{' '}
              {formatDuration(dashboardData?.performance?.current?.workerProcessingTime)}
            </div>
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4" /> Webhook:{' '}
              {formatDuration(dashboardData?.performance?.current?.webhookResponseTime)}
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" /> Banco:{' '}
              {formatDuration(dashboardData?.performance?.current?.databaseQueryTime)}
            </div>
          </CardFooter>
        </Card>
      </section>

      <section className="grid gap-6 px-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:px-6">
        <Card className="@container/card">
          <CardHeader className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Filas em destaque</CardTitle>
                <CardDescription>
                  Ordenado por jobs aguardando. Utilize os filtros para investigar filas específicas.
                </CardDescription>
              </div>
              <Link
                href="/admin/monitoring/queue-management"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary"
              >
                Abrir painel completo
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
            <Tabs
              value={queueFilter}
              onValueChange={(value) => setQueueFilter(value as QueueFilter)}
              className="flex flex-col gap-4"
            >
              <TabsList className="w-full justify-start overflow-x-auto rounded-lg border border-border bg-muted/40 p-1 text-xs">
                {queueFilterOptions.map((option) => (
                  <TabsTrigger key={option.value} value={option.value} className="rounded-md px-4 py-1">
                    {option.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {queueFilterOptions.map((option) => {
                const queues = getFilteredQueues(option.value);
                return (
                  <TabsContent key={option.value} value={option.value} className="mt-0">
                    {isQueuesLoading ? (
                      <Skeleton className="h-64 w-full" />
                    ) : queues.length === 0 ? (
                      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                        Nenhuma fila encontrada para este filtro.
                      </div>
                    ) : (
                      <div className="rounded-xl border border-border/80">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[180px]">Fila</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Aguardando</TableHead>
                              <TableHead className="text-right">Ativos</TableHead>
                              <TableHead className="text-right">Falhas</TableHead>
                              <TableHead className="text-right">Throughput</TableHead>
                              <TableHead className="text-right">Tempo médio</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {queues.slice(0, 12).map((queue) => {
                              const statusKey = (queue.paused ? 'paused' : queue.status) as keyof typeof queueStatusStyles;
                              const statusClass = queueStatusStyles[statusKey] ?? queueStatusStyles.warning;
                              const throughputValue = queue.performance?.throughput.jobsPerMinute ??
                                (typeof queue.throughput === 'number' ? queue.throughput : undefined);
                              const averageTime = queue.performance?.averageProcessingTime ?? queue.avgProcessingTime;
                              const StatusIcon = queue.paused
                                ? Pause
                                : queue.status === 'critical' || queue.status === 'error'
                                  ? XCircle
                                  : queue.status === 'warning'
                                    ? AlertTriangle
                                    : CheckCircle;
                              return (
                                <TableRow key={`${option.value}-${queue.name}`} className="last:border-none">
                                  <TableCell className="font-medium text-foreground">{queue.name}</TableCell>
                                  <TableCell>
                                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${statusClass}`}>
                                      <StatusIcon className="h-3 w-3" />
                                      {queue.paused ? 'Pausada' : queue.status === 'healthy' ? 'Saudável' : queue.status === 'active' ? 'Ativa' : queue.status === 'warning' ? 'Atenção' : 'Crítica'}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    {numberFormatter.format(queue.waiting)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {numberFormatter.format(queue.active)}
                                  </TableCell>
                                  <TableCell className="text-right text-red-600 dark:text-red-400">
                                    {numberFormatter.format(queue.failed)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {throughputValue !== undefined ? `${throughputValue.toFixed(1)} /min` : '--'}
                                  </TableCell>
                                  <TableCell className="text-right">{averageTime !== undefined ? formatDuration(averageTime) : '--'}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>
          </CardHeader>
        </Card>

        <Card className="@container/card">
          <CardHeader>
            <CardTitle>Alertas Recentes</CardTitle>
            <CardDescription>Eventos tratados automaticamente pelo monitoramento.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboardLoading && alerts.length === 0 ? (
              <Skeleton className="h-48 w-full" />
            ) : alerts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Nenhum alerta registrado neste intervalo.
              </div>
            ) : (
              alerts.slice(0, 5).map((alert, index) => (
                <div key={`${alert.title}-${index}`} className="rounded-xl border border-border bg-card/80 p-4 shadow-sm">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">
                      {alert.title || alert.type || 'Alerta'}
                    </span>
                    <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                      {alert.severity ?? 'INFO'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{alert.message}</p>
                  {alert.timestamp && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {new Date(alert.timestamp).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section className="px-4 lg:px-6">
        <Card className="@container/card">
          <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Explorar ecossistema de monitoramento</CardTitle>
              <CardDescription>
                Acesse rapidamente outras ferramentas do sistema para diagnósticos completos.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {navigationSections.flatMap((section) =>
              section.links.map(({ href, label, description, Icon }) => (
                <Link
                  key={`${section.title}-${href}`}
                  href={href}
                  className="group flex h-full flex-col justify-between rounded-2xl border border-border/70 bg-card/80 p-4 transition hover:border-primary hover:shadow-md"
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-primary/10 p-2 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{section.title}</span>
                    <ArrowUpRight className="h-4 w-4 transition group-hover:text-primary" />
                  </div>
                </Link>
              )),
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
