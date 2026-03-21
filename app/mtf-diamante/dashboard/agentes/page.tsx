"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AgentCanvas } from "../components/AgentCanvas";
import { AgentList } from "../components/AgentList";
import { useAgentBlueprints } from "../hooks/useAgentBlueprints";
import { useAgentCatalog } from "../hooks/useAgentCatalog";
import type { AgentBlueprint, AgentBlueprintDraft, AgentCatalogPayload } from "../types";

function buildDraftFromAgent(agent: AgentBlueprint): AgentBlueprintDraft {
	return {
		...agent,
		id: agent.id,
		createdAt: agent.createdAt,
		updatedAt: agent.updatedAt,
	};
}

function buildEmptyDraft(catalog?: AgentCatalogPayload): AgentBlueprintDraft {
	const defaultModel = catalog?.models?.[0]?.value || "gpt-4o-mini";
	const defaultAgentType = catalog?.agentTypes?.[0]?.id || "TOOLS";
	const defaultTemplate = catalog?.structuredOutputExamples?.[0];

	return {
		name: "Novo agente MTF",
		description: "",
		agentType: defaultAgentType,
		model: defaultModel,
		temperature: 0.7,
		maxOutputTokens: 1024,
		systemPrompt:
			"Você é um especialista MTF focado em entregar respostas estruturadas seguindo o schema configurado. Mantenha tom profissional e direto.",
		instructions: "",
		toolset: [],
		outputParser: defaultTemplate
			? {
					schemaType: defaultTemplate.schemaType,
					schema: defaultTemplate.schema,
					name: defaultTemplate.name,
					strict: true,
				}
			: null,
		memory: null,
		canvasState: undefined,
		metadata: { source: "mtf-agents-builder" },
	};
}

