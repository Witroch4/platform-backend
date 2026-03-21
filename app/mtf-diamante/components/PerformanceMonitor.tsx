// app/admin/mtf-diamante/components/PerformanceMonitor.tsx
// Performance monitoring dashboard for MTF Diamante

"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { performanceTracker } from "../lib/performance-utils";

interface PerformanceStats {
	operation: string;
	avgTime: number;
	successRate: number;
	totalOperations: number;
}

export function PerformanceMonitor() {
	const [stats, setStats] = useState<PerformanceStats[]>([]);
	const [isVisible, setIsVisible] = useState(false);

	const refreshStats = () => {
		const operations = ["add-message", "update-message", "delete-message", "interactive-messages-mutate"];
		const newStats: PerformanceStats[] = operations
			.map((op) => {
				const metrics = performanceTracker.getMetrics(op);
				return {
					operation: op,
					avgTime: performanceTracker.getAverageTime(op),
					successRate: performanceTracker.getSuccessRate(op),
					totalOperations: metrics.length,
				};
			})
			.filter((stat) => stat.totalOperations > 0);

		setStats(newStats);
	};

	useEffect(() => {
		if (isVisible) {
			refreshStats();
			const interval = setInterval(refreshStats, 5000); // Refresh every 5 seconds
			return () => clearInterval(interval);
		}
	}, [isVisible]);

	const getPerformanceBadge = (avgTime: number) => {
		if (avgTime < 100)
			return (
				<Badge variant="default" className="bg-green-500">
					Excelente
				</Badge>
			);
		if (avgTime < 300)
			return (
				<Badge variant="default" className="bg-yellow-500">
					Bom
				</Badge>
			);
		if (avgTime < 500)
			return (
				<Badge variant="default" className="bg-orange-500">
					Regular
				</Badge>
			);
		return <Badge variant="destructive">Lento</Badge>;
	};

	const getSuccessRateBadge = (rate: number) => {
		if (rate >= 95)
			return (
				<Badge variant="default" className="bg-green-500">
					Excelente
				</Badge>
			);
		if (rate >= 90)
			return (
				<Badge variant="default" className="bg-yellow-500">
					Bom
				</Badge>
			);
		if (rate >= 80)
			return (
				<Badge variant="default" className="bg-orange-500">
					Regular
				</Badge>
			);
		return <Badge variant="destructive">Crítico</Badge>;
	};

	if (process.env.NODE_ENV !== "development") {
		return null; // Only show in development
	}

	return (
		<div className="fixed bottom-4 right-4 z-50">
			{!isVisible ? (
				<Button onClick={() => setIsVisible(true)} variant="outline" className="bg-background/80 backdrop-blur-sm">
					📊 Performance
				</Button>
			) : (
				<Card className="w-96 max-h-96 overflow-auto bg-background/95 backdrop-blur-sm">
					<CardHeader className="pb-2">
						<div className="flex items-center justify-between">
							<CardTitle className="text-sm">Monitor de Performance</CardTitle>
							<Button onClick={() => setIsVisible(false)} variant="ghost" className="h-6 w-6 p-0">
								✕
							</Button>
						</div>
					</CardHeader>
					<CardContent className="space-y-3">
						{stats.length === 0 ? (
							<p className="text-sm text-muted-foreground">Nenhuma operação registrada ainda</p>
						) : (
							stats.map((stat) => (
								<div key={stat.operation} className="space-y-1">
									<div className="flex items-center justify-between">
										<span className="text-xs font-medium">{stat.operation.replace("-", " ").toUpperCase()}</span>
										<span className="text-xs text-muted-foreground">{stat.totalOperations} ops</span>
									</div>

									<div className="flex items-center justify-between">
										<div className="flex items-center gap-2">
											<span className="text-xs">Tempo:</span>
											{getPerformanceBadge(stat.avgTime)}
											<span className="text-xs text-muted-foreground">{stat.avgTime.toFixed(0)}ms</span>
										</div>
									</div>

									<div className="flex items-center justify-between">
										<div className="flex items-center gap-2">
											<span className="text-xs">Sucesso:</span>
											{getSuccessRateBadge(stat.successRate)}
											<span className="text-xs text-muted-foreground">{stat.successRate.toFixed(1)}%</span>
										</div>
									</div>
								</div>
							))
						)}

						<div className="pt-2 border-t">
							<Button
								onClick={() => {
									performanceTracker.logSummary();
									refreshStats();
								}}
								variant="outline"
								className="w-full text-xs"
							>
								Atualizar & Log Console
							</Button>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

export default PerformanceMonitor;
