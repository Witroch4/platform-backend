"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Activity,
	CheckCircle2,
	XCircle,
	Clock,
	TrendingUp,
	TrendingDown,
	MousePointerClick,
	Zap,
	AlertTriangle,
	Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExecutiveKPIs, DashboardFilters } from "@/types/flow-analytics";

// =============================================================================
// TYPES
// =============================================================================

interface ExecutiveKPICardsProps {
	filters: DashboardFilters;
}

interface KPICardData {
	title: string;
	value: string | number;
	subtitle?: string;
	icon: React.ReactNode;
	trend?: "up" | "down" | "neutral";
	colorClass?: string;
}

// =============================================================================
// FETCHER
// =============================================================================

const fetcher = async (url: string) => {
	const res = await fetch(url);
	if (!res.ok) {
		const error = await res.json();
		throw new Error(error.error || "Erro ao carregar KPIs");
	}
	return res.json();
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatTime(milliseconds: number): string {
	if (milliseconds < 1000) return `${milliseconds}ms`;
	if (milliseconds < 60000) return `${(milliseconds / 1000).toFixed(1)}s`;
	if (milliseconds < 3600000) return `${(milliseconds / 60000).toFixed(1)}m`;
	return `${(milliseconds / 3600000).toFixed(1)}h`;
}

function buildApiUrl(filters: DashboardFilters): string {
	const params = new URLSearchParams();
	if (filters.inboxId) params.append("inboxId", filters.inboxId);
	if (filters.flowId) params.append("flowId", filters.flowId);
	if (filters.dateRange) {
		params.append("startDate", filters.dateRange.start.toISOString());
		params.append("endDate", filters.dateRange.end.toISOString());
	}
	if (filters.campaign) params.append("campaign", filters.campaign);
	if (filters.channelType) params.append("channelType", filters.channelType);
	if (filters.status) params.append("status", filters.status.join(","));

	return `/api/admin/mtf-diamante/flow-analytics/kpis?${params.toString()}`;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ExecutiveKPICards({ filters }: ExecutiveKPICardsProps) {
	// Build API URL
	const apiUrl = useMemo(() => buildApiUrl(filters), [filters]);

	// Fetch KPI data
	const { data, error, isLoading } = useSWR<{ success: boolean; data: ExecutiveKPIs }>(apiUrl, fetcher, {
		refreshInterval: 30000, // Refresh every 30 seconds
		revalidateOnFocus: true,
		keepPreviousData: true,
	});

	const kpis = data?.data;

	// Prepare KPI cards data
	const kpiCards = useMemo<KPICardData[]>(() => {
		if (!kpis) return [];

		return [
			{
				title: "Total de Execuções",
				value: kpis.totalExecutions.toLocaleString("pt-BR"),
				icon: <Activity className="w-4 h-4" />,
				colorClass: "text-blue-600 dark:text-blue-400",
			},
			{
				title: "Taxa de Conclusão",
				value: `${kpis.completionRate.toFixed(1)}%`,
				icon: <CheckCircle2 className="w-4 h-4" />,
				trend: kpis.completionRate >= 70 ? "up" : kpis.completionRate >= 50 ? "neutral" : "down",
				colorClass:
					kpis.completionRate >= 70
						? "text-green-600 dark:text-green-400"
						: kpis.completionRate >= 50
							? "text-yellow-600 dark:text-yellow-400"
							: "text-red-600 dark:text-red-400",
			},
			{
				title: "Taxa de Abandono",
				value: `${kpis.abandonmentRate.toFixed(1)}%`,
				icon: <XCircle className="w-4 h-4" />,
				trend: kpis.abandonmentRate <= 30 ? "up" : kpis.abandonmentRate <= 50 ? "neutral" : "down",
				colorClass:
					kpis.abandonmentRate <= 30
						? "text-green-600 dark:text-green-400"
						: kpis.abandonmentRate <= 50
							? "text-yellow-600 dark:text-yellow-400"
							: "text-red-600 dark:text-red-400",
			},
			{
				title: "Tempo Médio de Conclusão",
				value: formatTime(kpis.avgTimeToCompletion),
				subtitle: kpis.avgTimeToCompletion > 0 ? "para sessões concluídas" : "sem dados",
				icon: <Clock className="w-4 h-4" />,
				colorClass: "text-purple-600 dark:text-purple-400",
			},
			{
				title: "Tempo Médio de Abandono",
				value: formatTime(kpis.avgTimeToAbandonment),
				subtitle: kpis.avgTimeToAbandonment > 0 ? "antes de abandonar" : "sem dados",
				icon: <Clock className="w-4 h-4" />,
				colorClass: "text-orange-600 dark:text-orange-400",
			},
			{
				title: "Taxa de Erro",
				value: `${kpis.errorRate.toFixed(1)}%`,
				icon: <AlertTriangle className="w-4 h-4" />,
				trend: kpis.errorRate <= 5 ? "up" : kpis.errorRate <= 15 ? "neutral" : "down",
				colorClass:
					kpis.errorRate <= 5
						? "text-green-600 dark:text-green-400"
						: kpis.errorRate <= 15
							? "text-yellow-600 dark:text-yellow-400"
							: "text-red-600 dark:text-red-400",
			},
			{
				title: "Taxa Início → Fim",
				value: `${kpis.startToEndRate.toFixed(1)}%`,
				subtitle: "conversão completa",
				icon: <TrendingUp className="w-4 h-4" />,
				colorClass: "text-indigo-600 dark:text-indigo-400",
			},
			{
				title: "Taxa Início → 1ª Interação",
				value: `${kpis.startToFirstInteractionRate.toFixed(1)}%`,
				subtitle: "engajamento inicial",
				icon: <Zap className="w-4 h-4" />,
				colorClass: "text-cyan-600 dark:text-cyan-400",
			},
			{
				title: "CTR Médio",
				value: `${kpis.avgClickThroughRate.toFixed(1)}%`,
				subtitle: "cliques em botões",
				icon: <MousePointerClick className="w-4 h-4" />,
				colorClass: "text-pink-600 dark:text-pink-400",
			},
			{
				title: "Taxa de Resposta Pós-Delay",
				value: `${kpis.avgResponseRateAfterDelay.toFixed(1)}%`,
				subtitle: "continuam após espera",
				icon: <TrendingDown className="w-4 h-4" />,
				colorClass: "text-teal-600 dark:text-teal-400",
			},
		];
	}, [kpis]);

	// Loading state
	if (isLoading) {
		return (
			<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
				{Array.from({ length: 10 }).map((_, i) => (
					<Card key={i}>
						<CardContent className="pt-6">
							<div className="flex items-center justify-center">
								<Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		);
	}

	// Error state
	if (error) {
		return (
			<Card className="border-destructive">
				<CardContent className="pt-6">
					<div className="flex items-center gap-2 text-destructive">
						<AlertTriangle className="w-5 h-5" />
						<p className="text-sm">Erro ao carregar KPIs: {error.message}</p>
					</div>
				</CardContent>
			</Card>
		);
	}

	// Empty state
	if (!kpis) {
		return (
			<Card>
				<CardContent className="pt-6">
					<p className="text-sm text-muted-foreground text-center">Nenhum dado disponível</p>
				</CardContent>
			</Card>
		);
	}

	// Render KPI cards
	return (
		<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
			{kpiCards.map((card, index) => (
				<Card key={index} className="hover:shadow-md transition-shadow">
					<CardHeader className="pb-2">
						<CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
							<span className={cn(card.colorClass)}>{card.icon}</span>
							{card.title}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex items-baseline gap-2">
							<p className={cn("text-2xl font-bold", card.colorClass)}>{card.value}</p>
							{card.trend && (
								<span className="text-xs">
									{card.trend === "up" && <TrendingUp className="w-3 h-3 text-green-500" />}
									{card.trend === "down" && <TrendingDown className="w-3 h-3 text-red-500" />}
								</span>
							)}
						</div>
						{card.subtitle && <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>}
					</CardContent>
				</Card>
			))}
		</div>
	);
}
