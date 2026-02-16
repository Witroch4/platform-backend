/**
 * AI Monitoring Dashboard Component
 * Based on requirements 10.3, 10.4, 11.2
 */

"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Alert, AlertDescription } from "../ui/alert";
import { Loader2, AlertTriangle, CheckCircle, XCircle } from "lucide-react";

interface DashboardData {
	overview: {
		totalJobs: number;
		successRate: number;
		errorRate: number;
		avgLatency: number;
		activeWorkers: number;
	};
	latency: {
		p50: number;
		p95: number;
		p99: number;
		byStage: Record<string, number>;
	};
	fallbacks: {
		total: number;
		rate: number;
		byReason: Record<string, number>;
	};
	dlq: {
		total: number;
		byReason: Record<string, number>;
		recentErrors: Array<{
			timestamp: string;
			reason: string;
			jobId: string;
			accountId?: number;
		}>;
	};
	rateLimits: {
		total: number;
		byScope: Record<string, number>;
		recentHits: Array<{
			timestamp: string;
			scope: string;
			accountId?: number;
		}>;
	};
	tokens: {
		totalToday: number;
		byModel: Record<string, number>;
		byAccount: Record<string, number>;
		costUsd: number;
	};
	queues: {
		[queueName: string]: {
			waiting: number;
			active: number;
			completed: number;
			failed: number;
			lag: number;
		};
	};
	alerts: Array<{
		level: "warning" | "critical";
		message: string;
		timestamp: string;
		metric: string;
		value: number;
		threshold: number;
	}>;
}

