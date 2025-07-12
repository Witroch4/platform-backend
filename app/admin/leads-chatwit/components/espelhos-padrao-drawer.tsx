"use client";

import { useState, useEffect } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { 
  BookOpen, 
  Upload, 
  Eye,
  FileUp,
  Loader2,
  Send,
  FileText,
  HelpCircle,
  AlertTriangle
} from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface EspelhoPadrao {
  id: string;
  especialidade: string;
  nome: string;
  descricao?: string;
  textoMarkdown?: string;
  espelhoCorrecao?: string;
  isAtivo: boolean;
  totalUsos: number;
  processado: boolean;
  aguardandoProcessamento: boolean;
  createdAt: string;
  updatedAt: string;
  atualizadoPor: {
    id: string;
    name: string;
  };
}

interface EspelhosPadraoDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  usuarioId: string;
}

const especialidades = [
  { key: 'ADMINISTRATIVO', label: 'Padrão de respostas definitivo (Direito Administrativo)' },
  { key: 'CIVIL', label: 'Padrão de respostas definitivo (Direito Civil)' },
  { key: 'CONSTITUCIONAL', label: 'Padrão de respostas definitivo (Direito Constitucional)' },
  { key: 'TRABALHO', label: 'Padrão de respostas definitivo (Direito do Trabalho)' },
  { key: 'EMPRESARIAL', label: 'Padrão de respostas definitivo (Direito Empresarial)' },
  { key: 'PENAL', label: 'Padrão de respostas definitivo (Direito Penal)' },
  { key: 'TRIBUTARIO', label: 'Padrão de respostas definitivo (Direito Tributário)' },
];

