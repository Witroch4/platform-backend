"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

interface DashboardData {
	timestamp: string;
	timeRange: string;
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
		flags: any[];
		metrics: {
			totalFlags: number;
			enabledFlags: number;
			rolloutFlags: number;
			flagDetails: any[];
		};
	};
	abTests: {
		tests: any[];
		metrics: {
			totalTests: number;
			runningTests: number;
			completedTests: number;
			activeTests: any[];
		};
	};
	feedback: {
		totalFeedback: number;
		byType: Record<string, number>;
		bySeverity: Record<string, number>;
		satisfactionScore: number;
	};
	queues: {
		overallHealth: {
			overallHealth: number;
			issues: string[];
		};
		queues: any[];
	};
	performance: {
		current: {
			webhookResponseTime: number;
			workerProcessingTime: number;
			databaseQueryTime: number;
			cacheHitRate: number;
			errorRate: number;
		};
		trends: Record<string, number>;
	};
	alerts: any[];
	recommendations: any[];
}

export default function MonitoringDashboard() {
	const [data, setData] = useState<DashboardData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [timeRange, setTimeRange] = useState("24h");
	const [autoRefresh, setAutoRefresh] = useState(true);

	const fetchDashboardData = async () => {
		try {
			setLoading(true);
			const response = await fetch(`/api/admin/monitoring/dashboard?timeRange=${timeRange}`);
			if (!response.ok) {
				throw new Error("Failed to fetch dashboard data");
			}
			const dashboardData = await response.json();
			setData(dashboardData);
			setError(null);
		} catch (err) {
			console.error("Dashboard fetch error:", err);
			setError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchDashboardData();
	}, [timeRange]);

	useEffect(() => {
		if (autoRefresh) {
			const interval = setInterval(fetchDashboardData, 30000); // Refresh every 30 seconds
			return () => clearInterval(interval);
		}
	}, [autoRefresh, timeRange]);

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

	if (loading && !data) {
		return (
			<div className="flex items-center justify-center h-64">
				<RefreshCw className="h-8 w-8 animate-spin" />
				<span className="ml-2">Loading dashboard...</span>
			</div>
		);
	}

	if (error) {
		return (
			<Alert variant="destructive">
				<AlertTriangle className="h-4 w-4" />
				<AlertTitle>Error</AlertTitle>
				<AlertDescription>{error}</AlertDescription>
			</Alert>
		);
	}

	if (!data) return null;

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold">Sistema de Monitoramento</h1>
					<p className="text-muted-foreground">Dashboard de monitoramento e controle do sistema ChatWit</p>
				</div>
				<div className="flex items-center space-x-2">
					<Button variant="outline" onClick={() => setAutoRefresh(!autoRefresh)}>
						<RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? "animate-spin" : ""}`} />
						Auto Refresh: {autoRefresh ? "ON" : "OFF"}
					</Button>
					<select
						value={timeRange}
						onChange={(e) => setTimeRange(e.target.value)}
						className="px-3 py-1 border rounded-md"
					>
						<option value="1h">1 Hour</option>
						<option value="24h">24 Hours</option>
						<option value="7d">7 Days</option>
					</select>
					<Button onClick={fetchDashboardData}>
						<RefreshCw className="h-4 w-4 mr-2" />
						Refresh
					</Button>
				</div>
			</div>

			{/* System Overview */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">System Status</CardTitle>
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
						<p className="text-xs text-muted-foreground">Version: {data.systemOverview.version}</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Feature Flags</CardTitle>
						<Flag className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{data.featureFlags.metrics.enabledFlags}/{data.featureFlags.metrics.totalFlags}
						</div>
						<p className="text-xs text-muted-foreground">{data.featureFlags.metrics.rolloutFlags} in rollout</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">A/B Tests</CardTitle>
						<Users className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{data.abTests.metrics.runningTests}</div>
						<p className="text-xs text-muted-foreground">{data.abTests.metrics.totalTests} total tests</p>
					</CardContent>
				</Card>
			</div>

			{/* Alerts */}
			{data.alerts.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center">
							<AlertTriangle className="h-5 w-5 mr-2 text-yellow-600" />
							System Alerts
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							{data.alerts.slice(0, 5).map((alert, index) => (
								<Alert key={index} variant={alert.severity === "CRITICAL" ? "destructive" : "default"}>
									<AlertTitle>{alert.title}</AlertTitle>
									<AlertDescription>{alert.message}</AlertDescription>
								</Alert>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Main Dashboard Tabs */}
			<Tabs defaultValue="overview" className="space-y-4">
				<TabsList>
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="performance">Performance</TabsTrigger>
					<TabsTrigger value="queues">Queues</TabsTrigger>
					<TabsTrigger value="features">Feature Flags</TabsTrigger>
					<TabsTrigger value="abtests">A/B Tests</TabsTrigger>
					<TabsTrigger value="feedback">Feedback</TabsTrigger>
				</TabsList>

				<TabsContent value="overview" className="space-y-4">
					{/* Component Status */}
					<Card>
						<CardHeader>
							<CardTitle>Component Status</CardTitle>
							<CardDescription>Status of all system components</CardDescription>
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

					{/* Recommendations */}
					{data.recommendations.length > 0 && (
						<Card>
							<CardHeader>
								<CardTitle>Recommendations</CardTitle>
								<CardDescription>System optimization recommendations</CardDescription>
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
												<p className="text-xs font-medium">Suggested Actions:</p>
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
				</TabsContent>

				<TabsContent value="performance" className="space-y-4">
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						<Card>
							<CardHeader>
								<CardTitle className="text-sm">Webhook Response Time</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="text-2xl font-bold">{data.performance.current.webhookResponseTime.toFixed(0)}ms</div>
								<div className="flex items-center text-xs text-muted-foreground">
									<TrendingUp className="h-3 w-3 mr-1" />
									{data.performance.trends.webhookResponseTime > 0 ? "+" : ""}
									{data.performance.trends.webhookResponseTime?.toFixed(1)}%
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="text-sm">Worker Processing Time</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="text-2xl font-bold">
									{(data.performance.current.workerProcessingTime / 1000).toFixed(1)}s
								</div>
								<div className="flex items-center text-xs text-muted-foreground">
									<TrendingUp className="h-3 w-3 mr-1" />
									{data.performance.trends.workerProcessingTime > 0 ? "+" : ""}
									{data.performance.trends.workerProcessingTime?.toFixed(1)}%
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="text-sm">Cache Hit Rate</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="text-2xl font-bold">{data.performance.current.cacheHitRate.toFixed(1)}%</div>
								<div className="flex items-center text-xs text-muted-foreground">
									<TrendingUp className="h-3 w-3 mr-1" />
									{data.performance.trends.cacheHitRate > 0 ? "+" : ""}
									{data.performance.trends.cacheHitRate?.toFixed(1)}%
								</div>
							</CardContent>
						</Card>
					</div>
				</TabsContent>

				<TabsContent value="queues" className="space-y-4">
					<Card>
						<CardHeader>
							<CardTitle>Queue Health</CardTitle>
							<CardDescription>
								Overall Health: {(data.queues.overallHealth.overallHealth * 100).toFixed(1)}%
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								{data.queues.queues.map((queue, index) => (
									<div key={index} className="border rounded-lg p-4">
										<div className="flex items-center justify-between mb-2">
											<h4 className="font-semibold">{queue.name}</h4>
											<Badge variant={queue.health.healthy ? "default" : "destructive"}>
												{queue.health.healthy ? "Healthy" : "Issues"}
											</Badge>
										</div>
										<div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
											<div>
												<p className="text-muted-foreground">Waiting</p>
												<p className="font-medium">{queue.health.waiting}</p>
											</div>
											<div>
												<p className="text-muted-foreground">Active</p>
												<p className="font-medium">{queue.health.active}</p>
											</div>
											<div>
												<p className="text-muted-foreground">Completed</p>
												<p className="font-medium">{queue.health.completed}</p>
											</div>
											<div>
												<p className="text-muted-foreground">Failed</p>
												<p className="font-medium">{queue.health.failed}</p>
											</div>
										</div>
									</div>
								))}
							</div>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="features" className="space-y-4">
					<Card>
						<CardHeader>
							<CardTitle>Feature Flags Status</CardTitle>
							<CardDescription>
								{data.featureFlags.metrics.enabledFlags} of {data.featureFlags.metrics.totalFlags} flags enabled
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								{data.featureFlags.metrics.flagDetails.map((flag, index) => (
									<div key={index} className="flex items-center justify-between border rounded-lg p-4">
										<div>
											<h4 className="font-semibold">{flag.name}</h4>
											<p className="text-sm text-muted-foreground">Rollout: {flag.rolloutPercentage}%</p>
										</div>
										<div className="flex items-center space-x-2">
											<Badge variant={flag.enabled ? "default" : "secondary"}>
												{flag.enabled ? "Enabled" : "Disabled"}
											</Badge>
											<div className="text-right text-sm">
												<p>Evaluations: {flag.metrics.evaluations}</p>
												<p>Enabled: {flag.metrics.enabled}</p>
											</div>
										</div>
									</div>
								))}
							</div>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="abtests" className="space-y-4">
					<Card>
						<CardHeader>
							<CardTitle>Active A/B Tests</CardTitle>
							<CardDescription>{data.abTests.metrics.runningTests} tests currently running</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								{data.abTests.metrics.activeTests.map((test, index) => (
									<div key={index} className="border rounded-lg p-4">
										<div className="flex items-center justify-between mb-2">
											<h4 className="font-semibold">{test.name}</h4>
											<Badge>{test.status}</Badge>
										</div>
										{test.results && (
											<div className="grid grid-cols-2 gap-4 text-sm">
												<div>
													<p className="font-medium">Control</p>
													<p>Sample Size: {test.results.control.sampleSize}</p>
												</div>
												<div>
													<p className="font-medium">Treatment</p>
													<p>Sample Size: {test.results.treatment.sampleSize}</p>
												</div>
											</div>
										)}
										{test.error && <p className="text-sm text-red-600">Error: {test.error}</p>}
									</div>
								))}
							</div>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="feedback" className="space-y-4">
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
						<Card>
							<CardHeader>
								<CardTitle className="text-sm">Total Feedback</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="text-2xl font-bold">{data.feedback.totalFeedback}</div>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="text-sm">Satisfaction Score</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="text-2xl font-bold">{data.feedback.satisfactionScore.toFixed(1)}/5</div>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="text-sm">By Type</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="space-y-1 text-sm">
									{Object.entries(data.feedback.byType).map(([type, count]) => (
										<div key={type} className="flex justify-between">
											<span>{type}</span>
											<span>{count}</span>
										</div>
									))}
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="text-sm">By Severity</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="space-y-1 text-sm">
									{Object.entries(data.feedback.bySeverity).map(([severity, count]) => (
										<div key={severity} className="flex justify-between">
											<span>{severity}</span>
											<span>{count}</span>
										</div>
									))}
								</div>
							</CardContent>
						</Card>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}