export default function MtfAgentsBuilderPage() {
	const {
		blueprints,
		isLoading: loadingAgents,
		createBlueprint,
		updateBlueprint,
		deleteBlueprint,
	} = useAgentBlueprints();
	const { catalog, isLoading: loadingCatalog } = useAgentCatalog();

	const [draft, setDraft] = useState<AgentBlueprintDraft | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [seedingNative, setSeedingNative] = useState(false);

	// Seed automático de agentes nativos na montagem do componente
	useEffect(() => {
		const seedNativeAgents = async () => {
			try {
				setSeedingNative(true);
				const response = await fetch("/api/admin/MTFdashboard/agentes/seed-native", {
					method: "POST",
				});

				if (response.ok) {
					const data = await response.json();
					if (data.created && data.created.length > 0) {
						console.log("✅ Agentes nativos criados:", data.created);
						// Recarregar blueprints se novos agentes foram criados
						window.location.reload();
					}
				}
			} catch (error) {
				console.error("Erro ao fazer seed de agentes nativos:", error);
			} finally {
				setSeedingNative(false);
			}
		};

		seedNativeAgents();
	}, []);

	useEffect(() => {
		if (!draft && blueprints.length > 0) {
			const agent = blueprints[0];
			setDraft(buildDraftFromAgent(agent));
			setSelectedId(agent.id);
		}
	}, [blueprints, draft]);

	const updateDraft = useCallback((patch: Partial<AgentBlueprintDraft>) => {
		setDraft((prev) => {
			if (!prev) return prev;
			const next: AgentBlueprintDraft = {
				...prev,
				...patch,
				toolset: patch.toolset === undefined ? prev.toolset : patch.toolset,
				outputParser: patch.outputParser === undefined ? prev.outputParser : patch.outputParser,
				memory: patch.memory === undefined ? prev.memory : patch.memory,
				canvasState: patch.canvasState === undefined ? prev.canvasState : patch.canvasState,
				metadata: patch.metadata === undefined ? prev.metadata : patch.metadata,
			};
			if (JSON.stringify(prev) === JSON.stringify(next)) {
				return prev;
			}
			return next;
		});
	}, []);

	const handleSelect = useCallback((agent: AgentBlueprint) => {
		setSelectedId(agent.id);
		setDraft(buildDraftFromAgent(agent));
	}, []);

	const handleCreate = useCallback(() => {
		const base = buildEmptyDraft(catalog);
		setDraft(base);
		setSelectedId(null);
	}, [catalog]);

	const handleRemove = useCallback(
		async (agent: AgentBlueprint) => {
			const confirmed = window.confirm(`Remover ${agent.name}? Esta ação não pode ser desfeita.`);
			if (!confirmed) return;
			try {
				await deleteBlueprint(agent.id);
				toast.success("Agente removido");
				if (selectedId === agent.id) {
					setDraft(null);
					setSelectedId(null);
				}
			} catch (error: any) {
				toast.error(error?.message || "Falha ao remover agente");
			}
		},
		[deleteBlueprint, selectedId],
	);

	const handleSave = useCallback(async () => {
		if (!draft) return;

		const { id, createdAt, updatedAt, ...payload } = draft;
		const payloadToSend: AgentBlueprintDraft = {
			...payload,
			toolset: payload.toolset ?? [],
			outputParser: payload.outputParser ?? null,
		};

		try {
			setIsSaving(true);
			if (id) {
				const updated = await updateBlueprint(id, payloadToSend);
				setDraft(buildDraftFromAgent(updated));
				toast.success("Agente atualizado com sucesso");
			} else {
				const created = await createBlueprint(payloadToSend);
				setDraft(buildDraftFromAgent(created));
				setSelectedId(created.id);
				toast.success("Agente criado com sucesso");
			}
		} catch (error: any) {
			toast.error(error?.message || "Não foi possível salvar o agente");
		} finally {
			setIsSaving(false);
		}
	}, [createBlueprint, draft, updateBlueprint]);

	const canSave = useMemo(() => {
		if (!draft) return false;
		return Boolean(draft.name && draft.model && draft.agentType);
	}, [draft]);

	return (
		<div className="flex-1 space-y-6 p-2 md:p-4">
			{seedingNative && (
				<div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
					<Loader2 className="h-4 w-4 animate-spin" />
					<span>Verificando agentes nativos OAB/EVAL...</span>
				</div>
			)}
			<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">MTF Agents Builder</h1>
					<p className="text-sm text-muted-foreground">
						Desenhe agentes LangGraph especializados, conectando modelos, ferramentas e parsers estruturados.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						onClick={() => {
							if (selectedId) {
								const agent = blueprints.find((item) => item.id === selectedId);
								if (agent) {
									setDraft(buildDraftFromAgent(agent));
									toast.success("Rascunho restaurado a partir do último save.");
									return;
								}
							}
							const fresh = buildEmptyDraft(catalog);
							setDraft(fresh);
							toast.info("Novo blueprint em branco carregado.");
						}}
					>
						<RefreshCw className="h-4 w-4 mr-2" /> Reset parcial
					</Button>
					<Button disabled={!canSave || isSaving || loadingCatalog} onClick={handleSave}>
						{isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
						Salvar blueprint
					</Button>
				</div>
			</div>

			<div className="grid gap-6 lg:grid-cols-[320px_1fr]">
				<aside className="space-y-4">
					<AgentList
						agents={blueprints}
						selectedId={selectedId}
						isLoading={loadingAgents}
						onCreate={handleCreate}
						onSelect={handleSelect}
						onRemove={handleRemove}
					/>
				</aside>

				<section className="space-y-6">
					{draft ? (
						<>
							<Card>
								<CardHeader>
									<CardTitle>Canvas do agente</CardTitle>
								</CardHeader>
								<CardContent>
									{loadingCatalog ? (
										<div className="flex items-center justify-center h-[320px]">
											<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
										</div>
									) : (
										<AgentCanvas
											draft={draft}
											agentTypes={catalog?.agentTypes ?? []}
											tools={catalog?.tools ?? []}
											modelOptions={catalog?.models ?? [{ value: draft.model, label: draft.model }]}
											structuredTemplates={catalog?.structuredOutputExamples ?? []}
											onDraftChange={updateDraft}
										/>
									)}
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle>Descrição & memória</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="grid gap-4 md:grid-cols-2">
										<div className="space-y-2">
											<Label htmlFor="agent-description">Descrição rápida</Label>
											<Textarea
												id="agent-description"
												placeholder="Resumo do objetivo deste agente (ex: Correção de peças jurídicas)."
												value={draft.description || ""}
												onChange={(event) => updateDraft({ description: event.target.value })}
											/>
										</div>
										<div className="space-y-2">
											<Label htmlFor="agent-instructions">Instruções adicionais</Label>
											<Textarea
												id="agent-instructions"
												placeholder="Instruções que serão anexadas como complemento do prompt principal."
												value={draft.instructions || ""}
												onChange={(event) => updateDraft({ instructions: event.target.value })}
											/>
										</div>
									</div>
									<Separator />
									<div className="flex items-center justify-between">
										<div className="space-y-1">
											<Label>Habilitar memória experimental</Label>
											<p className="text-xs text-muted-foreground">
												Quando ativo, o agente poderá reutilizar contexto salvo entre execuções (BETA).
											</p>
										</div>
										<Switch
											checked={Boolean(draft.memory)}
											onCheckedChange={(value) => updateDraft({ memory: value ? { strategy: "vector-memory" } : null })}
										/>
									</div>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle>Resumo da resposta estruturada</CardTitle>
								</CardHeader>
								<CardContent className="space-y-3 text-sm">
									<p className="text-muted-foreground">
										Garantir que o LangGraph consiga executar o parser escolhido evita drifts como arrays na raiz ou
										botões faltando. Revise o schema configurado para manter compatibilidade com o SocialWise Flow.
									</p>
									<div className="rounded-md bg-muted p-3 font-mono text-xs overflow-x-auto">
										{draft.outputParser?.schema ? draft.outputParser.schema : "Nenhum schema definido."}
									</div>
								</CardContent>
							</Card>
						</>
					) : (
						<Card className="border-dashed">
							<CardHeader>
								<CardTitle>Selecione ou crie um agente</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground">
									Escolha um agente existente ao lado ou clique em "Novo agente" para começar um blueprint do zero.
								</p>
							</CardContent>
						</Card>
					)}
				</section>
			</div>
		</div>
	);
}
