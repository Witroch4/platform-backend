/**
 * TURBO Mode Activation Badge Component
 * Visual indicator for TURBO mode activation in batch processing interface
 * Based on requirements 4.1, 4.6
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Zap, Crown, Lock, Info, CheckCircle2, AlertTriangle, Activity } from "lucide-react";
import { useState } from "react";
import { useTurboMode } from "./useTurboMode";

interface TurboModeEligibility {
	eligible: boolean;
	reason: string;
	config?: TurboModeConfig;
}

interface TurboModeConfig {
	maxParallelLeads: number;
	resourceThreshold: number;
	fallbackOnError: boolean;
}

interface TurboModeActivationBadgeProps {
	eligibility: TurboModeEligibility;
	config?: TurboModeConfig | null;
	isActive?: boolean;
	leadCount?: number;
	onActivate?: () => void;
	onDeactivate?: () => void;
	className?: string;
}

export function TurboModeActivationBadge({
	eligibility,
	config,
	isActive = false,
	leadCount = 0,
	onActivate,
	onDeactivate,
	className = "",
}: TurboModeActivationBadgeProps) {
	const [showDetails, setShowDetails] = useState(false);

	const getStatusIcon = () => {
		if (isActive) {
			return <Activity className="h-4 w-4 text-green-500 animate-pulse" />;
		}
		if (eligibility.eligible) {
			return <CheckCircle2 className="h-4 w-4 text-blue-500" />;
		}
		return <Lock className="h-4 w-4 text-gray-400" />;
	};

	const getStatusColor = () => {
		if (isActive) {
			return "bg-green-100 text-green-800 border-green-300";
		}
		if (eligibility.eligible) {
			return "bg-blue-100 text-blue-800 border-blue-300";
		}
		return "bg-gray-100 text-gray-600 border-gray-300";
	};

	const getStatusText = () => {
		if (isActive) {
			return "TURBO ATIVO";
		}
		if (eligibility.eligible) {
			return "TURBO DISPONÍVEL";
		}
		return "TURBO INDISPONÍVEL";
	};

	const estimateTimeSavings = () => {
		if (!config || leadCount === 0) return null;

		const sequentialTime = leadCount * 120; // 2 minutes per lead
		const turboTime = Math.ceil(leadCount / config.maxParallelLeads) * 120;
		const savings = sequentialTime - turboTime;

		if (savings <= 0) return null;

		const minutes = Math.floor(savings / 60);
		return minutes > 0 ? `~${minutes} min economizados` : null;
	};

	const timeSavingsEstimate = estimateTimeSavings();

	return (
		<div className={`space-y-2 ${className}`}>
			{/* Main Badge */}
			<Card className={`border-2 ${getStatusColor()}`}>
				<CardContent className="p-3">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							{getStatusIcon()}
							<div>
								<div className="font-semibold text-sm">{getStatusText()}</div>
								{config && <div className="text-xs opacity-75">Até {config.maxParallelLeads} leads paralelos</div>}
							</div>
						</div>

						<div className="flex items-center gap-2">
							{eligibility.eligible && !isActive && <Crown className="h-4 w-4 text-yellow-500" />}

							{timeSavingsEstimate && (
								<Badge variant="outline" className="text-xs bg-white">
									{timeSavingsEstimate}
								</Badge>
							)}

							<Button variant="ghost" onClick={() => setShowDetails(!showDetails)} className="h-6 w-6 p-0">
								<Info className="h-3 w-3" />
							</Button>
						</div>
					</div>

					{/* Action Buttons */}
					{eligibility.eligible && (
						<div className="mt-3 flex gap-2">
							{!isActive && onActivate && (
								<Button onClick={onActivate} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
									<Zap className="h-3 w-3 mr-1" />
									Ativar TURBO
								</Button>
							)}

							{isActive && onDeactivate && (
								<Button onClick={onDeactivate} variant="outline" className="flex-1">
									Desativar TURBO
								</Button>
							)}
						</div>
					)}
				</CardContent>
			</Card>

			{/* Details Panel */}
			{showDetails && (
				<Card className="border border-gray-200 bg-gray-50">
					<CardContent className="p-3 space-y-3">
						<div className="text-sm">
							<div className="font-medium mb-2">Status do TURBO Mode</div>

							{eligibility.eligible ? (
								<div className="space-y-2">
									<div className="flex items-center gap-2 text-green-700">
										<CheckCircle2 className="h-3 w-3" />
										<span className="text-xs">TURBO Mode disponível para sua conta</span>
									</div>

									{config && (
										<div className="space-y-1 text-xs text-gray-600">
											<div>• Processamento paralelo: até {config.maxParallelLeads} leads</div>
											<div>• Fallback automático: {config.fallbackOnError ? "Ativo" : "Inativo"}</div>
											<div>• Limite de recursos: {config.resourceThreshold}%</div>
										</div>
									)}

									{timeSavingsEstimate && leadCount > 0 && (
										<div className="p-2 bg-blue-50 rounded border border-blue-200">
											<div className="text-xs text-blue-700">
												<strong>Estimativa para {leadCount} leads:</strong>
											</div>
											<div className="text-xs text-blue-600">
												{timeSavingsEstimate} comparado ao processamento sequencial
											</div>
										</div>
									)}
								</div>
							) : (
								<div className="space-y-2">
									<div className="flex items-center gap-2 text-red-700">
										<AlertTriangle className="h-3 w-3" />
										<span className="text-xs">TURBO Mode não disponível</span>
									</div>

									<div className="text-xs text-gray-600">
										<strong>Motivo:</strong> {eligibility.reason}
									</div>

									<div className="p-2 bg-orange-50 rounded border border-orange-200">
										<div className="text-xs text-orange-700">
											<strong>Como ativar:</strong>
										</div>
										<div className="text-xs text-orange-600">
											Entre em contato com o suporte para ativar o TURBO Mode em sua conta premium.
										</div>
									</div>
								</div>
							)}
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

/**
 * Compact TURBO Mode Status Indicator for smaller spaces
 */
export function TurboModeStatusIndicator({
	eligibility,
	isActive = false,
	className = "",
}: {
	eligibility: TurboModeEligibility;
	isActive?: boolean;
	className?: string;
}) {
	const getStatusColor = () => {
		if (isActive) return "bg-green-500";
		if (eligibility.eligible) return "bg-blue-500";
		return "bg-gray-400";
	};

	const getStatusText = () => {
		if (isActive) return "TURBO Ativo";
		if (eligibility.eligible) return "TURBO Disponível";
		return "TURBO Indisponível";
	};

	return (
		<div className={`flex items-center gap-2 ${className}`}>
			<div className={`w-2 h-2 rounded-full ${getStatusColor()} ${isActive ? "animate-pulse" : ""}`}></div>
			<span className="text-xs font-medium">{getStatusText()}</span>
			{isActive && <Zap className="h-3 w-3 text-yellow-500" />}
		</div>
	);
}

/**
 * TURBO Mode Feature Highlight for non-premium users
 */
export function TurboModeFeatureHighlight({
	leadCount,
	className = "",
}: {
	leadCount: number;
	className?: string;
}) {
	const estimatedSavings = leadCount > 1 ? Math.floor((leadCount * 120 * 0.7) / 60) : 0;

	return (
		<Card className={`border-2 border-dashed border-blue-300 bg-gradient-to-r from-blue-50 to-purple-50 ${className}`}>
			<CardContent className="p-4">
				<div className="flex items-center gap-3">
					<div className="p-2 bg-blue-100 rounded-lg">
						<Zap className="h-5 w-5 text-blue-600" />
					</div>
					<div className="flex-1">
						<div className="font-semibold text-blue-800 mb-1">Acelere seu processamento com TURBO Mode</div>
						<div className="text-sm text-blue-700">Processe até 10 leads simultaneamente e economize tempo</div>
						{estimatedSavings > 0 && (
							<div className="text-xs text-blue-600 mt-1">
								Economia estimada: ~{estimatedSavings} minutos para {leadCount} leads
							</div>
						)}
					</div>
					<div className="flex items-center gap-1">
						<Crown className="h-4 w-4 text-yellow-500" />
						<Badge variant="outline" className="bg-yellow-100 text-yellow-800 text-xs">
							Premium
						</Badge>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
