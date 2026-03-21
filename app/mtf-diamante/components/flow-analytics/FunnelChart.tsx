"use client";

/**
 * FunnelChart Component
 *
 * Displays conversion funnel visualization showing user progression through flow steps.
 * Highlights drop-off percentages and identifies the step with highest abandonment.
 *
 * Validates Requirements: 3.1-3.6, 19.3
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	Legend,
	ResponsiveContainer,
	Cell,
	LabelList,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingDown, Users } from "lucide-react";
import type { FunnelStep, DashboardFilters } from "@/types/flow-analytics";
import { mtfDiamanteQueryKeys } from "../../lib/query-keys";

// =============================================================================
// TYPES
// =============================================================================

interface FunnelChartProps {
	flowId: string;
	filters: DashboardFilters;
}

interface ChartDataPoint {
	name: string;
	sessions: number;
	percentage: number;
	dropOff: number;
	isHighestDropOff: boolean;
}

// =============================================================================
// FETCHER
// =============================================================================

const fetchFunnel = async (url: string): Promise<FunnelStep[]> => {
	const res = await fetch(url);
	if (!res.ok) throw new Error("Erro ao carregar dados do funil");
	const json = await res.json();
	if (!json.success) throw new Error(json.error || "Erro");
	return json.data;
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function buildApiUrl(flowId: string, filters: DashboardFilters): string {
	const params = new URLSearchParams();
	params.append("flowId", flowId);

	if (filters.inboxId) {
		params.append("inboxId", filters.inboxId);
	}

	if (filters.dateRange) {
		params.append("dateStart", filters.dateRange.start.toISOString());
		params.append("dateEnd", filters.dateRange.end.toISOString());
	}

	return `/api/admin/mtf-diamante/flow-analytics/funnel?${params.toString()}`;
}

function transformToChartData(steps: FunnelStep[]): ChartDataPoint[] {
	if (steps.length === 0) return [];

	const maxDropOff = Math.max(...steps.map((s) => s.dropOffPercentage));

	return steps.map((step) => ({
		name: step.nodeName.length > 20 ? `${step.nodeName.substring(0, 20)}...` : step.nodeName,
		sessions: step.sessionCount,
		percentage: step.percentage,
		dropOff: step.dropOffPercentage,
		isHighestDropOff: step.dropOffPercentage === maxDropOff && maxDropOff > 0,
	}));
}

function getBarColor(dropOff: number, isHighestDropOff: boolean): string {
	if (isHighestDropOff) return "#ef4444";
	if (dropOff > 30) return "#f97316";
	if (dropOff > 15) return "#eab308";
	return "#22c55e";
}

// =============================================================================
// CUSTOM TOOLTIP
// =============================================================================

interface CustomTooltipProps {
	active?: boolean;
	payload?: Array<{
		value: number;
		payload: ChartDataPoint;
	}>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
	if (!active || !payload || payload.length === 0) return null;

	const data = payload[0].payload;

	return (
		<div className="bg-background border rounded-lg shadow-lg p-3 space-y-2">
			<p className="font-semibold text-sm">{data.name}</p>
			<div className="space-y-1 text-xs">
				<div className="flex items-center justify-between gap-4">
					<span className="text-muted-foreground">Sessões:</span>
					<span className="font-medium">{data.sessions.toLocaleString("pt-BR")}</span>
				</div>
				<div className="flex items-center justify-between gap-4">
					<span className="text-muted-foreground">% do início:</span>
					<span className="font-medium">{data.percentage.toFixed(1)}%</span>
				</div>
				<div className="flex items-center justify-between gap-4">
					<span className="text-muted-foreground">Abandono:</span>
					<span
						className={`font-medium ${data.dropOff > 30 ? "text-red-500" : data.dropOff > 15 ? "text-orange-500" : "text-green-500"}`}
					>
						{data.dropOff.toFixed(1)}%
					</span>
				</div>
			</div>
			{data.isHighestDropOff && (
				<Badge variant="destructive" className="text-xs">
					<TrendingDown className="w-3 h-3 mr-1" />
					Maior abandono
				</Badge>
			)}
		</div>
	);
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function FunnelChart({ flowId, filters }: FunnelChartProps) {
	// Build API URL
	const apiUrl = useMemo(() => buildApiUrl(flowId, filters), [flowId, filters]);

	// Fetch funnel data
	const {
		data: funnelSteps,
		error,
		isLoading,
	} = useQuery<FunnelStep[]>({
		queryKey: mtfDiamanteQueryKeys.analytics.funnel(flowId, {
			inboxId: filters.inboxId,
			dateRange: filters.dateRange,
		}),
		queryFn: () => fetchFunnel(apiUrl),
		refetchInterval: 60_000,
		staleTime: 0,
		refetchOnWindowFocus: true,
	});

	// Transform data for chart
	const chartData = useMemo(() => {
		if (!funnelSteps) return [];
		return transformToChartData(funnelSteps);
	}, [funnelSteps]);

	// Calculate summary metrics
	const summary = useMemo(() => {
		if (!funnelSteps || funnelSteps.length === 0) {
			return { totalSteps: 0, conversionRate: 0, highestDropOff: null };
		}

		const firstStep = funnelSteps[0];
		const lastStep = funnelSteps[funnelSteps.length - 1];
		const conversionRate = firstStep.sessionCount > 0 ? (lastStep.sessionCount / firstStep.sessionCount) * 100 : 0;

		const maxDropOffStep = funnelSteps.reduce((max, step) =>
			step.dropOffPercentage > max.dropOffPercentage ? step : max,
		);

		return {
			totalSteps: funnelSteps.length,
			conversionRate,
			highestDropOff: maxDropOffStep.dropOffPercentage > 0 ? maxDropOffStep : null,
		};
	}, [funnelSteps]);

	// ==========================================================================
	// RENDER
	// ==========================================================================

	return (
		<Card>
			<CardHeader>
				<div className="flex items-start justify-between">
					<div>
						<CardTitle className="text-base flex items-center gap-2">
							<Users className="w-4 h-4" />
							Funil de Conversão
						</CardTitle>
						<CardDescription>Progressão de usuários através das etapas do flow</CardDescription>
					</div>
					{summary.totalSteps > 0 && (
						<div className="text-right">
							<div className="text-2xl font-bold text-green-600">{summary.conversionRate.toFixed(1)}%</div>
							<div className="text-xs text-muted-foreground">Taxa de conversão</div>
						</div>
					)}
				</div>
			</CardHeader>
			<CardContent>
				{/* Loading State */}
				{isLoading && (
					<div className="flex items-center justify-center py-12">
						<Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
					</div>
				)}

				{/* Error State */}
				{error && (
					<div className="text-center py-12">
						<p className="text-sm text-red-500">Erro ao carregar dados do funil</p>
						<p className="text-xs text-muted-foreground mt-1">{error.message}</p>
					</div>
				)}

				{/* Empty State */}
				{!isLoading && !error && chartData.length === 0 && (
					<div className="text-center py-12">
						<Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
						<p className="text-sm text-muted-foreground">Nenhum dado de funil disponível</p>
						<p className="text-xs text-muted-foreground mt-1">Execute o flow para gerar dados de conversão</p>
					</div>
				)}

				{/* Chart */}
				{!isLoading && !error && chartData.length > 0 && (
					<div className="space-y-4">
						{/* Highest Drop-off Alert */}
						{summary.highestDropOff && (
							<div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg p-3">
								<div className="flex items-start gap-2">
									<TrendingDown className="w-4 h-4 text-red-500 mt-0.5" />
									<div className="flex-1">
										<p className="text-sm font-medium text-red-900 dark:text-red-100">Maior ponto de abandono</p>
										<p className="text-xs text-red-700 dark:text-red-300 mt-1">
											<span className="font-semibold">{summary.highestDropOff.nodeName}</span> tem taxa de abandono de{" "}
											<span className="font-semibold">{summary.highestDropOff.dropOffPercentage.toFixed(1)}%</span>
										</p>
									</div>
								</div>
							</div>
						)}

						{/* Funnel Chart */}
						<ResponsiveContainer width="100%" height={400}>
							<BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
								<CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
								<XAxis dataKey="name" angle={-45} textAnchor="end" height={100} className="text-xs" />
								<YAxis label={{ value: "Sessões", angle: -90, position: "insideLeft" }} className="text-xs" />
								<Tooltip content={<CustomTooltip />} />
								<Legend
									wrapperStyle={{ paddingTop: "20px" }}
									formatter={(value) => {
										if (value === "sessions") return "Sessões";
										return value;
									}}
								/>
								<Bar dataKey="sessions" name="sessions" radius={[8, 8, 0, 0]}>
									{chartData.map((entry, index) => (
										<Cell key={`cell-${index}`} fill={getBarColor(entry.dropOff, entry.isHighestDropOff)} />
									))}
									<LabelList
										dataKey="percentage"
										position="top"
										formatter={(value: number) => `${value.toFixed(0)}%`}
										className="text-xs font-medium"
									/>
								</Bar>
							</BarChart>
						</ResponsiveContainer>

						{/* Legend */}
						<div className="flex flex-wrap items-center justify-center gap-4 text-xs">
							<div className="flex items-center gap-2">
								<div className="w-3 h-3 rounded bg-green-500" />
								<span className="text-muted-foreground">Baixo abandono (&lt;15%)</span>
							</div>
							<div className="flex items-center gap-2">
								<div className="w-3 h-3 rounded bg-yellow-500" />
								<span className="text-muted-foreground">Moderado (15-30%)</span>
							</div>
							<div className="flex items-center gap-2">
								<div className="w-3 h-3 rounded bg-orange-500" />
								<span className="text-muted-foreground">Alto (&gt;30%)</span>
							</div>
							<div className="flex items-center gap-2">
								<div className="w-3 h-3 rounded bg-red-500" />
								<span className="text-muted-foreground">Maior abandono</span>
							</div>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
