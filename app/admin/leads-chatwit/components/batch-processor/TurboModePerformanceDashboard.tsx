/**
 * TURBO Mode Performance Dashboard Component
 * Comprehensive performance indicators and statistics display
 * Based on requirements 4.1, 4.3, 4.6
 */

'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  Zap, 
  Clock, 
  TrendingUp, 
  BarChart3, 
  Activity, 
  Timer,
  CheckCircle2,
  AlertTriangle,
  Users,
  Gauge
} from 'lucide-react'
import { useTurboMode, type TurboModeConfig, type TurboModeMetrics } from './useTurboMode'

interface TurboModePerformanceDashboardProps {
  config: TurboModeConfig
  metrics: TurboModeMetrics
  isActive?: boolean
  className?: string
}

export function TurboModePerformanceDashboard({
  config,
  metrics,
  isActive = false,
  className = ''
}: TurboModePerformanceDashboardProps) {
  const formatTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`
    }
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.round(seconds % 60)
    return `${minutes}m ${remainingSeconds}s`
  }

  const efficiencyGain = metrics.totalLeads > 0 
    ? Math.round((metrics.parallelProcessed / metrics.totalLeads) * 100)
    : 0

  const speedImprovement = metrics.averageProcessingTime > 0 && metrics.timeSaved > 0
    ? Math.round((metrics.timeSaved / (metrics.averageProcessingTime * metrics.totalLeads)) * 100)
    : 0

  const successRate = metrics.totalLeads > 0
    ? Math.round(((metrics.totalLeads - (metrics.errorRate * metrics.totalLeads)) / metrics.totalLeads) * 100)
    : 100

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header with Status */}
      <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              <span className="text-blue-800">TURBO Mode Dashboard</span>
            </div>
            <div className="flex items-center gap-2">
              {isActive && (
                <Badge variant="secondary" className="bg-green-100 text-green-800 animate-pulse">
                  <Activity className="h-3 w-3 mr-1" />
                  Ativo
                </Badge>
              )}
              <Badge variant="outline" className="bg-blue-100 text-blue-800">
                {config.maxParallelLeads}x Paralelo
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Key Performance Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <BarChart3 className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">{metrics.totalLeads}</div>
                <div className="text-xs text-muted-foreground">Total de Leads</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <TrendingUp className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{efficiencyGain}%</div>
                <div className="text-xs text-muted-foreground">Eficiência TURBO</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Clock className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">
                  {formatTime(metrics.timeSaved)}
                </div>
                <div className="text-xs text-muted-foreground">Tempo Economizado</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Gauge className="h-4 w-4 text-orange-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">{successRate}%</div>
                <div className="text-xs text-muted-foreground">Taxa de Sucesso</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Performance Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Processing Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              Distribuição de Processamento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Processamento Paralelo</span>
                <span className="font-semibold text-blue-600">
                  {metrics.parallelProcessed} leads
                </span>
              </div>
              <Progress 
                value={metrics.totalLeads > 0 ? (metrics.parallelProcessed / metrics.totalLeads) * 100 : 0} 
                className="h-2"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Processamento Sequencial</span>
                <span className="font-semibold text-gray-600">
                  {metrics.sequentialProcessed} leads
                </span>
              </div>
              <Progress 
                value={metrics.totalLeads > 0 ? (metrics.sequentialProcessed / metrics.totalLeads) * 100 : 0} 
                className="h-2"
              />
            </div>

            {metrics.errorRate > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Erros</span>
                  <span className="font-semibold text-red-600">
                    {Math.round(metrics.errorRate * metrics.totalLeads)} leads
                  </span>
                </div>
                <Progress 
                  value={metrics.errorRate * 100} 
                  className="h-2"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Performance Insights */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Timer className="h-4 w-4" />
              Insights de Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
              <div>
                <div className="text-sm font-medium text-blue-800">Tempo Médio por Lead</div>
                <div className="text-xs text-blue-600">Processamento TURBO</div>
              </div>
              <div className="text-lg font-bold text-blue-700">
                {formatTime(metrics.averageProcessingTime)}
              </div>
            </div>

            {speedImprovement > 0 && (
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <div>
                  <div className="text-sm font-medium text-green-800">Melhoria de Velocidade</div>
                  <div className="text-xs text-green-600">vs. Processamento Sequencial</div>
                </div>
                <div className="text-lg font-bold text-green-700">
                  {speedImprovement}% mais rápido
                </div>
              </div>
            )}

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <div className="text-sm font-medium text-gray-800">Configuração Atual</div>
                <div className="text-xs text-gray-600">Máximo de leads paralelos</div>
              </div>
              <div className="text-lg font-bold text-gray-700">
                {config.maxParallelLeads} leads
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Indicators */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Status do Sistema
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm">TURBO Mode Ativo</span>
            </div>
            
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${config.fallbackOnError ? 'bg-green-500' : 'bg-gray-400'}`}></div>
              <span className="text-sm">Fallback Automático</span>
            </div>
            
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${metrics.errorRate < 0.1 ? 'bg-green-500' : metrics.errorRate < 0.3 ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
              <span className="text-sm">Taxa de Erro: {Math.round(metrics.errorRate * 100)}%</span>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="text-sm">Sistema Monitorado</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Compact TURBO Mode Performance Summary for smaller spaces
 */
export function TurboModePerformanceSummary({
  metrics,
  config,
  className = ''
}: {
  metrics: TurboModeMetrics
  config: TurboModeConfig
  className?: string
}) {
  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`
    const minutes = Math.floor(seconds / 60)
    return `${minutes}m ${Math.round(seconds % 60)}s`
  }

  const efficiencyGain = metrics.totalLeads > 0 
    ? Math.round((metrics.parallelProcessed / metrics.totalLeads) * 100)
    : 0

  return (
    <Card className={`bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200 ${className}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-blue-600" />
            <span className="font-semibold text-blue-800 text-sm">Performance TURBO</span>
          </div>
          <Badge variant="outline" className="bg-blue-100 text-blue-800 text-xs">
            {config.maxParallelLeads}x
          </Badge>
        </div>
        
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-lg font-bold text-green-600">{efficiencyGain}%</div>
            <div className="text-xs text-muted-foreground">Eficiência</div>
          </div>
          
          <div>
            <div className="text-lg font-bold text-purple-600">
              {formatTime(metrics.timeSaved)}
            </div>
            <div className="text-xs text-muted-foreground">Economizado</div>
          </div>
          
          <div>
            <div className="text-lg font-bold text-blue-600">{metrics.totalLeads}</div>
            <div className="text-xs text-muted-foreground">Leads</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * TURBO Mode Availability Indicator for non-premium users
 */
export function TurboModeAvailabilityIndicator({
  available,
  reason,
  className = ''
}: {
  available: boolean
  reason: string
  className?: string
}) {
  if (available) {
    return null // Don't show if TURBO mode is available
  }

  return (
    <Card className={`border-orange-200 bg-orange-50 ${className}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 rounded-lg">
            <Zap className="h-4 w-4 text-orange-600" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-orange-800 text-sm mb-1">
              TURBO Mode Indisponível
            </div>
            <div className="text-xs text-orange-700">
              {reason}
            </div>
          </div>
          <Badge variant="outline" className="bg-orange-100 text-orange-800 text-xs">
            Premium
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}