export default function AIMonitoringDashboard() {
	const [data, setData] = useState<DashboardData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

	const fetchDashboardData = async () => {
		try {
			const response = await fetch("/api/admin/metrics/dashboard", {
				headers: {
					Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_TOKEN || ""}`,
				},
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const dashboardData = await response.json();
			setData(dashboardData);
			setLastUpdated(new Date());
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to fetch dashboard data");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchDashboardData();

		// Auto-refresh every 30 seconds
		const interval = setInterval(fetchDashboardData, 30000);
		return () => clearInterval(interval);
	}, []);

	const formatNumber = (num: number): string => {
		if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
		if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
		return num.toString();
	};

	const formatPercentage = (num: number): string => {
		return `${(num * 100).toFixed(1)}%`;
	};

	const formatLatency = (ms: number): string => {
		if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
		return `${Math.round(ms)}ms`;
	};

	const getStatusColor = (value: number, thresholds: { warning: number; critical: number }): string => {
		if (value >= thresholds.critical) return "text-red-600";
		if (value >= thresholds.warning) return "text-yellow-600";
		return "text-green-600";
	};

	const getStatusIcon = (value: number, thresholds: { warning: number; critical: number }) => {
		if (value >= thresholds.critical) return <XCircle className="h-4 w-4 text-red-600" />;
		if (value >= thresholds.warning) return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
		return <CheckCircle className="h-4 w-4 text-green-600" />;
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center p-8">
				<Loader2 className="h-8 w-8 animate-spin" />
				<span className="ml-2">Loading dashboard...</span>
			</div>
		);
	}

	if (error) {
		return (
			<Alert className="m-4">
				<AlertTriangle className="h-4 w-4" />
				<AlertDescription>
					Failed to load dashboard: {error}
					<button onClick={fetchDashboardData} className="ml-2 text-blue-600 hover:underline">
						Retry
					</button>
				</AlertDescription>
			</Alert>
		);
	}

	if (!data) return null;

	return (
		<div className="p-6 space-y-6">
			{/* Header */}
			<div className="flex justify-between items-center">
				<h1 className="text-3xl font-bold">AI Integration Monitoring</h1>
				<div className="text-sm text-gray-500">Last updated: {lastUpdated?.toLocaleTimeString()}</div>
			</div>

			{/* Alerts */}
			{data.alerts.length > 0 && (
				<div className="space-y-2">
					<h2 className="text-xl font-semibold">Active Alerts</h2>
					{data.alerts.map((alert, index) => (
						<Alert key={index} className={alert.level === "critical" ? "border-red-500" : "border-yellow-500"}>
							<AlertTriangle className="h-4 w-4" />
							<AlertDescription>
								<div className="flex justify-between items-center">
									<span>{alert.message}</span>
									<Badge variant={alert.level === "critical" ? "destructive" : "secondary"}>{alert.level}</Badge>
								</div>
							</AlertDescription>
						</Alert>
					))}
				</div>
			)}

			{/* Overview Cards */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{formatNumber(data.overview.totalJobs)}</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium">Success Rate</CardTitle>
					</CardHeader>
					<CardContent>
						<div
							className={`text-2xl font-bold ${getStatusColor(1 - data.overview.successRate, { warning: 0.05, critical: 0.1 })}`}
						>
							{formatPercentage(data.overview.successRate)}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium">Avg Latency</CardTitle>
					</CardHeader>
					<CardContent>
						<div
							className={`text-2xl font-bold ${getStatusColor(data.overview.avgLatency, { warning: 2500, critical: 5000 })}`}
						>
							{formatLatency(data.overview.avgLatency)}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium">Active Workers</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold flex items-center">
							{data.overview.activeWorkers}
							{getStatusIcon(data.overview.activeWorkers === 0 ? 1 : 0, { warning: 0.5, critical: 1 })}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium">Fallback Rate</CardTitle>
					</CardHeader>
					<CardContent>
						<div
							className={`text-2xl font-bold ${getStatusColor(data.fallbacks.rate, { warning: 0.1, critical: 0.2 })}`}
						>
							{formatPercentage(data.fallbacks.rate)}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Latency Metrics */}
			<Card>
				<CardHeader>
					<CardTitle>Latency Metrics</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						<div>
							<div className="text-sm text-gray-500">P50</div>
							<div className="text-xl font-bold">{formatLatency(data.latency.p50)}</div>
						</div>
						<div>
							<div className="text-sm text-gray-500">P95</div>
							<div
								className={`text-xl font-bold ${getStatusColor(data.latency.p95, { warning: 2500, critical: 5000 })}`}
							>
								{formatLatency(data.latency.p95)}
							</div>
						</div>
						<div>
							<div className="text-sm text-gray-500">P99</div>
							<div
								className={`text-xl font-bold ${getStatusColor(data.latency.p99, { warning: 5000, critical: 10000 })}`}
							>
								{formatLatency(data.latency.p99)}
							</div>
						</div>
					</div>

					<div className="mt-4">
						<div className="text-sm text-gray-500 mb-2">By Stage</div>
						<div className="space-y-1">
							{Object.entries(data.latency.byStage).map(([stage, latency]) => (
								<div key={stage} className="flex justify-between">
									<span className="capitalize">{stage}</span>
									<span className="font-mono">{formatLatency(latency)}</span>
								</div>
							))}
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Queue Status */}
			<Card>
				<CardHeader>
					<CardTitle>Queue Status</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						{Object.entries(data.queues).map(([queueName, stats]) => (
							<div key={queueName} className="border rounded p-3">
								<div className="font-medium mb-2">{queueName}</div>
								<div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
									<div>
										<span className="text-gray-500">Waiting:</span>
										<span className={`ml-1 font-mono ${getStatusColor(stats.waiting, { warning: 50, critical: 100 })}`}>
											{stats.waiting}
										</span>
									</div>
									<div>
										<span className="text-gray-500">Active:</span>
										<span className="ml-1 font-mono">{stats.active}</span>
									</div>
									<div>
										<span className="text-gray-500">Completed:</span>
										<span className="ml-1 font-mono">{stats.completed}</span>
									</div>
									<div>
										<span className="text-gray-500">Failed:</span>
										<span className="ml-1 font-mono text-red-600">{stats.failed}</span>
									</div>
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>

			{/* Token Usage */}
			<Card>
				<CardHeader>
					<CardTitle>Token Usage & Cost</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
						<div>
							<div className="text-sm text-gray-500 mb-2">Total Today</div>
							<div className="text-2xl font-bold">{formatNumber(data.tokens.totalToday)}</div>
							<div className="text-sm text-gray-500 mt-1">Cost: ${data.tokens.costUsd.toFixed(4)}</div>
						</div>

						<div>
							<div className="text-sm text-gray-500 mb-2">By Model</div>
							<div className="space-y-1">
								{Object.entries(data.tokens.byModel).map(([model, tokens]) => (
									<div key={model} className="flex justify-between text-sm">
										<span>{model}</span>
										<span className="font-mono">{formatNumber(tokens)}</span>
									</div>
								))}
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Recent Errors */}
			{data.dlq.recentErrors.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Recent Errors</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							{data.dlq.recentErrors.slice(0, 5).map((error, index) => (
								<div key={index} className="border-l-4 border-red-500 pl-3 py-1">
									<div className="text-sm font-medium">{error.reason}</div>
									<div className="text-xs text-gray-500">
										{new Date(error.timestamp).toLocaleString()} • Job: {error.jobId}
										{error.accountId && ` • Account: ${error.accountId}`}
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
