"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Activity, 
  AlertTriangle,
  RefreshCw,
  Download,
  Eye,
  BarChart3
} from "lucide-react";
import { toast } from "sonner";
import { CostBreakdownCharts } from "./cost-breakdown-charts";
import { CostEventsTable } from "./cost-events-table";

interface CostOverview {
  summary: {
    today: {
      total: number;
      events: number;
      change: number;
      currency: string;
    };
    month: {
      total: number;
      events: number;
      change: number;
      currency: string;
    };
  };
  breakdown: {
    byProvider: Array<{
      provider: string;
      cost: number;
      currency: string;
    }>;
    topInboxes: Array<{
      inboxId: string;
      cost: number;
      currency: string;
    }>;
  };
  recentEvents: Array<{
    timestamp: string;
    provider: string;
    product: string;
    cost: number;
    currency: string;
    inboxId?: string;
    intent?: string;
    units: number;
    unit: string;
  }>;
  systemHealth: {
    totalProcessedEvents: number;
    pendingEvents: number;
    processingRate: number;
  };
  lastUpdated: string;
}

export function CostMonitoringDashboard() {
  const [overview, setOverview] = useState<CostOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchOverview = async (showLoading = true) => {
    try {
      if (showLoading) setRefreshing(true);
      
      const response = await fetch('/api/admin/cost-monitoring/overview', {
        cache: 'no-store'
      });
      
      if (!response.ok) {
        throw new Error('Falha ao carregar dados de custos');
      }
      
      const data = await response.json();
      setOverview(data);
    } catch (error: any) {
      console.error('Erro ao carregar overview de custos:', error);
      toast.error('Erro ao carregar dados de custos');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Auto-refresh a cada 30 segundos
  useEffect(() => {
    fetchOverview();
    
    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchOverview(false);
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const formatCurrency = (amount: number, currency = 'USD') => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency === 'USD' ? 'USD' : 'BRL',
      minimumFractionDigits: 4,
      maximumFractionDigits: 6
    }).format(amount);
  };

  const formatChange = (change: number) => {
    const isPositive = change > 0;
    const Icon = isPositive ? TrendingUp : TrendingDown;
    const color = isPositive ? 'text-red-500' : 'text-green-500';
    
    return (
      <div className={`flex items-center gap-1 ${color}`}>
        <Icon className="h-3 w-3" />
        <span className="text-xs font-medium">
          {Math.abs(change).toFixed(1)}%
        </span>
      </div>
    );
  };

  const getProviderColor = (provider: string) => {
    switch (provider) {
      case 'OPENAI':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'META_WHATSAPP':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'INFRA':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getProviderName = (provider: string) => {
    switch (provider) {
      case 'OPENAI':
        return 'OpenAI';
      case 'META_WHATSAPP':
        return 'WhatsApp';
      case 'INFRA':
        return 'Infraestrutura';
      default:
        return provider;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Custos de IA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Carregando dados de custos...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!overview) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Custos de IA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Erro ao carregar dados de custos</p>
            <Button 
              variant="outline" 
              onClick={() => fetchOverview()} 
              className="mt-4"
            >
              Tentar Novamente
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com controles */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Custos de IA
              </CardTitle>
              <CardDescription>
                Monitoramento em tempo real dos custos de integrações de IA
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                <Activity className={`h-4 w-4 mr-1 ${autoRefresh ? 'text-green-500' : 'text-gray-400'}`} />
                Auto-refresh
              </Button>
              <Button
                variant="outline"
                
                onClick={() => fetchOverview()}
                disabled={refreshing}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Métricas principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Custo Hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">
                  {formatCurrency(overview.summary.today.total)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {overview.summary.today.events} eventos
                </div>
              </div>
              {formatChange(overview.summary.today.change)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Custo do Mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">
                  {formatCurrency(overview.summary.month.total)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {overview.summary.month.events} eventos
                </div>
              </div>
              {formatChange(overview.summary.month.change)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Taxa de Processamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">
                  {overview.systemHealth.processingRate.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">
                  {overview.systemHealth.pendingEvents} pendentes
                </div>
              </div>
              <div className={`flex items-center gap-1 ${
                overview.systemHealth.processingRate > 95 ? 'text-green-500' : 
                overview.systemHealth.processingRate > 90 ? 'text-yellow-500' : 'text-red-500'
              }`}>
                <Activity className="h-3 w-3" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Eventos Processados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">
                  {overview.systemHealth.totalProcessedEvents.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">
                  Total histórico
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown por provider e top inboxes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Custos por Provider</CardTitle>
            <CardDescription>Distribuição de custos hoje por serviço</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {overview.breakdown.byProvider.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={getProviderColor(item.provider)}>
                      {getProviderName(item.provider)}
                    </Badge>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">
                      {formatCurrency(item.cost)}
                    </div>
                  </div>
                </div>
              ))}
              {overview.breakdown.byProvider.length === 0 && (
                <div className="text-center py-4 text-muted-foreground">
                  Nenhum custo registrado hoje
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Inboxes</CardTitle>
            <CardDescription>Inboxes com maior custo hoje</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {overview.breakdown.topInboxes.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      #{index + 1}
                    </Badge>
                    <span className="text-sm font-mono">
                      {item.inboxId || 'N/A'}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">
                      {formatCurrency(item.cost)}
                    </div>
                  </div>
                </div>
              ))}
              {overview.breakdown.topInboxes.length === 0 && (
                <div className="text-center py-4 text-muted-foreground">
                  Nenhum custo por inbox hoje
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Eventos recentes */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Eventos Recentes</CardTitle>
              <CardDescription>Últimos 10 eventos de custo processados</CardDescription>
            </div>
            <Button variant="outline" >
              <Eye className="h-4 w-4 mr-1" />
              Ver Todos
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {overview.recentEvents.map((event, index) => (
              <div key={index} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={getProviderColor(event.provider)}>
                    {getProviderName(event.provider)}
                  </Badge>
                  <div>
                    <div className="text-sm font-medium">{event.product}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(event.timestamp).toLocaleString('pt-BR')}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">
                    {formatCurrency(event.cost)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {event.units.toLocaleString()} {event.unit.toLowerCase()}
                  </div>
                </div>
              </div>
            ))}
            {overview.recentEvents.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum evento recente
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Gráficos de breakdown detalhado */}
      <CostBreakdownCharts />

      {/* Tabela de eventos recentes */}
      <CostEventsTable />

      {/* Footer com última atualização */}
      <div className="text-center text-xs text-muted-foreground">
        Última atualização: {new Date(overview.lastUpdated).toLocaleString('pt-BR')}
      </div>
    </div>
  );
}