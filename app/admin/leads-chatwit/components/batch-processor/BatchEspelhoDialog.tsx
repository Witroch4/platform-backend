// app/admin/leads-chatwit/components/batch-processor/BatchEspelhoDialog.tsx

import { useState } from 'react'
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Check, Loader2, Send, RefreshCw } from "lucide-react"
import type { ExtendedLead } from '../../types'

type BatchEspelhoDialogProps = {
  lead: ExtendedLead
  progress: { current: number; total: number }
  onSubmit: (data: { selectedImages: string[] }) => void
  onClose: () => void
}

export function BatchEspelhoDialog({ lead, progress, onSubmit, onClose }: BatchEspelhoDialogProps) {
  const [selectedImages, setSelectedImages] = useState<string[]>([])
  const [isSending, setIsSending] = useState(false)
  const [loadingImages, setLoadingImages] = useState<Record<number, boolean>>({})
  const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({})

  // Obter imagens convertidas do lead
  const getConvertedImages = (): string[] => {
    let imagensConvertidas: string[] = []
    
    if (lead.imagensConvertidas) {
      try {
        imagensConvertidas = JSON.parse(lead.imagensConvertidas)
      } catch (error) {
        console.error("Erro ao processar URLs de imagens convertidas:", error)
      }
  }
  
    // Se não houver imagens no campo imagensConvertidas, buscar dos arquivos
    if (!imagensConvertidas || imagensConvertidas.length === 0) {
      imagensConvertidas = lead.arquivos
        ?.filter((a: any) => a.pdfConvertido)
        ?.map((a: any) => a.pdfConvertido as string)
        ?.filter((url: string | null) => url && url.length > 0) || []
    }

    return imagensConvertidas
  }

  const images = getConvertedImages()

  // Função para toggle da seleção de imagem
  const toggleImageSelection = (imageUrl: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation()
    }
    
    setSelectedImages(prev => {
      if (prev.includes(imageUrl)) {
        return prev.filter(url => url !== imageUrl)
      } else {
        return [...prev, imageUrl]
      }
    })
  }

  // Função para enviar espelho
  const handleSendEspelho = async () => {
    if (selectedImages.length === 0) {
      toast("Aviso", { description: "Selecione pelo menos uma imagem para enviar." })
      return
    }
    
    setIsSending(true)
    try {
      console.log(`[BatchEspelho] Enviando ${selectedImages.length} imagens do espelho para ${lead.nome}`)

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
        arquivos_imagens_espelho: selectedImages.map((url: string, index: number) => ({
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

      toast.success(`Espelho de ${lead.nome} enviado com sucesso!`)
      onSubmit({ selectedImages })
      
    } catch (error: any) {
      console.error(`[BatchEspelho] Erro ao enviar espelho:`, error)
      toast.error("Erro", { description: error.message || "Não foi possível enviar o espelho" })
    } finally {
      setIsSending(false)
    }
  }

  // Função para gerar URL de miniatura
  const getThumbnailUrl = (imageUrl: string) => {
    if (imageUrl.includes("/thumb_")) {
      return imageUrl
    }
    
    try {
      const url = new URL(imageUrl)
      const pathParts = url.pathname.split('/')
      
      if (pathParts.length > 0) {
        const lastIndex = pathParts.length - 1
        const fileName = pathParts[lastIndex]
        pathParts[lastIndex] = `thumb_${fileName}`
        url.pathname = pathParts.join('/')
        return url.toString()
      }
      
      return imageUrl
    } catch (e) {
      console.warn("Erro ao processar URL de miniatura:", e)
      return imageUrl
    }
  }

  const handleImageLoading = (index: number, isLoading: boolean) => {
    setLoadingImages(prev => ({ ...prev, [index]: isLoading }))
  }
  
  const handleImageError = (index: number, hasError: boolean) => {
    setImageErrors(prev => ({ ...prev, [index]: hasError }))
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>
            Espelho de Correção - {lead.nome} ({progress.current + 1}/{progress.total})
          </DialogTitle>
          <DialogDescription>
            Selecione as imagens que serão enviadas como espelho de correção para este lead.
          </DialogDescription>
          <div className="mt-2 text-sm text-muted-foreground">
            💡 Selecione as páginas que servirão como referência para correção do manuscrito.
          </div>
        </DialogHeader>
        
        <div className="py-4">
          <div className="mb-4 text-sm text-muted-foreground">
            {selectedImages.length === 0 ? (
              "Nenhuma imagem selecionada"
            ) : (
              `${selectedImages.length} ${selectedImages.length === 1 ? 'imagem selecionada' : 'imagens selecionadas'}`
            )}
          </div>
          
          {images.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma imagem disponível para este lead.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {images.map((imageUrl, index) => (
                <div 
                  key={index} 
                  className={`cursor-pointer border rounded-md overflow-hidden relative group ${
                    selectedImages.includes(imageUrl) ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => toggleImageSelection(imageUrl)}
                >
                  <div className="w-full h-40 flex items-center justify-center relative">
                    {loadingImages[index] && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    )}
                    
                    <img 
                      src={getThumbnailUrl(imageUrl)}
                      alt={`Imagem ${index + 1}`}
                      className={`w-full h-full object-contain ${imageErrors[index] ? 'opacity-60' : ''}`}
                      onLoad={() => handleImageLoading(index, false)}
                      onLoadStart={() => handleImageLoading(index, true)}
                      onError={(e) => {
                        console.warn(`Erro ao carregar miniatura: ${getThumbnailUrl(imageUrl)}`)
                        handleImageLoading(index, false)
                        handleImageError(index, true)
                        e.currentTarget.src = imageUrl
                      }}
                    />
                    
                    {/* Checkbox para seleção */}
                    <div 
                      className="absolute top-2 right-2 z-20"
                      onClick={(e) => toggleImageSelection(imageUrl, e)}
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                        selectedImages.includes(imageUrl) 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-background/90 border border-border hover:bg-muted'
                      }`}>
                        {selectedImages.includes(imageUrl) && <Check className="h-4 w-4" />}
                      </div>
                    </div>
                    
                    {imageErrors[index] && (
                      <div className="absolute bottom-1 left-1 right-1 bg-red-500/70 text-white text-xs p-1 rounded text-center">
                        Erro na miniatura
                      </div>
                    )}
                  </div>
                  
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <span className="text-white bg-black/60 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                      Página {index + 1}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <DialogFooter className="flex justify-between">
          <Button variant="outline" onClick={onClose}>
            Cancelar Processo
          </Button>
          
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => onSubmit({ selectedImages: [] })}
              disabled={isSending}
            >
              Pular este Lead
            </Button>
            <Button
              variant="default"
              onClick={handleSendEspelho}
              disabled={selectedImages.length === 0 || isSending}
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Enviar Espelho
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}