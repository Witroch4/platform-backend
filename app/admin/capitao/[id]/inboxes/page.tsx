"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Plus, Settings, BarChart3, History, Trash2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type InboxItem = {
	inboxId: string;
	name: string;
	channelType: string;
	attached: boolean;
	// SocialWise Flow configuration
	socialwiseConfig?: {
		embedipreview?: boolean;
		warmupDeadlineMs?: number;
		hardDeadlineMs?: number;
		softDeadlineMs?: number;
		cacheIsolation?: boolean;
		inheritFromAgent?: boolean;
	};
};

type InboxMetrics = {
	totalRequests: number;
	averageResponseTime: number;
	classificationAccuracy: number;
	cacheHitRate: number;
	errorRate: number;
	lastActivity: string | null;
};

type ConfigHistory = {
	id: string;
	timestamp: string;
	changes: Record<string, any>;
	userId: string;
	userName: string;
};

// Componente Skeleton para as caixas de entrada
const InboxSkeleton = () => (
	<div className="border border-border rounded-md bg-card shadow-sm">
		<div className="p-4">
			<div className="flex items-center justify-between mb-2">
				<div className="flex-1">
					<Skeleton className="h-4 w-32 mb-2" />
					<Skeleton className="h-3 w-48" />
				</div>
				<div className="flex items-center gap-2">
					<Skeleton className="h-6 w-24" />
					<Skeleton className="h-8 w-20" />
				</div>
			</div>
		</div>
	</div>
);

// Componente Skeleton para métricas
const MetricsSkeleton = () => (
	<div className="mt-3 p-3 bg-muted/30 rounded-md border border-border">
		<Skeleton className="h-3 w-32 mb-2" />
		<div className="grid grid-cols-2 md:grid-cols-5 gap-3">
			{Array.from({ length: 5 }).map((_, i) => (
				<div key={i}>
					<Skeleton className="h-3 w-16 mb-1" />
					<Skeleton className="h-4 w-12" />
				</div>
			))}
		</div>
		<div className="mt-2 flex items-center gap-2">
			<Skeleton className="h-8 w-24" />
			<Skeleton className="h-8 w-20" />
		</div>
	</div>
);

