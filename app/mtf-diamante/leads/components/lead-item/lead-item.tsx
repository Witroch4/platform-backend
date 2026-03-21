"use client";

import { TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Trash2 } from "lucide-react";
import type { LeadItemProps } from "./componentes-lead-item/types";
import { useLeadState, useDialogState, useLeadHandlers } from "./componentes-lead-item/hooks";
import {
	SelectCell,
	InfoCell,
	UserCell,
	FilesCell,
	PdfCell,
	ImagesCell,
	ProvaCell,
	EspelhoCell,
	EspelhoPadraoCell,
	AnaliseCell,
	RecursoCell,
	ConsultoriaCell,
} from "./componentes-lead-item/cells";
import { LeadDialogs } from "./componentes-lead-item/dialogs";
import { BibliotecaEspelhosDrawer } from "../biblioteca-espelhos-drawer";
import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

export function LeadItem({
	lead,
	isSelected,
	onSelect,
	onDelete,
	onEdit,
	onUnificar,
	onConverter,
	onDigitarProva,
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

	// Estado para diálogo de confirmação de exclusão
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

	// Verificar se o lead está aguardando processamento (para mostrar indicador)
	const isAwaitingProcessing = Boolean(lead.aguardandoManuscrito || lead.aguardandoEspelho || lead.aguardandoAnalise);

	// Handlers e lógica
	const handlers = useLeadHandlers({
		lead,
		onEdit,
		onDelete,
		onUnificar,
		onConverter,
		onDigitarProva,
		...dialogState,
		...leadState,
		forceServerRefresh: leadState.forceServerRefresh,
	});

	// Handler para abrir biblioteca de espelhos
	const handleOpenBiblioteca = () => {
		setShowBibliotecaEspelhos(true);
	};

	// Handler para mudança de especialidade do lead
	const handleEspelhoPadraoChange = (leadId: string, especialidade: string | null, espelhoPadraoId?: string) => {
		// Atualizar o lead localmente com flag especial para evitar efeitos colaterais
		const updatedLead = {
			...lead,
			especialidade: especialidade, // Agora aceita qualquer string (removido enum)
			espelhoPadraoId: espelhoPadraoId,
			_especialidadeUpdate: true, // Flag para identificar que é apenas atualização de especialidade
			_skipDialog: true, // Flag para não abrir diálogos automaticamente
		};

		// Notificar o componente pai sobre a mudança
		onEdit(updatedLead);
	};

	// Handler para exclusão do lead
	const handleDeleteLead = () => {
		setShowDeleteConfirm(false);
		onDelete(lead.id);
	};

	return (
		<>
			<TableRow
				data-lead-id={lead.id}
				className={`group hover:bg-secondary/30 relative ${leadState.consultoriaAtiva ? "border-2 border-[#AFDAFE] bg-[#4BB8EB]/10 hover:bg-[#4BB8EB]/20" : ""
					}`}
			>
				{/* Célula de Seleção */}
				<SelectCell isSelected={isSelected} onSelect={onSelect} leadId={lead.id} />

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

				{/* Célula de Prova */}
				<ProvaCell
					lead={lead}
					onEdit={onEdit}
					onDigitarProva={onDigitarProva}
					provaProcessadaLocal={leadState.manuscritoProcessadoLocal}
					isDigitando={dialogState.isDigitando}
					refreshKey={leadState.refreshKey}
					localProvaState={{
						provaProcessada: leadState.localManuscritoState.manuscritoProcessado,
						aguardandoProva: leadState.localManuscritoState.aguardandoManuscrito,
						provaManuscrita: leadState.localManuscritoState.provaManuscrita,
					}}
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
					localRecursoState={leadState.localRecursoState}
					isEnviandoRecurso={dialogState.isEnviandoRecurso || false}
					refreshKey={leadState.refreshKey}
					onContextMenuAction={handlers.handleContextMenuAction}
					onRecursoClick={handlers.handleRecursoClick}
					onGerarRecurso={handlers.handleGerarRecurso}
				/>

				{/* Célula de Consultoria */}
				<ConsultoriaCell
					lead={lead}
					onEdit={onEdit}
					consultoriaAtiva={leadState.consultoriaAtiva}
					isUploadingEspelho={dialogState.isUploadingEspelho}
					onConsultoriaToggle={handlers.handleConsultoriaToggle}
					onDelete={() => setShowDeleteConfirm(true)}
				/>

				{/* Célula de Status Absoluta - fora do fluxo da tabela para não quebrar layout */}
				{isAwaitingProcessing && (
					<td className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center z-20 pointer-events-none">
						<img src="/animations/wifi-animated.svg" alt="Conectado" className="w-5 h-5 dark:invert opacity-70" />
					</td>
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
				onEnviarProva={handlers.handleEnviarManuscrito}
				onSaveProva={handlers.handleSaveManuscrito}
				onCancelarProva={handlers.handleCancelarManuscrito}
				onEnviarEspelho={handlers.handleEnviarEspelho}
				onSaveEspelho={handlers.handleSaveEspelho}
				onCancelarEspelho={handlers.handleCancelarEspelho}
				onExcluirEspelho={handlers.handleExcluirEspelho}
				onSaveAnotacoes={handlers.handleSaveAnotacoes}
				onSaveRecursoDraft={handlers.handleSaveRecursoDraft}
				onEnviarPdf={handlers.handleEnviarPdf}
				onCancelarAnalise={handlers.handleExcluirAnalise}
				onSaveAnalisePreliminar={handlers.handleSaveAnalisePreliminar}
				onValidarAnalise={handlers.handleValidarAnalise}
				onExecuteDeleteAllFiles={handlers.handleExecuteDeleteAllFiles}
				onExecuteManuscritoDelete={handlers.handleExcluirManuscrito}
				onValidarRecurso={handlers.handleValidarRecurso}
				onCancelarRecurso={handlers.handleCancelarRecurso}
				onGerarRecurso={handlers.handleGerarRecurso}
			/>

			{/* Biblioteca de Espelhos Drawer */}
			<BibliotecaEspelhosDrawer
				isOpen={showBibliotecaEspelhos}
				onClose={() => setShowBibliotecaEspelhos(false)}
				lead={lead}
				onLeadUpdate={onEdit}
				usuarioId={lead.usuarioId}
			/>

			{/* Diálogo de Confirmação de Exclusão */}
			<Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Confirmar exclusão</DialogTitle>
						<DialogDescription>
							Tem certeza que deseja excluir o lead <strong>{lead.nomeReal || lead.name || "Lead sem nome"}</strong>?
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2 mt-4">
						<div className="text-sm bg-muted/50 p-3 rounded-md border-l-4 border-destructive/20">
							<div className="font-medium text-foreground mb-2">Esta ação irá excluir:</div>
							<ul className="text-muted-foreground space-y-1 list-disc list-inside">
								<li>O lead e todas as suas informações</li>
								<li>Todos os arquivos associados</li>
								<li>PDFs unificados e imagens convertidas</li>
								<li>Provas e espelhos de correção</li>
								<li>Análises e recursos</li>
							</ul>
							<div className="text-destructive font-medium mt-2">⚠️ Esta ação não pode ser desfeita!</div>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
							Cancelar
						</Button>
						<Button variant="destructive" onClick={handleDeleteLead}>
							<Trash2 className="mr-2 h-4 w-4" />
							Excluir Lead
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
