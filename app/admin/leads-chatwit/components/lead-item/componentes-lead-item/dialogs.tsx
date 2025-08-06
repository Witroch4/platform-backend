import React from "react";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { LeadChatwit } from "../../../types";
import { getDisplayName } from "./utils";

// Importar componentes de diálogo
import { DialogDetalheLead } from "@/app/admin/leads-chatwit/components/dialog-detalhe-lead";
import { ImageGalleryDialog } from "@/app/admin/leads-chatwit/components/image-gallery-dialog";
import { ProcessDialog, type ProcessType } from "@/app/admin/leads-chatwit/components/process-dialog";
import { ProvaDialog } from "@/app/admin/leads-chatwit/components/prova-dialog";
import { EspelhoDialog } from "@/app/admin/leads-chatwit/components/espelho-dialog";
import { AnaliseDialog } from "@/app/admin/leads-chatwit/components/analise-dialog";
import { AnalisePreviewDrawer } from "@/app/admin/leads-chatwit/components/analise-preliminar-drawer";

interface LeadDialogsProps {
  lead: LeadChatwit;
  
  // Estados dos diálogos
  detailsOpen: boolean;
  setDetailsOpen: (open: boolean) => void;
  
  confirmDelete: boolean;
  setConfirmDelete: (open: boolean) => void;
  
  showGallery: boolean;
  setShowGallery: (open: boolean) => void;
  
  showProcessDialog: boolean;
  setShowProcessDialog: (open: boolean) => void;
  processType: ProcessType;
  
  showProvaDialog: boolean;
  setShowProvaDialog: (open: boolean) => void;
  
  confirmDeleteManuscrito: boolean;
  setConfirmDeleteManuscrito: (open: boolean) => void;
  manuscritoToDelete: string | null;
  setManuscritoToDelete: (id: string | null) => void;
  
  showManuscritoImageSeletor: boolean;
  setShowManuscritoImageSeletor: (open: boolean) => void;
  
  showEspelhoSeletor: boolean;
  setShowEspelhoSeletor: (open: boolean) => void;
  
  showEspelhoDialog: boolean;
  setShowEspelhoDialog: (open: boolean) => void;
  
  confirmDeleteEspelho: boolean;
  setConfirmDeleteEspelho: (open: boolean) => void;
  
  showAnaliseDialog: boolean;
  setShowAnaliseDialog: (open: boolean) => void;
  
  showAnalisePreviewDrawer: boolean;
  setShowAnalisePreviewDrawer: (open: boolean) => void;
  
  confirmDeleteAllFiles: boolean;
  setConfirmDeleteAllFiles: (open: boolean) => void;
  
  // Estados de carregamento
  isSaving: boolean;
  isDigitando: boolean;
  setIsDigitando: (loading: boolean) => void;
  
  // Estados locais
  localAnaliseState: {
    analiseUrl?: string;
    aguardandoAnalise: boolean;
    analisePreliminar?: any;
    analiseValidada: boolean;
  };
  localManuscritoState: {
    manuscritoProcessado: boolean;
    aguardandoManuscrito: boolean;
    provaManuscrita: any;
  };
  localEspelhoState: {
    hasEspelho: boolean;
    aguardandoEspelho: boolean;
    espelhoCorrecao: any;
    textoDOEspelho: any;
  };
  
  // Funções de callback
  onEdit: (lead: LeadChatwit) => void;
  onDelete: () => void;
  onSendSelectedImages: (images: string[]) => Promise<void>;
  onEnviarProva: (images: string[]) => Promise<void>;
  onSaveProva: (texto: string) => Promise<void>;
  onCancelarProva: () => Promise<void>;
  onEnviarEspelho: (images: string[]) => Promise<void>;
  onSaveEspelho: (texto: any, imagens: string[]) => Promise<void>;
  onCancelarEspelho: () => Promise<void>;
  onExcluirEspelho: () => Promise<void>;
  onSaveAnotacoes: (anotacoes: string) => Promise<void>;
  onEnviarPdf: (sourceId: string) => Promise<void>;
  onCancelarAnalise: () => Promise<void>;
  onSaveAnalisePreliminar: (data: any) => Promise<void>;
  onValidarAnalise: (data: any) => Promise<void>;
  onExecuteDeleteAllFiles: () => Promise<void>;
  onExecuteManuscritoDelete: () => Promise<void>;
  
  // Dados auxiliares
  convertedImages: string[];
}