export function EspelhosPadraoDrawer({
  isOpen,
  onClose,
  usuarioId
}: EspelhosPadraoDrawerProps) {
  const [espelhosPadrao, setEspelhosPadrao] = useState<EspelhoPadrao[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [enviandoSistemaExterno, setEnviandoSistemaExterno] = useState<string | null>(null);
  const [showMarkdownDialog, setShowMarkdownDialog] = useState(false);
  const [selectedEspelhoParaVisualizacao, setSelectedEspelhoParaVisualizacao] = useState<EspelhoPadrao | null>(null);
  
  // 🔧 NOVO: Estados para controlar geração de imagens
  const [gerarImagens, setGerarImagens] = useState(false);  // Para espelhos: padrão é PDF bruto (false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingEspecialidade, setPendingEspecialidade] = useState<string | null>(null);

  // Carregar espelhos padrão
  useEffect(() => {
    if (isOpen) {
      fetchEspelhosPadrao();
    }
  }, [isOpen, usuarioId]);

  // 🔧 OTIMIZADO: Verificar espelhos processados com polling inteligente
  useEffect(() => {
    const espelhosAguardando = espelhosPadrao.filter(e => e.aguardandoProcessamento);
    
    if (espelhosAguardando.length > 0 && isOpen) {
      console.log(`[Espelhos Drawer] 🔄 Iniciando polling para ${espelhosAguardando.length} espelho(s) aguardando processamento`);
      
      let tentativas = 0;
      const maxTentativas = 20; // Máximo 20 tentativas (1 minuto)
      
      const interval = setInterval(async () => {
        tentativas++;
        
        try {
          const response = await fetch(`/api/admin/leads-chatwit/espelhos-padrao?usuarioId=${usuarioId}`);
          if (response.ok) {
            const data = await response.json();
            const espelhosAtualizados: EspelhoPadrao[] = data.espelhosPadrao || [];
            
            // Verificar quais espelhos foram processados
            const idsProcessados: string[] = [];
            espelhosAguardando.forEach(espelhoAnterior => {
              const espelhoAtual = espelhosAtualizados.find(e => e.id === espelhoAnterior.id);
              if (espelhoAtual && espelhoAtual.textoMarkdown && !espelhoAtual.aguardandoProcessamento) {
                idsProcessados.push(espelhoAtual.id);
              }
            });
            
            // Atualizar a lista de espelhos
            setEspelhosPadrao(espelhosAtualizados);
            
            // Se todos foram processados ou atingiu limite, parar polling
            const novosEspelhosAguardando = espelhosAtualizados.filter(e => e.aguardandoProcessamento);
            
            if (idsProcessados.length > 0) {
              console.log(`[Espelhos Drawer] ✅ ${idsProcessados.length} espelho(s) processado(s)`);
              idsProcessados.forEach(id => {
                const espelho = espelhosAtualizados.find(e => e.id === id);
                if (espelho) {
                  toast.success("Texto gerado!", {
                    description: `Espelho "${espelho.nome}" processado`,
                    duration: 4000
                  });
                }
              });
            }
            
            if (novosEspelhosAguardando.length === 0 || tentativas >= maxTentativas) {
              console.log(`[Espelhos Drawer] 🛑 Parando polling - processados: ${novosEspelhosAguardando.length === 0}, timeout: ${tentativas >= maxTentativas}`);
              clearInterval(interval);
            }
          }
        } catch (error) {
          console.error('[Espelhos Drawer] ❌ Erro no polling:', error);
          if (tentativas >= 3) { // Parar após 3 erros consecutivos
            clearInterval(interval);
          }
        }
      }, 3000); // Manter 3 segundos mas com limite de tentativas

      return () => {
        console.log(`[Espelhos Drawer] 🧹 Limpando polling de espelhos`);
        clearInterval(interval);
      };
    }
  }, [espelhosPadrao.filter(e => e.aguardandoProcessamento).length, usuarioId, isOpen]); // ✅ Dependência otimizada

  const fetchEspelhosPadrao = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/leads-chatwit/espelhos-padrao?usuarioId=${usuarioId}`);
      
      if (!response.ok) {
        throw new Error("Erro ao carregar espelhos padrão");
      }
      
      const data = await response.json();
      setEspelhosPadrao(data.espelhosPadrao || []);
    } catch (error: any) {
      console.error("Erro ao carregar espelhos padrão:", error);
      toast("Erro", { description: "Não foi possível carregar os espelhos padrão." });
    } finally {
      setLoading(false);
    }
  };

  // Upload de espelho padrão
  const handleUploadEspelhoPadrao = (especialidade: string) => {
    if (gerarImagens) {
      // Mostrar diálogo de confirmação
      setPendingEspecialidade(especialidade);
      setShowConfirmDialog(true);
    } else {
      // Prosseguir normalmente
      proceedWithUpload(especialidade);
    }
  };

  // 🔧 NOVO: Função para prosseguir com upload
  const proceedWithUpload = (especialidade: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        processUploadEspelhoPadrao(file, especialidade);
      }
    };
    input.click();
  };

  const processUploadEspelhoPadrao = async (file: File, especialidade: string) => {
    if (!file) return;
    
    setUploading(especialidade);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sessionId', `espelho-padrao-${especialidade}`);
      
      // 🔧 NOVO: Enviar controle de conversão apenas se diferente do padrão
      // Para espelhos, o padrão é PDF bruto (false), então só enviar se for true
      if (gerarImagens) {
        formData.append('convertToImages', 'true');
      }
      // Se gerarImagens for false, não enviar o parâmetro (backend usará padrão automático)
      
      const response = await fetch('/api/upload/process-files', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Erro no upload');
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Falha no processamento');
      }
      
      let processedData;
      
      if (gerarImagens) {
        // Usar imagens geradas
        const imageUrls = data.image_urls || [];
        
        if (imageUrls.length === 0) {
          throw new Error('Nenhuma imagem foi processada');
        }
        
        processedData = {
          type: 'images',
          urls: imageUrls,
          count: imageUrls.length
        };
      } else {
        // Usar PDF bruto
        const pdfUrl = data.pdf_url || data.file_url;
        
        if (!pdfUrl) {
          throw new Error('PDF não foi processado corretamente');
        }
        
        processedData = {
          type: 'pdf',
          url: pdfUrl,
          count: 1
        };
      }
      
      // Criar/atualizar espelho padrão
      const especialidadeInfo = especialidades.find(e => e.key === especialidade);
      const createResponse = await fetch('/api/admin/leads-chatwit/espelhos-padrao', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          especialidade,
          nome: especialidadeInfo?.label || `Espelho Padrão ${especialidade}`,
          descricao: `Espelho padrão para ${especialidadeInfo?.label}`,
          espelhoCorrecao: JSON.stringify(gerarImagens ? processedData.urls : [processedData.url]),
          tipoProcessamento: gerarImagens ? 'images' : 'pdf',
          usuarioId: usuarioId,
        }),
      });
      
      if (!createResponse.ok) {
        throw new Error('Erro ao salvar espelho padrão');
      }
      
      const createData = await createResponse.json();
      
      toast("Upload concluído", {
        description: `Espelho padrão de ${especialidadeInfo?.label} adicionado ${gerarImagens ? `com ${processedData.count} imagem(ns)` : 'como PDF'}.`,
      });
      
      // Recarregar lista
      fetchEspelhosPadrao();
      
      // Enviar para sistema externo automaticamente
      if (createData.espelhoPadrao) {
        if (gerarImagens) {
          await handleEnviarParaSistemaExterno(createData.espelhoPadrao.id, processedData.urls, especialidade);
        } else {
          await handleEnviarParaSistemaExterno(createData.espelhoPadrao.id, [processedData.url], especialidade);
        }
      }
      
    } catch (error: any) {
      console.error("Erro no upload:", error);
      toast("Erro", { description: error.message || "Não foi possível fazer upload do espelho padrão." });
    } finally {
      setUploading(null);
    }
  };

  // Enviar espelho padrão para sistema externo
  const handleEnviarParaSistemaExterno = async (espelhoId: string, imageUrls: string[], especialidade: string) => {
    try {
      setEnviandoSistemaExterno(especialidade);
      
      // Marcar como aguardando processamento
      await fetch('/api/admin/leads-chatwit/espelhos-padrao', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: espelhoId,
          aguardandoProcessamento: true
        }),
      });
      
      // Criar payload para o sistema externo
      const payload = {
        espelhoPadrao: true,
        especialidade: especialidade,
        [`is${especialidade.charAt(0).toUpperCase() + especialidade.slice(1).toLowerCase()}`]: true,
        espelhoId: espelhoId,
        arquivos_imagens_espelho: imageUrls.map((url: string, index: number) => ({
          id: `${espelhoId}-espelho-padrao-${index}`,
          url: url,
          nome: `Espelho Padrão ${especialidade} ${index + 1}`
        })),
        metadata: {
          especialidade: especialidade,
          usuarioId: usuarioId,
          tipo: 'espelho_padrao'
        }
      };
      
      const response = await fetch("/api/admin/leads-chatwit/enviar-manuscrito", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao enviar espelho padrão para processamento");
      }
      
      // Atualizar estado local
      setEspelhosPadrao(prev => prev.map(esp => 
        esp.id === espelhoId 
          ? { ...esp, aguardandoProcessamento: true }
          : esp
      ));
      
      const especialidadeInfo = especialidades.find(e => e.key === especialidade);
      
      toast("Processando...", {
        description: `Espelho padrão de ${especialidadeInfo?.label} foi enviado para processamento! O texto será gerado automaticamente.`,
      });
      
    } catch (error: any) {
      console.error("Erro ao enviar espelho padrão para sistema externo:", error);
      const especialidadeInfo = especialidades.find(e => e.key === especialidade);
      toast.error("Erro no processamento", {
        description: `Não foi possível processar espelho padrão de ${especialidadeInfo?.label}. Tente novamente.`,
      });
    } finally {
      setEnviandoSistemaExterno(null);
    }
  };

  // Visualizar texto markdown
  const handleVisualizarTexto = (espelho: EspelhoPadrao) => {
    setSelectedEspelhoParaVisualizacao(espelho);
    setShowMarkdownDialog(true);
  };

  // Encontrar espelho padrão por especialidade
  const findEspelhoByEspecialidade = (especialidade: string) => {
    return espelhosPadrao.find(e => e.especialidade === especialidade);
  };

  return (
    <TooltipProvider>
      <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent className="h-[90vh] max-h-[90vh] flex flex-col">
          <div className="container mx-auto max-w-6xl h-full flex flex-col">
            <DrawerHeader className="px-6 py-4">
              <DrawerTitle className="text-2xl flex items-center gap-2">
                <BookOpen className="h-6 w-6" />
                Espelhos Padrão
              </DrawerTitle>
              <DrawerDescription>
                Gerencie os espelhos padrão para cada especialidade jurídica. Estes serão usados para gerar espelhos mais precisos para os leads.
              </DrawerDescription>
            </DrawerHeader>

            <div className="flex-1 px-6 overflow-hidden">
              <div className="h-full flex flex-col">
                <div className="flex justify-between items-center mb-6">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-2">Especialidades Jurídicas</h3>
                    <p className="text-sm text-muted-foreground">
                      Faça upload dos PDFs dos espelhos padrão para cada área do direito
                    </p>
                  </div>
                  
                  {/* 🔧 NOVO: Controles de configuração */}
                  <div className="flex items-center gap-2 bg-muted/50 p-3 rounded-lg">
                    <Checkbox
                      id="gerar-imagens"
                      checked={gerarImagens}
                      onCheckedChange={(checked) => setGerarImagens(checked as boolean)}
                    />
                    <Label htmlFor="gerar-imagens" className="text-sm font-medium cursor-pointer">
                      Gerar imagens?
                    </Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        <p className="text-sm">
                          <strong>Para espelhos padrão:</strong> Padrão é PDF bruto (recomendado)
                          <br />
                          <strong>Para outros casos:</strong> Padrão é gerar imagens
                          <br />
                          <br />
                          Use "gerar imagens" apenas se o sistema externo não conseguir processar o PDF
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-4">
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin" />
                      <span className="ml-2">Carregando espelhos padrão...</span>
                    </div>
                  ) : (
                    especialidades.map((especialidade) => {
                      const espelhoExistente = findEspelhoByEspecialidade(especialidade.key);
                      const isUploading = uploading === especialidade.key;
                      const isEnviando = enviandoSistemaExterno === especialidade.key;
                      
                      return (
                        <div 
                          key={especialidade.key} 
                          className="border rounded-lg p-4 flex items-center justify-between bg-card"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="font-medium">{especialidade.label}</h4>
                              
                              {espelhoExistente && (
                                <div className="flex gap-2">
                                  {espelhoExistente.aguardandoProcessamento && (
                                    <Badge variant="outline" className="text-yellow-600">
                                      Processando...
                                    </Badge>
                                  )}
                                  {espelhoExistente.processado && espelhoExistente.textoMarkdown && (
                                    <Badge variant="default">
                                      Pronto
                                    </Badge>
                                  )}
                                  <Badge variant="secondary">
                                    {espelhoExistente.totalUsos} uso(s)
                                  </Badge>
                                </div>
                              )}
                            </div>
                            
                            {espelhoExistente && (
                              <p className="text-xs text-muted-foreground">
                                Atualizado em {new Date(espelhoExistente.updatedAt).toLocaleDateString()} por {espelhoExistente.atualizadoPor.name}
                              </p>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-3">
                            {/* Botão para fazer upload */}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUploadEspelhoPadrao(especialidade.key)}
                              disabled={isUploading || isEnviando}
                            >
                              {isUploading ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                  Enviando...
                                </>
                              ) : (
                                <>
                                  <FileUp className="h-4 w-4 mr-1" />
                                  {espelhoExistente ? 'Atualizar PDF' : 'Upload PDF'}
                                </>
                              )}
                            </Button>
                            
                            {/* Botão para reenviar para processamento */}
                            {espelhoExistente && espelhoExistente.espelhoCorrecao && !espelhoExistente.aguardandoProcessamento && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const imagens = JSON.parse(espelhoExistente.espelhoCorrecao || '[]');
                                  handleEnviarParaSistemaExterno(espelhoExistente.id, imagens, especialidade.key);
                                }}
                                disabled={isEnviando}
                              >
                                {isEnviando ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                    Processando...
                                  </>
                                ) : (
                                  <>
                                    <Send className="h-4 w-4 mr-1" />
                                    Reprocessar
                                  </>
                                )}
                              </Button>
                            )}
                            
                            {/* Botão para visualizar texto */}
                            {espelhoExistente && espelhoExistente.textoMarkdown && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleVisualizarTexto(espelhoExistente)}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                Visualizar
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <DrawerFooter className="px-6">
              <Button variant="outline" onClick={onClose}>
                Fechar
              </Button>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>

      {/* 🔧 NOVO: Dialog de confirmação para geração de imagens */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirmar geração de imagens
            </DialogTitle>
            <DialogDescription>
              Você ativou a opção "Gerar imagens". Isso irá converter o PDF em imagens.
              <br /><br />
              <strong>Recomendação:</strong> Use apenas se o envio do PDF falhar. Por padrão, o sistema externo trabalha com PDF.
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                setShowConfirmDialog(false);
                if (pendingEspecialidade) {
                  proceedWithUpload(pendingEspecialidade);
                  setPendingEspecialidade(null);
                }
              }}
            >
              Confirmar e gerar imagens
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para visualizar markdown */}
      <Dialog open={showMarkdownDialog} onOpenChange={setShowMarkdownDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {selectedEspelhoParaVisualizacao?.nome}
            </DialogTitle>
            <DialogDescription>
              Espelho padrão para {selectedEspelhoParaVisualizacao?.especialidade}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto">
            {selectedEspelhoParaVisualizacao?.textoMarkdown ? (
              <div className="prose prose-sm dark:prose-invert prose-slate max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {selectedEspelhoParaVisualizacao.textoMarkdown}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="text-muted-foreground">Nenhum texto disponível.</p>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMarkdownDialog(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
} 