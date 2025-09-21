// app/admin/leads-chatwit/components/batch-processor/BatchProcessorTrigger.tsx

'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Bot, PlayCircle } from 'lucide-react'
import { BatchProcessorOrchestrator } from './BatchProcessorOrchestrator'
import { useLeadBatchProcessor } from './useLeadBatchProcessor'
import type { ExtendedLead } from '../../types'
import { toast } from 'sonner'

type BatchProcessorTriggerProps = {
  selectedLeads: ExtendedLead[]
  onUpdate?: () => void
}

export function BatchProcessorTrigger({ selectedLeads, onUpdate }: BatchProcessorTriggerProps) {
  const [showOrchestrator, setShowOrchestrator] = useState(false)
  const batchProcessor = useLeadBatchProcessor(selectedLeads, onUpdate)
  
  console.log('[BatchProcessorTrigger] Renderizando com leads:', selectedLeads.length)
  
  const handleClick = () => {
    console.log('[BatchProcessorTrigger] Botão clicado! Leads selecionados:', selectedLeads.length)
    console.log('[BatchProcessorTrigger] Dados dos leads:', selectedLeads)
    
    if (selectedLeads.length === 0) {
      toast.warning('Nenhum lead selecionado.')
      return
    }
    
    setShowOrchestrator(true)
  }

  const handleClose = () => {
    console.log('[BatchProcessorTrigger] Fechando orquestrador')
    setShowOrchestrator(false)
  }

  console.log('[BatchProcessorTrigger] Estado atual - showOrchestrator:', showOrchestrator)

  return (
    <>
      <div className="flex gap-2">
        <Button 
          disabled={selectedLeads.length === 0}
          onClick={handleClick}
          variant="secondary"
          
          className="flex items-center gap-2"
        >
          <Bot className="mr-2 h-4 w-4" />
          Processar {selectedLeads.length > 0 ? `(${selectedLeads.length})` : ''} em Lote
        </Button>
        
        {batchProcessor.showContinueButton && (
          <Button
            onClick={batchProcessor.continueProcess}
            variant="default"
            
            className="flex items-center gap-2 animate-pulse"
          >
            <PlayCircle className="mr-2 h-4 w-4" />
            Continuar Processo
          </Button>
        )}
      </div>
      
      {showOrchestrator && (
        <BatchProcessorOrchestrator 
          leads={selectedLeads} 
          onClose={handleClose}
          onUpdate={onUpdate}
        />
      )}
    </>
  )
}