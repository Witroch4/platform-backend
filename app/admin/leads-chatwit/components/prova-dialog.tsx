// app/admin/leads-chatwit/components/prova-dialog.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Save, X, Maximize2, Minimize2 } from "lucide-react";

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
  const [wrap, setWrap] = useState(true);
  const [fontSize, setFontSize] = useState(14); // px
  const [gotoLine, setGotoLine] = useState<string>("");
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const [fullScreen, setFullScreen] = useState(false);

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

  const totalLinhas = (texto.match(/\n/g)?.length ?? 0) + 1;
  const digits = String(totalLinhas).length;
  const lineHeight = `${fontSize * 1.5}px`; // Sincronizar lineHeight com fontSize
  const renderLineNumbers = () => {
    const lines: string[] = [];
    for (let i = 1; i <= totalLinhas; i++) {
      lines.push(String(i).padStart(digits, " "));
    }
    return lines.join("\n");
  };

  const syncScroll = () => {
    if (taRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = taRef.current.scrollTop;
    }
  };


  const goToLine = () => {
    const n = parseInt(gotoLine, 10);
    if (!taRef.current || Number.isNaN(n) || n < 1) return;
    const target = n - 1;
    const text = taRef.current.value;
    let idx = 0;
    for (let i = 0, line = 0; i < text.length && line < target; i++) {
      if (text[i] === "\n") line++;
      idx = i + 1;
    }
    taRef.current.focus();
    taRef.current.setSelectionRange(idx, idx);
    // scroll caret into view
    requestAnimationFrame(() => syncScroll());
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className={
        `${fullScreen ? 'max-w-[95vw] w-[95vw] max-h-[95vh]' : 'max-w-6xl w-[90vw] max-h-[85vh]'} overflow-hidden flex flex-col`
      }>
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
              {/* Toolbar */}
              <div className="px-4 pt-2 pb-1 flex items-center gap-4 border-b">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Quebra de linha</span>
                  <Switch checked={wrap} onCheckedChange={setWrap} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Fonte</span>
                  <Button size="sm" variant="outline" onClick={() => setFontSize((s) => Math.max(10, s - 1))}>A-</Button>
                  <Button size="sm" variant="outline" onClick={() => setFontSize((s) => Math.min(22, s + 1))}>A+</Button>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setFullScreen((v) => !v)} title={fullScreen ? 'Sair da tela cheia' : 'Tela cheia'}>
                    {fullScreen ? <Minimize2 className="h-4 w-4"/> : <Maximize2 className="h-4 w-4"/>}
                  </Button>
                  <span className="text-sm text-muted-foreground">Ir para linha</span>
                  <Input value={gotoLine} onChange={(e) => setGotoLine(e.target.value)} placeholder="nº" className="w-20 h-8" />
                  <Button size="sm" variant="secondary" onClick={goToLine}>Ir</Button>
                </div>
              </div>

              {/* Editor com numeração de linhas */}
              <div className="flex-1 p-4 flex flex-col overflow-hidden">
                <div className="flex-1 border rounded-md bg-background flex overflow-hidden">
                  <div
                    ref={gutterRef}
                    className="shrink-0 w-12 sm:w-14 lg:w-16 overflow-hidden border-r bg-muted/30 text-muted-foreground"
                  >
                    <pre
                      className="m-0 px-2 py-2 font-mono select-none whitespace-pre"
                      style={{ fontSize: `${fontSize}px`, lineHeight }}
                    >
                      {renderLineNumbers()}
                    </pre>
                  </div>
                  <textarea
                    ref={taRef}
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Digite o texto da prova..."
                    className="flex-1 resize-none p-2 font-mono border-0 focus:outline-none focus-visible:ring-0 bg-transparent scrollbar-custom"
                    style={{ fontSize: `${fontSize}px`, lineHeight, overflow: 'auto' }}
                    wrap={wrap ? "soft" : "off"}
                    onScroll={syncScroll}
                    disabled={isSaving}
                  />
                </div>
              </div>

              <style jsx>{`
                .scrollbar-custom {
                  scrollbar-width: thin;
                  scrollbar-color: hsl(var(--primary) / 0.5) transparent;
                }
                .scrollbar-custom::-webkit-scrollbar {
                  width: 10px;
                  height: 10px;
                }
                .scrollbar-custom::-webkit-scrollbar-track {
                  background: transparent;
                }
                .scrollbar-custom::-webkit-scrollbar-thumb {
                  background: hsl(var(--primary) / 0.5);
                  border-radius: 5px;
                }
                .scrollbar-custom::-webkit-scrollbar-thumb:hover {
                  background: hsl(var(--primary) / 0.7);
                }
              `}</style>
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
