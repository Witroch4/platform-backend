'use client';

/**
 * Dashboard de Monitoramento de Produção
 * Interface para visualizar alertas, saúde das conexões e disaster recovery
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Database, 
  Server, 
  Activity,
  RefreshCw,
  Download,
  Play,
  RotateCcw,
  Shield,
  Zap
} from 'lucide-react';

interface InfrastructureAlert {
  id: string;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  component: string;
  message: string;
  timestamp: string;
  resolved: boolean;
  metrics?: Record<string, unknown>;
}

interface ConnectionHealth {
  component: 'PRISMA' | 'REDIS';
  status: 'HEALTHY' | 'DEGRADED' | 'FAILED';
  responseTime: number;
  lastCheck: string;
  errorCount: number;
  uptime: number;
  metadata?: Record<string, unknown>;
}

interface RecoveryProcedure {
  id: string;
  name: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  autoExecute: boolean;
  triggerConditions: string[];
  stepsCount: number;
}

interface RecoveryExecution {
  procedureId: string;
  startedAt: string;
  completedAt?: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ROLLED_BACK';
  steps: Array<{
    stepId: string;
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
    result?: {
      success: boolean;
      message: string;
      duration: number;
    };
  }>;
  error?: string;
}

interface SystemMetricsPayload {
  memory: {
    used: number;
    total: number;
    free: number;
    percentage: number;
    cgroup?: {
      used: number;
      limit: number;
      percentage: number;
    };
  };
  cpu: {
    usage: number;
    perCore: Array<{ id: string; usage: number }>;
    cores: number;
    load1: number;
    load5: number;
    load15: number;
  };
  process: {
    cpu: number;
    memory: {
      rss: number;
      heapUsed: number;
      heapTotal: number;
      external: number;
      arrayBuffers: number;
    };
  };
  uptime: number;
  processUptime: number;
  timestamp: string;
}

interface MonitoringStatus {
  isRunning: boolean;
  activeAlerts: number;
  criticalAlerts: number;
  connectionsHealth: Record<string, string>;
  lastCheck: number;
  uptime: number;
  processUptime: number;
  systemMetrics?: SystemMetricsPayload | null;
}

interface MonitoringStatusPayload {
  monitoring: MonitoringStatus;
  systemMetrics?: SystemMetricsPayload | null;
  alerts?: {
    active: number;
    critical: number;
  };
  connections?: {
    status: Record<string, string>;
  };
  recovery?: {
    proceduresCount: number;
    runningExecutions: number;
  };
  timestamp?: string;
}

interface MonitoringData {
  alerts: {
    activeAlerts: InfrastructureAlert[];
    totalAlerts: number;
    criticalAlerts: number;
    highAlerts: number;
    mediumAlerts: number;
    lowAlerts: number;
  };
  connections: {
    connections: ConnectionHealth[];
    summary: {
      healthy: number;
      degraded: number;
      failed: number;
    };
  };
  recovery: {
    procedures: RecoveryProcedure[];
    recentExecutions: RecoveryExecution[];
    executionStats: {
      total: number;
      running: number;
      completed: number;
      failed: number;
    };
  };
  status: MonitoringStatusPayload;
}

const formatBytes = (bytes?: number) => {
  if (!Number.isFinite(bytes ?? Number.NaN) || (bytes ?? 0) < 0) {
    return '--';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let value = bytes ?? 0;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  const precision = unitIndex === 0 ? 0 : value < 10 ? 2 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
};

const formatPercentageValue = (value?: number) => {
  if (!Number.isFinite(value ?? Number.NaN)) {
    return '--';
  }
  return `${(value as number).toFixed(1)}%`;
};

const clampPercentage = (value?: number) => {
  if (!Number.isFinite(value ?? Number.NaN)) return 0;
  return Math.max(0, Math.min(value as number, 100));
};

const formatSecondsToHuman = (seconds?: number) => {
  if (!Number.isFinite(seconds ?? Number.NaN) || (seconds ?? 0) < 0) {
    return '--';
  }
  const total = Math.floor(seconds ?? 0);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${Math.max(minutes, 0)}m`;
};

export default function ProductionMonitoringDashboard() {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [refreshing, setRefreshing] = useState(false);

  // Carregar dados iniciais
  useEffect(() => {
    loadData();
    
    // Auto-refresh a cada 30 segundos
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setError(null);
      
      // Carregar todos os componentes em paralelo
      const [alertsRes, connectionsRes, recoveryRes, statusRes] = await Promise.all([
        fetch('/api/admin/queue-management/production-monitoring?component=alerts'),
        fetch('/api/admin/queue-management/production-monitoring?component=connections'),
        fetch('/api/admin/queue-management/production-monitoring?component=recovery'),
        fetch('/api/admin/queue-management/production-monitoring?component=status'),
      ]);

      if (!alertsRes.ok || !connectionsRes.ok || !recoveryRes.ok || !statusRes.ok) {
        throw new Error('Erro ao carregar dados de monitoramento');
      }

      const [alerts, connections, recovery, status] = await Promise.all([
        alertsRes.json(),
        connectionsRes.json(),
        recoveryRes.json(),
        statusRes.json(),
      ]);

      setData({
        alerts: alerts.data,
        connections: connections.data,
        recovery: recovery.data,
        status: status.data,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleResolveAlert = async (alertId: string) => {
    try {
      const response = await fetch('/api/admin/queue-management/production-monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resolve_alert',
          data: { alertId },
        }),
      });

      if (response.ok) {
        loadData(); // Recarregar dados
      }
    } catch (err) {
      console.error('Erro ao resolver alerta:', err);
    }
  };

  const handleExecuteRecovery = async (procedureId: string) => {
    try {
      const response = await fetch('/api/admin/queue-management/production-monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'execute_recovery',
          data: { procedureId },
        }),
      });

      if (response.ok) {
        loadData(); // Recarregar dados
      }
    } catch (err) {
      console.error('Erro ao executar procedimento:', err);
    }
  };

  const handleForceBackup = async () => {
    try {
      const response = await fetch('/api/admin/queue-management/production-monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'force_backup',
          data: {},
        }),
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Backup executado: ${result.message}`);
      }
    } catch (err) {
      console.error('Erro ao executar backup:', err);
    }
  };

  const getSeverityColor = (
    severity: string,
  ): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (severity) {
      case 'CRITICAL':
      case 'HIGH':
        return 'destructive';
      case 'MEDIUM':
        return 'default';
      default:
        return 'secondary';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'HEALTHY': return 'text-green-600';
      case 'DEGRADED': return 'text-yellow-600';
      case 'FAILED': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'HEALTHY': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'DEGRADED': return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'FAILED': return <XCircle className="h-4 w-4 text-red-600" />;
      default: return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Carregando monitoramento...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Erro</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data) return null;

  const monitoringStatus = data.status.monitoring;
  const systemMetrics = monitoringStatus.systemMetrics ?? data.status.systemMetrics ?? null;
  const effectiveMemoryPercentage = systemMetrics
    ? systemMetrics.memory.cgroup?.percentage ?? systemMetrics.memory.percentage
    : 0;
  const memoryUsedBytes = systemMetrics
    ? systemMetrics.memory.cgroup?.used ?? systemMetrics.memory.used
    : 0;
  const memoryTotalBytes = systemMetrics
    ? systemMetrics.memory.cgroup?.limit ?? systemMetrics.memory.total
    : 0;
  const memoryFreeBytes = systemMetrics?.memory.free ?? 0;
  const perCoreUsage = systemMetrics?.cpu.perCore ?? [];
  const systemTimestamp = systemMetrics ? new Date(systemMetrics.timestamp) : null;
  const lastCheckDate = monitoringStatus.lastCheck ? new Date(monitoringStatus.lastCheck) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Monitoramento de Produção</h1>
          <p className="text-muted-foreground">
            Alertas de infraestrutura, saúde das conexões e disaster recovery
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleForceBackup} variant="outline" >
            <Download className="h-4 w-4 mr-2" />
            Backup Manual
          </Button>
          <Button 
            onClick={handleRefresh} 
            variant="outline" 
            
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status Geral</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {monitoringStatus.isRunning ? 'Ativo' : 'Inativo'}
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>Host: {formatSecondsToHuman(monitoringStatus.uptime)}</p>
              <p>Processo: {formatSecondsToHuman(monitoringStatus.processUptime)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alertas Ativos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {data.alerts.totalAlerts}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.alerts.criticalAlerts} críticos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conexões</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {data.connections.summary.healthy}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.connections.summary.failed} com falha
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recovery</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.recovery.procedures.length}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.recovery.executionStats.running} executando
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList >
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="alerts">Alertas</TabsTrigger>
          <TabsTrigger value="connections">Conexões</TabsTrigger>
          <TabsTrigger value="recovery">Disaster Recovery</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Alertas Críticos */}
            <Card>
              <CardHeader>
                <CardTitle>Alertas Críticos</CardTitle>
                <CardDescription>Alertas que requerem atenção imediata</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.alerts.activeAlerts
                    .filter(alert => alert.severity === 'CRITICAL')
                    .slice(0, 5)
                    .map(alert => (
                      <div key={alert.id} className="flex items-center justify-between p-2 border rounded">
                        <div className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-red-600" />
                          <span className="text-sm">{alert.message}</span>
                        </div>
                        <Button 
                           
                          variant="outline"
                          onClick={() => handleResolveAlert(alert.id)}
                        >
                          Resolver
                        </Button>
                      </div>
                    ))}
                  {data.alerts.activeAlerts.filter(a => a.severity === 'CRITICAL').length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhum alerta crítico</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Status das Conexões */}
            <Card>
              <CardHeader>
                <CardTitle>Status das Conexões</CardTitle>
                <CardDescription>Saúde das conexões singleton</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.connections.connections.map(conn => (
                    <div key={conn.component} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {conn.component === 'PRISMA' ? (
                          <Database className="h-4 w-4" />
                        ) : (
                          <Server className="h-4 w-4" />
                        )}
                        <span className="font-medium">{conn.component}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(conn.status)}
                        <span className={`text-sm ${getStatusColor(conn.status)}`}>
                          {conn.status}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {conn.responseTime}ms
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  Último health check: {lastCheckDate ? lastCheckDate.toLocaleString() : '--'}
                </p>
              </CardContent>
            </Card>

            {systemMetrics && (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Recursos do Host</CardTitle>
                  <CardDescription>
                    Utilização do ambiente que executa o monitoramento e workers.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm font-medium">
                        <span>CPU do host ({systemMetrics.cpu.cores} núcleos)</span>
                        <span>{formatPercentageValue(systemMetrics.cpu.usage)}</span>
                      </div>
                      <Progress value={clampPercentage(systemMetrics.cpu.usage)} className="h-2" />
                      <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                        <span>Load 1m: {systemMetrics.cpu.load1.toFixed(2)}</span>
                        <span>5m: {systemMetrics.cpu.load5.toFixed(2)}</span>
                        <span>15m: {systemMetrics.cpu.load15.toFixed(2)}</span>
                      </div>
                      {perCoreUsage.length > 0 && (
                        <div className="flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                          {perCoreUsage.map(({ id, usage }) => (
                            <span
                              key={id}
                              className="rounded-full border border-border/60 px-2 py-1"
                            >
                              {id.toUpperCase()}: {formatPercentageValue(usage)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm font-medium">
                        <span>Memória</span>
                        <span>{formatPercentageValue(effectiveMemoryPercentage)}</span>
                      </div>
                      <Progress value={clampPercentage(effectiveMemoryPercentage)} className="h-2" />
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center justify-between">
                          <span>Utilizado</span>
                          <span>{formatBytes(memoryUsedBytes)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Total</span>
                          <span>{formatBytes(memoryTotalBytes)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Livre</span>
                          <span>{formatBytes(memoryFreeBytes)}</span>
                        </div>
                      </div>
                      {systemMetrics.memory.cgroup && (
                        <p className="text-[11px] text-muted-foreground">
                          Limite do container: {formatBytes(systemMetrics.memory.cgroup.limit)}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2 text-xs text-muted-foreground md:col-span-2">
                      <div className="flex items-center justify-between text-sm font-medium text-foreground">
                        <span>Processo Node</span>
                        <span>{formatPercentageValue(systemMetrics.process.cpu)}</span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="flex items-center justify-between">
                          <span>RSS</span>
                          <span>{formatBytes(systemMetrics.process.memory.rss)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Heap usado</span>
                          <span>{formatBytes(systemMetrics.process.memory.heapUsed)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Heap total</span>
                          <span>{formatBytes(systemMetrics.process.memory.heapTotal)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Buffers externos</span>
                          <span>{formatBytes(systemMetrics.process.memory.external + systemMetrics.process.memory.arrayBuffers)}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Uptime do processo</span>
                        <span>{formatSecondsToHuman(systemMetrics.processUptime)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Última leitura: {systemTimestamp ? systemTimestamp.toLocaleString() : '--'}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Alertas de Infraestrutura</CardTitle>
              <CardDescription>Todos os alertas ativos do sistema</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.alerts.activeAlerts.map(alert => (
                  <div key={alert.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={getSeverityColor(alert.severity)}>
                            {alert.severity}
                          </Badge>
                          <Badge variant="outline">{alert.component}</Badge>
                          <Badge variant="outline">{alert.type}</Badge>
                        </div>
                        <p className="text-sm font-medium">{alert.message}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(alert.timestamp).toLocaleString()}
                        </p>
                        {alert.metrics && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-muted-foreground">
                              Ver métricas
                            </summary>
                            <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto">
                              {JSON.stringify(alert.metrics, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                      <Button 
                         
                        variant="outline"
                        onClick={() => handleResolveAlert(alert.id)}
                      >
                        Resolver
                      </Button>
                    </div>
                  </div>
                ))}
                {data.alerts.activeAlerts.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhum alerta ativo
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="connections" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {data.connections.connections.map(conn => (
              <Card key={conn.component}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {conn.component === 'PRISMA' ? (
                      <Database className="h-5 w-5" />
                    ) : (
                      <Server className="h-5 w-5" />
                    )}
                    {conn.component}
                  </CardTitle>
                  <CardDescription>
                    Status: <span className={getStatusColor(conn.status)}>{conn.status}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm">Tempo de Resposta:</span>
                      <span className="text-sm font-mono">{conn.responseTime}ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Erros:</span>
                      <span className="text-sm font-mono">{conn.errorCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Última Verificação:</span>
                      <span className="text-sm font-mono">
                        {new Date(conn.lastCheck).toLocaleTimeString()}
                      </span>
                    </div>
                    {conn.metadata && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground">
                          Ver detalhes
                        </summary>
                        <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto">
                          {JSON.stringify(conn.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="recovery" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Procedimentos Disponíveis */}
            <Card>
              <CardHeader>
                <CardTitle>Procedimentos de Recuperação</CardTitle>
                <CardDescription>Procedimentos automáticos disponíveis</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.recovery.procedures.map(procedure => (
                    <div key={procedure.id} className="border rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{procedure.name}</span>
                            <Badge variant={getSeverityColor(procedure.priority)} className="text-xs">
                              {procedure.priority}
                            </Badge>
                            {procedure.autoExecute && (
                              <Badge variant="secondary" className="text-xs">
                                <Zap className="h-3 w-3 mr-1" />
                                Auto
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {procedure.description}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {procedure.stepsCount} etapas
                          </p>
                        </div>
                        <Button 
                           
                          variant="outline"
                          onClick={() => handleExecuteRecovery(procedure.id)}
                        >
                          <Play className="h-3 w-3 mr-1" />
                          Executar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Execuções Recentes */}
            <Card>
              <CardHeader>
                <CardTitle>Execuções Recentes</CardTitle>
                <CardDescription>Histórico de procedimentos executados</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.recovery.recentExecutions.map((execution) => {
                    const executionKey = `${execution.procedureId}-${execution.startedAt}`;
                    return (
                      <div key={executionKey} className="border rounded-lg p-3">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">
                                {data.recovery.procedures.find(p => p.id === execution.procedureId)?.name}
                            </span>
                            <Badge 
                              variant={
                                execution.status === 'COMPLETED' ? 'default' :
                                execution.status === 'FAILED' ? 'destructive' :
                                execution.status === 'RUNNING' ? 'secondary' : 'outline'
                              }
                              className="text-xs"
                            >
                              {execution.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {new Date(execution.startedAt).toLocaleString()}
                          </p>
                          <div className="text-xs text-muted-foreground">
                            {execution.steps.filter(s => s.status === 'COMPLETED').length} / {execution.steps.length} etapas
                          </div>
                        </div>
                        {execution.status === 'COMPLETED' && (
                          <Button  variant="outline">
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Rollback
                          </Button>
                        )}
                      </div>
                    </div>
                    );
                  })}
                  {data.recovery.recentExecutions.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">
                      Nenhuma execução recente
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
