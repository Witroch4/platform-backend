"use client";

import React, { useState, useCallback, useMemo, useEffect, memo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import {
	Upload,
	FileText,
	Check,
	X,
	Loader2,
	Trash2,
	Eye,
	AlertCircle,
	RefreshCw,
	ExternalLink,
	ImageIcon,
	CheckSquare,
	Square,
	Search,
	Plus,
	ChevronRight,
	Save,
	RotateCcw,
	Layers,
	ListTree,
	Hash,
	Scale,
	BookOpen,
	Pencil,
	Copy,
	MoreHorizontal,
	GripVertical,
	ChevronDown,
	Info,
	Merge,
	ScanText,
	Download,
} from "lucide-react";
import { toast } from "sonner";
import { useDropzone } from "react-dropzone";
import useSWR from "swr";
import type { RubricPayload } from "@/lib/oab-eval/types";
import type { GabaritoGrupo, Subitem } from "@/lib/oab/gabarito-parser-deterministico";
import { verificarPontuacao } from "@/lib/oab/gabarito-parser-deterministico";

// ── Types ────────────────────────────────────────────────────────────────

interface UploadedFile {
	id: string;
	name: string;
	size: number;
	type: string;
	status: "uploading" | "processing" | "completed" | "error";
	progress: number;
	uploadedAt: Date;
	description?: string;
	agentId?: string;
	_isFromDB?: boolean;
	_rubricId?: string;
}

interface RubricFromDB {
	id: string;
	exam: string | null;
	area: string | null;
	version: string | null;
	pdfUrl: string | null;
	createdAt: string;
	updatedAt: string;
	meta: Record<string, any> | null;
	counts: { itens: number; grupos: number };
	pontuacao: {
		geral: { total: number; esperado: number; desvio: number; ok: boolean };
		peca: { total: number; esperado: number; desvio: number; ok: boolean };
		questoes: { total: number; esperado: number; desvio: number; ok: boolean };
	} | null;
}

type RubricDetail = {
	id: string;
	code: string | null;
	exam: string | null;
	area: string | null;
	version: string | null;
	pdfUrl: string | null;
	createdAt: string;
	updatedAt: string;
	meta: Record<string, unknown> | null;
	schema: RubricPayload;
	counts: { itens: number; grupos: number };
	pontuacao: RubricFromDB["pontuacao"];
};

type QuestaoKey = "PEÇA" | `Q${1 | 2 | 3 | 4}` | string;

// ── Constants ────────────────────────────────────────────────────────────

const QUESTAO_ORDER: QuestaoKey[] = ["PEÇA", "Q1", "Q2", "Q3", "Q4"];

const QUESTAO_LABEL: Record<string, string> = {
	PEÇA: "Peça Profissional",
	Q1: "Questão 1",
	Q2: "Questão 2",
	Q3: "Questão 3",
	Q4: "Questão 4",
};

const QUESTAO_COLORS: Record<string, string> = {
	PEÇA: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20",
	Q1: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
	Q2: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
	Q3: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
	Q4: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
};

const fetcher = async (url: string) => {
	const res = await fetch(url);
	if (!res.ok) throw new Error("Falha ao carregar dados");
	return res.json();
};

// ── Helpers ──────────────────────────────────────────────────────────────

function questaoOrderIndex(value: QuestaoKey): number {
	const idx = QUESTAO_ORDER.indexOf(value);
	return idx === -1 ? QUESTAO_ORDER.length + 1 : idx;
}

function roundTwo(n: number): number {
	if (!Number.isFinite(n)) return 0;
	return Number.parseFloat(n.toFixed(2));
}

function mergePesoArrays(...arrays: Array<number[] | undefined>): number[] {
	const values: number[] = [];
	for (const arr of arrays) {
		if (!Array.isArray(arr)) continue;
		for (const value of arr) {
			if (typeof value === "number" && Number.isFinite(value)) values.push(roundTwo(value));
		}
	}
	return Array.from(new Set(values));
}

function cloneRubricPayload(payload: RubricPayload): RubricPayload {
	return {
		meta: payload.meta ? JSON.parse(JSON.stringify(payload.meta)) : undefined,
		schema_docs: payload.schema_docs ? JSON.parse(JSON.stringify(payload.schema_docs)) : undefined,
		itens: payload.itens.map((item) => ({
			...item,
			fundamentos: Array.isArray(item.fundamentos) ? [...item.fundamentos] : [],
			alternativas_grupo: item.alternativas_grupo ? [...item.alternativas_grupo] : undefined,
			palavras_chave: Array.isArray(item.palavras_chave) ? [...item.palavras_chave] : [],
			embedding_text: item.embedding_text ?? "",
		})),
		grupos: payload.grupos?.map((grupo) => ({
			...grupo,
			pesos_brutos: Array.isArray(grupo.pesos_brutos) ? [...grupo.pesos_brutos] : [],
		})),
	};
}

function sortGroups(grupos: GabaritoGrupo[]): GabaritoGrupo[] {
	return [...grupos].sort((a, b) => {
		const qa = questaoOrderIndex(a.questao);
		const qb = questaoOrderIndex(b.questao);
		if (qa === qb) return a.indice - b.indice;
		return qa - qb;
	});
}

function reindexGroups(grupos: GabaritoGrupo[]): GabaritoGrupo[] {
	const sorted = sortGroups(grupos);
	const counters = new Map<string, number>();
	return sorted.map((grupo) => {
		const current = counters.get(grupo.questao) ?? 0;
		const nextIndex = current + 1;
		counters.set(grupo.questao, nextIndex);
		return { ...grupo, indice: nextIndex };
	});
}

function buildOuGroupId(ids?: string[]): string | undefined {
	if (!ids || !ids.length) return undefined;
	return `OG-${[...ids].sort().join("|")}`;
}

function convertRubricToSubitems(payload: RubricPayload): Subitem[] {
	return payload.itens.map((item) => ({
		id: item.id,
		escopo: item.escopo === "Questão" ? "Questão" : "Peça",
		questao: item.questao as Subitem["questao"],
		descricao: item.descricao,
		peso: typeof item.peso === "number" ? roundTwo(item.peso) : null,
		fundamentos: item.fundamentos ?? [],
		palavras_chave: item.palavras_chave ?? [],
		embedding_text: item.embedding_text ?? "",
		ou_group_id: buildOuGroupId(item.alternativas_grupo),
		ou_group_mode: "pick_best",
	}));
}

function sanitizePesoInput(raw: string): number | null {
	const normalized = raw.replace(",", ".").trim();
	if (!normalized) return null;
	const parsed = Number.parseFloat(normalized);
	if (!Number.isFinite(parsed)) return null;
	return roundTwo(parsed);
}

function formatFileSize(bytes: number) {
	if (bytes === 0) return "—";
	const k = 1024;
	const sizes = ["Bytes", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function generateSubitemId(questao: string, existingIds: string[]): string {
	const prefix = questao === "PEÇA" ? "PECA" : questao;
	let counter = 1;
	let id = `${prefix}-${String(counter).padStart(2, "0")}`;
	while (existingIds.includes(id)) {
		counter++;
		id = `${prefix}-${String(counter).padStart(2, "0")}`;
	}
	return id;
}

function generateGroupId(questao: string, existingIds: string[]): string {
	const prefix = questao === "PEÇA" ? "PECA" : questao;
	let counter = 1;
	let id = `${prefix}-G${String(counter).padStart(2, "0")}`;
	while (existingIds.includes(id)) {
		counter++;
		id = `${prefix}-G${String(counter).padStart(2, "0")}`;
	}
	return id;
}

// ── Sub-components ───────────────────────────────────────────────────────

const PontuacaoBadge = memo(function PontuacaoBadge({ pontos }: { pontos: { total: number; esperado: number; ok: boolean; desvio: number } }) {
	const isOk = pontos.ok;
	return (
		<div className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium tabular-nums ${isOk ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}>
			<span>{pontos.total.toFixed(2)}</span>
			<span className="text-muted-foreground">/</span>
			<span>{pontos.esperado.toFixed(2)}</span>
			{!isOk && (
				<span className="ml-0.5 text-[10px]">
					({pontos.desvio >= 0 ? "+" : ""}{pontos.desvio.toFixed(2)})
				</span>
			)}
		</div>
	);
});

const StatCard = memo(function StatCard({ label, value, icon: Icon, variant = "default" }: { label: string; value: string | number; icon: React.ElementType; variant?: "default" | "success" | "warning" }) {
	const variants = {
		default: "border-border",
		success: "border-emerald-500/30 bg-emerald-500/5",
		warning: "border-amber-500/30 bg-amber-500/5",
	};
	return (
		<div className={`rounded-lg border p-3.5 ${variants[variant]}`}>
			<div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
				<Icon className="h-3.5 w-3.5" />
				{label}
			</div>
			<div className="text-xl font-semibold tabular-nums">{value}</div>
		</div>
	);
});

const EmptyState = memo(function EmptyState({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
	return (
		<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-12 text-center">
			<div className="rounded-full bg-muted p-3 mb-3">
				<Icon className="h-6 w-6 text-muted-foreground" />
			</div>
			<h3 className="text-sm font-medium mb-1">{title}</h3>
			<p className="text-xs text-muted-foreground max-w-sm">{description}</p>
		</div>
	);
});

// ── Auditoria Sub-components ─────────────────────────────────────────────

const GroupRow = memo(function GroupRow({
	grupo,
	isSelected,
	isActive,
	onToggleSelect,
	onActivate,
}: {
	grupo: GabaritoGrupo;
	isSelected: boolean;
	isActive: boolean;
	onToggleSelect: () => void;
	onActivate: () => void;
}) {
	const colorClass = QUESTAO_COLORS[grupo.questao] ?? "bg-muted text-muted-foreground border-border";
	return (
		<tr
			className={`group border-t border-border transition-colors ${isActive ? "bg-primary/5 dark:bg-primary/10" : "hover:bg-muted/50 cursor-pointer"}`}
			onClick={onActivate}
		>
			<td className="w-10 px-3 py-2.5 align-middle" onClick={(e) => e.stopPropagation()}>
				<Checkbox checked={isSelected} onCheckedChange={onToggleSelect} />
			</td>
			<td className="w-12 px-3 py-2.5 text-xs text-muted-foreground tabular-nums">{grupo.indice}</td>
			<td className="px-3 py-2.5">
				<Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-medium ${colorClass}`}>
					{QUESTAO_LABEL[grupo.questao] ?? grupo.questao}
				</Badge>
			</td>
			<td className="px-3 py-2.5">
				<div className="font-medium text-sm leading-tight">{grupo.rotulo}</div>
				<div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{grupo.descricao}</div>
			</td>
			<td className="w-20 px-3 py-2.5 text-right font-mono text-xs tabular-nums">{grupo.peso_maximo.toFixed(2)}</td>
			<td className="w-10 px-3 py-2.5 text-right">
				<ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isActive ? "rotate-90" : ""}`} />
			</td>
		</tr>
	);
});

function GroupDetailPanel({
	grupo,
	onUpdate,
}: {
	grupo: GabaritoGrupo | null;
	onUpdate: (changes: Partial<GabaritoGrupo>) => void;
}) {
	if (!grupo) {
		return (
			<div className="rounded-lg border border-dashed border-border p-6 text-center">
				<Layers className="h-5 w-5 mx-auto text-muted-foreground mb-2" />
				<p className="text-sm text-muted-foreground">Selecione um grupo para visualizar os detalhes.</p>
			</div>
		);
	}

	return (
		<div className="space-y-4 rounded-lg border border-border bg-card p-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Layers className="h-4 w-4 text-primary" />
					<h3 className="text-sm font-semibold">Detalhes do Grupo</h3>
				</div>
				<span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{grupo.id}</span>
			</div>
			<div className="grid grid-cols-2 gap-3">
				<div className="space-y-1.5">
					<Label className="text-xs">Questão</Label>
					<Select value={grupo.questao} onValueChange={(v) => onUpdate({ questao: v as GabaritoGrupo["questao"] })}>
						<SelectTrigger className="h-8 text-sm">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{QUESTAO_ORDER.map((q) => (
								<SelectItem key={q} value={q}>{QUESTAO_LABEL[q] ?? q}</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-1.5">
					<Label className="text-xs">Índice</Label>
					<Input type="number" value={grupo.indice} onChange={(e) => onUpdate({ indice: Number.parseInt(e.target.value, 10) || 1 })} className="h-8 text-sm" />
				</div>
			</div>
			<div className="space-y-1.5">
				<Label className="text-xs">Rótulo</Label>
				<Input value={grupo.rotulo} onChange={(e) => onUpdate({ rotulo: e.target.value })} className="h-8 text-sm" />
			</div>
			<div className="space-y-1.5">
				<Label className="text-xs">Peso máximo</Label>
				<Input value={grupo.peso_maximo.toString()} onChange={(e) => onUpdate({ peso_maximo: sanitizePesoInput(e.target.value) ?? 0 })} className="h-8 text-sm font-mono" />
			</div>
			<div className="space-y-1.5">
				<Label className="text-xs">Descrição</Label>
				<textarea value={grupo.descricao} onChange={(e) => onUpdate({ descricao: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
			</div>
		</div>
	);
}

function SubitemDetailPanel({
	subitem,
	onUpdate,
	onDelete,
}: {
	subitem: RubricPayload["itens"][number] | null;
	onUpdate: (changes: Partial<RubricPayload["itens"][number]>) => void;
	onDelete?: () => void;
}) {
	if (!subitem) {
		return (
			<div className="rounded-lg border border-dashed border-border p-6 text-center">
				<ListTree className="h-5 w-5 mx-auto text-muted-foreground mb-2" />
				<p className="text-sm text-muted-foreground">Selecione um subitem para editar.</p>
			</div>
		);
	}

	return (
		<div className="space-y-4 rounded-lg border border-border bg-card p-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Pencil className="h-4 w-4 text-primary" />
					<h3 className="text-sm font-semibold">Subitem</h3>
				</div>
				<div className="flex items-center gap-2">
					<span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{subitem.id}</span>
					{onDelete && (
						<Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={onDelete}>
							<Trash2 className="h-3.5 w-3.5" />
						</Button>
					)}
				</div>
			</div>
			<div className="grid grid-cols-3 gap-3">
				<div className="space-y-1.5">
					<Label className="text-xs">Questão</Label>
					<Select value={subitem.questao} onValueChange={(v) => onUpdate({ questao: v })}>
						<SelectTrigger className="h-8 text-sm">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{QUESTAO_ORDER.map((q) => (
								<SelectItem key={q} value={q}>{QUESTAO_LABEL[q] ?? q}</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-1.5">
					<Label className="text-xs">Escopo</Label>
					<Select value={subitem.escopo} onValueChange={(v) => onUpdate({ escopo: v })}>
						<SelectTrigger className="h-8 text-sm">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="Peça">Peça</SelectItem>
							<SelectItem value="Questão">Questão</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-1.5">
					<Label className="text-xs">Peso</Label>
					<Input
						value={subitem.peso != null ? subitem.peso.toString() : ""}
						onChange={(e) => onUpdate({ peso: sanitizePesoInput(e.target.value) })}
						className="h-8 text-sm font-mono"
						placeholder="0.00"
					/>
				</div>
			</div>
			<div className="space-y-1.5">
				<Label className="text-xs">Descrição</Label>
				<textarea
					value={subitem.descricao}
					onChange={(e) => onUpdate({ descricao: e.target.value })}
					className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			</div>
			<div className="space-y-1.5">
				<Label className="text-xs">Fundamentos (um por linha)</Label>
				<textarea
					value={(subitem.fundamentos ?? []).join("\n")}
					onChange={(e) => onUpdate({ fundamentos: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean) })}
					className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono min-h-[60px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					placeholder="Art. 5º, CF/88&#10;Lei nº 8.906/94"
				/>
			</div>
			<div className="space-y-1.5">
				<Label className="text-xs">Palavras-chave (separadas por vírgula)</Label>
				<Input
					value={(subitem.palavras_chave ?? []).join(", ")}
					onChange={(e) => onUpdate({ palavras_chave: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })}
					className="h-8 text-sm"
					placeholder="habeas corpus, mandado de segurança"
				/>
			</div>
			<div className="space-y-1.5">
				<Label className="text-xs">Alternativas (IDs separados por vírgula)</Label>
				<Input
					value={(subitem.alternativas_grupo ?? []).join(", ")}
					onChange={(e) => onUpdate({ alternativas_grupo: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })}
					className="h-8 text-xs font-mono"
					placeholder="PECA-01A, PECA-01B"
				/>
			</div>
			<details className="group">
				<summary className="text-xs font-medium text-muted-foreground cursor-pointer flex items-center gap-1">
					<ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
					Texto de embedding
				</summary>
				<textarea
					value={subitem.embedding_text ?? ""}
					onChange={(e) => onUpdate({ embedding_text: e.target.value })}
					className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono min-h-[80px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			</details>
		</div>
	);
}

// ── Main Page ────────────────────────────────────────────────────────────

export default function MTFOABPage() {
	// ── Shared SWR ──
	const {
		data: rubricsData,
		mutate: refreshRubrics,
		isLoading: isLoadingRubrics,
	} = useSWR<{ success: boolean; rubrics: RubricFromDB[]; total: number }>("/api/oab-eval/rubrics", fetcher, {
		revalidateOnFocus: true,
		revalidateOnReconnect: true,
		dedupingInterval: 5000,
		keepPreviousData: true,
	});

	const rubricSummaries = rubricsData?.rubrics ?? [];

	// ── Upload Tab State ──
	const [files, setFiles] = useState<UploadedFile[]>([]);
	const [forceAI, setForceAI] = useState(false);
	const [visionMode, setVisionMode] = useState(false);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [rubricToDelete, setRubricToDelete] = useState<{ id: string; name: string } | null>(null);

	// Vision image selection
	const [imageSelectDialog, setImageSelectDialog] = useState<{
		open: boolean;
		imageUrls: string[];
		pdfFile: File | null;
		pdfUrl: string | null;
		fileId: string;
	}>({ open: false, imageUrls: [], pdfFile: null, pdfUrl: null, fileId: "" });
	const [selectedImageUrls, setSelectedImageUrls] = useState<Set<string>>(new Set());
	const [convertingImages, setConvertingImages] = useState(false);
	const [processingVision, setProcessingVision] = useState(false);

	// ── Auditoria Tab State ──
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [draft, setDraft] = useState<RubricPayload | null>(null);
	const [baselineHash, setBaselineHash] = useState("");
	const [searchTerm, setSearchTerm] = useState("");
	const [groupFilter, setGroupFilter] = useState<string>("TODOS");
	const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
	const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
	const [activeSubitemId, setActiveSubitemId] = useState<string | null>(null);
	const [metaEditor, setMetaEditor] = useState("{}");
	const [metaParseError, setMetaParseError] = useState<string | null>(null);
	const [headerDraft, setHeaderDraft] = useState({ code: "", exam: "", area: "", version: "" });
	const [deleteGroupsDialogOpen, setDeleteGroupsDialogOpen] = useState(false);
	const [deleteSubitemDialogOpen, setDeleteSubitemDialogOpen] = useState(false);
	const [subitemToDelete, setSubitemToDelete] = useState<string | null>(null);
	const [auditoriaView, setAuditoriaView] = useState<"grupos" | "itens">("grupos");
	const [itensSearchTerm, setItensSearchTerm] = useState("");

	// Auditoria: fetch detail via SWR
	const { data: detailData, isLoading: isLoadingDetail } = useSWR<{ success: boolean; rubric: RubricDetail }>(
		selectedId ? `/api/oab-eval/rubrics/${selectedId}` : null,
		fetcher,
	);

	const detail = detailData?.rubric ?? null;

	// Sync draft when detail changes
	useEffect(() => {
		if (!detail) return;
		setDraft(cloneRubricPayload(detail.schema));
		setBaselineHash(JSON.stringify(detail.schema));
		setSelectedGroupIds(new Set());
		setActiveGroupId(null);
		setActiveSubitemId(null);
		setMetaEditor(JSON.stringify(detail.schema.meta ?? detail.meta ?? {}, null, 2));
		setMetaParseError(null);
		setHeaderDraft({
			code: detail.code ?? "",
			exam: detail.exam ?? "",
			area: detail.area ?? "",
			version: detail.version ?? "",
		});
	}, [detail]);

	// ── Upload Tab Logic ──

	const handleVisionModeChange = (checked: boolean) => {
		setVisionMode(checked);
		if (checked) setForceAI(false);
	};

	const handleForceAIChange = (checked: boolean) => {
		setForceAI(checked);
		if (checked) setVisionMode(false);
	};

	const processUpload = useCallback(
		async (file: File, fileId: string, extraFormData?: Record<string, string>) => {
			try {
				for (let progress = 0; progress <= 90; progress += 30) {
					await new Promise((resolve) => setTimeout(resolve, 100));
					setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, progress } : f)));
				}

				setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, status: "processing", progress: 0 } : f)));

				const formData = new FormData();
				formData.append("file", file);
				formData.append("withEmbeddings", "false");
				if (forceAI) formData.append("forceAI", "true");
				if (extraFormData) {
					for (const [key, value] of Object.entries(extraFormData)) {
						formData.append(key, value);
					}
				}

				const response = await fetch("/api/oab-eval/rubric/upload", {
					method: "POST",
					body: formData,
				});

				if (!response.ok) {
					const errorData = await response.json();
					throw new Error(errorData.error || "Falha ao enviar arquivo");
				}

				const result = await response.json();

				setFiles((prev) =>
					prev.map((f) =>
						f.id === fileId
							? {
									...f,
									status: "completed",
									progress: 100,
									description: `Rubric ID: ${result.rubricId} | ${result.stats.itens} itens processados`,
								}
							: f,
					),
				);

				toast.success(`Arquivo ${file.name} processado com sucesso! ID: ${result.rubricId}`);
				refreshRubrics();
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
				setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, status: "error" } : f)));
				toast.error(`Erro ao processar ${file.name}: ${errorMessage}`);
			}
		},
		[forceAI, refreshRubrics],
	);

	const onDrop = useCallback(
		async (acceptedFiles: File[]) => {
			if (acceptedFiles.length === 0) return;

			for (const file of acceptedFiles) {
				const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

				const newFile: UploadedFile = {
					id: fileId,
					name: file.name,
					size: file.size,
					type: file.type,
					status: "uploading",
					progress: 0,
					uploadedAt: new Date(),
				};

				setFiles((prev) => [...prev, newFile]);

				if (visionMode) {
					setConvertingImages(true);
					try {
						setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, status: "processing", progress: 50 } : f)));

						const formData = new FormData();
						formData.append("file", file);

						const response = await fetch("/api/oab-eval/rubric/convert-images", {
							method: "POST",
							body: formData,
						});

						if (!response.ok) {
							const errorData = await response.json();
							throw new Error(errorData.error || "Falha ao converter PDF em imagens");
						}

						const { imageUrls, pdfUrl } = await response.json();

						setImageSelectDialog({ open: true, imageUrls, pdfFile: file, pdfUrl, fileId });
						setSelectedImageUrls(new Set(imageUrls));
						setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, status: "processing", progress: 0 } : f)));
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
						setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, status: "error" } : f)));
						toast.error(`Erro ao converter imagens: ${errorMessage}`);
					} finally {
						setConvertingImages(false);
					}
				} else {
					await processUpload(file, fileId);
				}
			}
		},
		[forceAI, visionMode, processUpload],
	);

	const handleConfirmImageSelection = useCallback(async () => {
		const { pdfFile, pdfUrl, fileId } = imageSelectDialog;
		if (!pdfFile || selectedImageUrls.size === 0) {
			toast.error("Selecione pelo menos uma imagem para enviar.");
			return;
		}

		setProcessingVision(true);
		setImageSelectDialog((prev) => ({ ...prev, open: false }));

		await processUpload(pdfFile, fileId, {
			visionMode: "true",
			selectedImageUrls: JSON.stringify(Array.from(selectedImageUrls)),
			...(pdfUrl ? { pdfUrl } : {}),
		});

		setProcessingVision(false);
	}, [imageSelectDialog, selectedImageUrls, processUpload]);

	const handleCancelImageSelection = useCallback(() => {
		const { fileId } = imageSelectDialog;
		setFiles((prev) => prev.filter((f) => f.id !== fileId));
		setImageSelectDialog({ open: false, imageUrls: [], pdfFile: null, pdfUrl: null, fileId: "" });
		setSelectedImageUrls(new Set());
	}, [imageSelectDialog]);

	const { getRootProps, getInputProps, isDragActive } = useDropzone({
		onDrop,
		accept: { "application/pdf": [".pdf"] },
		maxSize: 10 * 1024 * 1024,
	});

	const removeFile = (fileId: string) => {
		setFiles((prev) => prev.filter((f) => f.id !== fileId));
	};

	const confirmDeleteRubric = (rubricId: string, fileName: string) => {
		setRubricToDelete({ id: rubricId, name: fileName });
		setDeleteDialogOpen(true);
	};

	const deleteRubricFromDB = async () => {
		if (!rubricToDelete) return;
		const { id: rubricId, name: fileName } = rubricToDelete;

		const deletePromise = (async () => {
			const response = await fetch(`/api/oab-eval/rubrics/${rubricId}`, { method: "DELETE" });
			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Falha ao excluir gabarito");
			}
			return response.json();
		})();

		toast.promise(deletePromise, {
			loading: `Excluindo ${fileName}...`,
			success: () => {
				refreshRubrics();
				if (selectedId === rubricId) {
					setSelectedId(null);
					setDraft(null);
				}
				return `${fileName} excluído com sucesso`;
			},
			error: (err) => `Erro ao excluir: ${err.message}`,
		});

		setDeleteDialogOpen(false);
		setRubricToDelete(null);
	};

	// ── Auditoria Tab Logic ──

	const filteredSummaries = useMemo(() => {
		const term = searchTerm.trim().toLowerCase();
		if (!term) return rubricSummaries;
		return rubricSummaries.filter((r) =>
			[r.id, r.exam ?? "", r.area ?? "", r.version ?? ""].join(" ").toLowerCase().includes(term),
		);
	}, [rubricSummaries, searchTerm]);

	const gruposOrdenados = useMemo(() => {
		if (!draft?.grupos) return [];
		const gruposFiltrados = groupFilter === "TODOS" ? draft.grupos : draft.grupos.filter((g) => g.questao === groupFilter);
		return sortGroups(
			(gruposFiltrados as GabaritoGrupo[]).filter((g) => {
				if (!searchTerm.trim()) return true;
				return `${g.rotulo} ${g.descricao}`.toLowerCase().includes(searchTerm.trim().toLowerCase());
			}),
		);
	}, [draft, groupFilter, searchTerm]);

	const subitemsById = useMemo(() => {
		const map = new Map<string, RubricPayload["itens"][number]>();
		draft?.itens.forEach((item) => map.set(item.id, item));
		return map;
	}, [draft]);

	const activeGroup = useMemo(() => {
		if (!activeGroupId || !draft?.grupos) return null;
		return (draft.grupos.find((g) => g.id === activeGroupId) as GabaritoGrupo | undefined) ?? null;
	}, [activeGroupId, draft]);

	const activeSubitem = useMemo(() => {
		if (!activeSubitemId || !draft) return null;
		return draft.itens.find((item) => item.id === activeSubitemId) ?? null;
	}, [activeSubitemId, draft]);

	const subitemsSemGrupo = useMemo(() => {
		if (!draft) return [];
		const usados = new Set<string>();
		for (const g of (draft.grupos ?? []) as GabaritoGrupo[]) {
			for (const sid of g.subitens ?? []) {
				usados.add(sid);
			}
		}
		return draft.itens.filter((item) => !usados.has(item.id));
	}, [draft]);

	const pontuacaoAtual = useMemo(() => {
		if (!draft) return null;
		try {
			return verificarPontuacao(convertRubricToSubitems(draft));
		} catch {
			return null;
		}
	}, [draft]);

	const hasUnsavedChanges = useMemo(() => {
		if (!draft) return false;
		return JSON.stringify(draft) !== baselineHash;
	}, [draft, baselineHash]);

	// Filtered items for "itens" view
	const filteredItens = useMemo(() => {
		if (!draft) return [];
		const term = itensSearchTerm.trim().toLowerCase();
		let items = draft.itens;
		if (groupFilter !== "TODOS") {
			items = items.filter((item) => item.questao === groupFilter);
		}
		if (term) {
			items = items.filter((item) =>
				`${item.id} ${item.descricao} ${(item.fundamentos ?? []).join(" ")} ${(item.palavras_chave ?? []).join(" ")}`.toLowerCase().includes(term),
			);
		}
		return items;
	}, [draft, groupFilter, itensSearchTerm]);

	const toggleGroupSelection = useCallback((groupId: string) => {
		setSelectedGroupIds((prev) => {
			const next = new Set(prev);
			if (next.has(groupId)) next.delete(groupId);
			else next.add(groupId);
			return next;
		});
	}, []);

	const updateGrupo = useCallback((groupId: string, changes: Partial<GabaritoGrupo>) => {
		setDraft((prev) => {
			if (!prev) return prev;
			return { ...prev, grupos: (prev.grupos ?? []).map((g) => (g.id === groupId ? { ...g, ...changes } : g)) };
		});
	}, []);

	const handleDeleteSelectedGroups = useCallback(() => {
		if (!draft || selectedGroupIds.size === 0) return;
		setDraft((prev) => {
			if (!prev) return prev;
			const remaining = (prev.grupos ?? []).filter((g) => !selectedGroupIds.has(g.id));
			return { ...prev, grupos: reindexGroups(remaining as GabaritoGrupo[]) };
		});
		setSelectedGroupIds(new Set());
		if (activeGroupId && selectedGroupIds.has(activeGroupId)) setActiveGroupId(null);
		setDeleteGroupsDialogOpen(false);
	}, [draft, selectedGroupIds, activeGroupId]);

	const handleMergeGroups = useCallback(() => {
		if (!draft || selectedGroupIds.size < 2) {
			toast.info("Selecione dois ou mais grupos para mesclar.");
			return;
		}
		setDraft((prev) => {
			if (!prev?.grupos) return prev;
			const gruposOriginais = prev.grupos as GabaritoGrupo[];
			const selecionados = gruposOriginais.filter((g) => selectedGroupIds.has(g.id));
			if (selecionados.length < 2) return prev;
			const [principal, ...restantes] = selecionados;
			const merged: GabaritoGrupo = {
				...principal,
				rotulo: `${principal.rotulo} + ${restantes.map((g) => g.rotulo).join(" / ")}`,
				descricao: [principal.descricao, ...restantes.map((g) => g.descricao)].join("\n\n---\n\n"),
				peso_maximo: roundTwo([principal, ...restantes].reduce((acc, g) => acc + (g.peso_maximo ?? 0), 0)),
				pesos_brutos: mergePesoArrays(principal.pesos_brutos, ...restantes.map((g) => g.pesos_brutos)),
			};
			const outros = gruposOriginais.filter((g) => !selectedGroupIds.has(g.id));
			return { ...prev, grupos: reindexGroups([...(outros as GabaritoGrupo[]), merged]) };
		});
		const primeiroId = Array.from(selectedGroupIds)[0];
		setSelectedGroupIds(new Set([primeiroId]));
		setActiveGroupId(primeiroId);
	}, [draft, selectedGroupIds]);

	const handleReindexGroups = useCallback(() => {
		if (!draft?.grupos) return;
		setDraft((prev) => {
			if (!prev?.grupos) return prev;
			return { ...prev, grupos: reindexGroups(prev.grupos as GabaritoGrupo[]) };
		});
	}, [draft]);

	const handleSubitemUpdate = useCallback((subitemId: string, changes: Partial<RubricPayload["itens"][number]>) => {
		setDraft((prev) => {
			if (!prev) return prev;
			return {
				...prev,
				itens: prev.itens.map((item) =>
					item.id === subitemId ? { ...item, ...changes, peso: changes.peso === undefined ? item.peso : changes.peso } : item,
				),
			};
		});
	}, []);

	const handleAddSubitem = useCallback(() => {
		if (!draft) return;
		const questao = groupFilter !== "TODOS" ? groupFilter : "PEÇA";
		const existingIds = draft.itens.map((i) => i.id);
		const newId = generateSubitemId(questao, existingIds);
		const newItem: RubricPayload["itens"][number] = {
			id: newId,
			escopo: questao === "PEÇA" ? "Peça" : "Questão",
			questao,
			descricao: "",
			peso: null,
			fundamentos: [],
			palavras_chave: [],
			embedding_text: "",
		};
		setDraft((prev) => {
			if (!prev) return prev;
			return { ...prev, itens: [...prev.itens, newItem] };
		});
		setActiveSubitemId(newId);
		toast.success(`Subitem ${newId} criado.`);
	}, [draft, groupFilter]);

	const handleAddGroup = useCallback(() => {
		if (!draft) return;
		const questao = groupFilter !== "TODOS" ? groupFilter : "PEÇA";
		const existingIds = (draft.grupos ?? []).map((g) => g.id);
		const newId = generateGroupId(questao, existingIds);
		const existingCount = (draft.grupos ?? []).filter((g) => g.questao === questao).length;
		const newGroup: GabaritoGrupo = {
			id: newId,
			escopo: questao === "PEÇA" ? "Peça" : "Questão",
			questao: questao as GabaritoGrupo["questao"],
			indice: existingCount + 1,
			rotulo: `${existingCount + 1}`,
			descricao: "",
			descricao_bruta: "",
			descricao_limpa: "",
			peso_maximo: 0,
			pesos_opcoes: [],
			pesos_brutos: [],
			subitens: [],
		};
		setDraft((prev) => {
			if (!prev) return prev;
			return { ...prev, grupos: [...(prev.grupos ?? []), newGroup as any] };
		});
		setActiveGroupId(newId);
		toast.success(`Grupo ${newId} criado.`);
	}, [draft, groupFilter]);

	const handleDeleteSubitem = useCallback(() => {
		if (!draft || !subitemToDelete) return;
		setDraft((prev) => {
			if (!prev) return prev;
			return { ...prev, itens: prev.itens.filter((item) => item.id !== subitemToDelete) };
		});
		if (activeSubitemId === subitemToDelete) setActiveSubitemId(null);
		setSubitemToDelete(null);
		setDeleteSubitemDialogOpen(false);
		toast.success("Subitem removido.");
	}, [draft, subitemToDelete, activeSubitemId]);

	const handleDuplicateSubitem = useCallback((itemId: string) => {
		if (!draft) return;
		const source = draft.itens.find((i) => i.id === itemId);
		if (!source) return;
		const existingIds = draft.itens.map((i) => i.id);
		const newId = generateSubitemId(source.questao, existingIds);
		const newItem = { ...source, id: newId };
		setDraft((prev) => {
			if (!prev) return prev;
			const idx = prev.itens.findIndex((i) => i.id === itemId);
			const newItens = [...prev.itens];
			newItens.splice(idx + 1, 0, newItem);
			return { ...prev, itens: newItens };
		});
		setActiveSubitemId(newId);
		toast.success(`Subitem duplicado como ${newId}.`);
	}, [draft]);

	const applyMetaEditor = useCallback((value: string) => {
		setMetaEditor(value);
		try {
			const parsed = value.trim() ? JSON.parse(value) : {};
			setMetaParseError(null);
			setDraft((prev) => (prev ? { ...prev, meta: parsed } : prev));
		} catch (e) {
			setMetaParseError((e as Error).message ?? "JSON inválido");
		}
	}, []);

	const handleReset = useCallback(() => {
		if (!detail) return;
		setDraft(cloneRubricPayload(detail.schema));
		setBaselineHash(JSON.stringify(detail.schema));
		setMetaEditor(JSON.stringify(detail.schema.meta ?? detail.meta ?? {}, null, 2));
		setMetaParseError(null);
		setHeaderDraft({ code: detail.code ?? "", exam: detail.exam ?? "", area: detail.area ?? "", version: detail.version ?? "" });
		setSelectedGroupIds(new Set());
		setActiveGroupId(null);
		setActiveSubitemId(null);
		toast.success("Alterações descartadas.");
	}, [detail]);

	const handleDownloadFullJson = useCallback(() => {
		if (!detail) return;
		const fullPayload = {
			id: detail.id,
			code: detail.code,
			exam: detail.exam,
			area: detail.area,
			version: detail.version,
			pdfUrl: detail.pdfUrl,
			createdAt: detail.createdAt,
			updatedAt: detail.updatedAt,
			meta: detail.meta,
			schema: detail.schema,
			counts: detail.counts,
			pontuacao: detail.pontuacao,
		};
		const blob = new Blob([JSON.stringify(fullPayload, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `gabarito-${detail.exam ?? detail.id}-${detail.area ?? "sem-area"}.json`.replace(/\s+/g, "_");
		a.click();
		URL.revokeObjectURL(url);
	}, [detail]);

	const fullSchemaJson = useMemo(() => {
		if (!detail) return "";
		return JSON.stringify(detail.schema, null, 2);
	}, [detail]);

	const handleSave = useCallback(async () => {
		if (!draft || !selectedId) return;
		if (metaParseError) {
			toast.error("Corrija o JSON de meta antes de salvar.");
			return;
		}
		setSaving(true);
		try {
			const body = {
				schema: { ...draft, grupos: draft.grupos ?? [] },
				meta: draft.meta ?? null,
				code: headerDraft.code || null,
				exam: headerDraft.exam || null,
				area: headerDraft.area || null,
				version: headerDraft.version || null,
			};
			const response = await fetch(`/api/oab-eval/rubrics/${selectedId}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data?.error ?? "Falha ao salvar gabarito");

			const rubric: RubricDetail = data.rubric;
			setDraft(cloneRubricPayload(rubric.schema));
			setBaselineHash(JSON.stringify(rubric.schema));
			toast.success("Gabarito salvo com sucesso.");
			refreshRubrics();
		} catch (error) {
			toast.error((error as Error).message ?? "Erro ao salvar gabarito");
		} finally {
			setSaving(false);
		}
	}, [draft, selectedId, metaParseError, headerDraft, refreshRubrics]);

	// ── Render ──

	return (
		<TooltipProvider delayDuration={300}>
			<div className="container mx-auto px-4 py-6 max-w-[1600px]">
				{/* Page Header */}
				<div className="mb-6 flex items-end justify-between gap-4">
					<div>
						<div className="flex items-center gap-2.5 mb-1">
							<div className="rounded-lg bg-primary/10 p-2">
								<Scale className="h-5 w-5 text-primary" />
							</div>
							<h1 className="text-2xl font-bold tracking-tight">Espelho Padrão OAB</h1>
						</div>
						<p className="text-sm text-muted-foreground ml-[42px]">
							Upload, auditoria e gestão de gabaritos oficiais
						</p>
					</div>
					<div className="flex items-center gap-3">
						<div className="flex items-center gap-4 text-sm">
							<StatCard label="Gabaritos" value={rubricsData?.total ?? 0} icon={BookOpen} />
							<StatCard label="Total Itens" value={rubricSummaries.reduce((acc, r) => acc + r.counts.itens, 0)} icon={ListTree} />
						</div>
					</div>
				</div>

				<Tabs defaultValue="upload" className="space-y-4">
					<TabsList className="h-10">
						<TabsTrigger value="upload" className="gap-2 px-4">
							<Upload className="h-4 w-4" />
							Upload
						</TabsTrigger>
						<TabsTrigger value="auditoria" className="gap-2 px-4">
							<ScanText className="h-4 w-4" />
							Auditoria
						</TabsTrigger>
					</TabsList>

					{/* ═══════════ UPLOAD TAB ═══════════ */}
					<TabsContent value="upload" className="mt-0">
						<div className="grid grid-cols-1 lg:grid-cols-[1fr,320px] gap-6">
							<div className="space-y-6">
								{/* Dropzone */}
								<Card>
									<CardContent className="pt-6">
										<div
											{...getRootProps()}
											className={`relative overflow-hidden rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-200 ${
												isDragActive
													? "border-primary bg-primary/5 scale-[1.01]"
													: "border-muted-foreground/20 hover:border-primary/40 hover:bg-muted/30"
											}`}
										>
											<input {...getInputProps()} />
											<div className="mx-auto w-fit rounded-full bg-muted p-4 mb-4">
												<Upload className={`h-8 w-8 transition-colors ${isDragActive ? "text-primary" : "text-muted-foreground"}`} />
											</div>
											{isDragActive ? (
												<p className="text-lg font-medium text-primary">Solte os arquivos aqui...</p>
											) : (
												<>
													<p className="text-base font-medium mb-1">
														Arraste o PDF do gabarito aqui
													</p>
													<p className="text-sm text-muted-foreground">
														ou clique para selecionar &middot; máx. 10MB
													</p>
												</>
											)}
										</div>

										{/* Processing Mode Options */}
										<div className="flex items-center gap-6 mt-4 pt-4 border-t border-border">
											<span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Modo de processamento:</span>
											<label className="flex items-center gap-2 cursor-pointer group">
												<Checkbox id="forceAI" checked={forceAI} onCheckedChange={(c) => handleForceAIChange(c === true)} />
												<span className="text-sm group-hover:text-foreground transition-colors">
													Forçar IA (texto)
												</span>
											</label>
											<label className="flex items-center gap-2 cursor-pointer group">
												<Checkbox id="visionMode" checked={visionMode} onCheckedChange={(c) => handleVisionModeChange(c === true)} />
												<span className="text-sm group-hover:text-foreground transition-colors">
													Via IA (Visão PDF→Imagem)
												</span>
											</label>
										</div>

										{visionMode && (
											<div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground p-3 rounded-lg border border-violet-500/20 bg-violet-500/5">
												<Eye className="h-4 w-4 text-violet-500 mt-0.5 shrink-0" />
												<span>O PDF será convertido em imagens. Você poderá escolher quais páginas enviar ao modelo de visão (blueprint ESPELHO_PADRAO_CELL).</span>
											</div>
										)}
										{convertingImages && (
											<div className="mt-3 flex items-center gap-2 text-xs p-3 rounded-lg border border-violet-500/20 bg-violet-500/5 text-violet-700 dark:text-violet-400">
												<Loader2 className="h-4 w-4 animate-spin" />
												Convertendo PDF em imagens...
											</div>
										)}
										{forceAI && (
											<div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground p-3 rounded-lg border border-blue-500/20 bg-blue-500/5">
												<Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
												<span>O parser determinístico será ignorado — o texto extraído vai direto para o LLM.</span>
											</div>
										)}
									</CardContent>
								</Card>

								{/* Session files (uploading/processing) */}
								{files.filter((f) => f.status !== "completed").length > 0 && (
									<Card>
										<CardHeader className="pb-3">
											<CardTitle className="text-sm font-medium">Processando</CardTitle>
										</CardHeader>
										<CardContent className="space-y-3">
											{files
												.filter((f) => f.status !== "completed")
												.map((file) => (
													<div key={file.id} className="rounded-lg border border-border p-4 space-y-2">
														<div className="flex items-center justify-between">
															<div className="flex items-center gap-3 min-w-0">
																<div className={`shrink-0 rounded-md p-1.5 ${file.status === "error" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
																	{file.status === "error" ? <X className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
																</div>
																<div className="min-w-0">
																	<p className="text-sm font-medium truncate">{file.name}</p>
																	<p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
																</div>
															</div>
															<Badge variant={file.status === "error" ? "destructive" : "secondary"} className="text-[10px]">
																{file.status === "uploading" && "Enviando"}
																{file.status === "processing" && "Processando"}
																{file.status === "error" && "Erro"}
															</Badge>
														</div>
														{(file.status === "uploading" || file.status === "processing") && (
															<Progress value={file.progress} className="h-1.5" />
														)}
													</div>
												))}
										</CardContent>
									</Card>
								)}

								{/* DB Rubrics List */}
								<Card>
									<CardHeader className="flex flex-row items-center justify-between pb-3">
										<div>
											<CardTitle className="text-sm font-medium">Gabaritos Cadastrados</CardTitle>
											<CardDescription className="text-xs">{rubricSummaries.length} gabarito(s) no banco</CardDescription>
										</div>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button size="sm" variant="ghost" onClick={() => refreshRubrics()} disabled={isLoadingRubrics} className="h-8 w-8 p-0">
													<RefreshCw className={`h-4 w-4 ${isLoadingRubrics ? "animate-spin" : ""}`} />
												</Button>
											</TooltipTrigger>
											<TooltipContent>Atualizar lista</TooltipContent>
										</Tooltip>
									</CardHeader>
									<CardContent>
										{isLoadingRubrics && !rubricSummaries.length ? (
											<div className="space-y-3">
												{Array.from({ length: 3 }).map((_, i) => (
													<Skeleton key={i} className="h-16 w-full rounded-lg" />
												))}
											</div>
										) : rubricSummaries.length === 0 ? (
											<EmptyState icon={FileText} title="Nenhum gabarito" description="Faça upload de um PDF de gabarito para começar." />
										) : (
											<div className="space-y-2">
												{rubricSummaries.map((rubric) => (
													<div
														key={rubric.id}
														className="group flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors"
													>
														<div className="shrink-0 rounded-md bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
															<Check className="h-4 w-4" />
														</div>
														<div className="min-w-0 flex-1">
															<p className="text-sm font-medium truncate">
																{rubric.exam ?? rubric.id}
																{rubric.area ? ` — ${rubric.area}` : ""}
															</p>
															<div className="flex items-center gap-2 mt-0.5">
																<span className="text-xs text-muted-foreground">
																	{rubric.counts.itens} itens &middot; {rubric.counts.grupos} grupos
																</span>
																<span className="text-xs text-muted-foreground">&middot;</span>
																<span className="text-xs text-muted-foreground">
																	{new Date(rubric.createdAt).toLocaleDateString("pt-BR")}
																</span>
																{rubric.pontuacao && (
																	<>
																		<span className="text-xs text-muted-foreground">&middot;</span>
																		<PontuacaoBadge pontos={rubric.pontuacao.geral} />
																	</>
																)}
															</div>
														</div>
														<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
															{rubric.pdfUrl && (
																<Tooltip>
																	<TooltipTrigger asChild>
																		<Button size="sm" variant="ghost" className="h-8 w-8 p-0" asChild>
																			<a href={rubric.pdfUrl} target="_blank" rel="noopener noreferrer">
																				<ExternalLink className="h-3.5 w-3.5" />
																			</a>
																		</Button>
																	</TooltipTrigger>
																	<TooltipContent>Ver PDF</TooltipContent>
																</Tooltip>
															)}
															<Tooltip>
																<TooltipTrigger asChild>
																	<Button
																		size="sm"
																		variant="ghost"
																		className="h-8 w-8 p-0 text-destructive hover:text-destructive"
																		onClick={() => confirmDeleteRubric(rubric.id, `${rubric.exam ?? ""} - ${rubric.area ?? ""}`)}
																	>
																		<Trash2 className="h-3.5 w-3.5" />
																	</Button>
																</TooltipTrigger>
																<TooltipContent>Excluir</TooltipContent>
															</Tooltip>
														</div>
													</div>
												))}
											</div>
										)}
									</CardContent>
								</Card>
							</div>

							{/* Sidebar Info */}
							<div className="space-y-4">
								<Card>
									<CardHeader className="pb-3">
										<CardTitle className="text-sm font-medium flex items-center gap-2">
											<Info className="h-4 w-4" />
											Informações
										</CardTitle>
									</CardHeader>
									<CardContent className="space-y-3 text-xs text-muted-foreground">
										<div className="flex items-start gap-2">
											<FileText className="h-3.5 w-3.5 mt-0.5 shrink-0" />
											<span>Formato: PDF (máx. 10MB)</span>
										</div>
										<Separator />
										<div className="flex items-start gap-2">
											<ScanText className="h-3.5 w-3.5 mt-0.5 shrink-0" />
											<span>&quot;Forçar IA&quot; ignora o parser determinístico e envia texto direto ao LLM</span>
										</div>
										<Separator />
										<div className="flex items-start gap-2">
											<Eye className="h-3.5 w-3.5 mt-0.5 shrink-0" />
											<span>&quot;Via IA (Visão)&quot; converte PDF em imagens e usa visão computacional</span>
										</div>
									</CardContent>
								</Card>
							</div>
						</div>
					</TabsContent>

					{/* ═══════════ AUDITORIA TAB ═══════════ */}
					<TabsContent value="auditoria" className="mt-0">
						<div className="flex flex-col lg:flex-row gap-0 min-h-[80vh] rounded-lg border border-border overflow-hidden">
							{/* Sidebar: Rubric List */}
							<aside className="w-full lg:w-72 xl:w-80 border-b lg:border-b-0 lg:border-r border-border bg-card/50 flex flex-col shrink-0">
								<div className="p-3 border-b border-border space-y-2">
									<div className="flex items-center justify-between gap-2">
										<h2 className="text-sm font-semibold">Gabaritos</h2>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button size="sm" variant="ghost" onClick={() => refreshRubrics()} disabled={isLoadingRubrics} className="h-7 w-7 p-0">
													<RefreshCw className={`h-3.5 w-3.5 ${isLoadingRubrics ? "animate-spin" : ""}`} />
												</Button>
											</TooltipTrigger>
											<TooltipContent>Atualizar</TooltipContent>
										</Tooltip>
									</div>
									<div className="relative">
										<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
										<Input
											type="search"
											value={searchTerm}
											onChange={(e) => setSearchTerm(e.target.value)}
											placeholder="Buscar..."
											className="h-8 pl-8 text-xs"
										/>
									</div>
								</div>
								<ScrollArea className="flex-1">
									{isLoadingRubrics && !rubricSummaries.length ? (
										<div className="p-3 space-y-2">
											{Array.from({ length: 4 }).map((_, i) => (
												<Skeleton key={i} className="h-14 w-full rounded-md" />
											))}
										</div>
									) : filteredSummaries.length === 0 ? (
										<div className="p-6 text-center text-xs text-muted-foreground">Nenhum gabarito encontrado.</div>
									) : (
										<div className="divide-y divide-border">
											{filteredSummaries.map((rubric) => {
												const isActive = rubric.id === selectedId;
												return (
													<button
														key={rubric.id}
														className={`w-full text-left px-3 py-2.5 transition-colors ${isActive ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/50 border-l-2 border-l-transparent"}`}
														onClick={() => setSelectedId(rubric.id)}
													>
														<div className="flex items-center justify-between gap-2">
															<span className="text-sm font-medium truncate">{rubric.exam ?? rubric.id}</span>
															<Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">{rubric.version ?? "—"}</Badge>
														</div>
														<div className="text-[11px] text-muted-foreground mt-0.5">
															{rubric.area ?? "Área indefinida"} &middot; {rubric.counts.itens} itens
														</div>
														{rubric.pontuacao && (
															<div className="flex gap-2 mt-1">
																<span className={`text-[10px] tabular-nums ${rubric.pontuacao.peca.ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
																	P: {rubric.pontuacao.peca.total.toFixed(1)}
																</span>
																<span className={`text-[10px] tabular-nums ${rubric.pontuacao.questoes.ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
																	Q: {rubric.pontuacao.questoes.total.toFixed(1)}
																</span>
																<span className={`text-[10px] tabular-nums font-medium ${rubric.pontuacao.geral.ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
																	T: {rubric.pontuacao.geral.total.toFixed(1)}
																</span>
															</div>
														)}
													</button>
												);
											})}
										</div>
									)}
								</ScrollArea>
							</aside>

							{/* Main: Detail + Edit */}
							<main className="flex-1 overflow-y-auto">
								{isLoadingDetail ? (
									<div className="p-6 space-y-4">
										<Skeleton className="h-8 w-64" />
										<Skeleton className="h-20 w-full" />
										<div className="grid grid-cols-3 gap-3">
											{Array.from({ length: 3 }).map((_, i) => (
												<Skeleton key={i} className="h-16 w-full" />
											))}
										</div>
										<Skeleton className="h-64 w-full" />
									</div>
								) : !draft || !detail ? (
									<div className="flex items-center justify-center h-full min-h-[60vh]">
										<EmptyState
											icon={ScanText}
											title="Selecione um gabarito"
											description="Escolha um gabarito na lateral para iniciar a auditoria, edição e visualização dos itens."
										/>
									</div>
								) : (
									<div className="p-6 space-y-6">
										{/* Header + Actions */}
										<div className="flex items-start justify-between gap-4">
											<div>
												<h2 className="text-lg font-semibold">{detail.exam ?? detail.id}</h2>
												<div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
													<span>{headerDraft.area || "Área indefinida"}</span>
													<span>&middot;</span>
													<span>v{headerDraft.version || "?"}</span>
													<span>&middot;</span>
													<span>{new Date(detail.createdAt).toLocaleDateString("pt-BR")}</span>
												</div>
											</div>
											<div className="flex items-center gap-2">
												{hasUnsavedChanges && (
													<Badge variant="outline" className="text-amber-600 border-amber-400 bg-amber-500/5 text-xs">
														Não salvo
													</Badge>
												)}
												{detail.pdfUrl && (
													<Tooltip>
														<TooltipTrigger asChild>
															<Button size="sm" variant="outline" className="h-8" asChild>
																<a href={detail.pdfUrl} target="_blank" rel="noopener noreferrer">
																	<ExternalLink className="h-3.5 w-3.5 mr-1.5" />
																	PDF
																</a>
															</Button>
														</TooltipTrigger>
														<TooltipContent>Abrir PDF original</TooltipContent>
													</Tooltip>
												)}
												<Button variant="outline" size="sm" className="h-8" onClick={handleReset} disabled={!hasUnsavedChanges || saving}>
													<RotateCcw className="h-3.5 w-3.5 mr-1.5" />
													Descartar
												</Button>
												<Button size="sm" className="h-8" onClick={handleSave} disabled={!hasUnsavedChanges || saving || !!metaParseError}>
													{saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
													{saving ? "Salvando..." : "Salvar"}
												</Button>
											</div>
										</div>

										{/* Header Fields */}
										<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
											{(["code", "exam", "area", "version"] as const).map((field) => (
												<div key={field} className="space-y-1">
													<Label className="text-xs text-muted-foreground">
														{field === "code" ? "Código" : field === "exam" ? "Exame" : field === "area" ? "Área" : "Versão"}
													</Label>
													<Input
														value={headerDraft[field]}
														onChange={(e) => setHeaderDraft((prev) => ({ ...prev, [field]: e.target.value }))}
														className="h-8 text-sm"
													/>
												</div>
											))}
										</div>

										{/* Pontuação Summary */}
										<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
											{(["peca", "questoes", "geral"] as const).map((key) => {
												const label = key === "peca" ? "Peça" : key === "questoes" ? "Questões" : "Total Geral";
												const p = pontuacaoAtual?.[key];
												const isOk = p?.ok ?? true;
												return (
													<div key={key} className={`rounded-lg border p-3 ${isOk ? "border-border" : "border-amber-500/30 bg-amber-500/5"}`}>
														<div className="text-xs text-muted-foreground mb-1">{label}</div>
														{p ? (
															<PontuacaoBadge pontos={p} />
														) : (
															<span className="text-sm text-muted-foreground">—</span>
														)}
													</div>
												);
											})}
										</div>

										{pontuacaoAtual && (
											<details className="rounded-lg border border-border p-3 text-xs">
												<summary className="cursor-pointer font-medium flex items-center gap-1.5">
													<ChevronDown className="h-3 w-3 transition-transform [details[open]>&]:rotate-180" />
													Pontuação por questão
												</summary>
												<div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
													{Object.entries(pontuacaoAtual.questoes.porQuestao).map(([questao, pontuacao]) => (
														<div key={questao} className="rounded-md border border-border bg-card p-2.5">
															<Badge variant="outline" className={`text-[9px] px-1.5 py-0 mb-1.5 ${QUESTAO_COLORS[questao] ?? ""}`}>
																{QUESTAO_LABEL[questao] ?? questao}
															</Badge>
															<PontuacaoBadge pontos={pontuacao} />
														</div>
													))}
												</div>
											</details>
										)}

										<Separator />

										{/* View Toggle + Filter + Actions */}
										<div className="flex items-center justify-between gap-4 flex-wrap">
											<div className="flex items-center gap-3">
												<div className="flex items-center rounded-md border border-border p-0.5">
													<Button
														variant={auditoriaView === "grupos" ? "secondary" : "ghost"}
														size="sm"
														className="h-7 px-3 text-xs"
														onClick={() => setAuditoriaView("grupos")}
													>
														<Layers className="h-3.5 w-3.5 mr-1.5" />
														Grupos
													</Button>
													<Button
														variant={auditoriaView === "itens" ? "secondary" : "ghost"}
														size="sm"
														className="h-7 px-3 text-xs"
														onClick={() => setAuditoriaView("itens")}
													>
														<ListTree className="h-3.5 w-3.5 mr-1.5" />
														Itens ({draft.itens.length})
													</Button>
												</div>

												<Select value={groupFilter} onValueChange={setGroupFilter}>
													<SelectTrigger className="h-8 w-[160px] text-xs">
														<SelectValue placeholder="Filtrar questão" />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="TODOS">Todas as questões</SelectItem>
														{QUESTAO_ORDER.map((q) => (
															<SelectItem key={q} value={q}>{QUESTAO_LABEL[q] ?? q}</SelectItem>
														))}
													</SelectContent>
												</Select>
											</div>

											<div className="flex items-center gap-2">
												{auditoriaView === "grupos" && (
													<>
														<Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleAddGroup}>
															<Plus className="h-3.5 w-3.5 mr-1" />
															Grupo
														</Button>
														{selectedGroupIds.size >= 2 && (
															<Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleMergeGroups}>
																<Merge className="h-3.5 w-3.5 mr-1" />
																Mesclar ({selectedGroupIds.size})
															</Button>
														)}
														{selectedGroupIds.size > 0 && (
															<Button
																variant="outline"
																size="sm"
																className="h-8 text-xs text-destructive hover:text-destructive"
																onClick={() => setDeleteGroupsDialogOpen(true)}
															>
																<Trash2 className="h-3.5 w-3.5 mr-1" />
																Remover ({selectedGroupIds.size})
															</Button>
														)}
														<Tooltip>
															<TooltipTrigger asChild>
																<Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleReindexGroups}>
																	<Hash className="h-3.5 w-3.5" />
																</Button>
															</TooltipTrigger>
															<TooltipContent>Reindexar grupos</TooltipContent>
														</Tooltip>
													</>
												)}
												{auditoriaView === "itens" && (
													<Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleAddSubitem}>
														<Plus className="h-3.5 w-3.5 mr-1" />
														Subitem
													</Button>
												)}
											</div>
										</div>

										{/* ─── GRUPOS VIEW ─── */}
										{auditoriaView === "grupos" && (
											<section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr),minmax(0,1fr)]">
												<div className="space-y-4">
													{gruposOrdenados.length === 0 ? (
														<EmptyState icon={Layers} title="Nenhum grupo" description="Crie um grupo ou altere o filtro." />
													) : (
														<div className="rounded-lg border border-border overflow-hidden">
															<table className="w-full text-sm">
																<thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
																	<tr>
																		<th className="w-10 px-3 py-2.5" />
																		<th className="w-10 px-3 py-2.5 text-left">#</th>
																		<th className="px-3 py-2.5 text-left">Questão</th>
																		<th className="px-3 py-2.5 text-left">Rótulo / Descrição</th>
																		<th className="w-20 px-3 py-2.5 text-right">Peso</th>
																		<th className="w-10 px-3 py-2.5" />
																	</tr>
																</thead>
																<tbody>
																	{gruposOrdenados.map((grupo) => (
																		<GroupRow
																			key={grupo.id}
																			grupo={grupo}
																			isSelected={selectedGroupIds.has(grupo.id)}
																			isActive={activeGroupId === grupo.id}
																			onToggleSelect={() => toggleGroupSelection(grupo.id)}
																			onActivate={() => {
																				setActiveGroupId(grupo.id);
																				setActiveSubitemId(null);
																			}}
																		/>
																	))}
																</tbody>
															</table>
														</div>
													)}

													{subitemsSemGrupo.length > 0 && (
														<div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
															<div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400 mb-2">
																<AlertCircle className="h-3.5 w-3.5" />
																Subitens sem grupo ({subitemsSemGrupo.length})
															</div>
															<div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
																{subitemsSemGrupo.map((item) => (
																	<button
																		key={item.id}
																		className={`text-left text-xs font-mono rounded px-2 py-1.5 transition-colors ${activeSubitemId === item.id ? "bg-amber-500/20" : "hover:bg-amber-500/10"}`}
																		onClick={() => {
																			setActiveSubitemId(item.id);
																			setActiveGroupId(null);
																		}}
																	>
																		<span className="font-semibold">{item.id}</span>
																		<span className="text-muted-foreground ml-1.5">{item.descricao.slice(0, 50)}...</span>
																	</button>
																))}
															</div>
														</div>
													)}
												</div>

												{/* Detail Sidebar */}
												<div className="space-y-4 xl:sticky xl:top-4 self-start xl:max-h-[calc(100vh-10rem)] xl:overflow-y-auto xl:pr-1">
													<GroupDetailPanel
														grupo={activeGroup}
														onUpdate={(changes) => {
															if (activeGroup) updateGrupo(activeGroup.id, changes);
														}}
													/>

													{activeGroup && (
														<div className="rounded-lg border border-border bg-card p-4 space-y-3">
															<div className="flex items-center justify-between">
																<div className="flex items-center gap-2">
																	<ListTree className="h-4 w-4 text-primary" />
																	<h3 className="text-sm font-semibold">Subitens do grupo</h3>
																</div>
																<Badge variant="secondary" className="text-[10px]">{(activeGroup as GabaritoGrupo).subitens?.length ?? 0}</Badge>
															</div>
															<ScrollArea className="max-h-[280px]">
																<div className="space-y-1.5 pr-2">
																	{((activeGroup as GabaritoGrupo).subitens ?? []).map((subId) => {
																		const subitem = subitemsById.get(subId);
																		const isActiveItem = activeSubitemId === subId;
																		return (
																			<button
																				key={`${activeGroup.id}-${subId}`}
																				className={`w-full text-left rounded-md border p-2.5 text-xs transition-colors ${isActiveItem ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
																				onClick={() => setActiveSubitemId(subId)}
																			>
																				<div className="flex items-center justify-between">
																					<span className="font-mono font-semibold">{subId}</span>
																					{subitem?.peso != null && (
																						<span className="font-mono text-muted-foreground">{subitem.peso.toFixed(2)}</span>
																					)}
																				</div>
																				<div className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
																					{subitem ? subitem.descricao : "Subitem não encontrado."}
																				</div>
																			</button>
																		);
																	})}
																</div>
															</ScrollArea>
														</div>
													)}

													<SubitemDetailPanel
														subitem={activeSubitem}
														onUpdate={(changes) => {
															if (activeSubitem) handleSubitemUpdate(activeSubitem.id, changes);
														}}
														onDelete={activeSubitem ? () => {
															setSubitemToDelete(activeSubitem.id);
															setDeleteSubitemDialogOpen(true);
														} : undefined}
													/>

													<details className="rounded-lg border border-border bg-card p-4 group">
														<summary className="text-sm font-semibold cursor-pointer flex items-center gap-2">
															<ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
															Schema completo (JSON do banco)
														</summary>
														<div className="mt-3 flex items-center gap-2">
															<Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={handleDownloadFullJson}>
																<Download className="h-3.5 w-3.5" />
																Baixar JSON completo
															</Button>
															<span className="text-[10px] text-muted-foreground">
																{draft ? `${draft.itens.length} itens · ${(draft.grupos ?? []).length} grupos` : ""}
															</span>
														</div>
														<textarea
															value={fullSchemaJson}
															readOnly
															className="mt-2 w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-xs font-mono min-h-[200px] max-h-[400px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
														/>
													</details>
													<details className="rounded-lg border border-border bg-card p-4 group">
														<summary className="text-sm font-semibold cursor-pointer flex items-center gap-2">
															<ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
															Meta (editável)
															{metaParseError && <span className="text-xs text-destructive ml-auto">{metaParseError}</span>}
														</summary>
														<textarea
															value={metaEditor}
															onChange={(e) => applyMetaEditor(e.target.value)}
															className={`mt-3 w-full rounded-md border bg-background px-3 py-2 text-xs font-mono min-h-[140px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${metaParseError ? "border-destructive" : "border-input"}`}
														/>
													</details>
												</div>
											</section>
										)}

										{/* ─── ITENS VIEW ─── */}
										{auditoriaView === "itens" && (
											<section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr),minmax(0,1fr)]">
												<div className="space-y-3">
													<div className="relative">
														<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
														<Input
															type="search"
															value={itensSearchTerm}
															onChange={(e) => setItensSearchTerm(e.target.value)}
															placeholder="Buscar itens por ID, descrição, fundamento..."
															className="h-9 pl-9 text-sm"
														/>
													</div>

													{filteredItens.length === 0 ? (
														<EmptyState icon={ListTree} title="Nenhum item" description="Adicione um subitem ou altere o filtro." />
													) : (
														<div className="rounded-lg border border-border overflow-hidden">
															<table className="w-full text-sm">
																<thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
																	<tr>
																		<th className="px-3 py-2.5 text-left w-28">ID</th>
																		<th className="px-3 py-2.5 text-left">Questão</th>
																		<th className="px-3 py-2.5 text-left">Descrição</th>
																		<th className="px-3 py-2.5 text-right w-16">Peso</th>
																		<th className="px-3 py-2.5 text-center w-14">Fund.</th>
																		<th className="px-3 py-2.5 text-center w-20">Ações</th>
																	</tr>
																</thead>
																<tbody>
																	{filteredItens.map((item) => {
																		const isActiveItem = activeSubitemId === item.id;
																		const colorClass = QUESTAO_COLORS[item.questao] ?? "";
																		return (
																			<tr
																				key={item.id}
																				className={`border-t border-border transition-colors cursor-pointer ${isActiveItem ? "bg-primary/5 dark:bg-primary/10" : "hover:bg-muted/50"}`}
																				onClick={() => setActiveSubitemId(item.id)}
																			>
																				<td className="px-3 py-2 font-mono text-xs font-medium">{item.id}</td>
																				<td className="px-3 py-2">
																					<Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${colorClass}`}>
																						{item.questao}
																					</Badge>
																				</td>
																				<td className="px-3 py-2 text-xs text-muted-foreground line-clamp-2 max-w-xs">{item.descricao.slice(0, 100)}{item.descricao.length > 100 ? "..." : ""}</td>
																				<td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
																					{item.peso != null ? item.peso.toFixed(2) : "—"}
																				</td>
																				<td className="px-3 py-2 text-center text-xs text-muted-foreground">
																					{(item.fundamentos ?? []).length}
																				</td>
																				<td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
																					<div className="flex items-center justify-center gap-0.5">
																						<Tooltip>
																							<TooltipTrigger asChild>
																								<Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDuplicateSubitem(item.id)}>
																									<Copy className="h-3 w-3" />
																								</Button>
																							</TooltipTrigger>
																							<TooltipContent>Duplicar</TooltipContent>
																						</Tooltip>
																						<Tooltip>
																							<TooltipTrigger asChild>
																								<Button
																									variant="ghost"
																									size="sm"
																									className="h-7 w-7 p-0 text-destructive hover:text-destructive"
																									onClick={() => {
																										setSubitemToDelete(item.id);
																										setDeleteSubitemDialogOpen(true);
																									}}
																								>
																									<Trash2 className="h-3 w-3" />
																								</Button>
																							</TooltipTrigger>
																							<TooltipContent>Excluir</TooltipContent>
																						</Tooltip>
																					</div>
																				</td>
																			</tr>
																		);
																	})}
																</tbody>
															</table>
														</div>
													)}
												</div>

												{/* Item Detail Sidebar */}
												<div className="space-y-4 xl:sticky xl:top-4 self-start xl:max-h-[calc(100vh-10rem)] xl:overflow-y-auto xl:pr-1">
													<SubitemDetailPanel
														subitem={activeSubitem}
														onUpdate={(changes) => {
															if (activeSubitem) handleSubitemUpdate(activeSubitem.id, changes);
														}}
														onDelete={activeSubitem ? () => {
															setSubitemToDelete(activeSubitem.id);
															setDeleteSubitemDialogOpen(true);
														} : undefined}
													/>

													<details className="rounded-lg border border-border bg-card p-4 group">
														<summary className="text-sm font-semibold cursor-pointer flex items-center gap-2">
															<ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
															Schema completo (JSON do banco)
														</summary>
														<div className="mt-3 flex items-center gap-2">
															<Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={handleDownloadFullJson}>
																<Download className="h-3.5 w-3.5" />
																Baixar JSON completo
															</Button>
															<span className="text-[10px] text-muted-foreground">
																{draft ? `${draft.itens.length} itens · ${(draft.grupos ?? []).length} grupos` : ""}
															</span>
														</div>
														<textarea
															value={fullSchemaJson}
															readOnly
															className="mt-2 w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-xs font-mono min-h-[200px] max-h-[400px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
														/>
													</details>
													<details className="rounded-lg border border-border bg-card p-4 group">
														<summary className="text-sm font-semibold cursor-pointer flex items-center gap-2">
															<ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
															Meta (editável)
															{metaParseError && <span className="text-xs text-destructive ml-auto">{metaParseError}</span>}
														</summary>
														<textarea
															value={metaEditor}
															onChange={(e) => applyMetaEditor(e.target.value)}
															className={`mt-3 w-full rounded-md border bg-background px-3 py-2 text-xs font-mono min-h-[140px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${metaParseError ? "border-destructive" : "border-input"}`}
														/>
													</details>
												</div>
											</section>
										)}
									</div>
								)}
							</main>
						</div>
					</TabsContent>
				</Tabs>

				{/* ── Dialogs ── */}
				<Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
					<DialogContent className="sm:max-w-md">
						<DialogHeader>
							<DialogTitle className="flex items-center gap-2 text-destructive">
								<AlertCircle className="h-5 w-5" />
								Confirmar Exclusão
							</DialogTitle>
							<DialogDescription className="pt-3">
								Tem certeza que deseja excluir permanentemente o gabarito:
								<div className="mt-2 p-3 bg-muted rounded-md">
									<p className="font-semibold text-foreground">{rubricToDelete?.name}</p>
								</div>
								<p className="mt-3 text-destructive font-medium">Esta ação não pode ser desfeita.</p>
							</DialogDescription>
						</DialogHeader>
						<DialogFooter className="gap-2 sm:gap-0">
							<Button variant="outline" onClick={() => { setDeleteDialogOpen(false); setRubricToDelete(null); }}>
								Cancelar
							</Button>
							<Button variant="destructive" onClick={deleteRubricFromDB} className="gap-2">
								<Trash2 className="h-4 w-4" />
								Excluir
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				{/* ── Image Selection Dialog (Vision Mode) ── */}
				<Dialog
					open={imageSelectDialog.open}
					onOpenChange={(open) => {
						if (!open) handleCancelImageSelection();
					}}
				>
					<DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
						<DialogHeader>
							<DialogTitle className="flex items-center gap-2">
								<ImageIcon className="h-5 w-5" />
								Selecionar Imagens para Enviar ao Agente
							</DialogTitle>
							<DialogDescription>
								O PDF foi convertido em {imageSelectDialog.imageUrls.length} imagens. Selecione apenas as páginas relevantes para a extração do gabarito.
							</DialogDescription>
						</DialogHeader>

						<div className="flex items-center justify-between py-2 border-b border-border">
							<span className="text-sm text-muted-foreground">
								{selectedImageUrls.size} de {imageSelectDialog.imageUrls.length} selecionadas
							</span>
							<div className="flex gap-2">
								<Button
									size="sm"
									variant="outline"
									onClick={() => setSelectedImageUrls(new Set(imageSelectDialog.imageUrls))}
								>
									<CheckSquare className="h-3.5 w-3.5 mr-1" />
									Todas
								</Button>
								<Button
									size="sm"
									variant="outline"
									onClick={() => setSelectedImageUrls(new Set())}
								>
									<Square className="h-3.5 w-3.5 mr-1" />
									Nenhuma
								</Button>
							</div>
						</div>

						<div className="flex-1 overflow-y-auto min-h-0 py-2">
							<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
								{imageSelectDialog.imageUrls.map((url, idx) => {
									const isSelected = selectedImageUrls.has(url);
									return (
										<div
											key={url}
											className={`relative rounded-lg border-2 cursor-pointer transition-all overflow-hidden ${
												isSelected
													? "border-primary ring-2 ring-primary/20"
													: "border-border hover:border-muted-foreground/50 opacity-60"
											}`}
											onClick={() => {
												setSelectedImageUrls((prev) => {
													const next = new Set(prev);
													if (next.has(url)) next.delete(url);
													else next.add(url);
													return next;
												});
											}}
										>
											<div className="aspect-[3/4] bg-muted relative">
												<img
													src={url}
													alt={`Página ${idx + 1}`}
													className="w-full h-full object-contain"
													loading="lazy"
												/>
											</div>
											<div className="flex items-center gap-2 px-2 py-1.5 bg-background">
												<Checkbox checked={isSelected} className="pointer-events-none" />
												<span className="text-xs font-medium">Página {idx + 1}</span>
											</div>
										</div>
									);
								})}
							</div>
						</div>

						<DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border">
							<Button variant="outline" onClick={handleCancelImageSelection}>
								Cancelar
							</Button>
							<Button
								onClick={handleConfirmImageSelection}
								disabled={selectedImageUrls.size === 0 || processingVision}
								className="gap-2"
							>
								{processingVision ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Check className="h-4 w-4" />
								)}
								Enviar {selectedImageUrls.size} imagem(ns) ao Agente
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				<AlertDialog open={deleteGroupsDialogOpen} onOpenChange={setDeleteGroupsDialogOpen}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Remover {selectedGroupIds.size} grupo(s) selecionado(s)?</AlertDialogTitle>
							<AlertDialogDescription>
								Os grupos selecionados serão removidos do gabarito. Esta ação só é salva ao clicar em &quot;Salvar&quot;.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancelar</AlertDialogCancel>
							<AlertDialogAction onClick={handleDeleteSelectedGroups}>Confirmar</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>

				<AlertDialog open={deleteSubitemDialogOpen} onOpenChange={setDeleteSubitemDialogOpen}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Remover subitem {subitemToDelete}?</AlertDialogTitle>
							<AlertDialogDescription>
								O subitem será removido do gabarito. Esta ação só é salva ao clicar em &quot;Salvar&quot;.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel onClick={() => setSubitemToDelete(null)}>Cancelar</AlertDialogCancel>
							<AlertDialogAction onClick={handleDeleteSubitem}>Confirmar</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</TooltipProvider>
	);
}
