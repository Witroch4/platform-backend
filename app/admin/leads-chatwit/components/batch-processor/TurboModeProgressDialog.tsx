/**
 * TURBO Mode Progress Dialog Component
 * Enhanced progress tracking for parallel processing operations
 * Based on requirements 4.2, 4.3, 4.4
 */

'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { 
  Loader2, 
  Zap, 
  Clock, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2,
  Activity,
  Timer,
  BarChart3
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useTurboMode, type TurboModeConfig, type TurboModeMetrics } from './useTurboMode'

interface ParallelOperation {
  id: string
  leadName: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  startTime?: Date
  endTime?: Date
  error?: string
  progress: number
}

interface TurboModeProgressDialogProps {
  isOpen: boolean
  currentStep: string
  operations: ParallelOperation[]
  config: TurboModeConfig
  metrics?: TurboModeMetrics | null
  estimatedTimeRemaining?: number
  timeSavedEstimate?: number
  onFallbackToSequential?: () => void
  onClose?: () => void
}

export function TurboModeProgressDialog({
  isOpen,
  currentStep,
  operations,
  config,
  metrics,
  estimatedTimeRemaining,
  timeSavedEstimate,
  onFallbackToSequential,
  onClose
}: TurboModeProgressDialogProps) {
  const [elapsedTime, setElapsedTime] = useState(0)
  const [startTime] = useState(Date.now())

  // Update elapsed time every second
  useEffect(() => {
    if (!isOpen) return

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [isOpen, startTime])

  const formatTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}s`
    }
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  const getStepDisplayName = (step: string): string => {
    switch (step) {
      case 'unifying-pdf':
        return 'Unificando PDFs'
      case 'generating-images':
        return 'Gerando Imagens'
      case 'preliminary-analysis':
        return 'Análise Preliminar'
      default:
        return 'Processando'
    }
  }

  const getStatusIcon = (status: ParallelOperation['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-3 w-3 text-gray-400" />
      case 'processing':
        return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
      case 'completed':
        return <CheckCircle2 className="h-3 w-3 text-green-500" />
      case 'error':
        return <AlertTriangle className="h-3 w-3 text-red-500" />
    }
  }

  const getStatusColor = (status: ParallelOperation['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-gray-100 text-gray-600'
      case 'processing':
        return 'bg-blue-100 text-blue-600'
      case 'completed':
        return 'bg-green-100 text-green-600'
      case 'error':
        return 'bg-red-100 text-red-600'
    }
  }

  const completedOperations = operations.filter(op => op.status === 'completed').length
  const errorOperations = operations.filter(op => op.status === 'error').length
  const processingOperations = operations.filter(op => op.status === 'processing').length
  const overallProgress = operations.length > 0 ? (completedOperations / operations.length) * 100 : 0

  const hasErrors = errorOperations > 0
  const errorRate = operations.length > 0 ? (errorOperations / operations.length) * 100 : 0

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              <span>{getStepDisplayName(currentStep)} - TURBO Mode</span>
            </div>
            <Badge variant="secondary" className="bg-blue-100 text-blue-800 ml-auto">
              {config.maxParallelLeads}x Paralelo
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Overall Progress */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-600" />
                <span className="font-medium">Progresso Geral</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {completedOperations}/{operations.length} concluídos
              </span>
            </div>
            <Progress value={overallProgress} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{Math.round(overallProgress)}% concluído</span>
              <span>{processingOperations} processando</span>
            </div>
          </div>

          {/* Time and Performance Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-3">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-blue-500" />
                <div>
                  <div className="text-xs text-muted-foreground">Tempo Decorrido</div>
                  <div className="font-semibold">{formatTime(elapsedTime)}</div>
                </div>
              </div>
            </Card>

            {estimatedTimeRemaining !== undefined && (
              <Card className="p-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <div>
                    <div className="text-xs text-muted-foreground">Tempo Restante</div>
                    <div className="font-semibold">{formatTime(estimatedTimeRemaining)}</div>
                  </div>
                </div>
              </Card>
            )}

            {timeSavedEstimate !== undefined && timeSavedEstimate > 0 && (
              <Card className="p-3 bg-green-50 border-green-200">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  <div>
                    <div className="text-xs text-green-700">Tempo Economizado</div>
                    <div className="font-semibold text-green-800">{formatTime(timeSavedEstimate)}</div>
                  </div>
                </div>
              </Card>
            )}

            {hasErrors && (
              <Card className="p-3 bg-red-50 border-red-200">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <div>
                    <div className="text-xs text-red-700">Taxa de Erro</div>
                    <div className="font-semibold text-red-800">{Math.round(errorRate)}%</div>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Parallel Operations List */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-gray-600" />
              <span className="font-medium">Operações Paralelas</span>
            </div>
            
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {operations.map((operation) => (
                <Card key={operation.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(operation.status)}
                      <div>
                        <div className="font-medium text-sm">{operation.leadName}</div>
                        {operation.error && (
                          <div className="text-xs text-red-600 mt-1">
                            Erro: {operation.error}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${getStatusColor(operation.status)}`}
                      >
                        {operation.status === 'pending' && 'Aguardando'}
                        {operation.status === 'processing' && 'Processando'}
                        {operation.status === 'completed' && 'Concluído'}
                        {operation.status === 'error' && 'Erro'}
                      </Badge>
                      
                      {operation.status === 'processing' && (
                        <div className="w-16">
                          <Progress value={operation.progress} className="h-1" />
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* Error Handling and Fallback */}
          {hasErrors && onFallbackToSequential && (
            <Card className="p-4 bg-yellow-50 border-yellow-200">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium text-yellow-800 mb-1">
                    Erros Detectados no Processamento TURBO
                  </div>
                  <div className="text-sm text-yellow-700 mb-3">
                    {errorOperations} de {operations.length} operações falharam. 
                    O sistema pode continuar com processamento sequencial para as operações com erro.
                  </div>
                  <button
                    onClick={onFallbackToSequential}
                    className="px-3 py-1 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700 transition-colors"
                  >
                    Continuar com Processamento Sequencial
                  </button>
                </div>
              </div>
            </Card>
          )}

          {/* Performance Insights */}
          {metrics && (
            <Card className="p-4 bg-blue-50 border-blue-200">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-blue-600" />
                <span className="font-medium text-blue-800">Insights de Performance</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-blue-700">Processamento Paralelo</div>
                  <div className="font-semibold text-blue-800">
                    {Math.round((metrics.parallelProcessed / metrics.totalLeads) * 100)}% dos leads
                  </div>
                </div>
                
                <div>
                  <div className="text-blue-700">Tempo Médio/Lead</div>
                  <div className="font-semibold text-blue-800">
                    {formatTime(metrics.averageProcessingTime)}
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Simplified TURBO Mode Progress Indicator for smaller spaces
 */
export function TurboModeProgressIndicator({
  operations,
  config,
  className = ''
}: {
  operations: ParallelOperation[]
  config: TurboModeConfig
  className?: string
}) {
  const completedOperations = operations.filter(op => op.status === 'completed').length
  const processingOperations = operations.filter(op => op.status === 'processing').length
  const errorOperations = operations.filter(op => op.status === 'error').length
  const overallProgress = operations.length > 0 ? (completedOperations / operations.length) * 100 : 0

  return (
    <div className={`bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-3 border border-blue-200 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-blue-600" />
          <span className="font-semibold text-blue-800 text-sm">TURBO Mode</span>
        </div>
        <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs">
          {config.maxParallelLeads}x
        </Badge>
      </div>
      
      <Progress value={overallProgress} className="h-2 mb-2" />
      
      <div className="flex justify-between text-xs text-gray-600">
        <span>{completedOperations}/{operations.length} concluídos</span>
        <div className="flex gap-2">
          {processingOperations > 0 && (
            <span className="text-blue-600">{processingOperations} processando</span>
          )}
          {errorOperations > 0 && (
            <span className="text-red-600">{errorOperations} erros</span>
          )}
        </div>
      </div>
    </div>
  )
}