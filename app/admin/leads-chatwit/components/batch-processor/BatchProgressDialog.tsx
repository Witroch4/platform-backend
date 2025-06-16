// app/admin/leads-chatwit/components/batch-processor/BatchProgressDialog.tsx

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Loader2 } from 'lucide-react'

type BatchProgressDialogProps = {
  progress: { current: number; total: number }
  title: string
  isSending?: boolean
}

export function BatchProgressDialog({ progress, title, isSending = false }: BatchProgressDialogProps) {
  const percentage = progress.total > 0 ? (progress.current / progress.total) * 100 : 0

  return (
    <Dialog open>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center gap-4 py-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="w-full text-center">
            {isSending ? (
                <p>Aguarde, por favor...</p>
            ) : (
                <p>
                    Processando lead {progress.current + 1} de {progress.total}
                </p>
            )}
            <Progress value={percentage} className="mt-2" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}