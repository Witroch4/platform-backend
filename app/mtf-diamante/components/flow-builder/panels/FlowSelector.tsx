"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { mtfDiamanteQueryKeys } from "../../../lib/query-keys";
import { Plus, Workflow, Calendar, Edit2, Trash2, MoreVertical, CheckCircle2, XCircle, Megaphone, Upload, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

// =============================================================================
// TYPES
// =============================================================================

interface FlowListItem {
	id: string;
	name: string;
	inboxId: string;
	isActive: boolean;
	isCampaign: boolean;
	nodeCount: number;
	createdAt: string;
	updatedAt: string;
}

interface FlowSelectorProps {
	inboxId: string;
	selectedFlowId: string | null;
	onSelectFlow: (flowId: string | null) => void;
	onCreateNew: () => void;
}

// =============================================================================
// FETCHER
// =============================================================================

const fetcher = async (url: string) => {
	const res = await fetch(url);
	if (!res.ok) throw new Error("Falha ao carregar flows");
	return res.json();
};

// =============================================================================
// COMPONENT
// =============================================================================

export function FlowSelector({ inboxId, selectedFlowId, onSelectFlow, onCreateNew }: FlowSelectorProps) {
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
	const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [newFlowName, setNewFlowName] = useState("");
	const [editingFlow, setEditingFlow] = useState<FlowListItem | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [isImporting, setIsImporting] = useState(false);
	const [showCampaign, setShowCampaign] = useState(false);
	const importInputRef = useRef<HTMLInputElement>(null);

	const queryClient = useQueryClient();
	const queryKey = mtfDiamanteQueryKeys.flowSelector(inboxId, showCampaign);

	// Buscar lista de flows (filtra por isCampaign)
	const { data, error, isLoading: isLoadingFlows } = useQuery<{ success: boolean; data: FlowListItem[] }>({
		queryKey,
		queryFn: () => fetcher(`/api/admin/mtf-diamante/flows?inboxId=${inboxId}&isCampaign=${showCampaign}`),
		enabled: !!inboxId,
		placeholderData: keepPreviousData,
		refetchOnWindowFocus: false,
		staleTime: 30_000,
	});

	const flows = useMemo(() => data?.data ?? [], [data]);

	const mutate = useCallback(() => {
		queryClient.invalidateQueries({ queryKey });
	}, [queryClient, queryKey]);

	// Criar novo flow
	const handleCreateFlow = async () => {
		if (!newFlowName.trim()) {
			toast.error("Digite um nome para o flow");
			return;
		}

		setIsLoading(true);
		try {
			const res = await fetch("/api/admin/mtf-diamante/flows", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ inboxId, name: newFlowName.trim(), isCampaign: showCampaign }),
			});

			const result = await res.json();

			if (!res.ok || !result.success) {
				throw new Error(result.error || "Falha ao criar flow");
			}

			toast.success("Flow criado com sucesso");
			setIsCreateDialogOpen(false);
			setNewFlowName("");
			mutate();

			// Selecionar o novo flow e iniciar edição
			onSelectFlow(result.data.id);
			onCreateNew();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Erro ao criar flow");
		} finally {
			setIsLoading(false);
		}
	};

	// Renomear flow
	const handleRenameFlow = async () => {
		if (!editingFlow || !newFlowName.trim()) return;

		setIsLoading(true);
		try {
			const res = await fetch(`/api/admin/mtf-diamante/flows/${editingFlow.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: newFlowName.trim() }),
			});

			const result = await res.json();

			if (!res.ok || !result.success) {
				throw new Error(result.error || "Falha ao renomear");
			}

			toast.success("Flow renomeado");
			setIsRenameDialogOpen(false);
			setEditingFlow(null);
			setNewFlowName("");
			mutate();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Erro ao renomear");
		} finally {
			setIsLoading(false);
		}
	};

	// Deletar flow
	const handleDeleteFlow = async () => {
		if (!editingFlow) return;

		setIsLoading(true);
		try {
			const res = await fetch(`/api/admin/mtf-diamante/flows/${editingFlow.id}`, {
				method: "DELETE",
			});

			const result = await res.json();

			if (!res.ok || !result.success) {
				throw new Error(result.error || "Falha ao deletar");
			}

			toast.success("Flow removido");
			setIsDeleteDialogOpen(false);
			setEditingFlow(null);
			mutate();

			// Se o flow deletado estava selecionado, limpar seleção
			if (selectedFlowId === editingFlow.id) {
				onSelectFlow(null);
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Erro ao deletar");
		} finally {
			setIsLoading(false);
		}
	};

	// Importar flow de arquivo JSON
	const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		// Reset input para permitir reimportar o mesmo arquivo
		e.target.value = "";

		if (!file.name.endsWith(".json")) {
			toast.error("Selecione um arquivo .json");
			return;
		}

		setIsImporting(true);
		try {
			const text = await file.text();
			const flowData = JSON.parse(text);

			const res = await fetch("/api/admin/mtf-diamante/flows/import", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					inboxId,
					flowData,
					newName: flowData.meta?.flowName,
				}),
			});

			const result = await res.json();

			if (!res.ok || !result.success) {
				throw new Error(result.error || "Falha ao importar flow");
			}

			toast.success(`Flow "${result.data.name}" importado (${result.data.nodeCount} nós)`);
			mutate();

			// Selecionar o flow importado e abrir editor
			onSelectFlow(result.data.id);
			onCreateNew();
		} catch (error) {
			if (error instanceof SyntaxError) {
				toast.error("Arquivo JSON inválido");
			} else {
				toast.error(error instanceof Error ? error.message : "Erro ao importar flow");
			}
		} finally {
			setIsImporting(false);
		}
	}, [inboxId, mutate, onSelectFlow, onCreateNew]);

	// Formatar data
	const formatDate = (dateString: string) => {
		const date = new Date(dateString);
		return date.toLocaleDateString("pt-BR", {
			day: "2-digit",
			month: "2-digit",
			year: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	return (
		<div className="w-full">
			{/* Toggle: Flows normais / Campanhas */}
			<div className="flex items-center gap-1 mb-3 p-0.5 bg-muted rounded-md">
				<button
					type="button"
					onClick={() => { setShowCampaign(false); onSelectFlow(null); }}
					className={cn(
						"flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-colors",
						!showCampaign ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
					)}
				>
					<Workflow className="h-3.5 w-3.5" />
					Flows
				</button>
				<button
					type="button"
					onClick={() => { setShowCampaign(true); onSelectFlow(null); }}
					className={cn(
						"flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-colors",
						showCampaign ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
					)}
				>
					<Megaphone className="h-3.5 w-3.5" />
					Campanhas
				</button>
			</div>

			{/* Header com botões de criar e importar */}
			<div className="flex items-center justify-between mb-3">
				<h3 className="text-sm font-semibold text-muted-foreground">
					{showCampaign ? "Flows de Campanhas" : "Flows"}
				</h3>
				<div className="flex items-center gap-1.5">
					<Button
						variant="outline"
						size="sm"
						onClick={() => importInputRef.current?.click()}
						disabled={isImporting}
						className="h-7 px-2 text-xs"
					>
						{isImporting ? (
							<Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
						) : (
							<Upload className="h-3.5 w-3.5 mr-1" />
						)}
						Importar
					</Button>
					<input
						ref={importInputRef}
						type="file"
						accept=".json"
						className="hidden"
						onChange={handleImportFile}
					/>
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							setNewFlowName("");
							setIsCreateDialogOpen(true);
						}}
						className="h-7 px-2 text-xs"
					>
						<Plus className="h-3.5 w-3.5 mr-1" />
						Novo
					</Button>
				</div>
			</div>

			{/* Lista de flows */}
			{isLoadingFlows ? (
				<div className="space-y-1.5">
					{[1, 2, 3].map((i) => (
						<div key={i} className="flex items-center gap-3 px-3 py-2 rounded-md border border-border/50 animate-pulse">
							<div className="h-4 w-4 rounded bg-muted shrink-0" />
							<div className="flex-1 space-y-1.5">
								<div className="h-3 w-2/3 rounded bg-muted" />
								<div className="h-2.5 w-1/3 rounded bg-muted/70" />
							</div>
							<div className="h-3.5 w-3.5 rounded-full bg-muted shrink-0" />
						</div>
					))}
				</div>
			) : error ? (
				<div className="text-center py-4 text-sm text-destructive">Erro ao carregar flows</div>
			) : flows.length === 0 ? (
				<div className="text-center py-6 border border-dashed rounded-lg">
					<Workflow className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
					<p className="text-sm text-muted-foreground mb-3">Nenhum flow criado ainda</p>
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							setNewFlowName("");
							setIsCreateDialogOpen(true);
						}}
					>
						<Plus className="h-4 w-4 mr-1" />
						Criar primeiro flow
					</Button>
				</div>
			) : (
				<ScrollArea className="h-[180px]">
					<div className="space-y-1.5">
						{flows.map((flow) => (
							<div
								key={flow.id}
								className={cn(
									"group flex items-center justify-between px-3 py-2 rounded-md border cursor-pointer transition-colors",
									selectedFlowId === flow.id ? "bg-primary/10 border-primary/50" : "hover:bg-muted/50 border-border/50",
								)}
								onClick={() => onSelectFlow(flow.id)}
							>
								<div className="flex-1 min-w-0 mr-2">
									<div className="flex items-center gap-2">
										{showCampaign ? (
											<Megaphone className="h-4 w-4 text-muted-foreground shrink-0" />
										) : (
											<Workflow className="h-4 w-4 text-muted-foreground shrink-0" />
										)}
										<span className="text-sm font-medium truncate">{flow.name}</span>
										{flow.isActive ? (
											<CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
										) : (
											<XCircle className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
										)}
									</div>
									<div className="flex items-center gap-2 mt-0.5">
										<span className="text-[10px] text-muted-foreground">{flow.nodeCount} nós</span>
										<span className="text-[10px] text-muted-foreground/50">•</span>
										<Calendar className="h-3 w-3 text-muted-foreground/50" />
										<span className="text-[10px] text-muted-foreground/50">{formatDate(flow.updatedAt)}</span>
									</div>
								</div>

								{/* Menu de ações */}
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											variant="ghost"
											size="icon"
											className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
											onClick={(e) => e.stopPropagation()}
										>
											<MoreVertical className="h-4 w-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuItem
											onClick={(e) => {
												e.stopPropagation();
												setEditingFlow(flow);
												setNewFlowName(flow.name);
												setIsRenameDialogOpen(true);
											}}
										>
											<Edit2 className="h-4 w-4 mr-2" />
											Renomear
										</DropdownMenuItem>
										<DropdownMenuItem
											className="text-destructive focus:text-destructive"
											onClick={(e) => {
												e.stopPropagation();
												setEditingFlow(flow);
												setIsDeleteDialogOpen(true);
											}}
										>
											<Trash2 className="h-4 w-4 mr-2" />
											Excluir
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						))}
					</div>
				</ScrollArea>
			)}

			{/* Dialog: Criar Flow */}
			<Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Criar novo {showCampaign ? "flow de campanha" : "flow"}</DialogTitle>
						<DialogDescription>
							{showCampaign
								? "Flows de campanha começam com um template WhatsApp e são usados para disparos em massa."
								: "Digite um nome para identificar este flow de automação."}
						</DialogDescription>
					</DialogHeader>
					<div className="py-4">
						<Input
							value={newFlowName}
							onChange={(e) => setNewFlowName(e.target.value)}
							placeholder="Ex: Atendimento inicial"
							autoFocus
							onKeyDown={(e) => {
								if (e.key === "Enter") handleCreateFlow();
							}}
						/>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={isLoading}>
							Cancelar
						</Button>
						<Button onClick={handleCreateFlow} disabled={isLoading || !newFlowName.trim()}>
							{isLoading ? "Criando..." : "Criar"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Dialog: Renomear Flow */}
			<Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Renomear flow</DialogTitle>
						<DialogDescription>Digite o novo nome para o flow.</DialogDescription>
					</DialogHeader>
					<div className="py-4">
						<Input
							value={newFlowName}
							onChange={(e) => setNewFlowName(e.target.value)}
							placeholder="Novo nome"
							autoFocus
							onKeyDown={(e) => {
								if (e.key === "Enter") handleRenameFlow();
							}}
						/>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setIsRenameDialogOpen(false)} disabled={isLoading}>
							Cancelar
						</Button>
						<Button onClick={handleRenameFlow} disabled={isLoading || !newFlowName.trim()}>
							{isLoading ? "Salvando..." : "Salvar"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* AlertDialog: Confirmar exclusão */}
			<AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Excluir flow</AlertDialogTitle>
						<AlertDialogDescription>
							Tem certeza que deseja excluir o flow "{editingFlow?.name}"? Esta ação não pode ser desfeita e todos os
							nós serão removidos.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDeleteFlow}
							disabled={isLoading}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{isLoading ? "Excluindo..." : "Excluir"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

export default FlowSelector;
