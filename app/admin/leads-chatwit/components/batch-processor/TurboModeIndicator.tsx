/**
 * TURBO Mode Indicator Component
 * Visual indicator for TURBO mode status and performance metrics
 * Based on requirements 4.1, 4.2, 4.3
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Zap, Clock, TrendingUp, Activity } from "lucide-react";
import { useTurboMode, type TurboModeConfig, type TurboModeMetrics } from "./useTurboMode";

interface TurboModeIndicatorProps {
	enabled: boolean;
	config?: TurboModeConfig | null;
	metrics?: TurboModeMetrics | null;
	currentStep?: string;
	className?: string;
}

export function TurboModeIndicator({ enabled, config, metrics, currentStep, className = "" }: TurboModeIndicatorProps) {
	if (!enabled || !config) {
		return null;
	}

	const formatTime = (seconds: number): string => {
		if (seconds < 60) {
			return `${Math.round(seconds)}s`;
		}
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = Math.round(seconds % 60);
		return `${minutes}m ${remainingSeconds}s`;
	};

	const getStepDisplayName = (step?: string): string => {
		switch (step) {
			case "unifying-pdf":
				return "Unificando PDFs";
			case "generating-images":
				return "Gerando Imagens";
			case "preliminary-analysis":
				return "Análise Preliminar";
			default:
				return "Processando";
		}
	};

	return (
		<div className={`fixed top-4 right-4 z-50 ${className}`}>
			<Card className="w-80 bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200 shadow-lg">
				<CardHeader className="pb-3">
					<CardTitle className="flex items-center gap-2 text-sm font-semibold text-blue-800">
						<div className="flex items-center gap-1">
							<Zap className="h-4 w-4 text-yellow-500" />
							<span>TURBO MODE ATIVO</span>
						</div>
						<Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs">
							{config.maxParallelLeads}x Paralelo
						</Badge>
					</CardTitle>
				</CardHeader>

				<CardContent className="space-y-3">
					{/* Current Status */}
					{currentStep && (
						<div className="flex items-center gap-2 text-sm">
							<Activity className="h-3 w-3 text-blue-600 animate-pulse" />
							<span className="text-gray-700">{getStepDisplayName(currentStep)}</span>
						</div>
					)}

					{/* Performance Metrics */}
					{metrics && (
						<div className="space-y-2">
							{/* Processing Stats */}
							<div className="grid grid-cols-2 gap-2 text-xs">
								<div className="bg-white rounded p-2 border">
									<div className="text-gray-500">Total Processado</div>
									<div className="font-semibold text-blue-600">{metrics.totalLeads} leads</div>
								</div>
								<div className="bg-white rounded p-2 border">
									<div className="text-gray-500">Paralelo</div>
									<div className="font-semibold text-green-600">{metrics.parallelProcessed} leads</div>
								</div>
							</div>

							{/* Time Saved */}
							{metrics.timeSaved > 0 && (
								<div className="bg-green-50 rounded p-2 border border-green-200">
									<div className="flex items-center gap-1 text-xs text-green-700">
										<Clock className="h-3 w-3" />
										<span>Tempo Economizado</span>
									</div>
									<div className="font-semibold text-green-800">{formatTime(metrics.timeSaved)}</div>
								</div>
							)}

							{/* Processing Speed */}
							{metrics.averageProcessingTime > 0 && (
								<div className="bg-blue-50 rounded p-2 border border-blue-200">
									<div className="flex items-center gap-1 text-xs text-blue-700">
										<TrendingUp className="h-3 w-3" />
										<span>Tempo Médio/Lead</span>
									</div>
									<div className="font-semibold text-blue-800">{formatTime(metrics.averageProcessingTime)}</div>
								</div>
							)}

							{/* Error Rate */}
							{metrics.errorRate > 0 && (
								<div className="bg-yellow-50 rounded p-2 border border-yellow-200">
									<div className="text-xs text-yellow-700">Taxa de Erro</div>
									<div className="flex items-center gap-2">
										<Progress value={metrics.errorRate * 100} className="flex-1 h-2" />
										<span className="text-xs font-semibold text-yellow-800">
											{Math.round(metrics.errorRate * 100)}%
										</span>
									</div>
								</div>
							)}
						</div>
					)}

					{/* Configuration Info */}
					<div className="text-xs text-gray-500 border-t pt-2">
						<div className="flex justify-between">
							<span>Max Paralelo:</span>
							<span className="font-medium">{config.maxParallelLeads} leads</span>
						</div>
						<div className="flex justify-between">
							<span>Fallback:</span>
							<span className="font-medium">{config.fallbackOnError ? "Ativo" : "Inativo"}</span>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

/**
 * Compact TURBO Mode Badge for smaller spaces
 */
export function TurboModeBadge({
	enabled,
	config,
	className = "",
}: Pick<TurboModeIndicatorProps, "enabled" | "config" | "className">) {
	if (!enabled || !config) {
		return null;
	}

	return (
		<Badge
			variant="secondary"
			className={`bg-gradient-to-r from-blue-500 to-purple-500 text-white text-xs font-semibold ${className}`}
		>
			<Zap className="h-3 w-3 mr-1" />
			TURBO {config.maxParallelLeads}x
		</Badge>
	);
}

/**
 * TURBO Mode Status Display for completion dialogs
 */
export function TurboModeStats({
	metrics,
	className = "",
}: {
	metrics?: TurboModeMetrics | null;
	className?: string;
}) {
	if (!metrics) {
		return null;
	}

	const efficiencyGain =
		metrics.totalLeads > 0 ? Math.round((metrics.parallelProcessed / metrics.totalLeads) * 100) : 0;

	return (
		<div className={`bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-4 border border-blue-200 ${className}`}>
			<div className="flex items-center gap-2 mb-3">
				<Zap className="h-4 w-4 text-blue-600" />
				<span className="font-semibold text-blue-800">Estatísticas TURBO</span>
			</div>

			<div className="grid grid-cols-2 gap-3 text-sm">
				<div>
					<div className="text-gray-600">Processamento Paralelo</div>
					<div className="font-semibold text-blue-600">
						{metrics.parallelProcessed}/{metrics.totalLeads} leads
					</div>
				</div>

				<div>
					<div className="text-gray-600">Eficiência</div>
					<div className="font-semibold text-green-600">{efficiencyGain}%</div>
				</div>

				{metrics.timeSaved > 0 && (
					<div className="col-span-2">
						<div className="text-gray-600">Tempo Economizado</div>
						<div className="font-semibold text-green-600">{Math.round(metrics.timeSaved / 60)} minutos</div>
					</div>
				)}
			</div>
		</div>
	);
}
