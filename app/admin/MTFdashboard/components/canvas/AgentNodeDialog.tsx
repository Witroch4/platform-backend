"use client";

import { useState, useEffect } from "react";
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
import { InfoIcon, Sparkles, Settings2, Wrench, FileJson, Link2, AlertCircle } from "lucide-react";
import Image from "next/image";
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

// Modelos disponíveis por provedor
const GEMINI_MODELS = [
	{ value: "gemini-3-flash-preview", label: "Gemini 3 Flash (Visão Agêntica)", recommended: true },
	{ value: "gemini-3-pro-preview", label: "Gemini 3 Pro" },
	{ value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
	{ value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
	{ value: "gemini-2.0-flash-001", label: "Gemini 2.0 Flash" },
];

const OPENAI_MODELS = [
	{ value: "gpt-4.1", label: "GPT-4.1 (Vision)", recommended: true, supportsReasoning: false },
	{ value: "gpt-4.1-mini", label: "GPT-4.1 Mini", supportsReasoning: false },
	{ value: "gpt-4.1-nano", label: "GPT-4.1 Nano", supportsReasoning: false },
	{ value: "gpt-4o", label: "GPT-4o", supportsReasoning: false },
	{ value: "gpt-4o-mini", label: "GPT-4o Mini", supportsReasoning: false },
	{ value: "gpt-5", label: "GPT-5", supportsReasoning: true },
	{ value: "gpt-5-mini", label: "GPT-5 Mini", supportsReasoning: true },
	{ value: "gpt-5.1", label: "GPT-5.1", supportsReasoning: true },
	{ value: "gpt-5.2", label: "GPT-5.2", supportsReasoning: true },
	{ value: "gpt-5-pro", label: "GPT-5 Pro", supportsReasoning: true, fixedReasoning: "high" },
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

export function AgentNodeDialog({
	open,
	onOpenChange,
	draft,
	agentTypes,
	tools,
	structuredTemplates,
	onSave,
}: AgentNodeDialogProps) {
	const [localDraft, setLocalDraft] = useState<AgentBlueprintDraft>(draft);

	// Sincroniza o estado local quando o dialog abre ou o draft muda
	useEffect(() => {
		if (open) {
			setLocalDraft(draft);
		}
	}, [open, draft]);

	const currentType = agentTypes.find((t) => t.id === localDraft.agentType);
	const activeTools = new Set((localDraft.toolset || []).map((tool) => tool.key));

	// Detectar provedor baseado no modelo selecionado
	const isGeminiModel = (model: string) => model.toLowerCase().includes("gemini");

	const currentProvider: AiProviderType =
		localDraft.defaultProvider || (isGeminiModel(localDraft.model) ? "GEMINI" : "OPENAI");

	const handleSave = () => {
		onSave(localDraft);
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

	const selectProvider = (provider: AiProviderType) => {
		const defaultModel = provider === "GEMINI" ? "gemini-3-flash-preview" : "gpt-4.1";
		// Gemini: temperatura 1 | OpenAI GPT-4.x: temperatura 0.1 (vision)
		const defaultTemp = provider === "GEMINI" ? 1 : 0.1;
		updateLocal({
			defaultProvider: provider,
			model: defaultModel,
			temperature: defaultTemp,
			maxOutputTokens: 0, // 0 = ilimitado
			// Raciocínio padrão (null para GPT-4.x que não suporta)
			thinkingLevel: provider === "GEMINI" ? "high" : null,
			reasoningEffort: null, // será definido ao selecionar modelo GPT-5+
		});
	};

	// Verifica se o modelo OpenAI selecionado suporta raciocínio
	const currentOpenAIModel = OPENAI_MODELS.find((m) => m.value === localDraft.model);
	const supportsReasoning = currentOpenAIModel?.supportsReasoning ?? false;
	const fixedReasoning = (currentOpenAIModel as any)?.fixedReasoning as OpenAIReasoningEffort | undefined;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-4xl max-h-[85vh] p-0">
				<DialogHeader className="px-6 pt-6 pb-4 border-b">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl">🤖</div>
							<div>
								<DialogTitle className="text-xl">Configuração do Agente</DialogTitle>
								<DialogDescription>Configure todos os parâmetros do agente LangGraph</DialogDescription>
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
											</SelectContent>
										</Select>
										<p className="text-xs text-muted-foreground">
											Este agente será executado automaticamente quando a coluna for acionada na tabela de Leads
										</p>
									</div>
								</div>

								<Separator />

								<div className="space-y-2">
									<Label htmlFor="system-prompt" className="text-sm font-medium">
										Prompt do Sistema
									</Label>
									<Textarea
										id="system-prompt"
										value={localDraft.systemPrompt || ""}
										onChange={(e) => updateLocal({ systemPrompt: e.target.value })}
										placeholder="Defina o papel, comportamento e diretrizes do agente..."
										className="min-h-[200px] font-mono text-sm"
									/>
									<p className="text-xs text-muted-foreground flex items-center gap-1.5">
										<InfoIcon className="h-3 w-3" />
										Instruções fundamentais injetadas no LangGraph antes de cada execução
									</p>
								</div>

								<div className="space-y-2">
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
								{/* Seleção de Provedor */}
								<div className="grid grid-cols-2 gap-4">
									{/* GEMINI */}
									<div
										onClick={() => selectProvider("GEMINI")}
										className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
											currentProvider === "GEMINI"
												? "border-blue-500 bg-blue-500/10"
												: "border-muted hover:border-blue-500/50"
										}`}
									>
										<div className="flex items-center gap-3 mb-4">
											<Image src="/assets/Google-gemini-icon.svg" alt="Gemini" width={32} height={32} />
											<div>
												<h3 className="font-semibold">Google Gemini</h3>
												<p className="text-xs text-muted-foreground">Visão Agêntica com Code Execution</p>
											</div>
											{currentProvider === "GEMINI" && <Badge className="ml-auto bg-blue-500">Ativo</Badge>}
										</div>

										<div className="space-y-2">
											<Label className="text-xs">Modelo</Label>
											<Select
												value={currentProvider === "GEMINI" ? localDraft.model : GEMINI_MODELS[0].value}
												onValueChange={(value) => {
													if (currentProvider === "GEMINI") {
														updateLocal({ model: value });
													}
												}}
												disabled={currentProvider !== "GEMINI"}
											>
												<SelectTrigger className="text-sm">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{GEMINI_MODELS.map((model) => (
														<SelectItem key={model.value} value={model.value}>
															<span className="flex items-center gap-2">
																{model.label}
																{model.recommended && (
																	<Badge variant="secondary" className="text-[10px]">
																		Recomendado
																	</Badge>
																)}
															</span>
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>

										{currentProvider === "GEMINI" && (
											<p className="text-xs text-blue-600 dark:text-blue-400 mt-3 flex items-start gap-1.5">
												<InfoIcon className="h-3 w-3 mt-0.5 flex-shrink-0" />
												Instruções de Agentic Vision serão injetadas automaticamente
											</p>
										)}
									</div>

									{/* OPENAI */}
									<div
										onClick={() => selectProvider("OPENAI")}
										className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
											currentProvider === "OPENAI"
												? "border-emerald-500 bg-emerald-500/10"
												: "border-muted hover:border-emerald-500/50"
										}`}
									>
										<div className="flex items-center gap-3 mb-4">
											<Image src="/assets/ChatGPT_logo.svg" alt="OpenAI" width={32} height={32} />
											<div>
												<h3 className="font-semibold">OpenAI GPT</h3>
												<p className="text-xs text-muted-foreground">Modelos GPT-4 e GPT-5</p>
											</div>
											{currentProvider === "OPENAI" && <Badge className="ml-auto bg-emerald-500">Ativo</Badge>}
										</div>

										<div className="space-y-2">
											<Label className="text-xs">Modelo</Label>
											<Select
												value={currentProvider === "OPENAI" ? localDraft.model : OPENAI_MODELS[0].value}
												onValueChange={(value) => {
													if (currentProvider === "OPENAI") {
														const selectedModel = OPENAI_MODELS.find((m) => m.value === value);
														const modelSupportsReasoning = selectedModel?.supportsReasoning ?? false;
														// GPT-5+: temperatura 1 + raciocínio | GPT-4.x: temperatura editável (mantém atual ou 0.1)
														updateLocal({
															model: value,
															temperature: modelSupportsReasoning ? 1 : (localDraft.temperature ?? 0.1),
															reasoningEffort: modelSupportsReasoning ? localDraft.reasoningEffort || "medium" : null,
														});
													}
												}}
												disabled={currentProvider !== "OPENAI"}
											>
												<SelectTrigger className="text-sm">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{OPENAI_MODELS.map((model) => (
														<SelectItem key={model.value} value={model.value}>
															<span className="flex items-center gap-2">
																{model.label}
																{model.recommended && (
																	<Badge variant="secondary" className="text-[10px]">
																		Recomendado
																	</Badge>
																)}
															</span>
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									</div>
								</div>

								<Separator />

								{/* Configurações de Modelo */}
								<div className="grid grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label htmlFor="temperature" className="text-sm font-medium">
											Temperature
										</Label>
										{/* GPT-4.x: temperatura editável | Gemini e GPT-5+: temperatura fixa em 1 */}
										{currentProvider === "OPENAI" && !supportsReasoning ? (
											<>
												<Input
													id="temperature"
													type="number"
													step="0.1"
													min="0"
													max="2"
													value={localDraft.temperature ?? 0.1}
													onChange={(e) => updateLocal({ temperature: parseFloat(e.target.value) })}
													className="font-mono"
												/>
												<p className="text-xs text-muted-foreground">
													Vision: use <strong>0.1</strong> (mais preciso)
												</p>
											</>
										) : (
											<>
												<Input
													id="temperature"
													type="number"
													step="0.1"
													min="0"
													max="2"
													value={1}
													disabled
													className="font-mono bg-muted cursor-not-allowed"
												/>
												<p className="text-xs text-muted-foreground">
													Fixo em <strong>1</strong> (recomendação oficial para modelos com raciocínio)
												</p>
											</>
										)}
									</div>

									<div className="space-y-2">
										<Label htmlFor="max-tokens" className="text-sm font-medium">
											Max Tokens de Saída
										</Label>
										<Input
											id="max-tokens"
											type="number"
											min="0"
											max="128000"
											value={localDraft.maxOutputTokens ?? 0}
											onChange={(e) => updateLocal({ maxOutputTokens: parseInt(e.target.value, 10) })}
											className="font-mono"
										/>
										<p className="text-xs text-muted-foreground">
											<strong>0 = ilimitado</strong> (usa máximo do modelo)
										</p>
									</div>
								</div>

								{/* Raciocínio - Gemini */}
								{currentProvider === "GEMINI" && (
									<div className="space-y-2 p-4 rounded-lg border border-blue-500/30 bg-blue-500/5">
										<Label className="text-sm font-medium flex items-center gap-2">
											<Sparkles className="h-4 w-4 text-blue-500" />
											Nível de Raciocínio (Thinking)
										</Label>
										<Select
											value={localDraft.thinkingLevel || "high"}
											onValueChange={(value) => updateLocal({ thinkingLevel: value as GeminiThinkingLevel })}
										>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{GEMINI_THINKING_LEVELS.map((level) => (
													<SelectItem key={level.value} value={level.value}>
														<div className="flex flex-col">
															<span>{level.label}</span>
															<span className="text-xs text-muted-foreground">{level.description}</span>
														</div>
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<p className="text-xs text-muted-foreground">
											Controla a profundidade do raciocínio do Gemini 3 antes de responder
										</p>
									</div>
								)}

								{/* Raciocínio - OpenAI GPT-5+ */}
								{currentProvider === "OPENAI" && supportsReasoning && (
									<div className="space-y-2 p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
										<Label className="text-sm font-medium flex items-center gap-2">
											<Sparkles className="h-4 w-4 text-emerald-500" />
											Esforço de Raciocínio (Reasoning)
										</Label>
										{fixedReasoning ? (
											<>
												<Input
													value={fixedReasoning === "high" ? "Alto" : fixedReasoning}
													disabled
													className="bg-muted cursor-not-allowed"
												/>
												<p className="text-xs text-muted-foreground">
													GPT-5 Pro usa raciocínio fixo em <strong>alto</strong>
												</p>
											</>
										) : (
											<>
												<Select
													value={localDraft.reasoningEffort || "medium"}
													onValueChange={(value) => updateLocal({ reasoningEffort: value as OpenAIReasoningEffort })}
												>
													<SelectTrigger>
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{OPENAI_REASONING_EFFORTS.map((effort) => (
															<SelectItem key={effort.value} value={effort.value}>
																<div className="flex flex-col">
																	<span>{effort.label}</span>
																	<span className="text-xs text-muted-foreground">{effort.description}</span>
																</div>
															</SelectItem>
														))}
													</SelectContent>
												</Select>
												<p className="text-xs text-muted-foreground">
													Controla quantos tokens de raciocínio o GPT-5 gera antes de responder
												</p>
											</>
										)}
									</div>
								)}

								{/* Raciocínio desabilitado para GPT-4.x */}
								{currentProvider === "OPENAI" && !supportsReasoning && (
									<div className="space-y-2 p-4 rounded-lg border border-muted bg-muted/30">
										<Label className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
											<Sparkles className="h-4 w-4" />
											Esforço de Raciocínio (Reasoning)
										</Label>
										<Input
											value="Não disponível"
											disabled
											className="bg-muted cursor-not-allowed text-muted-foreground"
										/>
										<p className="text-xs text-muted-foreground">
											Modelos GPT-4.x não suportam configuração de raciocínio
										</p>
									</div>
								)}
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
										placeholder='{"type":"object","properties":{"answer":{"type":"string"}}}'
										className="min-h-[250px] font-mono text-xs"
									/>
									<p className="text-xs text-muted-foreground">
										Define a estrutura exata do JSON que o agente deve retornar
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
	);
}
