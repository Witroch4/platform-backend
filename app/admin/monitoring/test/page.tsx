"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
	Activity,
	AlertTriangle,
	CheckCircle,
	Clock,
	Database,
	Flag,
	MessageSquare,
	RefreshCw,
	Settings,
	TrendingUp,
	Users,
	XCircle,
	Zap,
} from "lucide-react";

interface TestDashboardData {
	timestamp: string;
	status: string;
	message: string;
	systemOverview: {
		status: "HEALTHY" | "WARNING" | "CRITICAL";
		healthScore: number;
		uptime: number;
		version: string;
		environment: string;
		components: {
			webhook: "HEALTHY" | "WARNING" | "CRITICAL";
			workers: "HEALTHY" | "WARNING" | "CRITICAL";
			database: "HEALTHY" | "WARNING" | "CRITICAL";
			cache: "HEALTHY" | "WARNING" | "CRITICAL";
			queues: "HEALTHY" | "WARNING" | "CRITICAL";
		};
	};
	featureFlags: {
		totalFlags: number;
		enabledFlags: number;
		rolloutFlags: number;
	};
	abTests: {
		totalTests: number;
		runningTests: number;
		completedTests: number;
	};
	feedback: {
		totalFeedback: number;
		satisfactionScore: number;
	};
	alerts: any[];
	recommendations: any[];
}

export default function TestMonitoringDashboard() {
	const [data, setData] = useState<TestDashboardData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchTestData = async () => {
		try {
			setLoading(true);
			const response = await fetch("/api/admin/monitoring/test");
			if (!response.ok) {
				throw new Error("Failed to fetch test data");
			}
			const testData = await response.json();
			setData(testData);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchTestData();
	}, []);

	const getStatusColor = (status: string) => {
		switch (status) {
			case "HEALTHY":
				return "text-green-600";
			case "WARNING":
				return "text-yellow-600";
			case "CRITICAL":
				return "text-red-600";
			default:
				return "text-gray-600";
		}
	};

	const getStatusIcon = (status: string) => {
		switch (status) {
			case "HEALTHY":
				return <CheckCircle className="h-4 w-4 text-green-600" />;
			case "WARNING":
				return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
			case "CRITICAL":
				return <XCircle className="h-4 w-4 text-red-600" />;
			default:
				return <Clock className="h-4 w-4 text-gray-600" />;
		}
	};

	const formatUptime = (seconds: number) => {
		const days = Math.floor(seconds / 86400);
		const hours = Math.floor((seconds % 86400) / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		return `${days}d ${hours}h ${minutes}m`;
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center h-64">
				<RefreshCw className="h-8 w-8 animate-spin" />
				<span className="ml-2">Carregando dashboard de teste...</span>
			</div>
		);
	}

	if (error) {
		return (
			<Alert variant="destructive">
				<AlertTriangle className="h-4 w-4" />
				<AlertTitle>Erro</AlertTitle>
				<AlertDescription>{error}</AlertDescription>
			</Alert>
		);
	}

	if (!data) return null;

	return (
		<div className="space-y-6 p-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold">Sistema de Monitoramento (TESTE)</h1>
					<p className="text-muted-foreground">Dashboard de teste para verificar funcionalidade - {data.message}</p>
				</div>
				<div className="flex items-center space-x-2">
					<Button onClick={fetchTestData}>
						<RefreshCw className="h-4 w-4 mr-2" />
						Atualizar
					</Button>
				</div>
			</div>

			{/* System Overview Cards */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Status do Sistema</CardTitle>
						{getStatusIcon(data.systemOverview.status)}
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							<span className={getStatusColor(data.systemOverview.status)}>{data.systemOverview.status}</span>
						</div>
						<p className="text-xs text-muted-foreground">Health Score: {data.systemOverview.healthScore}%</p>
						<Progress value={data.systemOverview.healthScore} className="mt-2" />
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Uptime</CardTitle>
						<Clock className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{formatUptime(data.systemOverview.uptime)}</div>
						<p className="text-xs text-muted-foreground">Versão: {data.systemOverview.version}</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Feature Flags</CardTitle>
						<Flag className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{data.featureFlags.enabledFlags}/{data.featureFlags.totalFlags}
						</div>
						<p className="text-xs text-muted-foreground">{data.featureFlags.rolloutFlags} em rollout</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">A/B Tests</CardTitle>
						<Users className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{data.abTests.runningTests}</div>
						<p className="text-xs text-muted-foreground">{data.abTests.totalTests} testes totais</p>
					</CardContent>
				</Card>
			</div>

			{/* Component Status */}
			<Card>
				<CardHeader>
					<CardTitle>Status dos Componentes</CardTitle>
					<CardDescription>Status de todos os componentes do sistema</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-2 md:grid-cols-5 gap-4">
						{Object.entries(data.systemOverview.components).map(([component, status]) => (
							<div key={component} className="flex items-center space-x-2">
								{getStatusIcon(status)}
								<span className="capitalize">{component}</span>
							</div>
						))}
					</div>
				</CardContent>
			</Card>

			{/* Feedback Metrics */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<Card>
					<CardHeader>
						<CardTitle className="text-sm">Total de Feedback</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{data.feedback.totalFeedback}</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="text-sm">Score de Satisfação</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{data.feedback.satisfactionScore.toFixed(1)}/5</div>
					</CardContent>
				</Card>
			</div>

			{/* Recommendations */}
			{data.recommendations.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Recomendações</CardTitle>
						<CardDescription>Recomendações de otimização do sistema</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{data.recommendations.map((rec, index) => (
								<div key={index} className="border-l-4 border-blue-500 pl-4">
									<div className="flex items-center justify-between">
										<h4 className="font-semibold">{rec.title}</h4>
										<Badge variant={rec.priority === "HIGH" ? "destructive" : "secondary"}>{rec.priority}</Badge>
									</div>
									<p className="text-sm text-muted-foreground mt-1">{rec.description}</p>
									<div className="mt-2">
										<p className="text-xs font-medium">Ações Sugeridas:</p>
										<ul className="text-xs text-muted-foreground list-disc list-inside">
											{rec.actions.map((action: string, actionIndex: number) => (
												<li key={actionIndex}>{action}</li>
											))}
										</ul>
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Debug Info */}
			<Card>
				<CardHeader>
					<CardTitle>Informações de Debug</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="text-sm space-y-2">
						<p>
							<strong>Timestamp:</strong> {data.timestamp}
						</p>
						<p>
							<strong>Ambiente:</strong> {data.systemOverview.environment}
						</p>
						<p>
							<strong>Status:</strong> {data.status}
						</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
