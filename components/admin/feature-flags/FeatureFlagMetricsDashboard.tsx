"use client";

import { useState, useEffect } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, Clock, CheckCircle, XCircle, Activity } from "lucide-react";
import { toast } from "sonner";

interface FlagMetric {
	id: string;
	evaluations: number;
	enabledCount: number;
	disabledCount: number;
	averageLatencyMs: number;
	date: string;
	lastEvaluatedAt: string | null;
}

interface FeatureFlagMetricsDashboardProps {
	flagId: string;
	flagName: string;
	children: React.ReactNode;
}

export function FeatureFlagMetricsDashboard({ flagId, flagName, children }: FeatureFlagMetricsDashboardProps) {
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [metrics, setMetrics] = useState<FlagMetric[]>([]);
	const [summary, setSummary] = useState<{
		totalEvaluations: number;
		averageLatency: number;
		successRate: number;
		lastEvaluated: string | null;
	} | null>(null);

	useEffect(() => {
		if (open) {
			loadMetrics();
		}
	}, [open, flagId]);

	const loadMetrics = async () => {
		try {
			setLoading(true);

			const response = await fetch(`/api/admin/feature-flags/${flagId}/metrics`);
			if (!response.ok) throw new Error("Erro ao carregar métricas");

			const data = await response.json();
			setMetrics(data.metrics);
			setSummary(data.summary);
		} catch (error) {
			console.error("Error loading metrics:", error);
			toast.error("Erro ao carregar métricas");
		} finally {
			setLoading(false);
		}
	};

	const formatLatency = (ms: number) => {
		if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
		if (ms < 1000) return `${ms.toFixed(1)}ms`;
		return `${(ms / 1000).toFixed(2)}s`;
	};

	const getSuccessRate = (metric: FlagMetric) => {
		const total = metric.enabledCount + metric.disabledCount;
		return total > 0 ? ((metric.enabledCount / total) * 100).toFixed(1) : "0";
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Métricas da Feature Flag</DialogTitle>
					<DialogDescription>Análise de performance e uso da feature flag "{flagName}"</DialogDescription>
				</DialogHeader>

				{loading ? (
					<div className="flex items-center justify-center py-8">
						<Loader2 className="h-8 w-8 animate-spin" />
					</div>
				) : (
					<div className="space-y-6">
						{/* Summary Cards */}
						{summary && (
							<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
								<Card>
									<CardContent className="p-4">
										<div className="flex items-center gap-2">
											<Activity className="h-5 w-5 text-blue-500" />
											<div>
												<p className="text-sm text-muted-foreground">Total de Avaliações</p>
												<p className="text-2xl font-bold">{summary.totalEvaluations.toLocaleString()}</p>
											</div>
										</div>
									</CardContent>
								</Card>

								<Card>
									<CardContent className="p-4">
										<div className="flex items-center gap-2">
											<Clock className="h-5 w-5 text-yellow-500" />
											<div>
												<p className="text-sm text-muted-foreground">Latência Média</p>
												<p className="text-2xl font-bold">{formatLatency(summary.averageLatency)}</p>
											</div>
										</div>
									</CardContent>
								</Card>

								<Card>
									<CardContent className="p-4">
										<div className="flex items-center gap-2">
											<TrendingUp className="h-5 w-5 text-green-500" />
											<div>
												<p className="text-sm text-muted-foreground">Taxa de Sucesso</p>
												<p className="text-2xl font-bold">{summary.successRate.toFixed(1)}%</p>
											</div>
										</div>
									</CardContent>
								</Card>

								<Card>
									<CardContent className="p-4">
										<div className="flex items-center gap-2">
											<CheckCircle className="h-5 w-5 text-purple-500" />
											<div>
												<p className="text-sm text-muted-foreground">Última Avaliação</p>
												<p className="text-sm font-medium">
													{summary.lastEvaluated ? new Date(summary.lastEvaluated).toLocaleString("pt-BR") : "Nunca"}
												</p>
											</div>
										</div>
									</CardContent>
								</Card>
							</div>
						)}

						{/* Daily Metrics */}
						<Card>
							<CardHeader>
								<CardTitle>Métricas Diárias</CardTitle>
								<CardDescription>Histórico de avaliações e performance dos últimos 30 dias</CardDescription>
							</CardHeader>
							<CardContent>
								{metrics.length === 0 ? (
									<div className="text-center py-8 text-muted-foreground">Nenhuma métrica disponível</div>
								) : (
									<div className="space-y-4">
										{metrics.map((metric) => (
											<div key={metric.id} className="flex items-center justify-between p-4 border rounded-lg">
												<div className="flex items-center gap-4">
													<div>
														<p className="font-medium">{new Date(metric.date).toLocaleDateString("pt-BR")}</p>
														<p className="text-sm text-muted-foreground">
															{metric.evaluations.toLocaleString()} avaliações
														</p>
													</div>

													<div className="flex gap-2">
														<Badge variant="default" className="flex items-center gap-1">
															<CheckCircle className="h-3 w-3" />
															{metric.enabledCount}
														</Badge>
														<Badge variant="secondary" className="flex items-center gap-1">
															<XCircle className="h-3 w-3" />
															{metric.disabledCount}
														</Badge>
													</div>
												</div>

												<div className="flex items-center gap-4 text-sm">
													<div className="text-right">
														<p className="text-muted-foreground">Taxa de Sucesso</p>
														<p className="font-medium">{getSuccessRate(metric)}%</p>
													</div>

													<div className="text-right">
														<p className="text-muted-foreground">Latência</p>
														<p className="font-medium">{formatLatency(metric.averageLatencyMs)}</p>
													</div>

													{metric.lastEvaluatedAt && (
														<div className="text-right">
															<p className="text-muted-foreground">Última Avaliação</p>
															<p className="font-medium">
																{new Date(metric.lastEvaluatedAt).toLocaleTimeString("pt-BR")}
															</p>
														</div>
													)}
												</div>
											</div>
										))}
									</div>
								)}
							</CardContent>
						</Card>

						{/* Performance Insights */}
						{summary && (
							<Card>
								<CardHeader>
									<CardTitle>Insights de Performance</CardTitle>
									<CardDescription>Análise automática da performance da feature flag</CardDescription>
								</CardHeader>
								<CardContent>
									<div className="space-y-3">
										{summary.averageLatency > 100 && (
											<div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
												<Clock className="h-4 w-4 text-yellow-600" />
												<p className="text-sm text-yellow-800">
													A latência média está acima de 100ms. Considere otimizar a avaliação da flag.
												</p>
											</div>
										)}

										{summary.successRate < 95 && (
											<div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
												<XCircle className="h-4 w-4 text-red-600" />
												<p className="text-sm text-red-800">
													Taxa de sucesso baixa ({summary.successRate.toFixed(1)}%). Verifique possíveis erros na
													configuração.
												</p>
											</div>
										)}

										{summary.totalEvaluations === 0 && (
											<div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
												<Activity className="h-4 w-4 text-blue-600" />
												<p className="text-sm text-blue-800">
													Esta feature flag ainda não foi avaliada. Considere testá-la em ambiente de desenvolvimento.
												</p>
											</div>
										)}

										{summary.averageLatency <= 50 && summary.successRate >= 99 && summary.totalEvaluations > 100 && (
											<div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
												<CheckCircle className="h-4 w-4 text-green-600" />
												<p className="text-sm text-green-800">
													Excelente performance! Esta feature flag está funcionando de forma otimizada.
												</p>
											</div>
										)}
									</div>
								</CardContent>
							</Card>
						)}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
