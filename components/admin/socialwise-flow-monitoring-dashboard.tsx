'use client';

/**
 * SocialWise Flow Monitoring Dashboard Component
 * Real-time performance metrics, alerts, and health status
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  TrendingUp, 
  TrendingDown,
  RefreshCw,
  AlertCircle,
  XCircle
} from 'lucide-react';

interface DashboardMetrics {
  currentLatency: {
    hard: number;
    soft: number;
    low: number;
    router: number;
    overall_p95: number;
  };
  classificationRates: {
    direct_map_rate: number;
    warmup_rate: number;
    vague_rate: number;
    router_rate: number;
  };
  errorRates: {
    timeout_rate: number;
    json_parse_fail_rate: number;
    abort_rate: number;
    overall_error_rate: number;
  };
  healthStatus: {
    embedding_index: 'healthy' | 'degraded' | 'unavailable';
    llm_availability: 'healthy' | 'degraded' | 'unavailable';
    overall_status: 'healthy' | 'degraded' | 'critical';
  };
  qualityMetrics: {
    hard_accuracy: number;
    soft_ctr: number;
    low_valid_topics: number;
    sample_size: number;
  };
  activeAlerts: Array<{
    id: string;
    level: 'info' | 'warning' | 'error' | 'critical';
    component: string;
    message: string;
    timestamp: Date;
  }>;
}

const SLA_THRESHOLDS = {
  HARD_BAND_MAX_MS: 120,
  SOFT_BAND_MAX_MS: 300,
  LOW_BAND_MAX_MS: 200,
  ROUTER_BAND_MAX_MS: 400,
  OVERALL_P95_MAX_MS: 400,
  MAX_ERROR_RATE: 5,
  MAX_TIMEOUT_RATE: 2,
  MAX_ABORT_RATE: 1,
  MIN_HARD_ACCURACY: 90,
  MIN_SOFT_CTR: 35,
  MIN_LOW_VALID_TOPICS: 95,
};

export function SocialWiseFlowMonitoringDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch metrics
  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/socialwise-flow/monitoring');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Falha ao carregar métricas');
      }

      setMetrics(data.data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh effect
  useEffect(() => {
    fetchMetrics();

    if (autoRefresh) {
      const interval = setInterval(fetchMetrics, 30000); // 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  // Get status color and icon
  const getStatusDisplay = (status: 'healthy' | 'degraded' | 'unavailable' | 'critical') => {
    switch (status) {
      case 'healthy':
        return { color: 'bg-green-500', icon: CheckCircle, text: 'Saudável' };
      case 'degraded':
        return { color: 'bg-yellow-500', icon: AlertTriangle, text: 'Degradado' };
      case 'unavailable':
      case 'critical':
        return { color: 'bg-red-500', icon: XCircle, text: 'Crítico' };
      default:
        return { color: 'bg-gray-500', icon: AlertCircle, text: 'Desconhecido' };
    }
  };

  // Get alert level color
  const getAlertLevelColor = (level: string) => {
    switch (level) {
      case 'info': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'error': return 'bg-red-100 text-red-800 border-red-200';
      case 'critical': return 'bg-red-200 text-red-900 border-red-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Check if metric exceeds threshold
  const exceedsThreshold = (value: number, threshold: number, isReverse = false) => {
    return isReverse ? value < threshold : value > threshold;
  };

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Carregando métricas...</span>
      </div>
    );
  }

  if (error && !metrics) {
    return (
      <Alert className="m-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Erro ao carregar dashboard</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
        <Button onClick={fetchMetrics} className="mt-2">
          Tentar novamente
        </Button>
      </Alert>
    );
  }

  if (!metrics) {
    return null;
  }

  const overallStatus = getStatusDisplay(metrics.healthStatus.overall_status);
  const embeddingStatus = getStatusDisplay(metrics.healthStatus.embedding_index);
  const llmStatus = getStatusDisplay(metrics.healthStatus.llm_availability);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">SocialWise Flow - Monitoramento</h1>
          <p className="text-muted-foreground">
            Dashboard de performance e saúde do sistema
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchMetrics}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <Activity className="h-4 w-4 mr-2" />
            Auto-refresh
          </Button>
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status Geral</CardTitle>
            <overallStatus.icon className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${overallStatus.color}`} />
              <span className="text-2xl font-bold">{overallStatus.text}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Índice de Embeddings</CardTitle>
            <embeddingStatus.icon className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${embeddingStatus.color}`} />
              <span className="text-2xl font-bold">{embeddingStatus.text}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Disponibilidade LLM</CardTitle>
            <llmStatus.icon className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${llmStatus.color}`} />
              <span className="text-2xl font-bold">{llmStatus.text}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Alerts */}
      {metrics.activeAlerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2 text-yellow-500" />
              Alertas Ativos ({metrics.activeAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {metrics.activeAlerts.slice(0, 5).map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3 rounded-lg border ${getAlertLevelColor(alert.level)}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <Badge variant="outline" className="mb-1">
                        {alert.component}
                      </Badge>
                      <p className="text-sm font-medium">{alert.message}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(alert.timestamp).toLocaleTimeString('pt-BR')}
                    </span>
                  </div>
                </div>
              ))}
              {metrics.activeAlerts.length > 5 && (
                <p className="text-sm text-muted-foreground text-center">
                  +{metrics.activeAlerts.length - 5} alertas adicionais
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metrics Tabs */}
      <Tabs defaultValue="performance" className="space-y-4">
        <TabsList>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="classification">Classificação</TabsTrigger>
          <TabsTrigger value="errors">Erros</TabsTrigger>
          <TabsTrigger value="quality">Qualidade</TabsTrigger>
        </TabsList>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">HARD Band</CardTitle>
                <CardDescription>≥0.80 score</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {metrics.currentLatency.hard}ms
                </div>
                <Progress 
                  value={(metrics.currentLatency.hard / SLA_THRESHOLDS.HARD_BAND_MAX_MS) * 100} 
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  SLA: {SLA_THRESHOLDS.HARD_BAND_MAX_MS}ms
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">SOFT Band</CardTitle>
                <CardDescription>0.65-0.79 score</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {metrics.currentLatency.soft}ms
                </div>
                <Progress 
                  value={(metrics.currentLatency.soft / SLA_THRESHOLDS.SOFT_BAND_MAX_MS) * 100} 
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  SLA: {SLA_THRESHOLDS.SOFT_BAND_MAX_MS}ms
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">LOW Band</CardTitle>
                <CardDescription>&lt;0.65 score</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {metrics.currentLatency.low}ms
                </div>
                <Progress 
                  value={(metrics.currentLatency.low / SLA_THRESHOLDS.LOW_BAND_MAX_MS) * 100} 
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  SLA: {SLA_THRESHOLDS.LOW_BAND_MAX_MS}ms
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">ROUTER Band</CardTitle>
                <CardDescription>embedipreview=false</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {metrics.currentLatency.router}ms
                </div>
                <Progress 
                  value={(metrics.currentLatency.router / SLA_THRESHOLDS.ROUTER_BAND_MAX_MS) * 100} 
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  SLA: {SLA_THRESHOLDS.ROUTER_BAND_MAX_MS}ms
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">P95 Geral</CardTitle>
                <CardDescription>95º percentil</CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${
                  exceedsThreshold(metrics.currentLatency.overall_p95, SLA_THRESHOLDS.OVERALL_P95_MAX_MS) 
                    ? 'text-red-600' : 'text-green-600'
                }`}>
                  {metrics.currentLatency.overall_p95}ms
                </div>
                <Progress 
                  value={(metrics.currentLatency.overall_p95 / SLA_THRESHOLDS.OVERALL_P95_MAX_MS) * 100} 
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  SLA: {SLA_THRESHOLDS.OVERALL_P95_MAX_MS}ms
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Classification Tab */}
        <TabsContent value="classification" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Mapeamento Direto</CardTitle>
                <CardDescription>HARD band (≥0.80)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {metrics.classificationRates.direct_map_rate.toFixed(1)}%
                </div>
                <div className="flex items-center mt-2">
                  <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                  <span className="text-sm text-muted-foreground">
                    Respostas rápidas
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Aquecimento</CardTitle>
                <CardDescription>SOFT band (0.65-0.79)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {metrics.classificationRates.warmup_rate.toFixed(1)}%
                </div>
                <div className="flex items-center mt-2">
                  <Activity className="h-4 w-4 text-blue-500 mr-1" />
                  <span className="text-sm text-muted-foreground">
                    Botões contextuais
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tópicos Vagos</CardTitle>
                <CardDescription>LOW band (&lt;0.65)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">
                  {metrics.classificationRates.vague_rate.toFixed(1)}%
                </div>
                <div className="flex items-center mt-2">
                  <TrendingDown className="h-4 w-4 text-yellow-500 mr-1" />
                  <span className="text-sm text-muted-foreground">
                    Tópicos legais
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Roteamento LLM</CardTitle>
                <CardDescription>ROUTER band</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">
                  {metrics.classificationRates.router_rate.toFixed(1)}%
                </div>
                <div className="flex items-center mt-2">
                  <Activity className="h-4 w-4 text-purple-500 mr-1" />
                  <span className="text-sm text-muted-foreground">
                    Conversacional
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Errors Tab */}
        <TabsContent value="errors" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Taxa de Timeout</CardTitle>
                <CardDescription>Limite de tempo excedido</CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${
                  exceedsThreshold(metrics.errorRates.timeout_rate, SLA_THRESHOLDS.MAX_TIMEOUT_RATE) 
                    ? 'text-red-600' : 'text-green-600'
                }`}>
                  {metrics.errorRates.timeout_rate.toFixed(2)}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  SLA: &lt;{SLA_THRESHOLDS.MAX_TIMEOUT_RATE}%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Falhas de Parse JSON</CardTitle>
                <CardDescription>Respostas LLM inválidas</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {metrics.errorRates.json_parse_fail_rate.toFixed(2)}%
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Taxa de Abort</CardTitle>
                <CardDescription>Operações canceladas</CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${
                  exceedsThreshold(metrics.errorRates.abort_rate, SLA_THRESHOLDS.MAX_ABORT_RATE) 
                    ? 'text-red-600' : 'text-green-600'
                }`}>
                  {metrics.errorRates.abort_rate.toFixed(2)}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  SLA: &lt;{SLA_THRESHOLDS.MAX_ABORT_RATE}%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Taxa de Erro Geral</CardTitle>
                <CardDescription>Todos os tipos de erro</CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${
                  exceedsThreshold(metrics.errorRates.overall_error_rate, SLA_THRESHOLDS.MAX_ERROR_RATE) 
                    ? 'text-red-600' : 'text-green-600'
                }`}>
                  {metrics.errorRates.overall_error_rate.toFixed(2)}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  SLA: &lt;{SLA_THRESHOLDS.MAX_ERROR_RATE}%
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Quality Tab */}
        <TabsContent value="quality" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Precisão HARD</CardTitle>
                <CardDescription>Mapeamento direto correto</CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${
                  exceedsThreshold(metrics.qualityMetrics.hard_accuracy, SLA_THRESHOLDS.MIN_HARD_ACCURACY, true) 
                    ? 'text-red-600' : 'text-green-600'
                }`}>
                  {metrics.qualityMetrics.hard_accuracy.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  SLA: ≥{SLA_THRESHOLDS.MIN_HARD_ACCURACY}%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">CTR SOFT</CardTitle>
                <CardDescription>Taxa de clique em botões</CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${
                  exceedsThreshold(metrics.qualityMetrics.soft_ctr, SLA_THRESHOLDS.MIN_SOFT_CTR, true) 
                    ? 'text-red-600' : 'text-green-600'
                }`}>
                  {metrics.qualityMetrics.soft_ctr.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  SLA: ≥{SLA_THRESHOLDS.MIN_SOFT_CTR}%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tópicos Válidos LOW</CardTitle>
                <CardDescription>Sugestões relevantes</CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${
                  exceedsThreshold(metrics.qualityMetrics.low_valid_topics, SLA_THRESHOLDS.MIN_LOW_VALID_TOPICS, true) 
                    ? 'text-red-600' : 'text-green-600'
                }`}>
                  {metrics.qualityMetrics.low_valid_topics.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  SLA: ≥{SLA_THRESHOLDS.MIN_LOW_VALID_TOPICS}%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tamanho da Amostra</CardTitle>
                <CardDescription>Amostras de qualidade</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {metrics.qualityMetrics.sample_size}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Últimas 24h
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Footer */}
      <div className="text-center text-sm text-muted-foreground">
        {lastUpdated && (
          <p>Última atualização: {lastUpdated.toLocaleString('pt-BR')}</p>
        )}
        {error && (
          <p className="text-red-600 mt-1">Erro: {error}</p>
        )}
      </div>
    </div>
  );
}