export function LeadDialogs({
  lead,
  detailsOpen,
  setDetailsOpen,
  confirmDelete,
  setConfirmDelete,
  showGallery,
  setShowGallery,
  showProcessDialog,
  setShowProcessDialog,
  processType,
  showProvaDialog,
  setShowProvaDialog,
  confirmDeleteManuscrito,
  setConfirmDeleteManuscrito,
  manuscritoToDelete,
  setManuscritoToDelete,
  showManuscritoImageSeletor,
  setShowManuscritoImageSeletor,
  showEspelhoSeletor,
  setShowEspelhoSeletor,
  showEspelhoDialog,
  setShowEspelhoDialog,
  confirmDeleteEspelho,
  setConfirmDeleteEspelho,
  showAnaliseDialog,
  setShowAnaliseDialog,
  showAnalisePreviewDrawer,
  setShowAnalisePreviewDrawer,
  confirmDeleteAllFiles,
  setConfirmDeleteAllFiles,
  isSaving,
  isDigitando,
  setIsDigitando,
  localAnaliseState,
  localManuscritoState,
  localEspelhoState,
  onEdit,
  onDelete,
  onSendSelectedImages,
  onEnviarProva,
  onSaveProva,
  onCancelarProva,
  onEnviarEspelho,
  onSaveEspelho,
  onCancelarEspelho,
  onExcluirEspelho,
  onSaveAnotacoes,
  onEnviarPdf,
  onCancelarAnalise,
  onSaveAnalisePreliminar,
  onValidarAnalise,
  onExecuteDeleteAllFiles,
  onExecuteManuscritoDelete,
  convertedImages
}: LeadDialogsProps) {
  const displayName = getDisplayName(lead);

  const handleCloseProvaDialog = () => {
    setIsDigitando(false);
    setTimeout(() => {
      setShowProvaDialog(false);
    }, 50);
  };

  const handleConfirmDeleteManuscrito = (open: boolean) => {
    if (!open) {
      setConfirmDeleteManuscrito(false);
      setManuscritoToDelete(null);
      setIsDigitando(false);
    }
  };

  return (
    <>
      {/* Diálogo de Detalhes do Lead */}
      <DialogDetalheLead
        lead={lead}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onEdit={(lead) => Promise.resolve(onEdit(lead))}
        isSaving={isSaving}
      />

      {/* Diálogo de Confirmação de Exclusão */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir o lead "{displayName}"? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={onDelete}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Galeria de Imagens */}
      <ImageGalleryDialog
        isOpen={showGallery}
        onClose={() => setShowGallery(false)}
        images={convertedImages}
        leadId={lead.id}
        title={`Imagens de ${displayName}`}
        description="Selecione as imagens da prova para enviar. Clique em uma miniatura para ver a imagem completa."
        selectionMode={true}
        onSend={onSendSelectedImages}
      />

      {/* Diálogo de Processo */}
      <ProcessDialog
        isOpen={showProcessDialog}
        onClose={() => setShowProcessDialog(false)}
        processType={processType}
        leadName={displayName}
        numFiles={lead.arquivos.length}
      />

      {/* Diálogo de Prova */}
      <ProvaDialog
        isOpen={showProvaDialog}
        onClose={handleCloseProvaDialog}
        leadId={lead.id}
        textoProva={lead.provaManuscrita || ""}
        aguardandoProva={localManuscritoState.aguardandoManuscrito}
        onSave={onSaveProva}
        onCancelarProva={onCancelarProva}
      />

      {/* Confirmação de Exclusão de Manuscrito */}
      <Dialog open={confirmDeleteManuscrito} onOpenChange={handleConfirmDeleteManuscrito}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
            <DialogDescription>
                             Tem certeza que deseja excluir a prova do lead "{displayName}"? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleConfirmDeleteManuscrito(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={onExecuteManuscritoDelete}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Seletor de Imagens para Manuscrito */}
      <ImageGalleryDialog
        isOpen={showManuscritoImageSeletor}
        onClose={() => setShowManuscritoImageSeletor(false)}
        images={convertedImages}
        leadId={lead.id}
        title="Selecionar Imagens para Prova"
        description="Selecione as imagens que serão usadas para o processo de digitação da prova."
        selectionMode={true}
        mode="prova"
        onSend={onEnviarProva}
        onCancelarProva={onCancelarProva}
        aguardandoProva={localManuscritoState.aguardandoManuscrito}
      />

      {/* Seletor de Espelho de Correção */}
      <ImageGalleryDialog
        isOpen={showEspelhoSeletor}
        onClose={() => setShowEspelhoSeletor(false)}
        images={convertedImages}
        leadId={lead.id}
        title="Selecionar Espelho de Correção"
        description="Selecione as imagens que serão utilizadas como espelho de correção. Você pode selecionar mais de uma imagem."
        selectionMode={true}
        mode="espelho"
        onSend={onEnviarEspelho}
      />

      {/* Diálogo de Edição do Espelho */}
      <EspelhoDialog
        isOpen={showEspelhoDialog}
        onClose={() => setShowEspelhoDialog(false)}
        leadId={lead.id}
        leadData={lead}
        textoEspelho={lead.textoDOEspelho || null}
        imagensEspelho={(() => {
          // Priorizar estado local se disponível, senão usar do lead
          if (localEspelhoState.espelhoCorrecao && localEspelhoState.espelhoCorrecao !== '[]') {
            try {
              const result = typeof localEspelhoState.espelhoCorrecao === 'string' 
                ? JSON.parse(localEspelhoState.espelhoCorrecao) 
                : localEspelhoState.espelhoCorrecao;
              return result;
            } catch (error) {
              return [];
            }
          }
          // Fallback para o campo do lead
          if (lead.espelhoCorrecao && lead.espelhoCorrecao !== '[]') {
            try {
              const result = JSON.parse(lead.espelhoCorrecao);
              return result;
            } catch (error) {
              return [];
            }
          }
          return [];
        })()}
        aguardandoEspelho={lead.aguardandoEspelho || localEspelhoState.aguardandoEspelho}
        onSave={onSaveEspelho}
        onCancelarEspelho={onCancelarEspelho}
      />

      {/* Confirmação de Exclusão do Espelho */}
      <Dialog open={confirmDeleteEspelho} onOpenChange={setConfirmDeleteEspelho}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir completamente o espelho de correção do lead "{displayName}"? 
              Esta ação irá remover tanto o texto quanto as imagens do espelho e não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteEspelho(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={onExcluirEspelho}>
              Excluir Espelho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Análise */}
      <AnaliseDialog
        isOpen={showAnaliseDialog}
        onClose={() => setShowAnaliseDialog(false)}
        leadId={lead.id}
        sourceId={lead.sourceId}
        analiseUrl={localAnaliseState.analiseUrl || null}
        argumentacaoUrl={lead.argumentacaoUrl || null}
        anotacoes={lead.anotacoes || null}
        aguardandoAnalise={localAnaliseState.aguardandoAnalise}
        onSaveAnotacoes={onSaveAnotacoes}
        onEnviarPdf={onEnviarPdf}
        onCancelarAnalise={onCancelarAnalise}
      />

      {/* Drawer de Pré-Análise */}
      <AnalisePreviewDrawer
        isOpen={showAnalisePreviewDrawer}
        onClose={() => setShowAnalisePreviewDrawer(false)}
        analisePreliminar={localAnaliseState.analisePreliminar}
        leadId={lead.id}
        onSave={onSaveAnalisePreliminar}
        onValidar={onValidarAnalise}
      />

      {/* Confirmação de Exclusão de Todos os Arquivos */}
      <Dialog open={confirmDeleteAllFiles} onOpenChange={setConfirmDeleteAllFiles}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar exclusão completa de arquivos</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir <strong>TODOS os arquivos</strong> do lead "{displayName}"?
            </DialogDescription>
            <div className="space-y-2 mt-4">
              <div className="text-sm bg-muted/50 p-3 rounded-md border-l-4 border-destructive/20">
                <div className="font-medium text-foreground mb-2">Esta ação irá excluir:</div>
                <ul className="text-muted-foreground space-y-1 list-disc list-inside">
                  <li>{lead.arquivos.length} arquivo(s) individual(is)</li>
                  {lead.pdfUnificado && <li>PDF unificado</li>}
                                     {(lead.provaManuscrita || lead.manuscritoProcessado) && <li>Prova digitada</li>}
                  {((lead.espelhoCorrecao && lead.espelhoCorrecao !== '[]') || lead.textoDOEspelho) && <li>Espelho de correção individual</li>}
                  {(localAnaliseState.analiseUrl || localAnaliseState.analisePreliminar || localAnaliseState.aguardandoAnalise) && <li>Análise da prova</li>}
                </ul>
                <div className="text-destructive font-medium mt-2">
                  ⚠️ Esta ação não pode ser desfeita!
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  Nota: Espelhos da biblioteca não serão afetados.
                </div>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteAllFiles(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={onExecuteDeleteAllFiles}>
              Excluir Todos os Arquivos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
} 