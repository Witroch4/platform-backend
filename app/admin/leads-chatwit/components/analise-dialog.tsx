import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, FileText, ExternalLink, Send, AlertOctagon, Key } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AnaliseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: string;
  sourceId: string;
  analiseUrl: string | null;
  argumentacaoUrl?: string | null;
  anotacoes: string | null;
  aguardandoAnalise: boolean;
  onSaveAnotacoes: (anotacoes: string) => Promise<void>;
  onEnviarPdf: (sourceId: string) => Promise<void>;
  onCancelarAnalise?: () => Promise<void>;
  isAnaliseValidada?: boolean;
}

export function AnaliseDialog({
  isOpen,
  onClose,
  leadId,
  sourceId,
  analiseUrl,
  argumentacaoUrl,
  anotacoes,
  aguardandoAnalise,
  onSaveAnotacoes,
  onEnviarPdf,
  onCancelarAnalise,
  isAnaliseValidada = false,
}: AnaliseDialogProps) {
  const [textoAnotacoes, setTextoAnotacoes] = useState(anotacoes || '');
  const [accessToken, setAccessToken] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isEnviando, setIsEnviando] = useState(false);
  const [isCancelando, setIsCancelando] = useState(false);
  const [isSavingToken, setIsSavingToken] = useState(false);

  // Mensagem padrão para enviar com o PDF
  const MENSAGEM_PADRAO = "Segue a nossa Análise, qualquer dúvidas estamos a disposição";

  // Atualiza as anotações quando o diálogo for aberto ou as props mudarem
  useEffect(() => {
    if (isOpen) {
      // Se não tiver anotações, usar a mensagem padrão
      setTextoAnotacoes(anotacoes || MENSAGEM_PADRAO);
      
      // Buscar token personalizado do banco de dados
      fetchAccessToken();
    }
  }, [isOpen, anotacoes, leadId]);

  // Função para buscar o token personalizado do banco de dados
  const fetchAccessToken = async () => {
    try {
      const response = await fetch(`/api/admin/leads-chatwit/custom-token?leadId=${leadId}`, {
        method: "GET",
      });
      
      if (response.ok) {
        const data = await response.json();
        setAccessToken(data.customAccessToken || '');
      }
    } catch (error) {
      console.error("Erro ao buscar token personalizado:", error);
      setAccessToken('');
    }
  };

  const handleSaveAnotacoes = async () => {
    try {
      setIsSaving(true);
      await onSaveAnotacoes(textoAnotacoes);
      toast.success("Mensagem salva", { 
        description: "Anotações atualizadas",
        duration: 2000
      });
    } catch (error: any) {
      toast.error("Erro", { description: error.message || "Não foi possível salvar a mensagem." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAccessToken = async () => {
    try {
      setIsSavingToken(true);
      
      // Salvar o token no banco de dados
      const response = await fetch("/api/admin/leads-chatwit/custom-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leadId,
          customAccessToken: accessToken
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Erro ao salvar token");
      }
      
      toast("Sucesso", { description: "Token de acesso salvo com sucesso!"  });
    } catch (error: any) {
      toast("Erro", { description: error.message || "Não foi possível salvar o token de acesso."  });
    } finally {
      setIsSavingToken(false);
    }
  };

  const handleEnviarPdf = async () => {
    if (!analiseUrl) {
      toast("Erro", { description: "Não há análise disponível para enviar."  });
      return;
    }

    try {
      setIsEnviando(true);
      
      // Construir a URL com query parameters
      let url = `/api/admin/leads-chatwit/enviar-pdf-analise-lead?sourceId=${sourceId}`;
      
      // Adicionar a mensagem das anotações como parâmetro
      if (textoAnotacoes) {
        url += `&message=${encodeURIComponent(textoAnotacoes)}`;
      }
      
      // Adicionar token personalizado se fornecido
      if (accessToken) {
        url += `&accessToken=${encodeURIComponent(accessToken)}`;
      }
      
      const response = await fetch(url, {
        method: "POST",
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Não foi possível enviar o PDF");
      }
      
      toast("Sucesso", { description: "PDF de análise enviado com sucesso!"  });
    } catch (error: any) {
      toast.error("Erro", { description: error.message || "Não foi possível enviar o PDF." });
    } finally {
      setIsEnviando(false);
    }
  };

  const handleCancelarAnalise = async () => {
    if (!onCancelarAnalise) return;
    
    try {
      setIsCancelando(true);
      await onCancelarAnalise();
      toast("Sucesso", { description: "Solicitação de análise cancelada com sucesso!"  });
      onClose(); // Fechar o diálogo após cancelamento
    } catch (error: any) {
      toast("Erro", { description: error.message || "Não foi possível cancelar a análise."  });
    } finally {
      setIsCancelando(false);
    }
  };

  const handleClose = () => {
    if (!isSaving && !isEnviando && !isCancelando) {
      onClose();
    }
  };

  const abrirPdfAnalise = () => {
    if (analiseUrl) {
      window.open(analiseUrl, "_blank");
    }
  };

  const abrirPdfArgumentacao = () => {
    if (argumentacaoUrl) {
      window.open(argumentacaoUrl, "_blank");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {isAnaliseValidada ? "Análise Validada da Prova" : "Análise da Prova"}
          </DialogTitle>
          <DialogDescription>
            {aguardandoAnalise
              ? "A análise está sendo processada. Aguarde..."
              : analiseUrl
                ? isAnaliseValidada 
                  ? "Visualize o PDF de análise validada e envie para o chat do lead."
                  : "Visualize o PDF de análise e adicione anotações."
                : "Ainda não recebemos a análise da prova."}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-6">
          {/* Status da Análise */}
          <div className="flex flex-col items-center justify-center">
            {aguardandoAnalise ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="h-16 w-16 text-primary animate-spin mb-4" />
                <p className="text-lg font-medium">Aguardando Análise</p>
                <p className="text-sm text-muted-foreground mt-2 mb-4">
                  Estamos processando sua solicitação. Isso pode levar alguns minutos.
                </p>
                
                {onCancelarAnalise && !isAnaliseValidada && (
                  <Button 
                    variant="destructive" 
                    onClick={handleCancelarAnalise}
                    disabled={isCancelando}
                  >
                    {isCancelando ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Cancelando...
                      </>
                    ) : (
                      <>
                        <AlertOctagon className="h-4 w-4 mr-2" />
                        Cancelar Análise
                      </>
                    )}
                  </Button>
                )}
              </div>
            ) : analiseUrl ? (
              <div className="space-y-4">
                {/* Botão da Análise */}
                <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-accent/30 transition-colors" onClick={abrirPdfAnalise}>
                  <FileText className="h-16 w-16 text-red-500 mb-4" />
                  <p className="text-lg font-medium">
                    {isAnaliseValidada ? "Análise Validada Disponível" : "Análise Disponível"}
                  </p>
                  <p className="text-sm text-primary mt-2 flex items-center">
                    Clique para abrir o PDF
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </p>
                </div>
                
                {/* Botão da Argumentação (só mostra se tiver argumentacaoUrl) */}
                {argumentacaoUrl && (
                  <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-accent/30 transition-colors" onClick={abrirPdfArgumentacao}>
                    <FileText className="h-16 w-16 text-blue-500 mb-4" />
                    <p className="text-lg font-medium">
                      Argumentação Disponível
                    </p>
                    <p className="text-sm text-primary mt-2 flex items-center">
                      Clique para abrir o PDF
                      <ExternalLink className="ml-1 h-3 w-3" />
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8">
                <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">Análise Não Disponível</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Ainda não recebemos a análise da prova. Solicite uma análise.
                </p>
              </div>
            )}
          </div>

          {/* Mensagem para envio - mostrar sempre que tiver analiseUrl */}
          {analiseUrl && (
            <div className="space-y-2">
              <h3 className="text-lg font-medium">Escreva uma Mensagem</h3>
              <Textarea
                value={textoAnotacoes}
                onChange={(e) => setTextoAnotacoes(e.target.value)}
                className="min-h-[100px] font-mono"
                placeholder="Escreva uma mensagem para enviar junto com o PDF da análise..."
              />
              <p className="text-sm text-muted-foreground">
                Esta mensagem será enviada junto com o PDF para o chat.
              </p>
            </div>
          )}
          
          {/* Token de acesso personalizado */}
          {analiseUrl && (
            <div className="space-y-2 border p-4 rounded-md">
              <h3 className="text-md font-medium flex items-center">
                <Key className="h-4 w-4 mr-2" />
                Token de Acesso Personalizado (Opcional)
              </h3>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="Token de acesso personalizado para o Chatwoot"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveAccessToken}
                  disabled={isSavingToken}
                  className="whitespace-nowrap"
                >
                  {isSavingToken ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Salvar Token"
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Se não for especificado, será usado o token padrão do sistema.
              </p>
            </div>
          )}

          {/* Anotações - só mostrar se não for análise validada e não tiver analiseUrl */}
          {!isAnaliseValidada && !analiseUrl && (
            <div className="space-y-2">
              <h3 className="text-lg font-medium">Anotações</h3>
              <Textarea
                value={textoAnotacoes}
                onChange={(e) => setTextoAnotacoes(e.target.value)}
                className="min-h-[150px] font-mono"
                placeholder="Adicione suas anotações sobre a análise..."
              />
            </div>
          )}
        </div>
        
        <DialogFooter className="flex flex-wrap gap-2 justify-between sm:justify-end">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isSaving || isEnviando || isCancelando}
            >
              Fechar
            </Button>
            
            {/* Botão de salvar anotações - só mostrar se não for análise validada e não tiver analiseUrl*/}
            {!isAnaliseValidada && !analiseUrl && (
              <Button
                variant="default"
                onClick={handleSaveAnotacoes}
                disabled={isSaving}
              >
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Anotações
              </Button>
            )}
          </div>
          
          {analiseUrl && (
            <Button
              variant="default"
              onClick={handleEnviarPdf}
              disabled={isEnviando || !analiseUrl}
            >
              {isEnviando ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Enviar para o Chat
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 