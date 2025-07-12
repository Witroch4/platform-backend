"use client";

import { TableRow, TableCell } from "@/components/ui/table";
import { LeadItemProps } from "./componentes-lead-item/types";
import { useLeadState, useDialogState, useLeadHandlers } from "./componentes-lead-item/hooks";
import { 
  SelectCell,
  InfoCell,
  UserCell,
  FilesCell,
  PdfCell,
  ImagesCell,
  ManuscritoCell,
  EspelhoCell,
  EspelhoPadraoCell,
  AnaliseCell,
  RecursoCell,
  ConsultoriaCell
} from "./componentes-lead-item/cells";
import { LeadDialogs } from "./componentes-lead-item/dialogs";
import { BibliotecaEspelhosDrawer } from "../biblioteca-espelhos-drawer";
import { SSEStatusIndicator } from "../sse-status-indicator";
import { useState } from "react";

export function LeadItem({
  lead,
  isSelected,
  onSelect,
  onDelete,
  onEdit,
  onUnificar,
  onConverter,
  onDigitarManuscrito,
  onRefresh,
  isUnifying,
  isConverting,
  espelhosPadrao = [],
  loadingEspelhosPadrao = false,
}: LeadItemProps) {
  
  // Estados do lead
  const leadState = useLeadState(lead, onRefresh);
  
  // Estados dos diálogos
  const dialogState = useDialogState();
  
  // Estado da biblioteca de espelhos
  const [showBibliotecaEspelhos, setShowBibliotecaEspelhos] = useState(false);

  // Verificar se o lead está aguardando processamento (para mostrar indicador)
  const isAwaitingProcessing = Boolean(
    lead.aguardandoManuscrito || 
    lead.aguardandoEspelho || 
    lead.aguardandoAnalise
  );
  
  // Handlers e lógica
  const handlers = useLeadHandlers({
    lead,
    onEdit,
    onDelete,
    onUnificar,
    onConverter,
    onDigitarManuscrito,
    ...dialogState,
    ...leadState,
    forceServerRefresh: leadState.forceServerRefresh
  });

  // Handler para abrir biblioteca de espelhos
  const handleOpenBiblioteca = () => {
    setShowBibliotecaEspelhos(true);
  };

  // Handler para mudança de especialidade do lead
  const handleEspelhoPadraoChange = (leadId: string, especialidade: string | null) => {
    // Atualizar o lead localmente com flag especial para evitar efeitos colaterais
    const updatedLead = {
      ...lead,
      especialidade: especialidade as any, // Cast para EspecialidadeJuridica
      _especialidadeUpdate: true, // Flag para identificar que é apenas atualização de especialidade
      _skipDialog: true, // Flag para não abrir diálogos automaticamente
    };
    
    // Notificar o componente pai sobre a mudança
    onEdit(updatedLead);
  };

  return (
    <>
      <TableRow 
        data-lead-id={lead.id}
        className={`group hover:bg-secondary/30 ${
          leadState.consultoriaAtiva 
            ? 'border-2 border-[#AFDAFE] bg-[#4BB8EB]/10 hover:bg-[#4BB8EB]/20' 
            : ''
        }`}
      >
        {/* Célula de Seleção */}
        <SelectCell
          isSelected={isSelected}
          onSelect={onSelect}
          leadId={lead.id}
        />
        
        {/* Célula de Informações */}
        <InfoCell
          lead={lead}
          onEdit={onEdit}
          onViewDetails={handlers.handleViewDetails}
          onShowFullImage={handlers.handleShowFullImage}
        />
        
        {/* Célula do Usuário */}
        <UserCell lead={lead} onEdit={onEdit} />
        
        {/* Célula de Arquivos */}
        <FilesCell
          lead={lead}
          onEdit={onEdit}
          onDelete={onDelete}
          onContextMenuAction={handlers.handleContextMenuAction}
          onDeleteFile={handlers.handleDeleteFile}
          onReloadAfterDelete={handlers.reloadAfterDelete}
        />
        
        {/* Célula de PDF */}
        <PdfCell
        lead={lead}
          onEdit={onEdit}
          onUnificar={handlers.handleUnificarArquivos}
          isUnifying={isUnifying}
          onContextMenuAction={handlers.handleContextMenuAction}
          onDeleteFile={handlers.handleDeleteFile}
          onReloadAfterDelete={handlers.reloadAfterDelete}
        />
        
        {/* Célula de Imagens */}
        <ImagesCell
          lead={lead}
          onEdit={onEdit}
          onConverter={() => handlers.handlePdfToImages()}
          isConverting={isConverting}
          onContextMenuAction={handlers.handleContextMenuAction}
          onDeleteFile={handlers.handleDeleteFile}
          onReloadAfterDelete={handlers.reloadAfterDelete}
          onShowGallery={handlers.handleShowGallery}
        />
        
        {/* Célula de Manuscrito */}
        <ManuscritoCell
          lead={lead}
          onEdit={onEdit}
          onDigitarManuscrito={onDigitarManuscrito}
          manuscritoProcessadoLocal={leadState.manuscritoProcessadoLocal}
          isDigitando={dialogState.isDigitando}
          refreshKey={leadState.refreshKey}
          localManuscritoState={leadState.localManuscritoState}
          onContextMenuAction={handlers.handleContextMenuAction}
          onDigitarClick={handlers.handleDigitarClick}
        />
        
        {/* Célula de Espelho */}
        <EspelhoCell
          lead={lead}
          onEdit={onEdit}
          manuscritoProcessadoLocal={leadState.manuscritoProcessadoLocal}
          hasEspelho={leadState.hasEspelho}
          consultoriaAtiva={leadState.consultoriaAtiva}
          isEnviandoEspelho={dialogState.isEnviandoEspelho}
          isUploadingEspelho={dialogState.isUploadingEspelho}
          refreshKey={leadState.refreshKey}
          localEspelhoState={leadState.localEspelhoState}
          onContextMenuAction={handlers.handleContextMenuAction}
          onEspelhoClick={handlers.handleEspelhoClick}
          onOpenFileUpload={handlers.handleOpenFileUpload}
          onOpenBiblioteca={handleOpenBiblioteca}
          onOpenEspelhoSeletor={() => dialogState.setShowEspelhoSeletor(true)}
        />
        
        {/* Célula de Espelho Padrão */}
        <EspelhoPadraoCell
          lead={lead}
          onEdit={onEdit}
          usuarioId={lead.usuarioId}
          onEspelhoPadraoChange={handleEspelhoPadraoChange}
          espelhosPadrao={espelhosPadrao}
          loadingEspelhosPadrao={loadingEspelhosPadrao}
        />
        
        {/* Célula de Análise */}
        <AnaliseCell
          lead={lead}
          onEdit={onEdit}
          localAnaliseState={leadState.localAnaliseState}
          consultoriaAtiva={leadState.consultoriaAtiva}
          isEnviandoAnalise={dialogState.isEnviandoAnalise}
          refreshKey={leadState.refreshKey}
          onContextMenuAction={handlers.handleContextMenuAction}
          onAnaliseClick={handlers.handleAnaliseClick}
        />
        
        {/* Célula de Recurso */}
        <RecursoCell
          lead={lead}
          onEdit={onEdit}
          localAnaliseState={leadState.localAnaliseState}
          isEnviandoRecurso={dialogState.isEnviandoRecurso || false}
          refreshKey={leadState.refreshKey}
          onContextMenuAction={handlers.handleContextMenuAction}
          onRecursoClick={handlers.handleRecursoClick}
        />
        
        {/* Célula de Consultoria */}
        <ConsultoriaCell
          lead={lead}
          onEdit={onEdit}
          consultoriaAtiva={leadState.consultoriaAtiva}
          isUploadingEspelho={dialogState.isUploadingEspelho}
          onConsultoriaToggle={handlers.handleConsultoriaToggle}
        />
        
        {/* Célula de Status - mostrar apenas se está aguardando processamento */}
        {isAwaitingProcessing && (
          <TableCell className="w-[120px] p-2 align-middle">
            <SSEStatusIndicator 
              isConnected={true} 
              error={null}
              className="w-full justify-center"
            />
          </TableCell>
        )}
      </TableRow>

      {/* Todos os Diálogos */}
      <LeadDialogs
        lead={lead}
        convertedImages={handlers.getConvertedImages()}
        {...dialogState}
        {...leadState}
        onEdit={handlers.handleEditLead}
        onDelete={handlers.handleDelete}
        onSendSelectedImages={handlers.handleSendSelectedImages}
        onEnviarManuscrito={handlers.handleEnviarManuscrito}
        onSaveManuscrito={handlers.handleSaveManuscrito}
        onCancelarManuscrito={handlers.handleCancelarManuscrito}
        onEnviarEspelho={handlers.handleEnviarEspelho}
        onSaveEspelho={handlers.handleSaveEspelho}
        onCancelarEspelho={handlers.handleCancelarEspelho}
        onExcluirEspelho={handlers.handleExcluirEspelho}
        onSaveAnotacoes={handlers.handleSaveAnotacoes}
        onEnviarPdf={handlers.handleEnviarPdf}
        onCancelarAnalise={handlers.handleExcluirAnalise}
        onSaveAnalisePreliminar={handlers.handleSaveAnalisePreliminar}
        onValidarAnalise={handlers.handleValidarAnalise}
        onExecuteDeleteAllFiles={handlers.handleExecuteDeleteAllFiles}
        onExecuteManuscritoDelete={handlers.handleExcluirManuscrito}
      />
      
      {/* Biblioteca de Espelhos Drawer */}
      <BibliotecaEspelhosDrawer
        isOpen={showBibliotecaEspelhos}
        onClose={() => setShowBibliotecaEspelhos(false)}
        lead={lead}
        onLeadUpdate={onEdit}
        usuarioId={lead.usuarioId}
      />
    </>
  );
}