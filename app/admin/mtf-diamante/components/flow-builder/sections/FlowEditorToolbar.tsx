"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ExportImportPanel } from "../panels/ExportImportPanel";
import type { FlowExportFormat } from "@/types/flow-builder";
import {
	Save,
	RotateCcw,
	Loader2,
	LayoutGrid,
	Import,
	ChevronLeft,
	Workflow,
	Cloud,
	CloudOff,
} from "lucide-react";

interface FlowMeta {
	name?: string;
	id?: string;
}

interface FlowEditorToolbarProps {
	flowMeta: FlowMeta | null;
	canvasVersion: number;
	selectedFlowId: string | null;
	isSaving: boolean;
	isAutoSaving: boolean;
	lastAutoSaveTime: Date | null;
	nodeCount: number;
	canImport: boolean;
	importStats?: { messages: number; reactions: number };
	isImporting: boolean;
	// Handlers
	onBack: () => void;
	onSave: () => void;
	onReset: () => void;
	onAutoLayout: () => void;
	onImport: () => void;
	// Export/Import JSON (tipos do ExportImportPanel)
	onExport: () => Promise<void>;
	onJsonImport: (file: File, options?: { newName?: string }) => Promise<{ id: string; name: string; nodeCount: number; connectionCount: number }>;
	getN8nPreview: () => FlowExportFormat;
	onImportSuccess: (flowId: string) => void;
}

export function FlowEditorToolbar({
	flowMeta,
	canvasVersion,
	selectedFlowId,
	isSaving,
	isAutoSaving,
	lastAutoSaveTime,
	nodeCount,
	canImport,
	importStats,
	isImporting,
	onBack,
	onSave,
	onReset,
	onAutoLayout,
	onImport,
	onExport,
	onJsonImport,
	getN8nPreview,
	onImportSuccess,
}: FlowEditorToolbarProps) {
	return (
		<div className="flex items-center justify-between px-1 pb-3">
			<div className="flex items-center gap-2">
				<Button variant="ghost" size="sm" className="h-8 px-2" onClick={onBack}>
					<ChevronLeft className="h-4 w-4 mr-1" />
					Voltar
				</Button>

				<Separator orientation="vertical" className="h-5" />

				<div className="flex items-center gap-2">
					<Workflow className="h-4 w-4 text-muted-foreground" />
					<span className="text-sm font-medium">{flowMeta?.name || "Novo Flow"}</span>
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
								<span>Não salvo</span>
							</>
						)}
					</div>
				)}
			</div>

			<div className="flex items-center gap-2">
				{/* Export/Import JSON */}
				<ExportImportPanel
					onExport={onExport}
					onImport={onJsonImport}
					getN8nPreview={getN8nPreview}
					hasSelectedFlow={!!selectedFlowId}
					disabled={isSaving}
					onImportSuccess={onImportSuccess}
				/>

				<Separator orientation="vertical" className="h-5" />

				{/* Import button - only shows when canvas is empty and there are reactions */}
				{canImport && (
					<Button
						variant="outline"
						size="sm"
						className="h-8 text-xs border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
						onClick={onImport}
						disabled={isSaving || isImporting}
					>
						<Import className="h-3.5 w-3.5 mr-1" />
						Importar ({importStats?.reactions ?? 0} reações)
					</Button>
				)}

				<Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onReset} disabled={isSaving}>
					<RotateCcw className="h-3.5 w-3.5 mr-1" />
					Reiniciar
				</Button>

				<Button
					variant="ghost"
					size="sm"
					className="h-8 text-xs"
					onClick={onAutoLayout}
					disabled={isSaving || nodeCount < 2}
				>
					<LayoutGrid className="h-3.5 w-3.5 mr-1" />
					Organizar
				</Button>

				<Button variant="default" size="sm" className="h-8 text-xs" onClick={onSave} disabled={isSaving}>
					{isSaving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
					Salvar
				</Button>
			</div>
		</div>
	);
}

export default FlowEditorToolbar;
