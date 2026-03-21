"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { InfoIcon, Sparkles, Settings2, Wrench, FileJson, Link2, AlertCircle, Maximize2, History, RotateCcw, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import Image from "next/image";
import { useProviderModels, type ProviderModelOption } from "../../hooks/useProviderModels";
import type {
	AgentBlueprintDraft,
	AgentTypeDescriptor,
	AgentToolDefinition,
	OutputParserTemplate,
	OutputParserConfig,
	AgentToolConfig,
	LinkedColumnType,
	AiProviderType,
	GeminiThinkingLevel,
	OpenAIReasoningEffort,
} from "../../types";

interface AgentNodeDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	draft: AgentBlueprintDraft;
	agentTypes: AgentTypeDescriptor[];
	tools: AgentToolDefinition[];
	modelOptions: Array<{ value: string; label: string }>;
	structuredTemplates: OutputParserTemplate[];
	onSave: (patch: Partial<AgentBlueprintDraft>) => void;
}

// Fallback hardcoded — usado enquanto a API dinâmica não responde
const FALLBACK_GEMINI: ProviderModelOption[] = [
	{ value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview", description: "SOTA reasoning com profundidade e multimodal avançado", pricing: "≤200K: $2.00 / $12.00 · >200K: $4.00 / $18.00", cutoff: "Jan 2025" },
	{ value: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview", description: "Inteligência frontier com velocidade, search e grounding", pricing: "$0.50 / $3.00 por 1M tokens", cutoff: "Jan 2025" },
	{ value: "gemini-3-pro-preview", label: "Gemini 3 Pro Preview", description: "Raciocínio avançado, multimodal e vibe coding", pricing: "≤200K: $2.00 / $12.00 · >200K: $4.00 / $18.00", cutoff: "Jan 2025" },
	{ value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", description: "Geração anterior, excelente em código e raciocínio complexo", pricing: "≤200K: $1.25 / $10.00 · >200K: $2.50 / $15.00", cutoff: "Jan 2025" },
	{ value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", description: "Raciocínio híbrido, 1M context, thinking budgets", pricing: "$0.30 / $2.50 por 1M tokens", cutoff: "Jan 2025" },
	{ value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", description: "Menor e mais econômico, feito para uso em escala", pricing: "$0.10 / $0.40 por 1M tokens", cutoff: "Jan 2025" },
];

const FALLBACK_OPENAI: ProviderModelOption[] = [
	{ value: "gpt-4.1", label: "GPT-4.1 (Vision)", supportsReasoning: false, description: "Principal modelo de visão", pricing: "$2.00 / $8.00 por 1M tokens" },
	{ value: "gpt-4.1-mini", label: "GPT-4.1 Mini", supportsReasoning: false, description: "Balanceado custo/qualidade", pricing: "$0.40 / $1.60 por 1M tokens" },
	{ value: "gpt-4.1-nano", label: "GPT-4.1 Nano", supportsReasoning: false, description: "Ultra rápido, baixo custo", pricing: "$0.10 / $0.40 por 1M tokens" },
	{ value: "gpt-4o", label: "GPT-4o", supportsReasoning: false, description: "Modelo anterior multimodal", pricing: "$2.50 / $10.00 por 1M tokens" },
	{ value: "gpt-4o-mini", label: "GPT-4o Mini", supportsReasoning: false, description: "Versão compacta do GPT-4o", pricing: "$0.15 / $0.60 por 1M tokens" },
	{ value: "gpt-5", label: "GPT-5", supportsReasoning: true, description: "Raciocínio avançado", pricing: "$1.25 / $10.00 por 1M tokens" },
	{ value: "gpt-5-mini", label: "GPT-5 Mini", supportsReasoning: true, description: "Raciocínio compacto", pricing: "$0.25 / $2.00 por 1M tokens" },
	{ value: "gpt-5.1", label: "GPT-5.1", supportsReasoning: true, description: "Evolução do GPT-5", pricing: "$1.25 / $10.00 por 1M tokens" },
	{ value: "gpt-5.2", label: "GPT-5.2", supportsReasoning: true, description: "Última geração GPT", pricing: "$1.75 / $14.00 por 1M tokens" },
	{ value: "gpt-5-pro", label: "GPT-5 Pro", supportsReasoning: true, fixedReasoning: "high", description: "Raciocínio máximo fixo", pricing: "$15.00 / $120.00 por 1M tokens" },
];

// Opções de Raciocínio Gemini (thinkingLevel)
const GEMINI_THINKING_LEVELS: Array<{ value: GeminiThinkingLevel; label: string; description: string }> = [
	{ value: "high", label: "Alto", description: "Máximo raciocínio - respostas mais elaboradas" },
	{ value: "medium", label: "Médio", description: "Balanceado para maioria das tarefas" },
	{ value: "low", label: "Baixo", description: "Raciocínio leve - menor latência" },
	{ value: "minimal", label: "Mínimo", description: "Quase sem thinking - máxima velocidade" },
];

// Opções de Raciocínio OpenAI (reasoningEffort)
const OPENAI_REASONING_EFFORTS: Array<{ value: OpenAIReasoningEffort; label: string; description: string }> = [
	{ value: "high", label: "Alto", description: "Máximo raciocínio - respostas mais elaboradas" },
	{ value: "medium", label: "Médio", description: "Balanceado para maioria das tarefas" },
	{ value: "low", label: "Baixo", description: "Raciocínio leve - menor latência" },
	{ value: "none", label: "Nenhum", description: "Sem raciocínio - máxima velocidade (padrão GPT-5.1+)" },
];

// ── Prompt version history ────────────────────────────────────────────────
interface PromptVersionEntry {
	prompt: string;
	savedAt: string; // ISO string
	label?: string;
}

const MAX_PROMPT_VERSIONS = 10;

function getPromptHistory(draft: AgentBlueprintDraft): PromptVersionEntry[] {
	const meta = draft.metadata as Record<string, unknown> | null | undefined;
	const raw = meta?.promptHistory;
	if (!Array.isArray(raw)) return [];
	return raw as PromptVersionEntry[];
}

export function AgentNodeDialog({
	open,
	onOpenChange,
	draft,
	agentTypes,
	tools,
	structuredTemplates,
	onSave,
}: AgentNodeDialogProps) {
	// Modelos dinâmicos via API — fallback para listas hardcoded
	const { openaiModels: dynamicOpenAi, geminiModels: dynamicGemini } = useProviderModels();
	const GEMINI_MODELS: ProviderModelOption[] = dynamicGemini ?? FALLBACK_GEMINI;
	const OPENAI_MODELS: ProviderModelOption[] = dynamicOpenAi ?? FALLBACK_OPENAI;

	const [localDraft, setLocalDraft] = useState<AgentBlueprintDraft>(draft);
	const [promptEditorOpen, setPromptEditorOpen] = useState(false);

	// Cache de configurações por provedor — preserva ao trocar e voltar
	const [providerCache, setProviderCache] = useState<Record<string, {
		model: string;
		temperature: number;
		maxOutputTokens: number;
		thinkingLevel: string | null;
		reasoningEffort: string | null;
		timeoutMs: number;
		retryAttempts: number;
		retryBaseDelayMs: number;
		retryMaxDelayMs: number;
	}>>({});

	const buildProviderCacheFromDraft = (source: AgentBlueprintDraft) => {
		const savedCache = (source.metadata as Record<string, unknown>)?.providerCache as typeof providerCache | undefined;
		const openAiDefault = OPENAI_MODELS[0]?.value || "gpt-4.1";
		const geminiDefault = GEMINI_MODELS[0]?.value || "gemini-3-flash-preview";
		const draftUsesGemini = typeof source.model === "string" && source.model.toLowerCase().includes("gemini");

		return {
			OPENAI: {
				model: savedCache?.OPENAI?.model ?? (!draftUsesGemini ? source.model : openAiDefault),
				temperature: savedCache?.OPENAI?.temperature ?? (draftUsesGemini ? 0.1 : (source.temperature ?? 0.1)),
				maxOutputTokens: savedCache?.OPENAI?.maxOutputTokens ?? source.maxOutputTokens ?? 20000,
				thinkingLevel: savedCache?.OPENAI?.thinkingLevel ?? null,
				reasoningEffort: savedCache?.OPENAI?.reasoningEffort ?? source.reasoningEffort ?? null,
				timeoutMs: savedCache?.OPENAI?.timeoutMs ?? 120000,
				retryAttempts: savedCache?.OPENAI?.retryAttempts ?? 3,
				retryBaseDelayMs: savedCache?.OPENAI?.retryBaseDelayMs ?? 3000,
				retryMaxDelayMs: savedCache?.OPENAI?.retryMaxDelayMs ?? 30000,
			},
			GEMINI: {
				model: savedCache?.GEMINI?.model ?? (draftUsesGemini ? source.model : geminiDefault),
				temperature: savedCache?.GEMINI?.temperature ?? 1,
				maxOutputTokens: savedCache?.GEMINI?.maxOutputTokens ?? source.maxOutputTokens ?? 20000,
				thinkingLevel: savedCache?.GEMINI?.thinkingLevel ?? source.thinkingLevel ?? "high",
				reasoningEffort: savedCache?.GEMINI?.reasoningEffort ?? null,
				timeoutMs: savedCache?.GEMINI?.timeoutMs ?? 120000,
				retryAttempts: savedCache?.GEMINI?.retryAttempts ?? 3,
				retryBaseDelayMs: savedCache?.GEMINI?.retryBaseDelayMs ?? 3000,
				retryMaxDelayMs: savedCache?.GEMINI?.retryMaxDelayMs ?? 30000,
			},
		};
	};

	// Sincroniza o estado local APENAS quando o dialog abre (open: false → true)
	const prevOpen = useRef(open);
	useEffect(() => {
		if (open && !prevOpen.current) {
			setLocalDraft(draft);
			setProviderCache(buildProviderCacheFromDraft(draft));
		}
		prevOpen.current = open;
	}, [open, draft]);

	const currentType = agentTypes.find((t) => t.id === localDraft.agentType);
	const activeTools = new Set((localDraft.toolset || []).map((tool) => tool.key));

	// Code execution toggle (Gemini) — persiste em metadata
	const codeExecutionEnabled = (localDraft.metadata as Record<string, unknown>)?.codeExecution !== false;
	const toggleCodeExecution = (enabled: boolean) => {
		updateLocal({ metadata: { ...(localDraft.metadata as Record<string, unknown> ?? {}), codeExecution: enabled } });
	};

	const updateProviderConfig = (
		provider: AiProviderType,
		patch: Partial<(typeof providerCache)[AiProviderType]>,
	) => {
		setProviderCache((prev) => ({
			...prev,
			[provider]: {
				...prev[provider],
				...patch,
			},
		}));
	};

	// Captura versão atual do prompt antes de salvar
	const capturePromptVersion = useCallback((targetDraft: AgentBlueprintDraft): PromptVersionEntry[] => {
		const currentPrompt = targetDraft.systemPrompt?.trim() ?? "";
		if (!currentPrompt) return getPromptHistory(targetDraft);
		const existing = getPromptHistory(targetDraft);
		// Não duplica se o prompt não mudou em relação à última versão
		if (existing.length > 0 && existing[0].prompt === currentPrompt) return existing;
		const newEntry: PromptVersionEntry = { prompt: currentPrompt, savedAt: new Date().toISOString() };
		return [newEntry, ...existing].slice(0, MAX_PROMPT_VERSIONS);
	}, []);

	const restorePromptVersion = (entry: PromptVersionEntry) => {
		updateLocal({ systemPrompt: entry.prompt });
	};

	const promptHistory = getPromptHistory(localDraft);

	const handleSave = () => {
		// Persiste o cache de provedores no metadata para sobreviver ao save/reopen
		const meta = (localDraft.metadata as Record<string, unknown>) ?? {};
		const effectiveOpenAiModel = providerCache.OPENAI?.model || OPENAI_MODELS[0]?.value || "gpt-4.1";
		const updatedHistory = capturePromptVersion(localDraft);
		const finalDraft = {
			...localDraft,
			model: effectiveOpenAiModel,
			temperature: providerCache.OPENAI?.temperature ?? 0.1,
			maxOutputTokens: providerCache.OPENAI?.maxOutputTokens ?? 0,
			thinkingLevel: providerCache.GEMINI?.thinkingLevel as GeminiThinkingLevel | null,
			reasoningEffort: providerCache.OPENAI?.reasoningEffort as OpenAIReasoningEffort | null,
			defaultProvider: null,
			metadata: { ...meta, providerCache, promptHistory: updatedHistory },
		};
		onSave(finalDraft);
		onOpenChange(false);
	};

	const updateLocal = (patch: Partial<AgentBlueprintDraft>) => {
		setLocalDraft((prev) => ({ ...prev, ...patch }));
	};

	const toggleTool = (tool: AgentToolDefinition, enabled: boolean) => {
		const current = localDraft.toolset || [];
		const exists = current.find((item) => item.key === tool.key);
		let next: AgentToolConfig[];

		if (enabled && !exists) {
			next = [...current, { ...tool, enabled: true }];
		} else if (!enabled && exists) {
			next = current.filter((item) => item.key !== tool.key);
		} else {
			next = current;
		}

		updateLocal({ toolset: next });
	};

	const applyTemplate = (template: OutputParserTemplate) => {
		updateLocal({
			outputParser: {
				schemaType: template.schemaType,
				schema: template.schema,
				name: template.name,
				strict: true,
			},
		});
	};

	const geminiConfig = providerCache.GEMINI;
	const openAiConfig = providerCache.OPENAI;
	const geminiInfo = GEMINI_MODELS.find((m) => m.value === geminiConfig?.model) ?? GEMINI_MODELS[0];
	const openAiInfo = OPENAI_MODELS.find((m) => m.value === openAiConfig?.model) ?? OPENAI_MODELS[0];
	const openAiSupportsReasoning = openAiInfo?.supportsReasoning ?? false;
	const openAiFixedReasoning = openAiInfo?.fixedReasoning as OpenAIReasoningEffort | undefined;

	return (
		<>
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-4xl max-h-[85vh] p-0">
				<DialogHeader className="px-6 pt-6 pb-4 border-b">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl">🤖</div>
							<div>
								<DialogTitle className="text-xl">Configuração do Agente</DialogTitle>
								<DialogDescription>Configure todos os parâmetros do agente via Vercel AI SDK</DialogDescription>
							</div>
						</div>
						<Badge variant="outline" className="font-mono">
							{currentType?.label || "Custom"}
						</Badge>
					</div>
				</DialogHeader>

				<Tabs defaultValue="parameters" className="flex-1">
					<div className="px-6 pt-2">
						<TabsList className="grid w-full grid-cols-4">
							<TabsTrigger value="parameters" className="gap-2">
								<Sparkles className="h-4 w-4" />
								Parâmetros
							</TabsTrigger>
							<TabsTrigger value="model" className="gap-2">
								<Settings2 className="h-4 w-4" />
								Modelo
							</TabsTrigger>
							<TabsTrigger value="tools" className="gap-2">
								<Wrench className="h-4 w-4" />
								Ferramentas
							</TabsTrigger>
							<TabsTrigger value="output" className="gap-2">
								<FileJson className="h-4 w-4" />
								Saída
							</TabsTrigger>
						</TabsList>
					</div>

					<ScrollArea className="h-[50vh] px-6 py-4">
						{/* PARAMETERS TAB */}
						<TabsContent value="parameters" className="space-y-6 mt-0">
							<div className="space-y-4">
								<div className="space-y-2">
									<Label htmlFor="agent-name" className="text-sm font-medium">
										Nome do Agente
									</Label>
									<Input
										id="agent-name"
										value={localDraft.name}
										onChange={(e) => updateLocal({ name: e.target.value })}
										placeholder="Ex: Perito em Correção OAB"
										className="text-base"
									/>
								</div>

								<div className="space-y-2">
									<Label className="text-sm font-medium">Tipo de Agente</Label>
									<Select
										value={localDraft.agentType}
										onValueChange={(value) => updateLocal({ agentType: value as AgentBlueprintDraft["agentType"] })}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{agentTypes.map((type) => (
												<SelectItem key={type.id} value={type.id}>
													{type.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{currentType?.description && (
										<p className="text-xs text-muted-foreground flex items-start gap-2 mt-2 p-3 bg-muted/50 rounded-md">
											<InfoIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
											<span>{currentType.description}</span>
										</p>
									)}
								</div>

								<Separator />

								{/* COLUNA VINCULADA (Lead Chatwit) */}
								<div className="space-y-4 p-4 rounded-lg border border-dashed border-primary/30 bg-primary/5">
									<div className="flex items-center gap-2 text-primary">
										<Link2 className="h-4 w-4" />
										<span className="text-sm font-medium">Vinculação com Lead Chatwit</span>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-medium">Coluna da Tabela</Label>
										<Select
											value={localDraft.linkedColumn || "_none"}
											onValueChange={(value) =>
												updateLocal({ linkedColumn: value === "_none" ? null : (value as LinkedColumnType) })
											}
										>
											<SelectTrigger>
												<SelectValue placeholder="Nenhuma" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="_none">Nenhuma vinculação</SelectItem>
												<SelectItem value="PROVA_CELL">
													<span className="flex items-center gap-2">📝 Prova (Transcrição de manuscritos)</span>
												</SelectItem>
												<SelectItem value="ESPELHO_CELL">
													<span className="flex items-center gap-2">📋 Espelho (Extração de dados)</span>
												</SelectItem>
												<SelectItem value="ANALISE_CELL">
													<span className="flex items-center gap-2">🔍 Análise (Comparação prova x espelho)</span>
												</SelectItem>
												<SelectItem value="RECURSO_CELL">
													<span className="flex items-center gap-2">📄 Recurso (Geração automática)</span>
												</SelectItem>
												<SelectItem value="ESPELHO_PADRAO_CELL">
													<span className="flex items-center gap-2">📐 Espelho Padrão (Extração de gabarito via IA)</span>
												</SelectItem>
											</SelectContent>
										</Select>
										<p className="text-xs text-muted-foreground">
											Este agente será executado automaticamente quando a coluna for acionada na tabela de Leads
										</p>
									</div>
								</div>

								<Separator />

								<div className="space-y-2">
									<div className="flex items-center justify-between">
										<Label htmlFor="system-prompt" className="text-sm font-medium">
											Prompt do Sistema
										</Label>
										<div className="flex items-center gap-1.5">
											{/* Histórico de versões */}
											{promptHistory.length > 0 && (
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground">
															<History className="h-3.5 w-3.5" />
															{promptHistory.length} versões
															<ChevronDown className="h-3 w-3" />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end" className="w-72">
														<DropdownMenuLabel className="text-xs">Versões salvas (restaurar sobrescreve o campo)</DropdownMenuLabel>
														<DropdownMenuSeparator />
														{promptHistory.map((entry, idx) => (
															<DropdownMenuItem
																key={entry.savedAt}
																onClick={() => restorePromptVersion(entry)}
																className="flex flex-col items-start gap-0.5 cursor-pointer"
															>
																<span className="text-xs font-medium flex items-center gap-1.5">
																	<RotateCcw className="h-3 w-3" />
																	{idx === 0 ? "Versão anterior" : `v${promptHistory.length - idx}`} — {new Date(entry.savedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
																</span>
																<span className="text-[10px] text-muted-foreground truncate w-full">{entry.prompt.slice(0, 60)}…</span>
															</DropdownMenuItem>
														))}
													</DropdownMenuContent>
												</DropdownMenu>
											)}
											{/* Botão expandir */}
											<Button
												variant="ghost"
												size="sm"
												className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
												onClick={() => setPromptEditorOpen(true)}
												type="button"
											>
												<Maximize2 className="h-3.5 w-3.5" />
												Expandir
											</Button>
										</div>
									</div>
									<Textarea
										id="system-prompt"
										value={localDraft.systemPrompt || ""}
										onChange={(e) => updateLocal({ systemPrompt: e.target.value })}
										placeholder="Defina o papel, comportamento e diretrizes do agente..."
										className="min-h-[200px] font-mono text-sm"
									/>
									<p className="text-xs text-muted-foreground flex items-center gap-1.5">
										<InfoIcon className="h-3 w-3" />
										Instruções fundamentais injetadas no Agente antes de cada execução
									</p>
								</div>

								{localDraft.linkedColumn === "RECURSO_CELL" && (
									<div className="space-y-2 p-4 rounded-lg border border-blue-500/30 bg-blue-500/5 mt-4">
										<Label className="text-sm font-medium flex items-center gap-2">
											<Sparkles className="h-4 w-4 text-blue-500" />
											Variáveis Disponíveis
										</Label>
										<p className="text-xs text-muted-foreground mb-2">
											Copie e cole estas marcações no seu Prompt do Sistema. O sistema irá substituí-las automaticamente pelos dados reais do Lead durante a execução:
										</p>
										<div className="flex flex-wrap gap-2">
											<Badge variant="outline" className="font-mono text-xs cursor-pointer hover:bg-muted" onClick={() => navigator.clipboard.writeText('{analise_validada}')}>
												{'{analise_validada}'}
											</Badge>
											<Badge variant="outline" className="font-mono text-xs cursor-pointer hover:bg-muted" onClick={() => navigator.clipboard.writeText('{modelo_recurso}')}>
												{'{modelo_recurso}'}
											</Badge>
											<Badge variant="outline" className="font-mono text-xs cursor-pointer hover:bg-muted" onClick={() => navigator.clipboard.writeText('{nome}')}>
												{'{nome}'}
											</Badge>
										</div>
									</div>
								)}

								{localDraft.linkedColumn === "ESPELHO_PADRAO_CELL" && (
									<div className="space-y-2 p-4 rounded-lg border border-purple-500/30 bg-purple-500/5 mt-4">
										<Label className="text-sm font-medium flex items-center gap-2">
											<Sparkles className="h-4 w-4 text-purple-500" />
											Extração de Gabarito Padrão
										</Label>
										<p className="text-xs text-muted-foreground">
											Este blueprint será utilizado pelo sistema ao processar PDFs de gabarito via visão computacional (PDF → Imagens → IA), quando a opção &quot;Via IA (Visão)&quot; for selecionada no upload de gabaritos OAB.
										</p>
									</div>
								)}

								<div className="space-y-2 mt-4">
									<Label htmlFor="instructions" className="text-sm font-medium">
										Instruções Adicionais (Opcional)
									</Label>
									<Textarea
										id="instructions"
										value={localDraft.instructions || ""}
										onChange={(e) => updateLocal({ instructions: e.target.value })}
										placeholder="Instruções complementares..."
										className="min-h-[100px] font-mono text-sm"
									/>
								</div>
							</div>
						</TabsContent>

						{/* MODEL TAB - REDESENHADA */}
						<TabsContent value="model" className="space-y-6 mt-0">
							<div className="space-y-4">
								<p className="text-sm text-muted-foreground">
									Configure aqui os modelos por provedor. A ordem de uso nao e definida neste dialog; quem escolhe o provedor inicial e o switch no topo da coluna de Leads.
								</p>

								<div className="grid grid-cols-2 gap-4">
									{/* GEMINI */}
									<div
										className="p-4 rounded-lg border border-blue-500/30 bg-blue-500/5 min-h-[280px] flex flex-col"
									>
										<div className="flex items-center gap-3 mb-4">
											<Image src="/assets/Google-gemini-icon.svg" alt="Gemini" width={32} height={32} />
											<div>
												<h3 className="font-semibold">Google Gemini</h3>
												<p className="text-xs text-muted-foreground">{GEMINI_MODELS.length} modelos disponíveis</p>
											</div>
										</div>

										<div className="space-y-2">
											<Label className="text-xs">Modelo</Label>
											<Select
												value={geminiConfig?.model ?? geminiInfo.value}
												onValueChange={(value) => updateProviderConfig("GEMINI", { model: value })}
											>
												<SelectTrigger className="text-sm">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{GEMINI_MODELS.map((model) => (
														<SelectItem key={model.value} value={model.value}>
															<span className="flex items-center gap-2">
																{model.label}
																{model.isNew && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-blue-400 text-blue-400">Novo</Badge>}
															</span>
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>

										{/* Info do modelo — sempre visível para manter altura consistente */}
										<div className="mt-3 space-y-2 flex-1">
											{geminiInfo?.description && (
												<p className="text-xs text-muted-foreground">{geminiInfo.description}</p>
											)}
											{geminiInfo?.pricing && (
												<p className="text-xs text-muted-foreground">
													💰 <span className="font-mono">{geminiInfo.pricing}</span>
												</p>
											)}
											{geminiInfo?.cutoff && (
												<p className="text-xs text-muted-foreground">📅 Dados até: {geminiInfo.cutoff}</p>
											)}
											<div className="flex items-center justify-between pt-1">
												<div>
													<p className="text-xs font-medium text-blue-600 dark:text-blue-400">Code Execution (Visão Agêntica)</p>
													<p className="text-[10px] text-muted-foreground">Permite ao modelo executar Python para zoom/crop em imagens</p>
												</div>
												<Switch
													checked={codeExecutionEnabled}
													onCheckedChange={toggleCodeExecution}
												/>
											</div>
										</div>

										<div className="grid grid-cols-2 gap-3 mt-4">
											<div className="space-y-1.5">
												<Label className="text-xs">Max Tokens</Label>
												<Input
													type="number"
													min="0"
													value={geminiConfig?.maxOutputTokens ?? 0}
													onChange={(e) => updateProviderConfig("GEMINI", { maxOutputTokens: parseInt(e.target.value || "0", 10) })}
													className="font-mono"
												/>
											</div>
											<div className="space-y-1.5">
												<Label className="text-xs">Thinking</Label>
												<Select
													value={(geminiConfig?.thinkingLevel as GeminiThinkingLevel) || "high"}
													onValueChange={(value) => updateProviderConfig("GEMINI", { thinkingLevel: value })}
												>
													<SelectTrigger>
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{GEMINI_THINKING_LEVELS.map((level) => (
															<SelectItem key={level.value} value={level.value}>
																{level.label}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</div>
										</div>
										<div className="grid grid-cols-2 gap-3 mt-3">
											<div className="space-y-1.5">
												<Label className="text-xs">Timeout (ms)</Label>
												<Input
													type="number"
													min="0"
													value={geminiConfig?.timeoutMs ?? 0}
													onChange={(e) => updateProviderConfig("GEMINI", { timeoutMs: parseInt(e.target.value || "0", 10) })}
													className="font-mono"
												/>
											</div>
											<div className="space-y-1.5">
												<Label className="text-xs">Retries</Label>
												<Input
													type="number"
													min="0"
													value={geminiConfig?.retryAttempts ?? 0}
													onChange={(e) => updateProviderConfig("GEMINI", { retryAttempts: parseInt(e.target.value || "0", 10) })}
													className="font-mono"
												/>
											</div>
										</div>
										<div className="grid grid-cols-2 gap-3 mt-3">
											<div className="space-y-1.5">
												<Label className="text-xs">Retry Base (ms)</Label>
												<Input
													type="number"
													min="0"
													value={geminiConfig?.retryBaseDelayMs ?? 0}
													onChange={(e) => updateProviderConfig("GEMINI", { retryBaseDelayMs: parseInt(e.target.value || "0", 10) })}
													className="font-mono"
												/>
											</div>
											<div className="space-y-1.5">
												<Label className="text-xs">Retry Max (ms)</Label>
												<Input
													type="number"
													min="0"
													value={geminiConfig?.retryMaxDelayMs ?? 0}
													onChange={(e) => updateProviderConfig("GEMINI", { retryMaxDelayMs: parseInt(e.target.value || "0", 10) })}
													className="font-mono"
												/>
											</div>
										</div>
									</div>

									{/* OPENAI */}
									<div
										className="p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 min-h-[280px] flex flex-col"
									>
										<div className="flex items-center gap-3 mb-4">
											<Image src="/assets/ChatGPT_logo.svg" alt="OpenAI" width={32} height={32} />
											<div>
												<h3 className="font-semibold">OpenAI GPT</h3>
												<p className="text-xs text-muted-foreground">{OPENAI_MODELS.length} modelos disponíveis</p>
											</div>
										</div>

										<div className="space-y-2">
											<Label className="text-xs">Modelo</Label>
											<Select
												value={openAiConfig?.model ?? openAiInfo.value}
												onValueChange={(value) => {
													const selectedModel = OPENAI_MODELS.find((m) => m.value === value);
													const modelSupportsReasoning = selectedModel?.supportsReasoning ?? false;
													updateProviderConfig("OPENAI", {
														model: value,
														temperature: modelSupportsReasoning ? 1 : (openAiConfig?.temperature ?? 0.1),
														reasoningEffort: modelSupportsReasoning ? (openAiConfig?.reasoningEffort || "medium") : null,
													});
												}}
											>
												<SelectTrigger className="text-sm">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{OPENAI_MODELS.map((model) => (
														<SelectItem key={model.value} value={model.value}>
															<span className="flex items-center gap-2">
																{model.label}
																{model.isNew && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-emerald-400 text-emerald-400">Novo</Badge>}
															</span>
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>

										{/* Info do modelo — sempre visível para manter altura consistente */}
										<div className="mt-3 space-y-1 flex-1">
											{openAiInfo?.description && (
												<p className="text-xs text-muted-foreground">{openAiInfo.description}</p>
											)}
											{openAiInfo?.pricing && (
												<p className="text-xs text-muted-foreground">
													💰 <span className="font-mono">{openAiInfo.pricing}</span>
												</p>
											)}
										</div>

										<div className="grid grid-cols-2 gap-3 mt-4">
											<div className="space-y-1.5">
												<Label className="text-xs">Temperature</Label>
												<Input
													type="number"
													step="0.1"
													min="0"
													max="2"
													value={openAiSupportsReasoning ? 1 : (openAiConfig?.temperature ?? 0.1)}
													disabled={openAiSupportsReasoning}
													onChange={(e) => updateProviderConfig("OPENAI", { temperature: parseFloat(e.target.value) })}
													className="font-mono"
												/>
											</div>
											<div className="space-y-1.5">
												<Label className="text-xs">Max Tokens</Label>
												<Input
													type="number"
													min="0"
													value={openAiConfig?.maxOutputTokens ?? 0}
													onChange={(e) => updateProviderConfig("OPENAI", { maxOutputTokens: parseInt(e.target.value || "0", 10) })}
													className="font-mono"
												/>
											</div>
										</div>
										<div className="grid grid-cols-2 gap-3 mt-3">
											<div className="space-y-1.5">
												<Label className="text-xs">Timeout (ms)</Label>
												<Input
													type="number"
													min="0"
													value={openAiConfig?.timeoutMs ?? 0}
													onChange={(e) => updateProviderConfig("OPENAI", { timeoutMs: parseInt(e.target.value || "0", 10) })}
													className="font-mono"
												/>
											</div>
											<div className="space-y-1.5">
												<Label className="text-xs">Retries</Label>
												<Input
													type="number"
													min="0"
													value={openAiConfig?.retryAttempts ?? 0}
													onChange={(e) => updateProviderConfig("OPENAI", { retryAttempts: parseInt(e.target.value || "0", 10) })}
													className="font-mono"
												/>
											</div>
										</div>
										<div className="grid grid-cols-2 gap-3 mt-3">
											<div className="space-y-1.5">
												<Label className="text-xs">Retry Base (ms)</Label>
												<Input
													type="number"
													min="0"
													value={openAiConfig?.retryBaseDelayMs ?? 0}
													onChange={(e) => updateProviderConfig("OPENAI", { retryBaseDelayMs: parseInt(e.target.value || "0", 10) })}
													className="font-mono"
												/>
											</div>
											<div className="space-y-1.5">
												<Label className="text-xs">Retry Max (ms)</Label>
												<Input
													type="number"
													min="0"
													value={openAiConfig?.retryMaxDelayMs ?? 0}
													onChange={(e) => updateProviderConfig("OPENAI", { retryMaxDelayMs: parseInt(e.target.value || "0", 10) })}
													className="font-mono"
												/>
											</div>
										</div>

										<div className="space-y-1.5 mt-4">
											<Label className="text-xs">Reasoning</Label>
											{openAiSupportsReasoning ? (
												openAiFixedReasoning ? (
													<Input value={openAiFixedReasoning === "high" ? "Alto" : openAiFixedReasoning} disabled className="bg-muted cursor-not-allowed" />
												) : (
													<Select
														value={(openAiConfig?.reasoningEffort as OpenAIReasoningEffort) || "medium"}
														onValueChange={(value) => updateProviderConfig("OPENAI", { reasoningEffort: value })}
													>
														<SelectTrigger>
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															{OPENAI_REASONING_EFFORTS.map((effort) => (
																<SelectItem key={effort.value} value={effort.value}>
																	{effort.label}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												)
											) : (
												<Input value="Nao disponivel" disabled className="bg-muted cursor-not-allowed text-muted-foreground" />
											)}
										</div>
									</div>
								</div>
							</div>
						</TabsContent>

						{/* TOOLS TAB */}
						<TabsContent value="tools" className="space-y-4 mt-0">
							<div className="flex items-center justify-between">
								<div>
									<h3 className="text-sm font-medium">Ferramentas Disponíveis</h3>
									<p className="text-xs text-muted-foreground">Selecione as ferramentas que o agente pode usar</p>
								</div>
								<Badge variant="secondary">
									{activeTools.size} de {tools.length} selecionadas
								</Badge>
							</div>

							<Separator />

							<div className="space-y-3">
								{tools.map((tool) => {
									const checked = activeTools.has(tool.key);
									return (
										<label
											key={tool.key}
											className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
										>
											<Checkbox
												checked={checked}
												onCheckedChange={(value) => toggleTool(tool, Boolean(value))}
												className="mt-1"
											/>
											<div className="flex-1 space-y-1">
												<div className="font-medium text-sm">{tool.name}</div>
												{tool.description && <div className="text-xs text-muted-foreground">{tool.description}</div>}
											</div>
										</label>
									);
								})}
							</div>
						</TabsContent>

						{/* OUTPUT TAB */}
						<TabsContent value="output" className="space-y-6 mt-0">
							<div className="space-y-4">
								<div className="space-y-2">
									<Label className="text-sm font-medium">Tipo de Schema</Label>
									<Select
										value={localDraft.outputParser?.schemaType || "json_schema"}
										onValueChange={(value) =>
											updateLocal({
												outputParser: {
													...(localDraft.outputParser ?? { schema: "" }),
													schemaType: value as OutputParserConfig["schemaType"],
												},
											})
										}
									>
										<SelectTrigger className="font-mono">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="json_schema">JSON Schema</SelectItem>
											<SelectItem value="zod">Zod Schema</SelectItem>
											<SelectItem value="structured">Structured Output (OpenAI)</SelectItem>
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<div className="flex items-center justify-between">
										<Label className="text-sm font-medium">Schema de Saída</Label>
										{structuredTemplates.length > 0 && (
											<Select
												onValueChange={(value) => {
													const template = structuredTemplates.find((t) => t.id === value);
													if (template) applyTemplate(template);
												}}
											>
												<SelectTrigger className="h-8 w-[200px] text-xs">
													<SelectValue placeholder="Templates prontos" />
												</SelectTrigger>
												<SelectContent>
													{structuredTemplates.map((template) => (
														<SelectItem key={template.id} value={template.id} className="text-xs">
															{template.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										)}
									</div>
									<Textarea
										value={localDraft.outputParser?.schema || ""}
										onChange={(e) =>
											updateLocal({
												outputParser: {
													...(localDraft.outputParser ?? {
														schemaType: "json_schema" as const,
													}),
													schema: e.target.value,
												},
											})
										}
										placeholder={localDraft.linkedColumn === "RECURSO_CELL" ? '{\n  "type": "object",\n  "properties": {\n    "texto_recurso": {\n      "type": "string",\n      "description": "O texto final do recurso elaborado."\n    }\n  },\n  "required": ["texto_recurso"]\n}' : '{"type":"object","properties":{"answer":{"type":"string"}}}'}
										className="min-h-[250px] font-mono text-xs"
									/>
									<p className="text-xs text-muted-foreground">
										Define a estrutura exata do JSON que o agente deve retornar. Será validadro via Vercel AI SDK generateObject.
									</p>
								</div>

								<Separator />

								<div className="space-y-4">
									<div className="flex items-center justify-between p-3 rounded-lg border">
										<div className="space-y-1">
											<Label className="text-sm font-medium">Modo Estrito</Label>
											<p className="text-xs text-muted-foreground">Força validação rigorosa do schema</p>
										</div>
										<Switch
											checked={Boolean(localDraft.outputParser?.strict)}
											onCheckedChange={(value) =>
												updateLocal({
													outputParser: {
														...(localDraft.outputParser ?? {
															schemaType: "json_schema" as const,
															schema: "",
														}),
														strict: Boolean(value),
													},
												})
											}
										/>
									</div>

									<div className="flex items-center justify-between p-3 rounded-lg border">
										<div className="space-y-1">
											<Label className="text-sm font-medium">Auto-correção</Label>
											<p className="text-xs text-muted-foreground">Tenta corrigir erros de formato automaticamente</p>
										</div>
										<Switch
											checked={Boolean(localDraft.outputParser?.autoFixFormat)}
											onCheckedChange={(value) =>
												updateLocal({
													outputParser: {
														...(localDraft.outputParser ?? {
															schemaType: "json_schema" as const,
															schema: "",
														}),
														autoFixFormat: Boolean(value),
													},
												})
											}
										/>
									</div>
								</div>
							</div>
						</TabsContent>
					</ScrollArea>
				</Tabs>

				<DialogFooter className="px-6 py-4 border-t bg-muted/30">
					<div className="flex items-center gap-2 text-xs text-muted-foreground mr-auto">
						<AlertCircle className="h-3.5 w-3.5" />
						Clique em "Salvar blueprint" no topo da página para persistir
					</div>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancelar
					</Button>
					<Button onClick={handleSave}>Aplicar</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>

		{/* ── Editor Full-Screen de Prompt ───────────────────────────────────── */}
		<Dialog open={promptEditorOpen} onOpenChange={setPromptEditorOpen}>
			<DialogContent className="max-w-5xl w-[90vw] max-h-[90vh] p-0 flex flex-col">
				<DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<Sparkles className="h-5 w-5 text-primary" />
							<div>
								<DialogTitle>Prompt do Sistema</DialogTitle>
								<DialogDescription className="text-xs">{localDraft.name || "Agente"} — editor expandido</DialogDescription>
							</div>
						</div>
						{promptHistory.length > 0 && (
							<Badge variant="secondary" className="gap-1">
								<History className="h-3 w-3" />
								{promptHistory.length} versões salvas
							</Badge>
						)}
					</div>
				</DialogHeader>

				<div className="flex flex-1 overflow-hidden min-h-0">
					{/* Editor principal */}
					<div className="flex flex-col flex-1 min-w-0 p-4 gap-3">
						<Textarea
							value={localDraft.systemPrompt || ""}
							onChange={(e) => updateLocal({ systemPrompt: e.target.value })}
							placeholder="Defina o papel, comportamento e diretrizes do agente..."
							className="flex-1 font-mono text-sm resize-none h-full min-h-[400px]"
							autoFocus
						/>
						<div className="flex items-center justify-between text-xs text-muted-foreground shrink-0">
							<span className="flex items-center gap-1">
								<InfoIcon className="h-3 w-3" />
								Instruções injetadas antes de cada execução
							</span>
							<span className="font-mono">
								{(localDraft.systemPrompt || "").length.toLocaleString("pt-BR")} chars
							</span>
						</div>
					</div>

					{/* Painel de histórico */}
					{promptHistory.length > 0 && (
						<>
							<Separator orientation="vertical" className="h-auto" />
							<div className="w-64 shrink-0 flex flex-col border-l">
								<div className="px-4 py-3 border-b shrink-0">
									<p className="text-xs font-semibold flex items-center gap-1.5">
										<History className="h-3.5 w-3.5" />
										Histórico de Versões
									</p>
									<p className="text-[10px] text-muted-foreground mt-0.5">Salvo automaticamente ao clicar em Aplicar</p>
								</div>
								<ScrollArea className="flex-1">
									<div className="p-2 space-y-2">
										{promptHistory.map((entry, idx) => (
											<div
												key={entry.savedAt}
												className="p-2.5 rounded-md border bg-muted/30 hover:bg-muted/60 transition-colors group"
											>
												<div className="flex items-start justify-between gap-1 mb-1">
													<span className="text-[10px] font-medium text-muted-foreground">
														{idx === 0 ? "🕐 Mais recente" : `v${promptHistory.length - idx}`}
													</span>
													<Button
														variant="ghost"
														size="sm"
														className="h-5 px-1.5 text-[10px] gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
														onClick={() => {
															restorePromptVersion(entry);
														}}
													>
														<RotateCcw className="h-2.5 w-2.5" />
														Restaurar
													</Button>
												</div>
												<p className="text-[9px] text-muted-foreground mb-1.5">
													{new Date(entry.savedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
												</p>
												<p className="text-[10px] text-foreground/70 line-clamp-3 font-mono leading-relaxed">
													{entry.prompt.slice(0, 120)}{entry.prompt.length > 120 ? "…" : ""}
												</p>
												<p className="text-[9px] text-muted-foreground mt-1">
													{entry.prompt.length.toLocaleString("pt-BR")} chars
												</p>
											</div>
										))}
									</div>
								</ScrollArea>
							</div>
						</>
					)}
				</div>

				<DialogFooter className="px-6 py-4 border-t bg-muted/30 shrink-0">
					<div className="flex items-center gap-2 text-xs text-muted-foreground mr-auto">
						<AlertCircle className="h-3.5 w-3.5" />
						As versões são salvas automaticamente ao clicar em Aplicar
					</div>
					<Button variant="outline" onClick={() => setPromptEditorOpen(false)}>
						Fechar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
		</>
	);
}
