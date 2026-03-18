"use client";

import { useState, useCallback } from "react";
import { Download, Upload, Eye, Copy, Check, AlertCircle, FileJson, X } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { generateConnectionsDebugView } from "@/lib/flow-builder/exportImport";
import type { FlowExportFormat } from "@/types/flow-builder";

// =============================================================================
// TYPES
// =============================================================================

interface ExportImportPanelProps {
	/** Função para exportar flow (dispara download) */
	onExport: () => Promise<void>;
	/** Função para importar flow de arquivo */
	onImport: (
		file: File,
		options?: { newName?: string },
	) => Promise<{ id: string; name: string; nodeCount: number; connectionCount: number }>;
	/** Função para obter preview do canvas em formato n8n */
	getN8nPreview: () => FlowExportFormat;
	/** Se há um flow selecionado */
	hasSelectedFlow: boolean;
	/** Se os botões estão desabilitados */
	disabled?: boolean;
	/** Callback após importação bem-sucedida */
	onImportSuccess?: (flowId: string) => void;
}

// =============================================================================
// IMPORT FLOW DIALOG
// =============================================================================

function ImportFlowDialog({
	open,
	onOpenChange,
	selectedFile,
	setSelectedFile,
	importName,
	setImportName,
	importError,
	isLoading,
	onDrop,
	onImport,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	selectedFile: File | null;
	setSelectedFile: (file: File | null) => void;
	importName: string;
	setImportName: (name: string) => void;
	importError: string | null;
	isLoading: boolean;
	onDrop: (files: File[]) => void;
	onImport: () => void;
}) {
	const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
		onDrop,
		accept: { "application/json": [".json"] },
		maxFiles: 1,
		multiple: false,
		disabled: isLoading,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="w-[96vw] sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="text-lg font-semibold">Importar Flow</DialogTitle>
					<DialogDescription className="text-sm">
						Arraste um arquivo JSON ou clique para selecionar.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					{importError && (
						<Alert variant="destructive">
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>{importError}</AlertDescription>
						</Alert>
					)}

					{/* Drop Zone */}
					{!selectedFile ? (
						<div
							{...getRootProps()}
							className={`
								group relative flex flex-col items-center justify-center
								w-full min-h-[160px] rounded-xl border-2 border-dashed
								cursor-pointer transition-all duration-200 ease-out
								${isDragActive && !isDragReject
									? "border-primary bg-primary/5 dark:bg-primary/10 scale-[1.01]"
									: isDragReject
										? "border-destructive bg-destructive/5"
										: "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50 dark:hover:bg-muted/30"
								}
								${isLoading ? "pointer-events-none opacity-50" : ""}
							`}
						>
							<input {...getInputProps()} />

							<div className={`
								flex items-center justify-center w-12 h-12 rounded-xl mb-3
								transition-all duration-200
								${isDragActive
									? "bg-primary/15 text-primary scale-110"
									: "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary group-hover:scale-105"
								}
							`}>
								{isDragActive ? (
									<FileJson className="h-6 w-6" />
								) : (
									<Upload className="h-6 w-6" />
								)}
							</div>

							{isDragActive ? (
								<p className="text-sm font-medium text-primary">
									Solte o arquivo aqui
								</p>
							) : (
								<>
									<p className="text-sm font-medium text-foreground">
										Arraste o arquivo JSON aqui
									</p>
									<p className="text-xs text-muted-foreground mt-1">
										ou clique para selecionar
									</p>
								</>
							)}
						</div>
					) : (
						/* File Selected State */
						<div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/40 dark:bg-muted/20 transition-all duration-200">
							<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary shrink-0">
								<FileJson className="h-5 w-5" />
							</div>
							<div className="flex-1 min-w-0">
								<p className="text-sm font-medium text-foreground truncate">
									{selectedFile.name}
								</p>
								<p className="text-xs text-muted-foreground">
									{(selectedFile.size / 1024).toFixed(1)} KB
								</p>
							</div>
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									setSelectedFile(null);
								}}
								className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors duration-150 shrink-0"
								aria-label="Remover arquivo"
							>
								<X className="h-4 w-4" />
							</button>
						</div>
					)}

					{/* Flow Name */}
					<div className="space-y-2">
						<Label htmlFor="flow-name" className="text-sm">
							Nome do flow <span className="text-muted-foreground font-normal">(opcional)</span>
						</Label>
						<Input
							id="flow-name"
							value={importName}
							onChange={(e) => setImportName(e.target.value)}
							placeholder="Usar nome original do arquivo"
							disabled={isLoading}
							className="h-9"
						/>
					</div>
				</div>

				<DialogFooter className="gap-2 sm:gap-0">
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isLoading}
						className="h-9"
					>
						Cancelar
					</Button>
					<Button
						onClick={onImport}
						disabled={!selectedFile || isLoading}
						className="h-9"
					>
						{isLoading ? (
							<>
								<span className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
								Importando...
							</>
						) : (
							<>
								<Upload className="h-4 w-4 mr-2" />
								Importar
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ExportImportPanel({
	onExport,
	onImport,
	getN8nPreview,
	hasSelectedFlow,
	disabled,
	onImportSuccess,
}: ExportImportPanelProps) {
	// State
	const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
	const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [importName, setImportName] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [previewData, setPreviewData] = useState<FlowExportFormat | null>(null);
	const [copied, setCopied] = useState(false);
	const [importError, setImportError] = useState<string | null>(null);

	// Handlers
	const handleExport = useCallback(async () => {
		if (!hasSelectedFlow) {
			toast.error("Selecione um flow para exportar");
			return;
		}

		setIsLoading(true);
		try {
			await onExport();
			toast.success("Flow exportado com sucesso");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Erro ao exportar flow");
		} finally {
			setIsLoading(false);
		}
	}, [hasSelectedFlow, onExport]);

	const handleImport = useCallback(async () => {
		if (!selectedFile) return;

		setIsLoading(true);
		setImportError(null);

		try {
			const result = await onImport(selectedFile, {
				newName: importName || undefined,
			});

			toast.success(`Flow "${result.name}" importado com sucesso`, {
				description: `${result.nodeCount} nós, ${result.connectionCount} conexões`,
			});

			setIsImportDialogOpen(false);
			setSelectedFile(null);
			setImportName("");

			// Callback para selecionar o flow importado
			if (onImportSuccess) {
				onImportSuccess(result.id);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : "Erro ao importar flow";
			setImportError(message);
			toast.error(message);
		} finally {
			setIsLoading(false);
		}
	}, [selectedFile, importName, onImport, onImportSuccess]);

	const handlePreview = useCallback(() => {
		if (!hasSelectedFlow) {
			toast.error("Selecione um flow para visualizar");
			return;
		}

		try {
			const data = getN8nPreview();
			setPreviewData(data);
			setIsPreviewDialogOpen(true);
		} catch (error) {
			toast.error("Erro ao gerar preview");
		}
	}, [hasSelectedFlow, getN8nPreview]);

	const handleCopyJson = useCallback(async () => {
		if (!previewData) return;

		try {
			await navigator.clipboard.writeText(JSON.stringify(previewData, null, 2));
			setCopied(true);
			toast.success("JSON copiado para a área de transferência");
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error("Erro ao copiar JSON");
		}
	}, [previewData]);

	const onDrop = useCallback((acceptedFiles: File[]) => {
		const file = acceptedFiles[0];
		if (file) {
			setSelectedFile(file);
			setImportError(null);
		}
	}, []);

	const handleOpenImportDialog = useCallback(() => {
		setImportError(null);
		setSelectedFile(null);
		setImportName("");
		setIsImportDialogOpen(true);
	}, []);

	// Render
	return (
		<TooltipProvider>
			<div className="flex items-center gap-1">
				{/* Export Button */}
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							onClick={handleExport}
							disabled={disabled || isLoading || !hasSelectedFlow}
							className="h-8 px-2"
						>
							<Download className="h-4 w-4" />
							<span className="ml-1 hidden sm:inline">Exportar</span>
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<p>Exportar flow como JSON</p>
					</TooltipContent>
				</Tooltip>

				{/* Import Button */}
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							onClick={handleOpenImportDialog}
							disabled={disabled || isLoading}
							className="h-8 px-2"
						>
							<Upload className="h-4 w-4" />
							<span className="ml-1 hidden sm:inline">Importar</span>
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<p>Importar flow de arquivo JSON</p>
					</TooltipContent>
				</Tooltip>

				{/* Preview/Debug Button */}
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							onClick={handlePreview}
							disabled={disabled || !hasSelectedFlow}
							className="h-8 px-2"
						>
							<Eye className="h-4 w-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<p>Ver conexões (debug)</p>
					</TooltipContent>
				</Tooltip>

				{/* Import Dialog */}
				<ImportFlowDialog
					open={isImportDialogOpen}
					onOpenChange={setIsImportDialogOpen}
					selectedFile={selectedFile}
					setSelectedFile={setSelectedFile}
					importName={importName}
					setImportName={setImportName}
					importError={importError}
					isLoading={isLoading}
					onDrop={onDrop}
					onImport={handleImport}
				/>

				{/* Preview/Debug Dialog */}
				<Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
					<DialogContent className="w-[96vw] sm:max-w-2xl max-h-[85vh]">
						<DialogHeader>
							<DialogTitle>Conexões do Flow (Debug)</DialogTitle>
							<DialogDescription>
								Visualização das conexões em formato legível. Útil para debug e verificação da estrutura do flow.
							</DialogDescription>
						</DialogHeader>

						<ScrollArea className="h-[400px] border rounded-md p-4 bg-muted/30">
							<pre className="whitespace-pre-wrap font-mono text-xs">
								{previewData && generateConnectionsDebugView(previewData)}
							</pre>
						</ScrollArea>

						<DialogFooter className="gap-2 sm:gap-0">
							<Button variant="outline" onClick={handleCopyJson} disabled={!previewData}>
								{copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
								{copied ? "Copiado!" : "Copiar JSON"}
							</Button>
							<Button variant="outline" onClick={() => setIsPreviewDialogOpen(false)}>
								Fechar
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>
		</TooltipProvider>
	);
}

export default ExportImportPanel;
