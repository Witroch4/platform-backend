// app/admin/leads-chatwit/components/prova-dialog.tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Save, X } from "lucide-react";

interface ProvaDialogProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: string;
  textoProva: string;
  aguardandoProva?: boolean;
  onSave: (texto: string) => Promise<void>;
  onCancelarProva?: () => Promise<void>;
}

export function ProvaDialog({
  isOpen,
  onClose,
  leadId,
  textoProva,
  aguardandoProva = false,
  onSave,
  onCancelarProva,
}: ProvaDialogProps) {
  const [texto, setTexto] = useState(textoProva || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);

  // Atualizar o texto quando o diálogo abrir ou quando o textoProva mudar
  useEffect(() => {
    if (isOpen) {
      setTexto(textoProva || '');
    }
  }, [isOpen, textoProva]);

  const handleSave = async () => {
    if (!texto.trim()) {
      toast("Aviso", { description: "O texto da prova não pode ser vazio."  });
      return;
    }

    setIsSaving(true);
    try {
      await onSave(texto);
      toast("Sucesso", { 
        description: "Prova atualizada com sucesso!",
      });
      onClose();
    } catch (error) {
      toast("Erro", { description: "Erro ao salvar a prova. Tente novamente." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelarProva = async () => {
    if (!onCancelarProva) return;
    
    setIsCanceling(true);
    try {
      await onCancelarProva();
      toast("Sucesso", { description: "Processamento da prova cancelado com sucesso!"  });
      onClose();
    } catch (error) {
      toast("Erro", { description: "Erro ao cancelar o processamento. Tente novamente." });
    } finally {
      setIsCanceling(false);
    }
  };

  const handleClose = () => {
    if (!aguardandoProva) {
      setTexto(textoProva || '');
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl w-[90vw] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Editar Prova</DialogTitle>
          <DialogDescription>
            Faça as alterações necessárias no texto da prova.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {aguardandoProva ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                <p className="text-muted-foreground">
                  Estamos processando a prova. Isso pode levar alguns minutos.
                </p>
                {onCancelarProva && (
                  <Button
                    variant="outline"
                    onClick={handleCancelarProva}
                    disabled={isCanceling}
                    className="mt-4"
                  >
                    {isCanceling ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <X className="h-4 w-4 mr-2" />
                    )}
                    Cancelar Processamento
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <>
                                        <div className="flex-1 overflow-hidden p-4">
                            <Textarea
                              value={texto}
                              onChange={(e) => setTexto(e.target.value)}
                              placeholder="Digite o texto da prova..."
                              className="h-full resize-none border-0 focus-visible:ring-0 text-sm leading-relaxed"
                              disabled={isSaving}
                            />
                          </div>
            </>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          {!aguardandoProva && (
            <>
              <Button variant="outline" onClick={handleClose} disabled={isSaving}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isSaving || !texto.trim()}>
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salvar Prova
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 