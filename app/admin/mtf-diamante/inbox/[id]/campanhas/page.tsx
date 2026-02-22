"use client";

import { useParams } from "next/navigation";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import useSWR, { mutate } from "swr";
import useSWRInfinite from "swr/infinite";
import {
	Plus,
	Megaphone,
	ArrowLeft,
	Play,
	Pause,
	Square,
	RotateCcw,
	Trash2,
	Search,
	CheckCircle2,
	XCircle,
	Clock,
	AlertCircle,
	Loader2,
	Users,
	ChevronRight,
	CalendarIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import SafeBoundary from "@/components/SafeBoundary";

// =============================================================================
// TYPES
// =============================================================================

interface CampaignListItem {
	id: string;
	name: string;
	flowId: string;
	flowName: string;
	inboxId: string;
	status: string;
	totalContacts: number;
	sentCount: number;
	failedCount: number;
	skippedCount: number;
	rateLimit: number;
	contactCount: number;
	startedAt: string | null;
	completedAt: string | null;
	createdAt: string;
}

interface CampaignDetail extends CampaignListItem {
	variables: Record<string, unknown>;
	contacts: CampaignContact[];
}

interface CampaignContact {
	id: string;
	contactId: string;
	contactPhone: string | null;
	contactName: string | null;
	status: string;
	sentAt: string | null;
	errorMessage: string | null;
	retryCount: number;
}

interface FlowOption {
	id: string;
	name: string;
	isActive: boolean;
	isCampaign: boolean;
	nodeCount: number;
}

interface CampaignProgress {
	campaignId: string;
	status: string;
	totalContacts: number;
	sentCount: number;
	failedCount: number;
	skippedCount: number;
	pendingCount: number;
	progressPercent: number;
	estimatedTimeRemaining?: number;
}

interface LeadItem {
	id: string;
	name: string | null;
	nomeReal: string | null;
	phoneNumber: string | null;
	email: string | null;
	fezRecurso: boolean;
	concluido: boolean;
	anotacoes: string | null;
}

// =============================================================================
// FETCHER
// =============================================================================

const fetcher = async (url: string) => {
	const res = await fetch(url);
	if (!res.ok) throw new Error("Falha ao carregar dados");
	return res.json();
};

// =============================================================================
// STATUS HELPERS
// =============================================================================

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
	DRAFT: { label: "Rascunho", color: "bg-muted text-muted-foreground", icon: Clock },
	SCHEDULED: { label: "Agendada", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: Clock },
	RUNNING: { label: "Em execução", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: Play },
	PAUSED: { label: "Pausada", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", icon: Pause },
	COMPLETED: { label: "Concluída", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
	CANCELLED: { label: "Cancelada", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
	const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.DRAFT;
	const Icon = cfg.icon;
	return (
		<Badge variant="secondary" className={`${cfg.color} gap-1`}>
			<Icon className="h-3 w-3" />
			{cfg.label}
		</Badge>
	);
}

function formatDate(dateStr: string | null) {
	if (!dateStr) return "—";
	return new Date(dateStr).toLocaleDateString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function formatEta(seconds?: number) {
	if (!seconds || seconds <= 0) return "";
	if (seconds < 60) return `~${seconds}s restantes`;
	const min = Math.ceil(seconds / 60);
	return `~${min}min restantes`;
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function CampanhasPage() {
	const params = useParams() as { id?: string };
	const inboxId = params?.id ?? "";
	const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

	if (!inboxId) {
		return (
			<div className="flex items-center justify-center p-6 min-h-[200px]">
				<Loader2 className="h-4 w-4 animate-spin mr-2" />
				Carregando...
			</div>
		);
	}

	return (
		<SafeBoundary>
			<div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
				{/* Header */}
				<div className="flex items-center gap-3">
					<Megaphone className="h-6 w-6 text-primary" />
					<div>
						<h1 className="text-2xl font-bold tracking-tight">Campanhas</h1>
						<p className="text-sm text-muted-foreground">
							Disparo em massa de flows para leads selecionados
						</p>
					</div>
				</div>

				{selectedCampaignId ? (
					<CampaignDetailView
						campaignId={selectedCampaignId}
						inboxId={inboxId}
						onBack={() => setSelectedCampaignId(null)}
					/>
				) : (
					<CampaignListView
						inboxId={inboxId}
						onSelect={setSelectedCampaignId}
					/>
				)}
			</div>
		</SafeBoundary>
	);
}

// =============================================================================
// CAMPAIGN LIST VIEW
// =============================================================================

function CampaignListView({ inboxId, onSelect }: { inboxId: string; onSelect: (id: string) => void }) {
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [newName, setNewName] = useState("");
	const [selectedFlowId, setSelectedFlowId] = useState("");
	const [isCreating, setIsCreating] = useState(false);

	const campaignsKey = `/api/admin/mtf-diamante/campaigns?inboxId=${inboxId}`;
	const { data, error } = useSWR<{ success: boolean; data: CampaignListItem[] }>(
		campaignsKey,
		fetcher,
		{
			keepPreviousData: true,
			revalidateOnFocus: false,
			revalidateOnReconnect: false,
			dedupingInterval: 5000,
			fallbackData: { success: true, data: [] },
		},
	);

	const { data: flowsData } = useSWR<{ success: boolean; data: FlowOption[] }>(
		`/api/admin/mtf-diamante/flows?inboxId=${inboxId}&isCampaign=true`,
		fetcher,
		{
			revalidateOnFocus: false,
			dedupingInterval: 5000,
		},
	);

	const campaigns = data?.data ?? [];
	const campaignFlows = flowsData?.data ?? [];

	const handleCreate = useCallback(async () => {
		if (!newName.trim() || !selectedFlowId) return;
		setIsCreating(true);
		try {
			const res = await fetch("/api/admin/mtf-diamante/campaigns", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: newName.trim(), flowId: selectedFlowId, inboxId }),
			});
			const result = await res.json();
			if (!res.ok || !result.success) throw new Error(result.error || "Falha ao criar");
			toast.success("Campanha criada");
			setIsCreateOpen(false);
			setNewName("");
			setSelectedFlowId("");
			mutate(campaignsKey);
			onSelect(result.data.id);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Erro ao criar campanha");
		} finally {
			setIsCreating(false);
		}
	}, [newName, selectedFlowId, inboxId, campaignsKey, onSelect]);

	return (
		<>
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold text-muted-foreground">
					{campaigns.length} campanha(s)
				</h3>
				<Button
					size="sm"
					onClick={() => setIsCreateOpen(true)}
					disabled={campaignFlows.length === 0}
				>
					<Plus className="h-4 w-4 mr-1" />
					Nova Campanha
				</Button>
			</div>

			{campaignFlows.length === 0 && (
				<Card className="border-dashed">
					<CardContent className="pt-6 text-center">
						<Megaphone className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
						<p className="text-sm text-muted-foreground mb-1">
							Nenhum flow de campanha disponível
						</p>
						<p className="text-xs text-muted-foreground">
							Crie um flow de campanha na aba Flow Builder primeiro
						</p>
					</CardContent>
				</Card>
			)}

			{error && (
				<Card className="border-destructive/50">
					<CardContent className="pt-6 text-center text-destructive text-sm">
						Erro ao carregar campanhas
					</CardContent>
				</Card>
			)}

			{campaigns.length > 0 && (
				<div className="grid gap-3">
					{campaigns.map((c) => (
						<Card
							key={c.id}
							className="cursor-pointer hover:border-primary/50 transition-colors"
							onClick={() => onSelect(c.id)}
						>
							<CardContent className="pt-4 pb-4">
								<div className="flex items-center justify-between mb-2">
									<div className="flex items-center gap-2 min-w-0">
										<span className="font-medium truncate">{c.name}</span>
										<StatusBadge status={c.status} />
									</div>
									<ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
								</div>
								<div className="flex items-center gap-4 text-xs text-muted-foreground">
									<span>Flow: {c.flowName}</span>
									<span>{c.contactCount} contatos</span>
									<span>{formatDate(c.createdAt)}</span>
								</div>
								{(c.status === "RUNNING" || c.status === "COMPLETED") && c.totalContacts > 0 && (
									<div className="mt-2">
										<Progress
											value={Math.round(((c.sentCount + c.failedCount + c.skippedCount) / c.totalContacts) * 100)}
											className="h-1.5"
										/>
										<div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
											<span className="text-green-600">{c.sentCount} enviados</span>
											{c.failedCount > 0 && <span className="text-red-600">{c.failedCount} falhas</span>}
											{c.skippedCount > 0 && <span>{c.skippedCount} ignorados</span>}
										</div>
									</div>
								)}
							</CardContent>
						</Card>
					))}
				</div>
			)}

			{/* Create Dialog */}
			<Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
				<DialogContent className="w-[96vw] sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Nova Campanha</DialogTitle>
						<DialogDescription>
							Selecione um flow de campanha e dê um nome para identificar este disparo.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div>
							<label className="text-sm font-medium mb-1.5 block">Nome da campanha</label>
							<Input
								value={newName}
								onChange={(e) => setNewName(e.target.value)}
								placeholder="Ex: Campanha Previdenciário Fev/2026"
								autoFocus
							/>
						</div>
						<div>
							<label className="text-sm font-medium mb-1.5 block">Flow de campanha</label>
							<Select value={selectedFlowId} onValueChange={setSelectedFlowId}>
								<SelectTrigger>
									<SelectValue placeholder="Selecione um flow" />
								</SelectTrigger>
								<SelectContent>
									{campaignFlows.filter(f => f.isActive).map((f) => (
										<SelectItem key={f.id} value={f.id}>
											{f.name} ({f.nodeCount} nós)
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setIsCreateOpen(false)}>
							Cancelar
						</Button>
						<Button
							onClick={handleCreate}
							disabled={isCreating || !newName.trim() || !selectedFlowId}
						>
							{isCreating ? "Criando..." : "Criar"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

// =============================================================================
// CAMPAIGN DETAIL VIEW
// =============================================================================

function CampaignDetailView({
	campaignId,
	inboxId,
	onBack,
}: {
	campaignId: string;
	inboxId: string;
	onBack: () => void;
}) {
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const [showLeadSelector, setShowLeadSelector] = useState(false);
	const [actionLoading, setActionLoading] = useState<string | null>(null);

	const detailKey = `/api/admin/mtf-diamante/campaigns/${campaignId}`;
	const { data, error, mutate: mutateCampaign } = useSWR<{ success: boolean; data: CampaignDetail }>(
		detailKey,
		fetcher,
	);

	const campaign = data?.data;
	const isRunning = campaign?.status === "RUNNING";

	// Poll progress while running
	const { data: progressData } = useSWR<{ success: boolean; data: CampaignProgress }>(
		isRunning ? `/api/admin/mtf-diamante/campaigns/${campaignId}/progress` : null,
		fetcher,
		{ refreshInterval: 3000 },
	);
	const progress = progressData?.data;

	const handleAction = useCallback(async (action: string) => {
		setActionLoading(action);
		try {
			const res = await fetch(`/api/admin/mtf-diamante/campaigns/${campaignId}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action }),
			});
			const result = await res.json();
			if (!res.ok || !result.success) throw new Error(result.error || "Falha na ação");
			toast.success(result.message || "Ação executada");
			mutateCampaign();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Erro ao executar ação");
		} finally {
			setActionLoading(null);
		}
	}, [campaignId, mutateCampaign]);

	const handleDelete = useCallback(async () => {
		try {
			const res = await fetch(`/api/admin/mtf-diamante/campaigns/${campaignId}`, {
				method: "DELETE",
			});
			const result = await res.json();
			if (!res.ok || !result.success) throw new Error(result.error || "Falha ao excluir");
			toast.success("Campanha excluída");
			setShowDeleteDialog(false);
			mutate(`/api/admin/mtf-diamante/campaigns?inboxId=${inboxId}`);
			onBack();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Erro ao excluir");
		}
	}, [campaignId, inboxId, onBack]);

	const handleContactsAdded = useCallback(() => {
		setShowLeadSelector(false);
		mutateCampaign();
	}, [mutateCampaign]);

	if (error) {
		return (
			<div className="text-center py-8 text-destructive text-sm">
				Erro ao carregar campanha
			</div>
		);
	}

	if (!campaign) {
		return (
			<div className="flex items-center justify-center py-8">
				<Loader2 className="h-4 w-4 animate-spin mr-2" />
				Carregando...
			</div>
		);
	}

	const displayProgress = progress ?? {
		totalContacts: campaign.totalContacts,
		sentCount: campaign.sentCount,
		failedCount: campaign.failedCount,
		skippedCount: campaign.skippedCount,
		pendingCount: campaign.totalContacts - campaign.sentCount - campaign.failedCount - campaign.skippedCount,
		progressPercent: campaign.totalContacts > 0
			? Math.round(((campaign.sentCount + campaign.failedCount + campaign.skippedCount) / campaign.totalContacts) * 100)
			: 0,
	};

	return (
		<>
			{/* Back + Header */}
			<div className="flex items-center gap-3">
				<Button variant="ghost" size="icon" onClick={onBack}>
					<ArrowLeft className="h-4 w-4" />
				</Button>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<h2 className="text-lg font-semibold truncate">{campaign.name}</h2>
						<StatusBadge status={campaign.status} />
					</div>
					<p className="text-xs text-muted-foreground">
						Flow: {campaign.flowName} · Criada em {formatDate(campaign.createdAt)}
					</p>
				</div>
			</div>

			{/* Actions */}
			<div className="flex flex-wrap gap-2">
				{campaign.status === "DRAFT" && (
					<>
						<Button
							size="sm"
							onClick={() => handleAction("start")}
							disabled={actionLoading !== null || campaign.contactCount === 0}
						>
							{actionLoading === "start" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
							Iniciar
						</Button>
						<Button
							size="sm"
							variant="destructive"
							onClick={() => setShowDeleteDialog(true)}
						>
							<Trash2 className="h-4 w-4 mr-1" />
							Excluir
						</Button>
					</>
				)}
				{campaign.status === "RUNNING" && (
					<>
						<Button
							size="sm"
							variant="outline"
							onClick={() => handleAction("pause")}
							disabled={actionLoading !== null}
						>
							{actionLoading === "pause" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Pause className="h-4 w-4 mr-1" />}
							Pausar
						</Button>
						<Button
							size="sm"
							variant="destructive"
							onClick={() => handleAction("cancel")}
							disabled={actionLoading !== null}
						>
							<Square className="h-4 w-4 mr-1" />
							Cancelar
						</Button>
					</>
				)}
				{campaign.status === "PAUSED" && (
					<>
						<Button
							size="sm"
							onClick={() => handleAction("resume")}
							disabled={actionLoading !== null}
						>
							{actionLoading === "resume" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1" />}
							Retomar
						</Button>
						<Button
							size="sm"
							variant="destructive"
							onClick={() => handleAction("cancel")}
							disabled={actionLoading !== null}
						>
							<Square className="h-4 w-4 mr-1" />
							Cancelar
						</Button>
					</>
				)}
				{campaign.status === "CANCELLED" && (
					<Button
						size="sm"
						variant="destructive"
						onClick={() => setShowDeleteDialog(true)}
					>
						<Trash2 className="h-4 w-4 mr-1" />
						Excluir
					</Button>
				)}
			</div>

			{/* Progress Card */}
			{campaign.totalContacts > 0 && (
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="text-sm">Progresso</CardTitle>
					</CardHeader>
					<CardContent>
						<Progress value={displayProgress.progressPercent} className="h-2 mb-3" />
						<div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
							<div>
								<div className="text-2xl font-bold">{displayProgress.totalContacts}</div>
								<div className="text-[10px] text-muted-foreground uppercase">Total</div>
							</div>
							<div>
								<div className="text-2xl font-bold text-green-600">{displayProgress.sentCount}</div>
								<div className="text-[10px] text-muted-foreground uppercase">Enviados</div>
							</div>
							<div>
								<div className="text-2xl font-bold text-red-600">{displayProgress.failedCount}</div>
								<div className="text-[10px] text-muted-foreground uppercase">Falhas</div>
							</div>
							<div>
								<div className="text-2xl font-bold text-yellow-600">{displayProgress.skippedCount}</div>
								<div className="text-[10px] text-muted-foreground uppercase">Ignorados</div>
							</div>
							<div>
								<div className="text-2xl font-bold">{displayProgress.pendingCount}</div>
								<div className="text-[10px] text-muted-foreground uppercase">Pendentes</div>
							</div>
						</div>
						{progress?.estimatedTimeRemaining && (
							<p className="text-xs text-muted-foreground text-center mt-2">
								{formatEta(progress.estimatedTimeRemaining)}
							</p>
						)}
					</CardContent>
				</Card>
			)}

			{/* Contacts Section */}
			<Card>
				<CardHeader className="pb-3">
					<div className="flex items-center justify-between">
						<CardTitle className="text-sm flex items-center gap-2">
							<Users className="h-4 w-4" />
							Contatos ({campaign.contactCount})
						</CardTitle>
						{campaign.status === "DRAFT" && (
							<Button size="sm" variant="outline" onClick={() => setShowLeadSelector(true)}>
								<Plus className="h-4 w-4 mr-1" />
								Adicionar Leads
							</Button>
						)}
					</div>
				</CardHeader>
				<CardContent>
					{campaign.contacts.length === 0 ? (
						<div className="text-center py-6 text-muted-foreground text-sm">
							Nenhum contato adicionado ainda
						</div>
					) : (
						<ScrollArea className="h-[300px]">
							<div className="space-y-1">
								{campaign.contacts.map((contact) => (
									<div
										key={contact.id}
										className="flex items-center justify-between px-3 py-2 rounded-md border border-border/50 text-sm"
									>
										<div className="flex-1 min-w-0">
											<div className="font-medium truncate">
												{contact.contactName || contact.contactPhone || "—"}
											</div>
											{contact.contactName && (
												<div className="text-xs text-muted-foreground">{contact.contactPhone}</div>
											)}
										</div>
										<div className="flex items-center gap-2 shrink-0 ml-2">
											{contact.status === "SENT" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
											{contact.status === "FAILED" && (
												<span className="flex items-center gap-1 text-red-500 text-xs">
													<XCircle className="h-4 w-4" />
													{contact.errorMessage?.substring(0, 30)}
												</span>
											)}
											{contact.status === "PENDING" && <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
											{contact.status === "QUEUED" && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />}
											{contact.status === "SKIPPED" && <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />}
										</div>
									</div>
								))}
							</div>
						</ScrollArea>
					)}
				</CardContent>
			</Card>

			{/* Lead Selector Dialog */}
			{showLeadSelector && (
				<LeadSelectorDialog
					campaignId={campaignId}
					open={showLeadSelector}
					onClose={() => setShowLeadSelector(false)}
					onAdded={handleContactsAdded}
				/>
			)}

			{/* Delete Confirmation */}
			<AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Excluir campanha</AlertDialogTitle>
						<AlertDialogDescription>
							Tem certeza que deseja excluir a campanha "{campaign.name}"?
							Todos os contatos associados serão removidos.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDelete}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							Excluir
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

// =============================================================================
// LEAD SELECTOR DIALOG
// =============================================================================

const LEADS_PAGE_SIZE = 100;

type LeadFilter = "todos" | "comRecurso" | "semRecurso" | "concluidos";
type DatePreset = "qualquerData" | "7dias" | "30dias" | "personalizado";

const FILTER_OPTIONS: { value: LeadFilter; label: string }[] = [
	{ value: "todos", label: "Todos" },
	{ value: "comRecurso", label: "Com Recurso" },
	{ value: "semRecurso", label: "Sem Recurso" },
	{ value: "concluidos", label: "Conclu\u00eddos" },
];

function getPresetDate(preset: DatePreset): Date | null {
	const now = new Date();
	if (preset === "7dias") { const d = new Date(now); d.setDate(d.getDate() - 7); return d; }
	if (preset === "30dias") { const d = new Date(now); d.setDate(d.getDate() - 30); return d; }
	return null;
}

function LeadSelectorDialog({
	campaignId,
	open,
	onClose,
	onAdded,
}: {
	campaignId: string;
	open: boolean;
	onClose: () => void;
	onAdded: () => void;
}) {
	const [searchQuery, setSearchQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [activeFilter, setActiveFilter] = useState<LeadFilter>("todos");
	const [datePreset, setDatePreset] = useState<DatePreset>("qualquerData");
	const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(undefined);
	const [calendarOpen, setCalendarOpen] = useState(false);
	const [selectedLeads, setSelectedLeads] = useState<Map<string, LeadItem>>(new Map());
	const [isAdding, setIsAdding] = useState(false);
	const [isAddingAll, setIsAddingAll] = useState(false);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const sentinelRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) {
			setSearchQuery(""); setDebouncedQuery(""); setActiveFilter("todos");
			setDatePreset("qualquerData"); setCustomDateRange(undefined);
			setSelectedLeads(new Map());
		}
	}, [open]);

	const handleSearch = useCallback((value: string) => {
		setSearchQuery(value);
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => setDebouncedQuery(value), 350);
	}, []);

	const handleFilterChange = useCallback((f: LeadFilter) => {
		setActiveFilter(f); setSelectedLeads(new Map());
	}, []);

	const handleDatePreset = useCallback((p: DatePreset) => {
		setDatePreset(p); setSelectedLeads(new Map());
		if (p !== "personalizado") setCustomDateRange(undefined);
	}, []);

	const effectiveDateFrom = useMemo((): Date | null => {
		if (datePreset === "personalizado") return customDateRange?.from ?? null;
		return getPresetDate(datePreset);
	}, [datePreset, customDateRange]);

	const effectiveDateTo = useMemo((): Date | null => {
		if (datePreset === "personalizado") return customDateRange?.to ?? null;
		return null;
	}, [datePreset, customDateRange]);

	// useSWRInfinite — acumula p\u00e1ginas conforme scroll
	const getKey = useCallback(
		(pageIndex: number, prev: { leads: LeadItem[]; pagination: { total: number } } | null) => {
			if (!open) return null;
			if (prev && prev.leads.length < LEADS_PAGE_SIZE) return null; // fim
			const params = new URLSearchParams({
				onlyWithPhone: "true",
				marketing: "true",
				limit: String(LEADS_PAGE_SIZE),
				page: String(pageIndex + 1),
			});
			if (debouncedQuery.trim()) params.set("search", debouncedQuery.trim());
			if (activeFilter === "comRecurso") params.set("fezRecurso", "true");
			if (activeFilter === "semRecurso") params.set("semRecurso", "true");
			if (activeFilter === "concluidos") params.set("concluido", "true");
			if (effectiveDateFrom) params.set("updatedAfter", effectiveDateFrom.toISOString());
			if (effectiveDateTo) params.set("updatedBefore", effectiveDateTo.toISOString());
			return `/api/admin/leads-chatwit/leads?${params}`;
		},
		[open, debouncedQuery, activeFilter, effectiveDateFrom, effectiveDateTo],
	);

	const { data: pages, size, setSize, isLoading, error } = useSWRInfinite<{
		leads: LeadItem[];
		pagination: { total: number; totalPages: number };
	}>(getKey, fetcher, { revalidateFirstPage: false, keepPreviousData: true });

	const leads = useMemo(() => pages?.flatMap((p) => p.leads) ?? [], [pages]);
	const total = pages?.[0]?.pagination?.total ?? 0;
	const isLoadingMore = isLoading || (size > 0 && pages && typeof pages[size - 1] === "undefined");
	const isReachingEnd = pages ? pages[pages.length - 1]?.leads?.length < LEADS_PAGE_SIZE : false;

	// IntersectionObserver — carrega pr\u00f3xima p\u00e1gina automaticamente
	useEffect(() => {
		const el = sentinelRef.current;
		if (!el) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && !isReachingEnd && !isLoadingMore) {
					setSize((s) => s + 1);
				}
			},
			{ threshold: 0.1 },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [isReachingEnd, isLoadingMore, setSize]);

	const toggleSelect = useCallback((lead: LeadItem) => {
		setSelectedLeads((prev) => {
			const next = new Map(prev);
			if (next.has(lead.id)) next.delete(lead.id);
			else next.set(lead.id, lead);
			return next;
		});
	}, []);

	const allVisibleSelected = leads.length > 0 && leads.every((l) => selectedLeads.has(l.id));

	const toggleAll = useCallback(() => {
		if (allVisibleSelected) {
			setSelectedLeads((prev) => {
				const next = new Map(prev);
				for (const l of leads) next.delete(l.id);
				return next;
			});
		} else {
			setSelectedLeads((prev) => {
				const next = new Map(prev);
				for (const l of leads) next.set(l.id, l);
				return next;
			});
		}
	}, [leads, allVisibleSelected]);

	// Adicionar selecionados
	const handleAdd = useCallback(async () => {
		if (selectedLeads.size === 0) return;
		setIsAdding(true);
		try {
			const res = await fetch(`/api/admin/mtf-diamante/campaigns/${campaignId}/contacts`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					contacts: Array.from(selectedLeads.values()).map((l) => ({
						contactId: l.id,
						contactPhone: l.phoneNumber!,
						contactName: l.nomeReal || l.name || "",
					})),
				}),
			});
			const result = await res.json();
			if (!res.ok || !result.success) throw new Error(result.error || "Falha ao adicionar");
			toast.success(result.message || `${result.data.added} contatos adicionados`);
			onAdded();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Erro ao adicionar contatos");
		} finally {
			setIsAdding(false);
		}
	}, [selectedLeads, campaignId, onAdded]);

	// A\u00e7\u00e3o r\u00e1pida: adicionar TODOS do banco diretamente
	const handleAddAll = useCallback(async () => {
		setIsAddingAll(true);
		try {
			const res = await fetch(`/api/admin/mtf-diamante/campaigns/${campaignId}/contacts`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ selectAll: true }),
			});
			const result = await res.json();
			if (!res.ok || !result.success) throw new Error(result.error || "Falha ao adicionar");
			toast.success(result.message || `${result.data.added} contatos adicionados`);
			onAdded();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Erro ao adicionar todos");
		} finally {
			setIsAddingAll(false);
		}
	}, [campaignId, onAdded]);

	const formatDateLabel = (d: Date) =>
		d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent className="w-[96vw] sm:max-w-2xl overflow-hidden">
				<DialogHeader>
					<DialogTitle>Adicionar Leads</DialogTitle>
					<DialogDescription>
						Selecione leads ou adicione todos de uma vez. Apenas leads com telefone são exibidos.
					</DialogDescription>
				</DialogHeader>

				{/* A\u00e7\u00e3o r\u00e1pida */}
				{total > 0 && (
					<button
						type="button"
						onClick={handleAddAll}
						disabled={isAddingAll || isAdding}
						className="w-full flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 px-4 py-3 text-sm transition-colors disabled:opacity-50"
					>
						<div className="flex items-center gap-2">
							<Users className="h-4 w-4 text-primary" />
							<span className="font-medium">
								Adicionar todos os <strong>{total}</strong> leads de uma vez
							</span>
						</div>
						{isAddingAll ? (
							<Loader2 className="h-4 w-4 animate-spin text-primary" />
						) : (
							<span className="text-primary font-semibold text-xs">{"→ Ação rápida"}</span>
						)}
					</button>
				)}

				{/* Busca */}
				<div className="relative">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
					<Input
						value={searchQuery}
						onChange={(e) => handleSearch(e.target.value)}
						placeholder="Buscar por nome, telefone ou email..."
						className="pl-9"
					/>
				</div>

				{/* Filtros de status */}
				<div className="flex gap-1.5 flex-wrap">
					{FILTER_OPTIONS.map((f) => (
						<button
							key={f.value}
							type="button"
							onClick={() => handleFilterChange(f.value)}
							className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
								activeFilter === f.value
									? "bg-primary text-primary-foreground border-primary"
									: "bg-muted/50 text-muted-foreground border-border hover:border-primary/50"
							}`}
						>
							{f.label}
						</button>
					))}
				</div>

				{/* Filtro de data */}
				<div className="flex items-center gap-1.5 flex-wrap">
					<CalendarIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
					{(["qualquerData", "7dias", "30dias"] as DatePreset[]).map((p) => {
						const labels: Record<string, string> = {
							qualquerData: "Qualquer data",
							"7dias": "\u00DAltimos 7 dias",
							"30dias": "\u00DAltimo m\u00eas",
						};
						return (
							<button
								key={p}
								type="button"
								onClick={() => handleDatePreset(p)}
								className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
									datePreset === p
										? "bg-secondary text-secondary-foreground border-secondary-foreground/30"
										: "bg-muted/50 text-muted-foreground border-border hover:border-primary/50"
								}`}
							>
								{labels[p]}
							</button>
						);
					})}
					<Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
						<PopoverTrigger asChild>
							<button
								type="button"
								className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
									datePreset === "personalizado"
										? "bg-secondary text-secondary-foreground border-secondary-foreground/30"
										: "bg-muted/50 text-muted-foreground border-border hover:border-primary/50"
								}`}
							>
								{datePreset === "personalizado" && customDateRange?.from
									? customDateRange.to
										? `${formatDateLabel(customDateRange.from)} — ${formatDateLabel(customDateRange.to)}`
										: `De ${formatDateLabel(customDateRange.from)}`
									: "Personalizado"}
							</button>
						</PopoverTrigger>
						<PopoverContent className="w-auto p-0" align="start">
							<Calendar
								mode="range"
								selected={customDateRange}
								onSelect={(range) => {
									setCustomDateRange(range);
									setDatePreset("personalizado");
									setSelectedLeads(new Map());
									if (range?.from && range?.to) setCalendarOpen(false);
								}}
								disabled={(d) => d > new Date()}
								initialFocus
							/>
						</PopoverContent>
					</Popover>
					{datePreset !== "qualquerData" && (
						<button
							type="button"
							onClick={() => handleDatePreset("qualquerData")}
							className="text-[10px] text-muted-foreground hover:text-foreground underline"
						>
							limpar
						</button>
					)}
				</div>

				{/* Contador */}
				<div className="flex items-center justify-between text-xs text-muted-foreground px-0.5">
					<span>
						{isLoading && leads.length === 0
							? "Carregando..."
							: `${leads.length} de ${total} lead(s) carregados`}
					</span>
					{selectedLeads.size > 0 && (
						<span className="text-primary font-medium">{selectedLeads.size} selecionado(s)</span>
					)}
				</div>

				{/* Lista com scroll infinito */}
				{error ? (
					<div className="text-sm text-destructive text-center py-4">Erro ao carregar leads</div>
				) : (
					<div className="h-[260px] overflow-y-auto border rounded-md" style={{ overflowY: "auto" }}>
						<div className="p-2">
							<div
								className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/50 cursor-pointer border-b mb-1"
								onClick={toggleAll}
							>
								<Checkbox checked={allVisibleSelected} />
								<span className="text-sm font-medium">
									Selecionar todos carregados ({leads.length})
								</span>
							</div>

							{isLoading && leads.length === 0 ? (
								<div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
									<Loader2 className="h-4 w-4 animate-spin" />
									Carregando...
								</div>
							) : leads.length === 0 ? (
								<div className="text-center py-6 text-sm text-muted-foreground">
									Nenhum lead disponível com este filtro
								</div>
							) : (
								<>
									{leads.map((lead) => (
										<div
											key={lead.id}
											className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-muted/50 cursor-pointer"
											onClick={() => toggleSelect(lead)}
										>
											<Checkbox checked={selectedLeads.has(lead.id)} />
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-2 flex-wrap">
													<span className="text-sm font-medium truncate">
														{lead.nomeReal || lead.name || "Sem nome"}
													</span>
													{lead.fezRecurso && (
														<span className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded font-medium shrink-0">
															Recurso
														</span>
													)}
													{lead.concluido && (
														<span className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-1.5 py-0.5 rounded font-medium shrink-0">
															Concluído
														</span>
													)}
												</div>
												<div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap mt-0.5">
													<span>{lead.phoneNumber}</span>
													{lead.email && <span>{"· "}{lead.email}</span>}
													{lead.anotacoes && (
														<span className="truncate max-w-[200px] italic" title={lead.anotacoes}>
															{"· "}{lead.anotacoes}
														</span>
													)}
												</div>
											</div>
										</div>
									))}

									{/* Sentinel para infinite scroll */}
									<div ref={sentinelRef} className="py-2 flex justify-center">
										{isLoadingMore && (
											<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
										)}
										{isReachingEnd && leads.length > 0 && (
											<span className="text-[10px] text-muted-foreground">
												{leads.length} leads carregados — fim da lista
											</span>
										)}
									</div>
								</>
							)}
						</div>
					</div>
				)}

				<DialogFooter>
					<Button variant="outline" onClick={onClose} disabled={isAdding || isAddingAll}>
						Cancelar
					</Button>
					<Button onClick={handleAdd} disabled={isAdding || isAddingAll || selectedLeads.size === 0}>
						{isAdding ? (
							<><Loader2 className="h-4 w-4 mr-1 animate-spin" />Adicionando...</>
						) : (
							`Adicionar ${selectedLeads.size} selecionado(s)`
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
