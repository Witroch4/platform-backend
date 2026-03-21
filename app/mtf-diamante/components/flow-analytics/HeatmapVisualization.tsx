"use client";

import { useMemo, useCallback, useState } from "react";
import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Loader2, AlertTriangle, RefreshCcw, TrendingDown, Clock, Eye, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useHeatmapData } from "./hooks/useHeatmapData";
import { NodeDetailPanel } from "./NodeDetailPanel";

// =============================================================================
// TYPES
// =============================================================================

interface HeatmapNodeData extends Record<string, unknown> {
	label: string;
	visitCount: number;
	visitPercentage: number;
	dropOffRate: number;
	avgTimeBeforeLeaving: number; // milliseconds
	healthStatus: "healthy" | "moderate" | "critical";
	isBottleneck: boolean;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatTime(milliseconds: number): string {
	if (milliseconds < 1000) return `${milliseconds}ms`;
	if (milliseconds < 60000) return `${(milliseconds / 1000).toFixed(1)}s`;
	if (milliseconds < 3600000) return `${(milliseconds / 60000).toFixed(1)}m`;
	return `${(milliseconds / 3600000).toFixed(1)}h`;
}

// =============================================================================
// CUSTOM NODE COMPONENT
// =============================================================================

function HeatmapNode({ data }: { data: HeatmapNodeData }) {
	const healthColors = {
		healthy: "bg-green-50 border-green-500 dark:bg-green-950",
		moderate: "bg-yellow-50 border-yellow-500 dark:bg-yellow-950",
		critical: "bg-red-50 border-red-500 dark:bg-red-950",
	};

	const healthTextColors = {
		healthy: "text-green-700 dark:text-green-300",
		moderate: "text-yellow-700 dark:text-yellow-300",
		critical: "text-red-700 dark:text-red-300",
	};

	const healthLabels = {
		healthy: "Saudável",
		moderate: "Moderado",
		critical: "Crítico",
	};

	return (
		<TooltipProvider delayDuration={200}>
			<Tooltip>
				<TooltipTrigger asChild>
					<div
						className={cn(
							"px-4 py-3 rounded-lg border-2 shadow-lg min-w-[200px] transition-all cursor-pointer hover:shadow-xl hover:scale-105",
							healthColors[data.healthStatus],
						)}
					>
						{/* Node Name */}
						<div className="font-semibold text-sm mb-2 text-foreground flex items-center gap-2">
							<Activity className="w-4 h-4" />
							{data.label}
						</div>

						{/* Metrics */}
						<div className="space-y-1 text-xs">
							<div className="flex justify-between items-center">
								<span className="text-muted-foreground flex items-center gap-1">
									<Eye className="w-3 h-3" />
									Visitas:
								</span>
								<span className="font-medium">{data.visitCount}</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">% do total:</span>
								<span className="font-medium">{data.visitPercentage.toFixed(1)}%</span>
							</div>
							<div className="flex justify-between items-center">
								<span className="text-muted-foreground flex items-center gap-1">
									<TrendingDown className="w-3 h-3" />
									Abandono:
								</span>
								<span className={cn("font-medium", healthTextColors[data.healthStatus])}>
									{data.dropOffRate.toFixed(1)}%
								</span>
							</div>
						</div>

						{/* Bottleneck Warning */}
						{data.isBottleneck && (
							<div className="mt-2 pt-2 border-t border-current/20">
								<div className="flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold text-xs">
									<AlertTriangle className="w-3 h-3" />
									Gargalo Detectado
								</div>
							</div>
						)}
					</div>
				</TooltipTrigger>
				<TooltipContent side="right" className="max-w-[300px] p-4">
					<div className="space-y-3">
						{/* Header */}
						<div className="border-b pb-2">
							<h4 className="font-semibold text-sm">{data.label}</h4>
							<p className="text-xs text-muted-foreground mt-1">Métricas detalhadas do nó</p>
						</div>

						{/* Detailed Metrics */}
						<div className="space-y-2 text-xs">
							<div className="flex justify-between items-center">
								<span className="text-muted-foreground flex items-center gap-1">
									<Eye className="w-3 h-3" />
									Contagem de visitas:
								</span>
								<span className="font-medium">{data.visitCount}</span>
							</div>

							<div className="flex justify-between">
								<span className="text-muted-foreground">Percentual de visitas:</span>
								<span className="font-medium">{data.visitPercentage.toFixed(2)}%</span>
							</div>

							<div className="flex justify-between items-center">
								<span className="text-muted-foreground flex items-center gap-1">
									<TrendingDown className="w-3 h-3" />
									Taxa de abandono:
								</span>
								<span className={cn("font-medium", healthTextColors[data.healthStatus])}>
									{data.dropOffRate.toFixed(2)}%
								</span>
							</div>

							<div className="flex justify-between items-center">
								<span className="text-muted-foreground flex items-center gap-1">
									<Clock className="w-3 h-3" />
									Tempo médio antes de sair:
								</span>
								<span className="font-medium">{formatTime(data.avgTimeBeforeLeaving)}</span>
							</div>

							<div className="flex justify-between items-center pt-2 border-t">
								<span className="text-muted-foreground">Status de saúde:</span>
								<span className={cn("font-semibold", healthTextColors[data.healthStatus])}>
									{healthLabels[data.healthStatus]}
								</span>
							</div>
						</div>

						{/* Bottleneck Warning in Tooltip */}
						{data.isBottleneck && (
							<div className="mt-3 pt-3 border-t border-red-200 dark:border-red-800">
								<div className="flex items-start gap-2 text-red-600 dark:text-red-400">
									<AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
									<div>
										<p className="font-semibold text-xs">Gargalo Identificado</p>
										<p className="text-xs mt-1 text-red-600/80 dark:text-red-400/80">
											Este nó apresenta alta taxa de abandono (&gt;50%). Considere revisar o conteúdo ou fluxo.
										</p>
									</div>
								</div>
							</div>
						)}

						{/* Health Status Explanation */}
						<div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
							<p className="font-medium mb-1">Critérios de saúde:</p>
							<ul className="space-y-0.5 text-[10px]">
								<li className="text-green-600 dark:text-green-400">• Saudável: abandono &lt;20%</li>
								<li className="text-yellow-600 dark:text-yellow-400">• Moderado: abandono 20-50%</li>
								<li className="text-red-600 dark:text-red-400">• Crítico: abandono &gt;50%</li>
							</ul>
						</div>
					</div>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

interface HeatmapVisualizationProps {
	flowId: string;
	inboxId?: string;
	dateRange?: {
		start: Date;
		end: Date;
	};
}

export function HeatmapVisualization({ flowId, inboxId, dateRange }: HeatmapVisualizationProps) {
	// State for selected node
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

	// Fetch heatmap data using custom hook
	const { flow, heatmap, isLoading, error, mutate } = useHeatmapData({
		flowId,
		inboxId,
		dateRange,
	});

	// Transform RuntimeFlow nodes to React Flow nodes with heatmap data
	const nodes = useMemo<Node[]>(() => {
		if (!flow || !heatmap) return [];

		const heatmapMap = new Map(heatmap.map((h) => [h.nodeId, h]));

		return flow.nodes.map((node) => {
			const heatmapData = heatmapMap.get(node.id);

			return {
				id: node.id,
				type: "heatmap",
				position: node.position,
				data: {
					label: node.data.label || "Nó sem nome",
					visitCount: heatmapData?.visitCount || 0,
					visitPercentage: heatmapData?.visitPercentage || 0,
					dropOffRate: heatmapData?.dropOffRate || 0,
					avgTimeBeforeLeaving: heatmapData?.avgTimeBeforeLeaving || 0,
					healthStatus: heatmapData?.healthStatus || "healthy",
					isBottleneck: heatmapData?.isBottleneck || false,
				} as HeatmapNodeData,
			};
		});
	}, [flow, heatmap]);

	// Transform RuntimeFlow edges to React Flow edges
	const edges = useMemo<Edge[]>(() => {
		if (!flow) return [];

		return flow.edges.map((edge) => ({
			id: edge.id,
			source: edge.source,
			target: edge.target,
			sourceHandle: edge.sourceHandle,
			targetHandle: edge.targetHandle,
			type: "smoothstep",
			animated: false,
			style: {
				stroke: "#94a3b8",
				strokeWidth: 2,
			},
		}));
	}, [flow]);

	// Custom node types
	const nodeTypes = useMemo<NodeTypes>(
		() => ({
			heatmap: HeatmapNode,
		}),
		[],
	);

	// Handle node click (open detail panel)
	const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
		setSelectedNodeId(node.id);
	}, []);

	// Loading state
	if (isLoading) {
		return (
			<div className="flex h-[600px] items-center justify-center bg-muted/20 rounded-lg border">
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="h-4 w-4 animate-spin" />
					Carregando heatmap...
				</div>
			</div>
		);
	}

	// Error state
	if (error) {
		return (
			<div className="flex h-[600px] items-center justify-center bg-muted/20 rounded-lg border">
				<div className="flex flex-col items-center gap-4">
					<AlertTriangle className="h-8 w-8 text-destructive" />
					<p className="text-sm text-destructive">Erro ao carregar heatmap: {error.message}</p>
					<Button onClick={() => mutate()} variant="outline" size="sm">
						<RefreshCcw className="h-4 w-4 mr-2" />
						Tentar novamente
					</Button>
				</div>
			</div>
		);
	}

	// Empty state
	if (!flow || nodes.length === 0) {
		return (
			<div className="flex h-[600px] items-center justify-center bg-muted/20 rounded-lg border">
				<div className="text-center space-y-2">
					<p className="text-sm text-muted-foreground">Nenhum dado de heatmap disponível</p>
					<p className="text-xs text-muted-foreground">Execute o flow para gerar dados de análise</p>
				</div>
			</div>
		);
	}

	return (
		<div className="h-[600px] w-full rounded-lg border bg-background overflow-hidden">
			<ReactFlow
				nodes={nodes}
				edges={edges}
				nodeTypes={nodeTypes}
				onNodeClick={onNodeClick}
				fitView
				fitViewOptions={{
					padding: 0.2,
					minZoom: 0.5,
					maxZoom: 1.5,
				}}
				minZoom={0.3}
				maxZoom={2}
				defaultEdgeOptions={{
					type: "smoothstep",
					animated: false,
				}}
				proOptions={{ hideAttribution: true }}
			>
				<Background gap={16} size={1} />
				<Controls />
				<MiniMap
					nodeColor={(node) => {
						const data = node.data as unknown as HeatmapNodeData;
						const colors = {
							healthy: "#22c55e",
							moderate: "#eab308",
							critical: "#ef4444",
						};
						return colors[data.healthStatus];
					}}
					maskColor="rgba(0, 0, 0, 0.1)"
				/>
			</ReactFlow>

			{/* Node Detail Panel */}
			<NodeDetailPanel
				flowId={flowId}
				nodeId={selectedNodeId}
				inboxId={inboxId}
				dateRange={dateRange}
				onClose={() => setSelectedNodeId(null)}
			/>
		</div>
	);
}