export default function AssistantInboxesPage() {
	const params = useParams();
	const router = useRouter();
	const assistantId = String((params as any)?.id || "");
	const [inboxes, setInboxes] = useState<InboxItem[]>([]);
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [selection, setSelection] = useState<Record<string, boolean>>({});

	// SocialWise Flow state
	const [showMetrics, setShowMetrics] = useState(false);
	const [inboxMetrics, setInboxMetrics] = useState<Record<string, InboxMetrics>>({});
	const [configHistory, setConfigHistory] = useState<Record<string, ConfigHistory[]>>({});
	const [editingConfig, setEditingConfig] = useState<string | null>(null);
	const [tempConfig, setTempConfig] = useState<InboxItem["socialwiseConfig"]>({});

	const load = async () => {
		setLoading(true);
		try {
			const r = await fetch(`/api/admin/ai-integration/assistants/inboxes?assistantId=${assistantId}`, {
				cache: "no-store",
			});
			const j = await r.json();
			const list: InboxItem[] = j?.inboxes || [];
			setInboxes(list);
			const sel: Record<string, boolean> = {};
			list.forEach((i) => {
				sel[i.inboxId] = i.attached;
			});
			setSelection(sel);
		} finally {
			setLoading(false);
		}
	};

	const loadInboxMetrics = async (inboxId: string) => {
		try {
			const r = await fetch(`/api/admin/socialwise-flow/inbox-metrics?inboxId=${inboxId}`, { cache: "no-store" });
			if (r.ok) {
				const metrics = await r.json();
				setInboxMetrics((prev) => ({ ...prev, [inboxId]: metrics }));
			}
		} catch (error) {
			console.error("Erro ao carregar métricas da inbox:", error);
		}
	};

	const loadConfigHistory = async (inboxId: string) => {
		try {
			const r = await fetch(`/api/admin/socialwise-flow/config-history?inboxId=${inboxId}`, { cache: "no-store" });
			if (r.ok) {
				const history = await r.json();
				setConfigHistory((prev) => ({ ...prev, [inboxId]: history.changes || [] }));
			}
		} catch (error) {
			console.error("Erro ao carregar histórico de configuração:", error);
		}
	};

	const updateInboxConfig = async (inboxId: string, config: InboxItem["socialwiseConfig"]) => {
		try {
			const r = await fetch("/api/admin/socialwise-flow/inbox-config", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ assistantId, inboxId, config }),
			});

			if (r.ok) {
				// Update local state
				setInboxes((prev) =>
					prev.map((inbox) => (inbox.inboxId === inboxId ? { ...inbox, socialwiseConfig: config } : inbox)),
				);
				setEditingConfig(null);
				await loadConfigHistory(inboxId);
			}
		} catch (error) {
			console.error("Erro ao atualizar configuração da inbox:", error);
		}
	};

	const clearInboxCache = async (inboxId: string) => {
		try {
			const r = await fetch("/api/admin/socialwise-flow/clear-cache", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ inboxId }),
			});

			if (r.ok) {
				console.log("Cache da inbox limpo com sucesso");
				await loadInboxMetrics(inboxId);
			}
		} catch (error) {
			console.error("Erro ao limpar cache da inbox:", error);
		}
	};

	const rollbackConfig = async (inboxId: string, historyId: string) => {
		try {
			const r = await fetch("/api/admin/socialwise-flow/rollback-config", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ inboxId, historyId }),
			});

			if (r.ok) {
				await load();
				await loadConfigHistory(inboxId);
			}
		} catch (error) {
			console.error("Erro ao fazer rollback da configuração:", error);
		}
	};

	useEffect(() => {
		if (assistantId) {
			load();
			if (showMetrics) {
				// Load metrics for all attached inboxes
				inboxes
					.filter((i) => i.attached)
					.forEach((inbox) => {
						loadInboxMetrics(inbox.inboxId);
						loadConfigHistory(inbox.inboxId);
					});
			}
		}
	}, [assistantId, showMetrics]);

	const save = async () => {
		for (const i of inboxes) {
			const target = !!selection[i.inboxId];
			if (target !== i.attached) {
				await fetch("/api/admin/ai-integration/assistants/inboxes", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						assistantId,
						inboxId: i.inboxId,
						name: i.name,
						channelType: i.channelType,
						attach: target,
					}),
				});
			}
		}
		setOpen(false);
		await load();
	};

	return (
		<div className="p-6 space-y-4 bg-background text-foreground min-h-screen">
			<div className="flex items-center justify-between">
				<button
					onClick={() => router.push("/admin/capitao")}
					className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
				>
					<ArrowLeft className="w-4 h-4" /> Anterior
				</button>
				<Dialog open={open} onOpenChange={setOpen}>
					<DialogTrigger asChild>
						<Button className="bg-primary hover:bg-primary/90">
							<Plus className="w-4 h-4 mr-2" /> Conectar uma nova caixa de entrada
						</Button>
					</DialogTrigger>
					<DialogContent className="w-[96vw] sm:max-w-2xl max-h-[85vh] bg-background border-border">
						<DialogHeader>
							<DialogTitle className="text-foreground">Conectar caixas ao Capitão</DialogTitle>
						</DialogHeader>
						<div className="space-y-3 overflow-auto max-h-[60vh] pr-2">
							{inboxes.map((i) => (
								<label
									key={i.inboxId}
									className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors"
								>
									<Checkbox
										checked={!!selection[i.inboxId]}
										onCheckedChange={(v: any) => setSelection((s) => ({ ...s, [i.inboxId]: !!v }))}
									/>
									<div>
										<div className="text-sm font-medium text-foreground">{i.name}</div>
										<div className="text-xs text-muted-foreground">
											{i.channelType} • {i.inboxId}
										</div>
									</div>
								</label>
							))}
							{inboxes.length === 0 && (
								<div className="text-sm text-muted-foreground text-center py-4">Nenhuma inbox encontrada.</div>
							)}
						</div>
						<div className="flex justify-end">
							<Button onClick={save} disabled={loading} className="bg-primary hover:bg-primary/90">
								Salvar
							</Button>
						</div>
					</DialogContent>
				</Dialog>
			</div>

			{/* SocialWise Flow Metrics Toggle */}
			{inboxes.filter((i) => i.attached).length > 0 && (
				<Collapsible
					open={showMetrics}
					onOpenChange={setShowMetrics}
					className="border border-border rounded-md bg-card"
				>
					<div className="p-4 flex items-center justify-between">
						<div className="flex items-center gap-2">
							<BarChart3 className="w-4 h-4 text-primary" />
							<span className="font-medium text-foreground">SocialWise Flow - Métricas e Configurações</span>
						</div>
						<CollapsibleTrigger className="text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors">
							{showMetrics ? "Ocultar" : "Mostrar"} Detalhes
						</CollapsibleTrigger>
					</div>
				</Collapsible>
			)}

			<div className="mt-6">
				<h2 className="text-lg font-semibold mb-3 text-foreground">Caixas de entrada conectadas</h2>

				{loading ? (
					// Skeleton durante o carregamento
					<div className="space-y-4">
						{Array.from({ length: 3 }).map((_, index) => (
							<div key={index}>
								<InboxSkeleton />
								{showMetrics && <MetricsSkeleton />}
							</div>
						))}
					</div>
				) : (
					<div className="space-y-4">
						{inboxes
							.filter((i) => i.attached)
							.map((inbox) => {
								const metrics = inboxMetrics[inbox.inboxId];
								const history = configHistory[inbox.inboxId] || [];
								const isEditing = editingConfig === inbox.inboxId;

								return (
									<div key={inbox.inboxId} className="border border-border rounded-md bg-card shadow-sm">
										<div className="p-4">
											<div className="flex items-center justify-between mb-2">
												<div>
													<div className="text-sm font-medium text-foreground">{inbox.name}</div>
													<div className="text-xs text-muted-foreground">
														{inbox.channelType} • {inbox.inboxId}
													</div>
												</div>
												<div className="flex items-center gap-2">
													<Badge
														variant={inbox.socialwiseConfig?.inheritFromAgent ? "default" : "secondary"}
														className="bg-primary/10 text-primary border-primary/20"
													>
														{inbox.socialwiseConfig?.inheritFromAgent ? "Herda do Agente" : "Config. Personalizada"}
													</Badge>
													<Button
														variant="outline"
														onClick={() => {
															setEditingConfig(inbox.inboxId);
															setTempConfig(inbox.socialwiseConfig || {});
														}}
														className="border-border hover:bg-muted"
													>
														<Settings className="w-3 h-3 mr-1" />
														Configurar
													</Button>
												</div>
											</div>

											{/* SocialWise Flow Metrics */}
											{showMetrics && metrics && (
												<div className="mt-3 p-3 bg-muted/30 rounded-md border border-border">
													<div className="text-xs font-medium mb-2 text-foreground">Métricas de Performance</div>
													<div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
														<div>
															<div className="text-muted-foreground">Requisições</div>
															<div className="font-medium text-foreground">{metrics.totalRequests}</div>
														</div>
														<div>
															<div className="text-muted-foreground">Tempo Médio</div>
															<div className="font-medium text-foreground">{metrics.averageResponseTime}ms</div>
														</div>
														<div>
															<div className="text-muted-foreground">Precisão</div>
															<div className="font-medium text-foreground">
																{Math.round(metrics.classificationAccuracy * 100)}%
															</div>
														</div>
														<div>
															<div className="text-muted-foreground">Cache Hit</div>
															<div className="font-medium text-foreground">
																{Math.round(metrics.cacheHitRate * 100)}%
															</div>
														</div>
														<div>
															<div className="text-muted-foreground">Taxa de Erro</div>
															<div className="font-medium text-foreground">{Math.round(metrics.errorRate * 100)}%</div>
														</div>
													</div>
													<div className="mt-2 flex items-center gap-2">
														<Button
															variant="outline"
															onClick={() => clearInboxCache(inbox.inboxId)}
															className="border-border hover:bg-muted"
														>
															<Trash2 className="w-3 h-3 mr-1" />
															Limpar Cache
														</Button>
														<Button
															variant="outline"
															onClick={() => loadInboxMetrics(inbox.inboxId)}
															className="border-border hover:bg-muted"
														>
															<BarChart3 className="w-3 h-3 mr-1" />
															Atualizar
														</Button>
													</div>
												</div>
											)}

											{/* Configuration History */}
											{showMetrics && history.length > 0 && (
												<div className="mt-3 p-3 bg-blue-500/10 rounded-md border border-blue-500/20">
													<div className="text-xs font-medium mb-2 flex items-center gap-1 text-blue-600 dark:text-blue-400">
														<History className="w-3 h-3" />
														Histórico de Configurações
													</div>
													<div className="space-y-1 max-h-32 overflow-y-auto">
														{history.slice(0, 5).map((change) => (
															<div key={change.id} className="flex items-center justify-between text-xs">
																<div>
																	<span className="text-muted-foreground">{change.timestamp}</span>
																	<span className="ml-2 text-foreground">{change.userName}</span>
																</div>
																<Button
																	variant="ghost"
																	onClick={() => rollbackConfig(inbox.inboxId, change.id)}
																	className="h-6 px-2 text-xs hover:bg-muted"
																>
																	Restaurar
																</Button>
															</div>
														))}
													</div>
												</div>
											)}
										</div>

										{/* Configuration Dialog */}
										{isEditing && (
											<div className="border-t border-border p-4 bg-muted/20">
												<div className="text-sm font-medium mb-3 text-foreground">Configuração SocialWise Flow</div>
												<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
													<div>
														<label className="flex items-center gap-2 text-sm text-foreground">
															<input
																type="checkbox"
																checked={tempConfig?.inheritFromAgent || false}
																onChange={(e) =>
																	setTempConfig((prev) => ({
																		...prev,
																		inheritFromAgent: e.target.checked,
																	}))
																}
																className="rounded border-border bg-background"
															/>
															Herdar configurações do agente
														</label>
													</div>

													{!tempConfig?.inheritFromAgent && (
														<>
															<div>
																<label className="flex items-center gap-2 text-sm text-foreground">
																	<input
																		type="checkbox"
																		checked={tempConfig?.embedipreview || false}
																		onChange={(e) =>
																			setTempConfig((prev) => ({
																				...prev,
																				embedipreview: e.target.checked,
																			}))
																		}
																		className="rounded border-border bg-background"
																	/>
																	Embedding-first (modo rápido)
																</label>
															</div>

															<div>
																<label className="text-xs font-medium text-foreground">Deadline Warmup (ms)</label>
																<Input
																	type="number"
																	min="100"
																	max="1000"
																	value={tempConfig?.warmupDeadlineMs || 250}
																	onChange={(e) =>
																		setTempConfig((prev) => ({
																			...prev,
																			warmupDeadlineMs: parseInt(e.target.value) || 250,
																		}))
																	}
																	className="bg-background border-border text-foreground"
																/>
															</div>

															<div>
																<label className="text-xs font-medium text-foreground">Deadline HARD (ms)</label>
																<Input
																	type="number"
																	min="50"
																	max="500"
																	value={tempConfig?.hardDeadlineMs || 120}
																	onChange={(e) =>
																		setTempConfig((prev) => ({
																			...prev,
																			hardDeadlineMs: parseInt(e.target.value) || 120,
																		}))
																	}
																	className="bg-background border-border text-foreground"
																/>
															</div>

															<div>
																<label className="text-xs font-medium text-foreground">Deadline SOFT (ms)</label>
																<Input
																	type="number"
																	min="100"
																	max="1000"
																	value={tempConfig?.softDeadlineMs || 300}
																	onChange={(e) =>
																		setTempConfig((prev) => ({
																			...prev,
																			softDeadlineMs: parseInt(e.target.value) || 300,
																		}))
																	}
																	className="bg-background border-border text-foreground"
																/>
															</div>

															<div>
																<label className="flex items-center gap-2 text-sm text-foreground">
																	<input
																		type="checkbox"
																		checked={tempConfig?.cacheIsolation || false}
																		onChange={(e) =>
																			setTempConfig((prev) => ({
																				...prev,
																				cacheIsolation: e.target.checked,
																			}))
																		}
																		className="rounded border-border bg-background"
																	/>
																	Isolamento de cache
																</label>
															</div>
														</>
													)}
												</div>

												<div className="flex items-center gap-2 mt-4">
													<Button
														onClick={() => updateInboxConfig(inbox.inboxId, tempConfig)}
														className="bg-primary hover:bg-primary/90"
													>
														Salvar Configuração
													</Button>
													<Button
														variant="outline"
														onClick={() => setEditingConfig(null)}
														className="border-border hover:bg-muted"
													>
														Cancelar
													</Button>
												</div>
											</div>
										)}
									</div>
								);
							})}

						{inboxes.filter((i) => i.attached).length === 0 && (
							<div className="border border-border rounded-md bg-muted/20 py-14 px-6 text-center">
								<h3 className="text-2xl font-semibold mb-2 text-foreground">Caixa de entrada não conectada</h3>
								<p className="text-sm text-muted-foreground max-w-xl mx-auto mb-6">
									Conectar uma caixa de entrada permite ao assistente lidar com perguntas iniciais de seus clientes
									antes de transferi-las para você.
								</p>
								<Button onClick={() => setOpen(true)} className="bg-primary hover:bg-primary/90">
									<Plus className="w-4 h-4 mr-2" /> Conectar uma nova caixa de entrada
								</Button>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
