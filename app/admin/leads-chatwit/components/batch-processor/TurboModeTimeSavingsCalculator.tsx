/**
 * TURBO Mode Time Savings Calculator Component
 * Calculates and displays estimated time savings compared to sequential processing
 * Based on requirements 4.3, 4.6
 */

'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  Clock, 
  TrendingUp, 
  Calculator, 
  Zap,
  ArrowRight,
  Timer
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useTurboMode, type TurboModeConfig } from './useTurboMode'

interface TimeSavingsCalculatorProps {
  leadCount: number
  config: TurboModeConfig
  averageSequentialTime?: number // Average time per lead in sequential mode (seconds)
  currentProgress?: number // Current progress (0-100)
  className?: string
}

export function TurboModeTimeSavingsCalculator({
  leadCount,
  config,
  averageSequentialTime = 120, // Default 2 minutes per lead
  currentProgress = 0,
  className = ''
}: TimeSavingsCalculatorProps) {
  const [realTimeElapsed, setRealTimeElapsed] = useState(0)
  const [startTime] = useState(Date.now())

  // Update real-time elapsed time
  useEffect(() => {
    const interval = setInterval(() => {
      setRealTimeElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [startTime])

  const formatTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}s`
    }
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  const formatTimeDetailed = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds} segundos`
    }
    if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60)
      const remainingSeconds = seconds % 60
      return remainingSeconds > 0 
        ? `${minutes} minutos e ${remainingSeconds} segundos`
        : `${minutes} minutos`
    }
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return minutes > 0 
      ? `${hours} horas e ${minutes} minutos`
      : `${hours} horas`
  }

  // Calculate time estimates
  const sequentialTotalTime = leadCount * averageSequentialTime
  const turboEstimatedTime = Math.ceil(leadCount / config.maxParallelLeads) * averageSequentialTime
  const estimatedTimeSavings = sequentialTotalTime - turboEstimatedTime
  const timeSavingsPercentage = sequentialTotalTime > 0 
    ? Math.round((estimatedTimeSavings / sequentialTotalTime) * 100)
    : 0

  // Real-time calculations based on current progress
  const estimatedRemainingTime = currentProgress > 0 
    ? Math.round((realTimeElapsed / (currentProgress / 100)) - realTimeElapsed)
    : turboEstimatedTime

  const projectedTotalTime = realTimeElapsed + estimatedRemainingTime
  const realTimeSavings = sequentialTotalTime - projectedTotalTime
  const realTimeSavingsPercentage = sequentialTotalTime > 0 
    ? Math.round((realTimeSavings / sequentialTotalTime) * 100)
    : 0

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <Card className="bg-gradient-to-r from-green-50 to-blue-50 border-green-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-green-800">
            <Calculator className="h-5 w-5" />
            <span>Calculadora de Economia de Tempo</span>
            <Badge variant="secondary" className="bg-green-100 text-green-800 ml-auto">
              TURBO {config.maxParallelLeads}x
            </Badge>
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Time Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Sequential Processing */}
        <Card className="border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-gray-700">
              <Timer className="h-4 w-4" />
              Processamento Sequencial
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-700">
                {formatTime(sequentialTotalTime)}
              </div>
              <div className="text-xs text-muted-foreground">
                Tempo total estimado
              </div>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Leads:</span>
                <span className="font-medium">{leadCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Tempo/Lead:</span>
                <span className="font-medium">{formatTime(averageSequentialTime)}</span>
              </div>
              <div className="flex justify-between">
                <span>Processamento:</span>
                <span className="font-medium">1 por vez</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* TURBO Processing */}
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-blue-700">
              <Zap className="h-4 w-4" />
              Processamento TURBO
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-700">
                {currentProgress > 0 ? formatTime(projectedTotalTime) : formatTime(turboEstimatedTime)}
              </div>
              <div className="text-xs text-blue-600">
                {currentProgress > 0 ? 'Tempo projetado' : 'Tempo estimado'}
              </div>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Leads:</span>
                <span className="font-medium">{leadCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Tempo/Lead:</span>
                <span className="font-medium">{formatTime(averageSequentialTime)}</span>
              </div>
              <div className="flex justify-between">
                <span>Processamento:</span>
                <span className="font-medium text-blue-600">{config.maxParallelLeads} paralelos</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Time Savings Highlight */}
      <Card className="bg-gradient-to-r from-green-100 to-emerald-100 border-green-300">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-200 rounded-full">
                <TrendingUp className="h-6 w-6 text-green-700" />
              </div>
              <div>
                <div className="text-lg font-bold text-green-800">
                  {currentProgress > 0 ? formatTime(realTimeSavings) : formatTime(estimatedTimeSavings)}
                </div>
                <div className="text-sm text-green-700">
                  {currentProgress > 0 ? 'Economia projetada' : 'Economia estimada'}
                </div>
              </div>
            </div>
            
            <div className="text-right">
              <div className="text-2xl font-bold text-green-800">
                {currentProgress > 0 ? realTimeSavingsPercentage : timeSavingsPercentage}%
              </div>
              <div className="text-sm text-green-700">mais rápido</div>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-green-200">
            <div className="text-sm text-green-700 text-center">
              <strong>Economia detalhada:</strong> {formatTimeDetailed(currentProgress > 0 ? realTimeSavings : estimatedTimeSavings)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Real-time Progress (only show if processing) */}
      {currentProgress > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Progresso em Tempo Real
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progresso</span>
                <span className="font-medium">{Math.round(currentProgress)}%</span>
              </div>
              <Progress value={currentProgress} className="h-2" />
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Tempo Decorrido</div>
                <div className="font-semibold">{formatTime(realTimeElapsed)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Tempo Restante</div>
                <div className="font-semibold">{formatTime(estimatedRemainingTime)}</div>
              </div>
            </div>
            
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <span>{formatTime(realTimeElapsed)}</span>
              <ArrowRight className="h-3 w-3" />
              <span className="font-medium">{formatTime(projectedTotalTime)}</span>
              <span className="text-green-600 font-medium">
                (economia: {formatTime(realTimeSavings)})
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Efficiency Breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Análise de Eficiência</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
              <span className="text-sm font-medium">Fator de Paralelização</span>
              <span className="font-bold text-blue-600">{config.maxParallelLeads}x</span>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <span className="text-sm font-medium">Melhoria Teórica Máxima</span>
              <span className="font-bold text-green-600">
                {Math.round((1 - (1 / config.maxParallelLeads)) * 100)}%
              </span>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
              <span className="text-sm font-medium">Eficiência Alcançada</span>
              <span className="font-bold text-purple-600">
                {currentProgress > 0 ? realTimeSavingsPercentage : timeSavingsPercentage}%
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Compact Time Savings Display for smaller spaces
 */
export function TurboModeTimeSavingsDisplay({
  timeSaved,
  totalTime,
  className = ''
}: {
  timeSaved: number
  totalTime: number
  className?: string
}) {
  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    return `${minutes}m ${Math.round(seconds % 60)}s`
  }

  const savingsPercentage = totalTime > 0 ? Math.round((timeSaved / totalTime) * 100) : 0

  return (
    <div className={`flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200 ${className}`}>
      <div className="p-2 bg-green-100 rounded-lg">
        <TrendingUp className="h-4 w-4 text-green-600" />
      </div>
      <div className="flex-1">
        <div className="font-semibold text-green-800">{formatTime(timeSaved)} economizados</div>
        <div className="text-xs text-green-600">{savingsPercentage}% mais rápido que sequencial</div>
      </div>
      <Badge variant="secondary" className="bg-green-100 text-green-800">
        <Zap className="h-3 w-3 mr-1" />
        TURBO
      </Badge>
    </div>
  )
}