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
  metrics?: Record<string, any>;
}

interface ConnectionHealth {
  component: 'PRISMA' | 'REDIS';
  status: 'HEALTHY' | 'DEGRADED' | 'FAILED';
  responseTime: number;
  lastCheck: string;
  errorCount: number;
  uptime: number;
  metadata?: Record<string, any>;
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
  status: {
    monitoring: {
      isRunning: boolean;
      activeAlerts: number;
      criticalAlerts: number;
      connectionsHealth: Record<string, string>;
      lastCheck: number;
      uptime: number;
    };
  };
}

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

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'destructive';
      case 'HIGH': return 'destructive';
      case 'MEDIUM': return 'default';
      case 'LOW': return 'secondary';
      default: return 'secondary';
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
          <Button onClick={handleForceBackup} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Backup Manual
          </Button>
          <Button 
            onClick={handleRefresh} 
            variant="outline" 
            size="sm"
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
              {data.status.monitoring.isRunning ? 'Ativo' : 'Inativo'}
            </div>
            <p className="text-xs text-muted-foreground">
              Uptime: {Math.floor(data.status.monitoring.uptime / 3600)}h
            </p>
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
        <TabsList>
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
                          size="sm" 
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
              </CardContent>
            </Card>
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
                          <Badge variant={getSeverityColor(alert.severity) as any}>
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
                        size="sm" 
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
                            <Badge variant={getSeverityColor(procedure.priority) as any} className="text-xs">
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
                          size="sm" 
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
                  {data.recovery.recentExecutions.map((execution, index) => (
                    <div key={index} className="border rounded-lg p-3">
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
                          <Button size="sm" variant="outline">
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Rollback
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
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