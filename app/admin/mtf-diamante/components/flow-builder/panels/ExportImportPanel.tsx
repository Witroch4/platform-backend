"use client";

import { useState, useRef, useCallback } from "react";
import { Download, Upload, Eye, Copy, Check, AlertCircle } from "lucide-react";
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
	const fileInputRef = useRef<HTMLInputElement>(null);

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

	const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		setSelectedFile(file || null);
		setImportError(null);
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
				<Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
					<DialogContent className="w-[96vw] sm:max-w-md">
						<DialogHeader>
							<DialogTitle>Importar Flow</DialogTitle>
							<DialogDescription>Selecione um arquivo JSON exportado anteriormente.</DialogDescription>
						</DialogHeader>

						<div className="space-y-4 py-4">
							{importError && (
								<Alert variant="destructive">
									<AlertCircle className="h-4 w-4" />
									<AlertDescription>{importError}</AlertDescription>
								</Alert>
							)}

							<div className="space-y-2">
								<Label htmlFor="flow-file">Arquivo JSON</Label>
								<Input
									id="flow-file"
									type="file"
									accept=".json,application/json"
									ref={fileInputRef}
									onChange={handleFileSelect}
									disabled={isLoading}
								/>
								{selectedFile && (
									<p className="text-xs text-muted-foreground">
										Arquivo: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
									</p>
								)}
							</div>

							<div className="space-y-2">
								<Label htmlFor="flow-name">Nome do flow (opcional)</Label>
								<Input
									id="flow-name"
									value={importName}
									onChange={(e) => setImportName(e.target.value)}
									placeholder="Usar nome original do arquivo"
									disabled={isLoading}
								/>
							</div>
						</div>

						<DialogFooter className="gap-2 sm:gap-0">
							<Button variant="outline" onClick={() => setIsImportDialogOpen(false)} disabled={isLoading}>
								Cancelar
							</Button>
							<Button onClick={handleImport} disabled={!selectedFile || isLoading}>
								{isLoading ? "Importando..." : "Importar"}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

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
