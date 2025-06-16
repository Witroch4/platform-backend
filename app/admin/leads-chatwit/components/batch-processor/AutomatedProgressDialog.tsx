import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Loader2 } from 'lucide-react'

type AutomatedProgressDialogProps = {
  isOpen: boolean
  progress: { current: number; total: number }
  currentStep: string
  currentTask?: string
  leadName?: string
}

export function AutomatedProgressDialog({ 
  isOpen, 
  progress, 
  currentStep, 
  currentTask, 
  leadName 
}: AutomatedProgressDialogProps) {
  const percentage = progress.total > 0 ? (progress.current / progress.total) * 100 : 0

  const getStepTitle = () => {
    switch (currentStep) {
      case 'unifying-pdf':
        return 'Unificando PDFs'
      case 'generating-images':
        return 'Gerando Imagens'
      case 'preliminary-analysis':
        return 'Enviando para Análise Preliminar'
      default:
        return 'Processando...'
    }
  }

  const getProgressText = () => {
    if (leadName) {
      return `${currentTask || getStepTitle()}: ${leadName} (${progress.current + 1} de ${progress.total})`
    }
    return `${currentTask || getStepTitle()}: Lead ${progress.current + 1} de ${progress.total}`
  }

  return (
    <Dialog open={isOpen}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{getStepTitle()}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center gap-4 py-6">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="w-full text-center">
            <p className="text-sm text-muted-foreground mb-2">
              {getProgressText()}
            </p>
            <Progress value={percentage} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              Processamento automático em andamento...
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 