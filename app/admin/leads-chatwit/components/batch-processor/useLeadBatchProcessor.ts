// app/admin/leads-chatwit/components/batch-processor/useLeadBatchProcessor.ts

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { ExtendedLead } from '../../types'

// Defina os tipos para os dados que você coletará nos diálogos
type ManuscritoData = { selectedImages: string[] }
type EspelhoData = { selectedImages: string[] }

type CollectedData = {
  manuscrito?: ManuscritoData
  espelho?: EspelhoData
}

// Tipos para as filas de processamento
type ProcessingQueue = {
  pdfUnification: ExtendedLead[]
  imageGeneration: ExtendedLead[]
  manuscriptProcessing: ExtendedLead[]
  mirrorProcessing: ExtendedLead[]
  preliminaryAnalysis: ExtendedLead[]
}

type ProcessingStep = 
  | 'idle' 
  | 'analyzing' 
  | 'unifying-pdf' 
  | 'generating-images' 
  | 'manuscript' 
  | 'mirror' 
  | 'preliminary-analysis' 
  | 'done'

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

export const useLeadBatchProcessor = (leads: ExtendedLead[], onUpdate?: () => void) => {
  console.log('[useLeadBatchProcessor] Inicializando hook com leads:', leads.length)
  
  const [isOpen, setIsOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState<ProcessingStep>('idle')
  const [progress, setProgress] = useState({ current: 0, total: leads.length })
  const [collectedData, setCollectedData] = useState<Map<string, CollectedData>>(new Map())
  
  // Novos estados para orquestração inteligente
  const [processingQueues, setProcessingQueues] = useState<ProcessingQueue>({
    pdfUnification: [],
    imageGeneration: [],
    manuscriptProcessing: [],
    mirrorProcessing: [],
    preliminaryAnalysis: []
  })
  const [stats, setStats] = useState<ProcessingStats>({
    totalLeads: leads.length,
    processedLeads: 0,
    skippedAnalysis: [],
    completedTasks: {
      pdfUnified: 0,
      imagesGenerated: 0,
      manuscriptsProcessed: 0,
      mirrorsProcessed: 0,
      analysisCompleted: 0
    }
  })
  const [currentProcessingLead, setCurrentProcessingLead] = useState<ExtendedLead | null>(null)
  const [currentManualLeadIndex, setCurrentManualLeadIndex] = useState(0)
  const [showAutomatedDialog, setShowAutomatedDialog] = useState(false)
  const [showContinueButton, setShowContinueButton] = useState(false)

  const currentLead = processingQueues.manuscriptProcessing[currentManualLeadIndex] || 
                     processingQueues.mirrorProcessing[currentManualLeadIndex]

  const start = () => {
    console.log('[useLeadBatchProcessor] Função start() chamada')
    if (leads.length === 0) {
      console.log('[useLeadBatchProcessor] Nenhum lead selecionado')
      toast.warning('Nenhum lead selecionado.')
      return
    }
    console.log('[useLeadBatchProcessor] Iniciando processo com', leads.length, 'leads')
    
    // Reset dos stats para começar do zero
    const resetStats = {
      totalLeads: leads.length,
      processedLeads: 0,
      skippedAnalysis: [],
      completedTasks: {
        pdfUnified: 0,
        imagesGenerated: 0,
        manuscriptsProcessed: 0,
        mirrorsProcessed: 0,
        analysisCompleted: 0
      }
    }
    console.log('[useLeadBatchProcessor] Resetando stats para:', resetStats)
    setStats(resetStats)
    
    setIsOpen(true)
    setCurrentStep('analyzing')
    setProgress({ current: 0, total: leads.length })
    setCurrentManualLeadIndex(0)
    setShowContinueButton(false)
    analyzeLeadsAndCreateQueues()
  }

  const close = () => {
    console.log('[useLeadBatchProcessor] Fechando processo')
    setIsOpen(false)
    setShowAutomatedDialog(false)
    setShowContinueButton(false)
    // Delay para resetar o estado e permitir animação de saída
    setTimeout(() => {
      setCurrentStep('idle')
      setCollectedData(new Map())
      setCurrentManualLeadIndex(0)
      setProcessingQueues({
        pdfUnification: [],
        imageGeneration: [],
        manuscriptProcessing: [],
        mirrorProcessing: [],
        preliminaryAnalysis: []
      })
    }, 300)
  }

  const continueProcess = () => {
    console.log('[useLeadBatchProcessor] Continuando processo...')
    setShowContinueButton(false)
    
    const temEspelhos = processingQueues.mirrorProcessing.length > 0
    const temAnalises = processingQueues.preliminaryAnalysis.length > 0
    
    if (temEspelhos) {
      setCurrentStep('mirror')
      setProgress({ current: 0, total: processingQueues.mirrorProcessing.length })
      setIsOpen(true)
    } else if (temAnalises) {
      executePreliminaryAnalysis(processingQueues.preliminaryAnalysis)
    }
  }

  // Passo 1: Análise e Enfileiramento
  const analyzeLeadsAndCreateQueues = async () => {
    console.log('[useLeadBatchProcessor] Analisando leads e criando filas...')
    
    const queues: ProcessingQueue = {
      pdfUnification: [],
      imageGeneration: [],
      manuscriptProcessing: [],
      mirrorProcessing: [],
      preliminaryAnalysis: []
    }

    // Análise inteligente: verificar as necessidades de cada lead individualmente
    for (const lead of leads) {
      console.log(`[useLeadBatchProcessor] Analisando lead ${lead.nome}:`, {
        pdfUnificado: !!lead.pdfUnificado,
        imagensConvertidas: !!lead.imagensConvertidas,
        provaManuscrita: !!lead.provaManuscrita,
        textoDOEspelho: !!lead.textoDOEspelho,
        analisePreliminar: !!lead.analisePreliminar
      })

      // Se já tem tudo pronto para análise preliminar, adicionar diretamente
      if (!lead.analisePreliminar && lead.provaManuscrita && lead.textoDOEspelho && lead.imagensConvertidas) {
        queues.preliminaryAnalysis.push(lead)
        console.log(`[useLeadBatchProcessor] ✅ ${lead.nome} já está pronto para análise preliminar`)
        continue // Pular outras verificações para este lead
      }

      // Verificar se precisa unificar PDF
      if (!lead.pdfUnificado) {
        queues.pdfUnification.push(lead)
        console.log(`[useLeadBatchProcessor] ✅ ${lead.nome} precisa unificar PDF`)
      }
      
      // Verificar se precisa gerar imagens
      if (!lead.imagensConvertidas) {
        queues.imageGeneration.push(lead)
        console.log(`[useLeadBatchProcessor] ✅ ${lead.nome} precisa gerar imagens`)
      }
      
      // Verificar se precisa processar prova manuscrita (SÓ se há imagens convertidas)
      if (!lead.provaManuscrita && lead.imagensConvertidas) {
        queues.manuscriptProcessing.push(lead)
        console.log(`[useLeadBatchProcessor] ✅ ${lead.nome} precisa processar manuscrito`)
      }
      
      // Verificar se precisa processar texto do espelho (SÓ se há imagens convertidas)
      if (!lead.textoDOEspelho && lead.imagensConvertidas) {
        queues.mirrorProcessing.push(lead)
        console.log(`[useLeadBatchProcessor] ✅ ${lead.nome} precisa processar espelho`)
      }
    }

    setProcessingQueues(queues)
    
    console.log('[useLeadBatchProcessor] Filas criadas:', {
      pdfUnification: queues.pdfUnification.length,
      imageGeneration: queues.imageGeneration.length,
      manuscriptProcessing: queues.manuscriptProcessing.length,
      mirrorProcessing: queues.mirrorProcessing.length,
      preliminaryAnalysis: queues.preliminaryAnalysis.length
    })

    // Executar análise preliminar primeiro para leads que já estão prontos
    if (queues.preliminaryAnalysis.length > 0) {
      console.log(`[useLeadBatchProcessor] 🚀 Executando análise preliminar para ${queues.preliminaryAnalysis.length} leads que já estão prontos`)
      await executePreliminaryAnalysis(queues.preliminaryAnalysis)
      
      // Remover os leads já processados das outras filas se estiverem duplicados
      const processedLeadIds = queues.preliminaryAnalysis.map(l => l.id)
      queues.manuscriptProcessing = queues.manuscriptProcessing.filter(l => !processedLeadIds.includes(l.id))
      queues.mirrorProcessing = queues.mirrorProcessing.filter(l => !processedLeadIds.includes(l.id))
      setProcessingQueues(queues)
    }

    // Iniciar processamento automático para outros leads
    await executeAutomatedTasks(queues)
  }

  // Passo 2: Execução Automatizada - Unificação de PDF e Geração de Imagens
  const executeAutomatedTasks = async (queues: ProcessingQueue) => {
    console.log('[useLeadBatchProcessor] Iniciando tarefas automatizadas...')
    
    // Unificação de PDFs
    if (queues.pdfUnification.length > 0) {
      setCurrentStep('unifying-pdf')
      setShowAutomatedDialog(true)
      await processUnifyPdfs(queues.pdfUnification)
    }

    // Geração de Imagens (incluindo leads que acabaram de ter PDF unificado)
    const allLeadsNeedingImages = [...queues.imageGeneration, ...queues.pdfUnification]
    if (allLeadsNeedingImages.length > 0) {
      setCurrentStep('generating-images')
      setShowAutomatedDialog(true)
      await processGenerateImages(allLeadsNeedingImages)
    }

    setShowAutomatedDialog(false)

    // Reanalizar leads após geração de imagens para atualizar filas de manuscrito/espelho
    const updatedQueues = await reanalyzeLeadsAfterImageGeneration(queues)

    // Passo 3: Processos Manuais (Manuscrito e Espelho)
    await executeManualTasks(updatedQueues)
  }

  // Função para reanalizar leads após geração de imagens
  const reanalyzeLeadsAfterImageGeneration = async (originalQueues: ProcessingQueue): Promise<ProcessingQueue> => {
    console.log('[useLeadBatchProcessor] Reanalisando leads após geração de imagens...')
    
    // Buscar dados atualizados dos leads do banco
    const updatedQueues: ProcessingQueue = {
      pdfUnification: [],
      imageGeneration: [],
      manuscriptProcessing: [],
      mirrorProcessing: [],
      preliminaryAnalysis: []
    }

    for (const lead of leads) {
      // Verificar se o lead estava nas filas de processamento de imagens/PDF
      const wasInPdfQueue = originalQueues.pdfUnification.some(l => l.id === lead.id)
      const wasInImageQueue = originalQueues.imageGeneration.some(l => l.id === lead.id)
      const hasImagesNow = lead.imagensConvertidas || wasInPdfQueue || wasInImageQueue

      console.log(`[useLeadBatchProcessor] Lead ${lead.nome}: provaManuscrita=${!!lead.provaManuscrita}, hasImagesNow=${hasImagesNow}`)

      // Verificar se precisa processar prova manuscrita (SÓ se há imagens convertidas)
      if (!lead.provaManuscrita && hasImagesNow) {
        updatedQueues.manuscriptProcessing.push(lead)
        console.log(`[useLeadBatchProcessor] ✅ Adicionado à fila de manuscrito: ${lead.nome}`)
      }
      
      // Verificar se precisa processar texto do espelho (SÓ se há imagens convertidas)
      if (!lead.textoDOEspelho && hasImagesNow) {
        updatedQueues.mirrorProcessing.push(lead)
        console.log(`[useLeadBatchProcessor] ✅ Adicionado à fila de espelho: ${lead.nome}`)
      }
      
      // Verificar se pode executar análise preliminar
      if (!lead.analisePreliminar && lead.provaManuscrita && lead.textoDOEspelho) {
        updatedQueues.preliminaryAnalysis.push(lead)
      }
    }

    console.log('[useLeadBatchProcessor] Filas atualizadas após geração de imagens:', {
      manuscriptProcessing: updatedQueues.manuscriptProcessing.length,
      mirrorProcessing: updatedQueues.mirrorProcessing.length,
      preliminaryAnalysis: updatedQueues.preliminaryAnalysis.length
    })

    return updatedQueues
  }

  const processUnifyPdfs = async (leadsToProcess: ExtendedLead[]) => {
    console.log('[useLeadBatchProcessor] Processando unificação de PDFs...')
    
    for (let i = 0; i < leadsToProcess.length; i++) {
      const lead = leadsToProcess[i]
      setCurrentProcessingLead(lead)
      setProgress({ current: i, total: leadsToProcess.length })
      
      try {
        console.log(`[useLeadBatchProcessor] Unificando PDFs para ${lead.nome}`)
        const response = await fetch(`/api/admin/leads-chatwit/unify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId: lead.id }),
        })
        
        if (response.ok) {
          setStats(prev => ({
            ...prev,
            completedTasks: {
              ...prev.completedTasks,
              pdfUnified: prev.completedTasks.pdfUnified + 1
            }
          }))
          
          // Atualizar lista na interface
          if (onUpdate) {
            onUpdate()
          }
        }
      } catch (error) {
        console.error(`[useLeadBatchProcessor] Erro ao unificar PDF para ${lead.nome}:`, error)
        toast.error(`Falha ao unificar PDF para o lead: ${lead.nome}`)
      }
    }
  }

  const processGenerateImages = async (leadsToProcess: ExtendedLead[]) => {
    console.log('[useLeadBatchProcessor] Processando geração de imagens...')
    
    for (let i = 0; i < leadsToProcess.length; i++) {
      const lead = leadsToProcess[i]
      setCurrentProcessingLead(lead)
      setProgress({ current: i, total: leadsToProcess.length })
      
      try {
        console.log(`[useLeadBatchProcessor] Convertendo PDF para imagem para ${lead.nome}`)
        const response = await fetch(`/api/admin/leads-chatwit/convert-to-images`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId: lead.id }),
        })
        
        if (response.ok) {
          // Buscar os dados atualizados do lead para obter as URLs das imagens
          // Pequeno delay para garantir que o banco foi atualizado
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          try {
            let retries = 3
            let updatedLead = null
            
            while (retries > 0 && !updatedLead?.imagensConvertidas) {
              const updatedLeadResponse = await fetch(`/api/admin/leads-chatwit/leads?id=${lead.id}`)
              if (updatedLeadResponse.ok) {
                updatedLead = await updatedLeadResponse.json()
                if (updatedLead.imagensConvertidas && updatedLead.imagensConvertidas !== 'processed') {
                  lead.imagensConvertidas = updatedLead.imagensConvertidas
                  console.log(`[useLeadBatchProcessor] URLs das imagens atualizadas para ${lead.nome}:`, lead.imagensConvertidas)
                  break
                }
              }
              retries--
              if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 2000)) // Aguardar 2s antes de tentar novamente
              }
            }
            
            if (!updatedLead?.imagensConvertidas || updatedLead.imagensConvertidas === 'processed') {
              // Fallback para flag temporária se não conseguir buscar dados atualizados
              lead.imagensConvertidas = "processed"
              console.warn(`[useLeadBatchProcessor] Não foi possível obter URLs atualizadas para ${lead.nome}, usando fallback`)
            }
          } catch (error) {
            console.error(`[useLeadBatchProcessor] Erro ao buscar dados atualizados para ${lead.nome}:`, error)
            lead.imagensConvertidas = "processed"
          }
          
          setStats(prev => ({
            ...prev,
            completedTasks: {
              ...prev.completedTasks,
              imagesGenerated: prev.completedTasks.imagesGenerated + 1
            }
          }))
          console.log(`[useLeadBatchProcessor] Imagens geradas com sucesso para ${lead.nome}`)
          
          // Atualizar lista na interface
          if (onUpdate) {
            onUpdate()
          }
        }
      } catch (error) {
        console.error(`[useLeadBatchProcessor] Erro ao gerar imagens para ${lead.nome}:`, error)
        toast.error(`Falha ao gerar imagens para o lead: ${lead.nome}`)
      }
    }
    
    // Pequeno delay para garantir que o processo seja finalizado
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  // Passo 3: Execução com Intervenção do Usuário
  const executeManualTasks = async (queues: ProcessingQueue) => {
    console.log('[useLeadBatchProcessor] Iniciando tarefas manuais...')
    
    // Primeiro processar manuscritos
    if (queues.manuscriptProcessing.length > 0) {
      setCurrentStep('manuscript')
      setProgress({ current: 0, total: queues.manuscriptProcessing.length })
      return // O usuário vai interagir
    }
    
    // Se não há manuscritos, processar espelhos
    if (queues.mirrorProcessing.length > 0) {
      setCurrentStep('mirror')
      setProgress({ current: 0, total: queues.mirrorProcessing.length })
      return // O usuário vai interagir
    }

    // Se não há tarefas manuais, verificar se há leads prontos para análise preliminar
    console.log('[useLeadBatchProcessor] Verificando leads prontos para análise após tarefas manuais...')
    
    // Buscar leads que agora estão prontos para análise (manuscrito E espelho completos)
    const leadsReadyForAnalysis = leads.filter(lead => 
      !lead.analisePreliminar && 
      lead.provaManuscrita && 
      lead.textoDOEspelho && 
      lead.imagensConvertidas
    )
    
    if (leadsReadyForAnalysis.length > 0) {
      console.log(`[useLeadBatchProcessor] 🎯 Encontrados ${leadsReadyForAnalysis.length} leads prontos para análise:`, leadsReadyForAnalysis.map(l => l.nome))
      await executePreliminaryAnalysis(leadsReadyForAnalysis)
    } else {
      console.log('[useLeadBatchProcessor] Nenhum lead está pronto para análise preliminar')
      finishProcessing()
    }
  }

  // Passo 4: Análise Preliminar
  const executePreliminaryAnalysis = async (leadsToAnalyze: ExtendedLead[]) => {
    if (leadsToAnalyze.length === 0) {
      finishProcessing()
      return
    }

    console.log('[useLeadBatchProcessor] Executando análise preliminar...')
    setCurrentStep('preliminary-analysis')
    setShowAutomatedDialog(true)
    
    // Buscar dados atualizados dos leads antes de processar
    const updatedLeads: ExtendedLead[] = []
    for (const lead of leadsToAnalyze) {
      try {
        const response = await fetch(`/api/admin/leads-chatwit/leads?id=${lead.id}`)
        if (response.ok) {
          const updatedLead = await response.json()
          updatedLeads.push(updatedLead)
          console.log(`[useLeadBatchProcessor] ✅ Dados atualizados para ${lead.nome}:`, {
            provaManuscrita: !!updatedLead.provaManuscrita,
            textoDOEspelho: !!updatedLead.textoDOEspelho,
            analisePreliminar: !!updatedLead.analisePreliminar
          })
        } else {
          console.warn(`[useLeadBatchProcessor] Falha ao buscar dados atualizados para ${lead.nome}, usando dados originais`)
          updatedLeads.push(lead)
        }
      } catch (error) {
        console.warn(`[useLeadBatchProcessor] Erro ao buscar dados para ${lead.nome}:`, error)
        updatedLeads.push(lead)
      }
    }
    
    // Filtrar apenas leads que realmente podem ser analisados
    const validLeadsForAnalysis = updatedLeads.filter(lead => 
      !lead.analisePreliminar && lead.provaManuscrita && lead.textoDOEspelho
    )
    
    if (validLeadsForAnalysis.length === 0) {
      console.log('[useLeadBatchProcessor] Nenhum lead válido para análise após verificação')
      setShowAutomatedDialog(false)
      finishProcessing()
      return
    }
    
    console.log(`[useLeadBatchProcessor] Processando análise para ${validLeadsForAnalysis.length} leads válidos:`, validLeadsForAnalysis.map(l => l.nome))
    
    for (let i = 0; i < validLeadsForAnalysis.length; i++) {
      const lead = validLeadsForAnalysis[i]
      setCurrentProcessingLead(lead)
      setProgress({ current: i, total: validLeadsForAnalysis.length })
      
      try {
        console.log(`[useLeadBatchProcessor] Enviando para análise: ${lead.nome}`)
        const response = await fetch(`/api/admin/leads-chatwit/enviar-analise`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId: lead.id }),
        })
        
        if (response.ok) {
          console.log(`[useLeadBatchProcessor] ✅ Análise de ${lead.nome} enviada com sucesso!`)
          setStats(prev => ({
            ...prev,
            completedTasks: {
              ...prev.completedTasks,
              analysisCompleted: prev.completedTasks.analysisCompleted + 1
            }
          }))
        } else {
          const errorData = await response.json()
          throw new Error(errorData.error || `Erro ${response.status} ao enviar análise`)
        }
      } catch (error: any) {
        console.error(`[useLeadBatchProcessor] Erro na análise para ${lead.nome}:`, error)
        toast.error(`Falha na análise preliminar para ${lead.nome}: ${error.message}`)
      }
    }

    setShowAutomatedDialog(false)
    
    // Mostrar resultado da análise
    const totalAnalises = validLeadsForAnalysis.length
    let sucessos = 0
    
    // Contar sucessos baseado nos logs
    setStats(prev => {
      sucessos = prev.completedTasks.analysisCompleted
      return prev
    })
    
    setTimeout(() => {
      setStats(currentStats => {
        const finalSucessos = currentStats.completedTasks.analysisCompleted
        if (finalSucessos === totalAnalises) {
          toast.success(`✅ Análise preliminar enviada com sucesso para ${totalAnalises} lead${totalAnalises > 1 ? 's' : ''}!`, { duration: 6000 })
        } else {
          toast.warning(`⚠️ Análise concluída com ${finalSucessos}/${totalAnalises} sucessos. Verifique os erros acima.`, { duration: 8000 })
        }
        return currentStats
      })
    }, 100)
    
    finishProcessing()
  }

  const finishProcessing = () => {
    console.log('[useLeadBatchProcessor] Processamento concluído')
    
    // Identificar leads que não puderam ter análise preliminar
    const skippedLeads = leads.filter(lead => 
      !lead.analisePreliminar && (!lead.provaManuscrita || !lead.textoDOEspelho)
    )
    
    setStats(prev => {
      const finalStats = { ...prev, skippedAnalysis: skippedLeads }
      console.log('[useLeadBatchProcessor] Stats finais:', finalStats)
      return finalStats
    })
    setCurrentStep('done')
    
    // Mostrar relatório final
    if (skippedLeads.length > 0) {
      toast.warning(
        `Processo concluído. A análise preliminar não foi executada para ${skippedLeads.length} leads. Por favor, processe o manuscrito e/ou o espelho de correção para esses leads e execute novamente.`
      )
    } else {
      toast.success('Processo concluído com sucesso!')
    }
  }

  const handleManuscriptSubmit = async (leadId: string, data: ManuscritoData) => {
    console.log('[useLeadBatchProcessor] Manuscrito submetido para lead:', leadId, data)
    
    // Enviar manuscrito para o sistema externo
    try {
      const lead = leads.find(l => l.id === leadId)
      if (!lead) {
        console.error('Lead não encontrado:', leadId)
        return
      }

      const payload = {
        leadID: lead.id,
        nome: lead.nome || "Lead sem nome",
        telefone: lead.phoneNumber,
        manuscrito: true,
        arquivos: lead.arquivos?.map((a: any) => ({
          id: a.id,
          url: a.dataUrl,
          tipo: a.fileType,
          nome: a.fileType
        })) || [],
        arquivos_pdf: lead.pdfUnificado ? [{
          id: lead.id,
          url: lead.pdfUnificado,
          nome: "PDF Unificado"
        }] : [],
        arquivos_imagens_manuscrito: data.selectedImages.map((url: string, index: number) => ({
          id: `${lead.id}-manuscrito-${index}`,
          url: url,
          nome: `Manuscrito ${index + 1}`
        })),
        metadata: {
          leadUrl: lead.leadUrl,
          sourceId: lead.sourceId,
          concluido: lead.concluido,
          fezRecurso: lead.fezRecurso
        }
      }

      const response = await fetch("/api/admin/leads-chatwit/enviar-manuscrito", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Erro ao enviar manuscrito")
      }

      console.log(`[useLeadBatchProcessor] Manuscrito de ${lead.nome} enviado com sucesso!`)
    } catch (error: any) {
      console.error(`[useLeadBatchProcessor] Erro ao enviar manuscrito:`, error)
      throw error // Re-throw para ser tratado pelo ImageGalleryDialog
    }

    const currentData = collectedData.get(leadId) || {}
    collectedData.set(leadId, { ...currentData, manuscrito: data })
    setCollectedData(new Map(collectedData))
    
    setStats(prev => ({
      ...prev,
      completedTasks: {
        ...prev.completedTasks,
        manuscriptsProcessed: prev.completedTasks.manuscriptsProcessed + 1
      }
    }))

    // Verificar se há mais manuscritos para processar
    const hasMoreManuscripts = currentManualLeadIndex < processingQueues.manuscriptProcessing.length - 1
    
    if (hasMoreManuscripts) {
      // Há mais manuscritos - avançar para o próximo
      console.log(`[useLeadBatchProcessor] Avançando para próximo manuscrito (${currentManualLeadIndex + 1}/${processingQueues.manuscriptProcessing.length})`)
      setCurrentManualLeadIndex(prev => prev + 1)
      
      // Mostrar toast de sucesso individual
      const currentLeadName = leads.find(l => l.id === leadId)?.nome || 'Lead'
      toast.success(`✅ Manuscrito de ${currentLeadName} enviado! Continuando para o próximo...`)
      
      // Em modo batch, não permitir que o ImageGalleryDialog feche
      // O diálogo vai se atualizar automaticamente para o próximo lead
    } else {
      // Terminaram manuscritos - verificar se há espelhos para processar imediatamente
      const totalManuscritos = processingQueues.manuscriptProcessing.length
      const temEspelhos = processingQueues.mirrorProcessing.length > 0
      const temAnalises = processingQueues.preliminaryAnalysis.length > 0
      
      let message = `✅ Manuscritos enviados com sucesso para ${totalManuscritos} lead${totalManuscritos > 1 ? 's' : ''}!`
      
      if (temEspelhos) {
        // Mostrar mensagem de transição e continuar automaticamente para espelhos
        message += `\n\n📋 Iniciando espelhos de correção (${processingQueues.mirrorProcessing.length} lead${processingQueues.mirrorProcessing.length > 1 ? 's' : ''})`
        toast.success(message, { duration: 4000 })
        
        // Transição automática para espelhos sem fechar o modal
        console.log('[useLeadBatchProcessor] Transição automática: manuscritos → espelhos')
        setCurrentStep('mirror')
        setCurrentManualLeadIndex(0) // Reset para começar os espelhos
        setProgress({ current: 0, total: processingQueues.mirrorProcessing.length })
        
        // Não fechar o modal - mantém o fluxo contínuo
        // setIsOpen(false) - REMOVIDO
        // setShowContinueButton(true) - REMOVIDO
        
      } else if (temAnalises) {
        message += `\n\n📊 Próximo passo: Análise preliminar automática (${processingQueues.preliminaryAnalysis.length} lead${processingQueues.preliminaryAnalysis.length > 1 ? 's' : ''})`
        message += '\n\n⏰ Continue o processo quando estiver pronto.'
        
        toast.info(message, { duration: 8000 })
        
        // Fechar o modal temporariamente para dar feedback
        setIsOpen(false)
        
        // Se há análises pendentes, mostrar botão para continuar
        setShowContinueButton(true)
        setCurrentManualLeadIndex(0)
        
      } else {
        message += '\n\n🎉 Processo concluído!'
        
        toast.success(message, { duration: 6000 })
        
        // Fechar modal - processo completo
        setIsOpen(false)
      }
    }
  }

  const handleMirrorSubmit = async (leadId: string, data: EspelhoData) => {
    console.log('[useLeadBatchProcessor] Espelho submetido para lead:', leadId, data)
    
    // Enviar espelho para o sistema externo
    try {
      const lead = leads.find(l => l.id === leadId)
      if (!lead) {
        console.error('Lead não encontrado:', leadId)
        return
      }

      const payload = {
        leadID: lead.id,
        nome: lead.nome || "Lead sem nome",
        telefone: lead.phoneNumber,
        espelho: true,
        arquivos: lead.arquivos?.map((a: any) => ({
          id: a.id,
          url: a.dataUrl,
          tipo: a.fileType,
          nome: a.fileType
        })) || [],
        arquivos_pdf: lead.pdfUnificado ? [{
          id: lead.id,
          url: lead.pdfUnificado,
          nome: "PDF Unificado"
        }] : [],
        arquivos_imagens_espelho: data.selectedImages.map((url: string, index: number) => ({
          id: `${lead.id}-espelho-${index}`,
          url: url,
          nome: `Espelho ${index + 1}`
        })),
        metadata: {
          leadUrl: lead.leadUrl,
          sourceId: lead.sourceId,
          concluido: lead.concluido,
          fezRecurso: lead.fezRecurso
        }
      }

      const response = await fetch("/api/admin/leads-chatwit/enviar-manuscrito", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Erro ao enviar espelho")
      }

      console.log(`[useLeadBatchProcessor] Espelho de ${lead.nome} enviado com sucesso!`)
    } catch (error: any) {
      console.error(`[useLeadBatchProcessor] Erro ao enviar espelho:`, error)
      throw error // Re-throw para ser tratado pelo ImageGalleryDialog
    }

    const currentData = collectedData.get(leadId) || {}
    collectedData.set(leadId, { ...currentData, espelho: data })
    setCollectedData(new Map(collectedData))

    setStats(prev => ({
      ...prev,
      completedTasks: {
        ...prev.completedTasks,
        mirrorsProcessed: prev.completedTasks.mirrorsProcessed + 1
      }
    }))

    // Verificar se há mais espelhos para processar
    const hasMoreMirrors = currentManualLeadIndex < processingQueues.mirrorProcessing.length - 1
    
    if (hasMoreMirrors) {
      // Há mais espelhos - avançar para o próximo
      console.log(`[useLeadBatchProcessor] Avançando para próximo espelho (${currentManualLeadIndex + 1}/${processingQueues.mirrorProcessing.length})`)
      setCurrentManualLeadIndex(prev => prev + 1)
      setProgress(prev => ({ ...prev, current: prev.current + 1 }))
      
      // NÃO fechar o modal - vamos continuar com o próximo
      // Mostrar toast de sucesso individual
      const currentLeadName = leads.find(l => l.id === leadId)?.nome || 'Lead'
      toast.success(`✅ Espelho de ${currentLeadName} enviado! Continuando para o próximo...`)
      
      // Em modo batch, não permitir que o ImageGalleryDialog feche
      // O diálogo vai se atualizar automaticamente para o próximo lead
    } else {
      // Terminaram espelhos - mostrar feedback
      const totalEspelhos = processingQueues.mirrorProcessing.length
      const temAnalises = processingQueues.preliminaryAnalysis.length > 0
      
      let message = `✅ Espelhos de correção enviados com sucesso para ${totalEspelhos} lead${totalEspelhos > 1 ? 's' : ''}!`
      
      if (temAnalises) {
        message += `\n\n📊 Próximo passo: Análise preliminar automática (${processingQueues.preliminaryAnalysis.length} lead${processingQueues.preliminaryAnalysis.length > 1 ? 's' : ''})`
        message += '\n\n⏰ Continue o processo quando estiver pronto.'
      } else {
        message += '\n\n🎉 Processo concluído!'
      }
      
      toast.info(message, { duration: 8000 })
      
      // Fechar o modal temporariamente para dar feedback
      setIsOpen(false)
      
      // Se há análises pendentes, mostrar botão para continuar
      if (temAnalises) {
        setShowContinueButton(true)
        // Reset do índice para a análise
        setCurrentManualLeadIndex(0)
      }
    }
  }

  console.log('[useLeadBatchProcessor] Estado atual:', { 
    isOpen, 
    currentStep, 
    progress, 
    currentLead: currentLead?.nome,
    showAutomatedDialog,
    currentProcessingLead: currentProcessingLead?.nome
  })

  return {
    isOpen,
    currentStep,
    progress,
    currentLead,
    start,
    close,
    continueProcess,
    handleManuscriptSubmit,
    handleMirrorSubmit,
    // Novos dados para orquestração
    processingQueues,
    stats,
    showAutomatedDialog,
    showContinueButton,
    currentProcessingLead,
  }
}