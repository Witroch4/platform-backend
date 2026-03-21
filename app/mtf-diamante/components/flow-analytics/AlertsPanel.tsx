"use client";

/**
 * AlertsPanel Component
 *
 * Displays quality alerts with severity indicators and action buttons.
 *
 * Validates Requirements: 6.6-6.10
 */

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, AlertCircle, Info, Loader2, Bell, XCircle } from "lucide-react";
import type { DashboardFilters } from "@/types/flow-analytics";
import { mtfDiamanteQueryKeys } from "../../lib/query-keys";

// =============================================================================
// TYPES
// =============================================================================

interface AlertsPanelProps {
	filters: DashboardFilters;
}

type AlertSeverity = "critical" | "warning" | "info";

interface FlowAlert {
	id: string;
	type: string;
	severity: AlertSeverity;
	title: string;
	message: string;
	flowId?: string;
	flowName?: string;
	nodeId?: string;
	nodeName?: string;
	sessionId?: string;
	metadata: Record<string, any>;
	createdAt: string;
}

// =============================================================================
// FETCHER
// =============================================================================

const fetchAlerts = async (url: string): Promise<FlowAlert[]> => {
	const res = await fetch(url);
	if (!res.ok) throw new Error("Erro ao carregar alertas");
	const json = await res.json();
	if (!json.success) throw new Error(json.error || "Erro");
	return json.data;
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getSeverityIcon(severity: AlertSeverity) {
	switch (severity) {
		case "critical":
			return <AlertTriangle className="w-4 h-4 text-red-500" />;
		case "warning":
			return <AlertCircle className="w-4 h-4 text-yellow-500" />;
		case "info":
			return <Info className="w-4 h-4 text-blue-500" />;
	}
}

function getSeverityBadge(severity: AlertSeverity) {
	switch (severity) {
		case "critical":
			return <Badge variant="destructive">Crítico</Badge>;
		case "warning":
			return <Badge className="bg-yellow-500 hover:bg-yellow-600">Aviso</Badge>;
		case "info":
			return <Badge className="bg-blue-500 hover:bg-blue-600">Info</Badge>;
	}
}

function getAlertTypeLabel(type: string): string {
	const labels: Record<string, string> = {
		high_dropoff: "Alto Abandono",
		stuck_session: "Sessão Travada",
		recurring_error: "Erro Recorrente",
		zero_clicks: "Sem Cliques",
		performance_degradation: "Degradação de Performance",
	};
	return labels[type] || type;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function AlertsPanel({ filters }: AlertsPanelProps) {
	// Build API URL
	const apiUrl = (() => {
		if (!filters.inboxId) return null;

		const params = new URLSearchParams();
		params.append("inboxId", filters.inboxId);

		if (filters.flowId) {
			params.append("flowId", filters.flowId);
		}

		if (filters.dateRange) {
			params.append("dateStart", filters.dateRange.start.toISOString());
			params.append("dateEnd", filters.dateRange.end.toISOString());
		}

		return `/api/admin/mtf-diamante/flow-analytics/alerts?${params.toString()}`;
	})();

	// Fetch alerts
	const {
		data: alerts,
		error,
		isLoading,
	} = useQuery<FlowAlert[]>({
		queryKey: mtfDiamanteQueryKeys.analytics.alerts({
			inboxId: filters.inboxId,
			flowId: filters.flowId,
			dateRange: filters.dateRange,
		}),
		queryFn: () => fetchAlerts(apiUrl!),
		enabled: !!apiUrl,
		refetchInterval: 15_000,
		staleTime: 0,
		refetchOnWindowFocus: true,
	});

	// Count by severity
	const criticalCount = alerts?.filter((a) => a.severity === "critical").length || 0;
	const warningCount = alerts?.filter((a) => a.severity === "warning").length || 0;

	// ==========================================================================
	// RENDER
	// ==========================================================================

	return (
		<Card>
			<CardHeader>
				<div className="flex items-start justify-between">
					<div>
						<CardTitle className="text-base flex items-center gap-2">
							<Bell className="w-4 h-4" />
							Alertas de Qualidade
						</CardTitle>
						<CardDescription>Problemas detectados automaticamente</CardDescription>
					</div>
					{alerts && alerts.length > 0 && (
						<div className="flex items-center gap-2">
							{criticalCount > 0 && (
								<Badge variant="destructive">
									{criticalCount} crítico{criticalCount > 1 ? "s" : ""}
								</Badge>
							)}
							{warningCount > 0 && (
								<Badge className="bg-yellow-500 hover:bg-yellow-600">
									{warningCount} aviso{warningCount > 1 ? "s" : ""}
								</Badge>
							)}
						</div>
					)}
				</div>
			</CardHeader>
			<CardContent>
				{/* Loading State */}
				{isLoading && (
					<div className="flex items-center justify-center py-8">
						<Loader2 className="w-6 h-6 animate-spin" />
					</div>
				)}

				{/* Error State */}
				{error && (
					<div className="text-center py-8">
						<XCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
						<p className="text-sm text-red-500">Erro ao carregar alertas</p>
						<p className="text-xs text-muted-foreground mt-1">{error.message}</p>
					</div>
				)}

				{/* Empty State */}
				{!isLoading && !error && (!alerts || alerts.length === 0) && (
					<div className="text-center py-8">
						<Bell className="w-12 h-12 mx-auto text-green-500 mb-4" />
						<p className="text-sm font-medium text-green-600">Tudo funcionando bem!</p>
						<p className="text-xs text-muted-foreground mt-1">Nenhum alerta detectado no momento</p>
					</div>
				)}

				{/* Alerts List */}
				{!isLoading && !error && alerts && alerts.length > 0 && (
					<ScrollArea className="h-[400px]">
						<div className="space-y-3">
							{alerts.map((alert, index) => (
								<div key={alert.id}>
									{index > 0 && <Separator className="my-3" />}
									<div className="flex gap-3">
										{/* Icon */}
										<div className="flex-shrink-0 mt-0.5">{getSeverityIcon(alert.severity)}</div>

										{/* Content */}
										<div className="flex-1 min-w-0 space-y-2">
											<div className="flex items-start justify-between gap-2">
												<div className="flex-1">
													<p className="text-sm font-medium">{alert.title}</p>
													<p className="text-xs text-muted-foreground mt-0.5">{alert.message}</p>
												</div>
												{getSeverityBadge(alert.severity)}
											</div>

											{/* Metadata */}
											<div className="flex flex-wrap items-center gap-2 text-xs">
												<Badge variant="outline">{getAlertTypeLabel(alert.type)}</Badge>
												{alert.flowName && (
													<Badge variant="outline" className="font-normal">
														{alert.flowName}
													</Badge>
												)}
												{alert.nodeName && (
													<Badge variant="outline" className="font-normal">
														Nó: {alert.nodeName}
													</Badge>
												)}
											</div>

											{/* Additional Info */}
											{Object.keys(alert.metadata).length > 0 && (
												<div className="bg-muted/50 rounded p-2 text-xs space-y-1">
													{alert.metadata.dropOffRate !== undefined && (
														<div>Taxa de abandono: {alert.metadata.dropOffRate.toFixed(1)}%</div>
													)}
													{alert.metadata.errorCount !== undefined && <div>Erros: {alert.metadata.errorCount}</div>}
													{alert.metadata.inactiveMinutes !== undefined && (
														<div>Inativo há: {alert.metadata.inactiveMinutes} minutos</div>
													)}
												</div>
											)}
										</div>
									</div>
								</div>
							))}
						</div>
					</ScrollArea>
				)}
			</CardContent>
		</Card>
	);
}
