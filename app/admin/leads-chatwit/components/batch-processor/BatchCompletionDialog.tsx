// app/admin/leads-chatwit/components/batch-processor/BatchCompletionDialog.tsx

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import type { ExtendedLead } from '../../types'

type ProcessingStats = {
  totalLeads: number
  processedLeads: number
  skippedAnalysis: ExtendedLead[]
  completedTasks: {
    pdfUnified: number
    imagesGenerated: number
    manuscriptsProcessed: number
    mirrorsProcessed: number
    analysisCompleted: number
  }
}

type BatchCompletionDialogProps = {
  count: number
  onClose: () => void
  stats?: ProcessingStats
}

export function BatchCompletionDialog({ count, onClose, stats }: BatchCompletionDialogProps) {
  const hasSkippedAnalysis = stats?.skippedAnalysis && stats.skippedAnalysis.length > 0
  
  // Debug para verificar os stats recebidos
  console.log('[BatchCompletionDialog] Stats recebidos:', stats)

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-6 w-6 text-green-600" aria-hidden="true" />
          </div>
          <DialogTitle className="text-center mt-4">Processo Concluído!</DialogTitle>
          <DialogDescription className="text-center">
            O processamento em lote dos {count} leads foi finalizado com sucesso!
          </DialogDescription>
        </DialogHeader>

        {stats && (
          <div className="space-y-3 py-4 text-sm">
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="p-2 bg-blue-50 rounded">
                <div className="font-semibold text-blue-700">{stats.completedTasks.analysisCompleted}</div>
                <div className="text-xs text-blue-600">PDFs Unificados</div>
              </div>
              <div className="p-2 bg-green-50 rounded">
                <div className="font-semibold text-green-700">{stats.completedTasks.analysisCompleted}</div>
                <div className="text-xs text-green-600">Imagens Geradas</div>
              </div>
              <div className="p-2 bg-purple-50 rounded">
                <div className="font-semibold text-purple-700">{stats.completedTasks.analysisCompleted}</div>
                <div className="text-xs text-purple-600">Manuscritos</div>
              </div>
              <div className="p-2 bg-orange-50 rounded">
                <div className="font-semibold text-orange-700">{stats.completedTasks.analysisCompleted}</div>
                <div className="text-xs text-orange-600">Espelhos</div>
              </div>
            </div>
            
            <div className="p-2 bg-indigo-50 rounded text-center">
              <div className="font-semibold text-indigo-700">{stats.completedTasks.analysisCompleted}</div>
              <div className="text-xs text-indigo-600">Análises Preliminares</div>
            </div>

            {hasSkippedAnalysis && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm font-medium text-yellow-800">Atenção</span>
                </div>
                <p className="text-xs text-yellow-700">
                  {stats.skippedAnalysis.length} leads não puderam ter análise preliminar executada. 
                  É necessário processar o manuscrito e/ou espelho desses leads primeiro.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="sm:justify-center">
          <Button type="button" onClick={onClose}>
            Entendido, continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}