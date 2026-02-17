"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { FlowCanvas } from "./flow-builder/FlowCanvas";
import { NodePalette } from "./flow-builder/panels/NodePalette";
import { NodeDetailDialog } from "./flow-builder/panels/NodeDetailDialog";
import { TemplateConfigDialog } from "./flow-builder/dialogs/TemplateConfigDialog";
import { FlowSelector } from "./flow-builder/panels/FlowSelector";
import { ExportImportPanel } from "./flow-builder/panels/ExportImportPanel";
import { FlowBuilderProvider } from "./flow-builder/context/FlowBuilderContext";
import { HandlePopover } from "./flow-builder/panels/HandlePopover";
import { useFlowBuilderTab } from "./flow-builder/hooks/FlowBuilderTabHooks";
import { ResetDialog, ImportDialog } from "./flow-builder/FlowBuilderTabDialogs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Save,
	RotateCcw,
	AlertTriangle,
	Loader2,
	LayoutGrid,
	Import,
	ChevronLeft,
	Workflow,
	Cloud,
	CloudOff,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";

// =============================================================================
// INNER CANVAS (needs ReactFlowProvider parent)
// =============================================================================

interface FlowBuilderInnerProps {
	caixaId: string;
}

function FlowBuilderInner({ caixaId }: FlowBuilderInnerProps) {
	const {
		// Flow selection state
		selectedFlowId,
		isEditing,
		setSelectedFlowId,
		setIsEditing,

		// Flow canvas data
		nodes,
		edges,
		onNodesChange,
		onEdgesChange,
		onConnect,

		// Flow canvas meta
		canvasVersion,
		currentFlowMeta,
		isLoading,
		isSaving,
		isAutoSaving,
		lastAutoSaveTime,
		error,

		// Export/Import
		exportFlowAsJson,
		importFlowFromJson,
		getCanvasAsN8nFormat,

		// Dialog state
		selectedNode,
		dialogOpen,
		templateDialogOpen,
		showResetDialog,
		showImportDialog,
		isImporting,
		setDialogOpen,
		setTemplateDialogOpen,
		setShowResetDialog,
		setShowImportDialog,

		// Import status
		canImport,
		importStats,

		// Popover state
		popoverState,
		closePopover,

		// Data
		channelType,
		messagesForDialog,

		// Handlers
		handleSelectFlow,
		handleCreateNew,
		handleBackToList,
		handleDrop,
		handleDropElement,
		handleDropTemplateElement,
		handleNodeDoubleClick,
		handleNodeSelect,
		handleUpdateNodeData,
		handleLinkMessageWithReactions,
		handleCloseDialog,
		handleConnectEnd,
		handlePopoverSelect,
		handleSave,
		handleAutoLayout,
		handleReset,
		handleImport,
	} = useFlowBuilderTab(caixaId);

	// ---------------------------------------------------------------------------
	// Loading / error states
	// ---------------------------------------------------------------------------

	if (isLoading) {
		return (
			<div className="flex h-[calc(100vh-200px)] items-center justify-center">
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="h-4 w-4 animate-spin" />
					Carregando fluxo...
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex h-[calc(100vh-200px)] items-center justify-center">
				<div className="text-center space-y-2">
					<AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
					<p className="text-sm text-destructive">Erro ao carregar fluxo</p>
					<p className="text-xs text-muted-foreground">{String(error)}</p>
				</div>
			</div>
		);
	}

	// ---------------------------------------------------------------------------
	// Render: Flow Selection View (quando nao esta editando)
	// ---------------------------------------------------------------------------

	if (!isEditing) {
		return (
			<div className="px-1">
				<div className="flex items-center justify-between mb-4">
					<h3 className="text-sm font-medium">Flow Builder</h3>
				</div>

				<div className="max-w-md">
					<FlowSelector
						inboxId={caixaId}
						selectedFlowId={selectedFlowId}
						onSelectFlow={handleSelectFlow}
						onCreateNew={handleCreateNew}
					/>

					{selectedFlowId && (
						<div className="mt-4">
							<Button onClick={() => setIsEditing(true)} className="w-full">
								<Workflow className="h-4 w-4 mr-2" />
								Editar flow selecionado
							</Button>
						</div>
					)}
				</div>
			</div>
		);
	}

	// ---------------------------------------------------------------------------
	// Render: Flow Editor View (quando esta editando)
	// ---------------------------------------------------------------------------

	return (
		<>
			{/* Toolbar */}
			<div className="flex items-center justify-between px-1 pb-3">
				<div className="flex items-center gap-2">
					<Button variant="ghost" size="sm" className="h-8 px-2" onClick={handleBackToList}>
						<ChevronLeft className="h-4 w-4 mr-1" />
						Voltar
					</Button>

					<Separator orientation="vertical" className="h-5" />

					<div className="flex items-center gap-2">
						<Workflow className="h-4 w-4 text-muted-foreground" />
						<span className="text-sm font-medium">{currentFlowMeta?.name || "Novo Flow"}</span>
						{canvasVersion > 0 && (
							<Badge variant="secondary" className="text-[10px]">
								v{canvasVersion}
							</Badge>
						)}
					</div>

					{/* Auto-save indicator */}
					{selectedFlowId && (
						<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
							{isAutoSaving ? (
								<>
									<Loader2 className="h-3 w-3 animate-spin" />
									<span>Salvando...</span>
								</>
							) : lastAutoSaveTime ? (
								<>
									<Cloud className="h-3 w-3 text-green-500" />
									<span>Salvo</span>
								</>
							) : (
								<>
									<CloudOff className="h-3 w-3" />
									<span>Nao salvo</span>
								</>
							)}
						</div>
					)}
				</div>

				<div className="flex items-center gap-2">
					{/* Export/Import JSON */}
					<ExportImportPanel
						onExport={exportFlowAsJson}
						onImport={importFlowFromJson}
						getN8nPreview={getCanvasAsN8nFormat}
						hasSelectedFlow={!!selectedFlowId}
						disabled={isSaving}
						onImportSuccess={(flowId) => {
							setSelectedFlowId(flowId);
							setIsEditing(true);
						}}
					/>

					<Separator orientation="vertical" className="h-5" />

					{/* Import button - only shows when canvas is empty and there are reactions */}
					{canImport && (
						<Button
							variant="outline"
							size="sm"
							className="h-8 text-xs border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
							onClick={() => setShowImportDialog(true)}
							disabled={isSaving || isImporting}
						>
							<Import className="h-3.5 w-3.5 mr-1" />
							Importar ({importStats?.reactions ?? 0} reacoes)
						</Button>
					)}

					<Button
						variant="ghost"
						size="sm"
						className="h-8 text-xs"
						onClick={() => setShowResetDialog(true)}
						disabled={isSaving}
					>
						<RotateCcw className="h-3.5 w-3.5 mr-1" />
						Reiniciar
					</Button>

					<Button
						variant="ghost"
						size="sm"
						className="h-8 text-xs"
						onClick={handleAutoLayout}
						disabled={isSaving || nodes.length < 2}
					>
						<LayoutGrid className="h-3.5 w-3.5 mr-1" />
						Organizar
					</Button>

					<Button variant="default" size="sm" className="h-8 text-xs" onClick={handleSave} disabled={isSaving}>
						{isSaving ? (
							<Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
						) : (
							<Save className="h-3.5 w-3.5 mr-1" />
						)}
						Salvar
					</Button>
				</div>
			</div>

			{/* Main content: Palette | Canvas */}
			<div className="flex h-[calc(100vh-240px)] gap-3">
				<NodePalette channelType={channelType} />

				<div className="flex-1 rounded-lg border bg-muted/20 overflow-hidden">
					<FlowCanvas
						nodes={nodes}
						edges={edges}
						onNodesChange={onNodesChange}
						onEdgesChange={onEdgesChange}
						onConnect={onConnect}
						onDrop={handleDrop}
						onDropElement={handleDropElement}
						onDropTemplateElement={handleDropTemplateElement}
						onNodeDoubleClick={handleNodeDoubleClick}
						onNodeSelect={handleNodeSelect}
						onConnectEnd={handleConnectEnd}
					/>
				</div>
			</div>

			{/* Node Detail Dialog (opens on double-click) */}
			<NodeDetailDialog
				node={selectedNode}
				open={dialogOpen}
				onOpenChange={handleCloseDialog}
				onUpdateNodeData={handleUpdateNodeData}
				interactiveMessages={messagesForDialog}
				onLinkMessageWithReactions={handleLinkMessageWithReactions}
			/>

			{/* Template Config Dialog (opens on double-click for TEMPLATE nodes) */}
			<TemplateConfigDialog
				node={selectedNode}
				open={templateDialogOpen}
				onOpenChange={setTemplateDialogOpen}
				onUpdateNodeData={handleUpdateNodeData}
				caixaId={caixaId}
			/>

			{/* Handle Popover (appears when dragging from handle to empty canvas) */}
			<HandlePopover
				anchorX={popoverState.anchorX}
				anchorY={popoverState.anchorY}
				open={popoverState.open}
				onClose={closePopover}
				onSelectType={handlePopoverSelect}
			/>

			{/* Reset confirmation */}
			<ResetDialog open={showResetDialog} onOpenChange={setShowResetDialog} onConfirm={handleReset} />

			{/* Import confirmation */}
			<ImportDialog
				open={showImportDialog}
				onOpenChange={setShowImportDialog}
				onConfirm={handleImport}
				isImporting={isImporting}
				stats={importStats}
			/>
		</>
	);
}

// =============================================================================
// EXPORTED TAB (wraps with ReactFlowProvider)
// =============================================================================

interface FlowBuilderTabProps {
	caixaId: string;
}

export function FlowBuilderTab({ caixaId }: FlowBuilderTabProps) {
	return (
		<ReactFlowProvider>
			<FlowBuilderProvider caixaId={caixaId}>
				<FlowBuilderInner caixaId={caixaId} />
			</FlowBuilderProvider>
		</ReactFlowProvider>
	);
}

export default FlowBuilderTab;
