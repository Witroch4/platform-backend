"use client";

import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
	Activity,
	AlertTriangle,
	BarChart3,
	Clock,
	Database,
	RefreshCw,
	Server,
	TrendingDown,
	TrendingUp,
	Zap,
} from "lucide-react";
import { QueueMetrics, SystemMetrics, TimeRange } from "@/types/queue-management";
import { MetricsChart } from "./MetricsChart";

interface PerformanceDashboardProps {
	queueMetrics: QueueMetrics[];
	systemMetrics: SystemMetrics[];
	timeRange: TimeRange;
	onTimeRangeChange: (range: TimeRange) => void;
	onRefresh: () => void;
}

export function PerformanceDashboard({
	queueMetrics,
	systemMetrics,
	timeRange,
	onTimeRangeChange,
	onRefresh,
}: PerformanceDashboardProps) {
	const [selectedQueue, setSelectedQueue] = useState<string>("all");
	const [selectedMetric, setSelectedMetric] = useState<"throughput" | "latency" | "reliability" | "resources">(
		"throughput",
	);
	const [refreshing, setRefreshing] = useState(false);

	// Get unique queue names
	const queueNames = useMemo(() => {
		const names = Array.from(new Set(queueMetrics.map((m) => m.queueName)));
		return ["all", ...names];
	}, [queueMetrics]);

	// Filter metrics by selected queue
	const filteredMetrics = useMemo(() => {
		if (selectedQueue === "all") return queueMetrics;
		return queueMetrics.filter((m) => m.queueName === selectedQueue);
	}, [queueMetrics, selectedQueue]);

	// Calculate aggregate performance metrics
	const performanceOverview = useMemo(() => {
		if (filteredMetrics.length === 0) {
			return {
				avgThroughput: 0,
				avgLatency: 0,
				successRate: 0,
				errorRate: 0,
				totalJobs: 0,
				peakThroughput: 0,
				trends: {
					throughput: 0,
					latency: 0,
					successRate: 0,
					errorRate: 0,
				},
			};
		}

		const latest = filteredMetrics.slice(-10); // Last 10 data points
		const previous = filteredMetrics.slice(-20, -10); // Previous 10 data points

		const avgThroughput = latest.reduce((sum, m) => sum + m.throughput.jobsPerMinute, 0) / latest.length;
		const avgLatency = latest.reduce((sum, m) => sum + m.latency.p50, 0) / latest.length;
		const successRate = latest.reduce((sum, m) => sum + m.reliability.successRate, 0) / latest.length;
		const errorRate = latest.reduce((sum, m) => sum + m.reliability.errorRate, 0) / latest.length;
		const totalJobs = latest.reduce((sum, m) => sum + m.throughput.jobsPerDay, 0);
		const peakThroughput = Math.max(...filteredMetrics.map((m) => m.throughput.jobsPerMinute));

		// Calculate trends
		const prevAvgThroughput =
			previous.length > 0
				? previous.reduce((sum, m) => sum + m.throughput.jobsPerMinute, 0) / previous.length
				: avgThroughput;
		const prevAvgLatency =
			previous.length > 0 ? previous.reduce((sum, m) => sum + m.latency.p50, 0) / previous.length : avgLatency;
		const prevSuccessRate =
			previous.length > 0
				? previous.reduce((sum, m) => sum + m.reliability.successRate, 0) / previous.length
				: successRate;
		const prevErrorRate =
			previous.length > 0 ? previous.reduce((sum, m) => sum + m.reliability.errorRate, 0) / previous.length : errorRate;

		const trends = {
			throughput: prevAvgThroughput > 0 ? ((avgThroughput - prevAvgThroughput) / prevAvgThroughput) * 100 : 0,
			latency: prevAvgLatency > 0 ? ((avgLatency - prevAvgLatency) / prevAvgLatency) * 100 : 0,
			successRate: prevSuccessRate > 0 ? ((successRate - prevSuccessRate) / prevSuccessRate) * 100 : 0,
			errorRate: prevErrorRate > 0 ? ((errorRate - prevErrorRate) / prevErrorRate) * 100 : 0,
		};

		return {
			avgThroughput,
			avgLatency,
			successRate,
			errorRate,
			totalJobs,
			peakThroughput,
			trends,
		};
	}, [filteredMetrics]);

	// Calculate system resource utilization
	const systemOverview = useMemo(() => {
		if (systemMetrics.length === 0) {
			return {
				avgCpuUsage: 0,
				avgMemoryUsage: 0,
				avgDiskUsage: 0,
				redisMemory: 0,
				redisConnections: 0,
				dbConnections: 0,
				dbQueryTime: 0,
			};
		}

		const latest = systemMetrics.slice(-10);

		return {
			avgCpuUsage: latest.reduce((sum, m) => sum + m.system.cpuUsage, 0) / latest.length,
			avgMemoryUsage: latest.reduce((sum, m) => sum + m.system.memoryUsage, 0) / latest.length,
			avgDiskUsage: latest.reduce((sum, m) => sum + m.system.diskUsage, 0) / latest.length,
			redisMemory: latest[latest.length - 1]?.redis.memoryUsage || 0,
			redisConnections: latest[latest.length - 1]?.redis.connections || 0,
			dbConnections: latest[latest.length - 1]?.database.connections || 0,
			dbQueryTime: latest.reduce((sum, m) => sum + m.database.queryTime, 0) / latest.length,
		};
	}, [systemMetrics]);

	const handleRefresh = async () => {
		setRefreshing(true);
		await onRefresh();
		setTimeout(() => setRefreshing(false), 1000);
	};

	const getTrendIcon = (trend: number) => {
		if (Math.abs(trend) < 1) return null;
		return trend > 0 ? (
			<TrendingUp className="h-4 w-4 text-green-600" />
		) : (
			<TrendingDown className="h-4 w-4 text-red-600" />
		);
	};

	const getTrendColor = (trend: number, inverse = false) => {
		if (Math.abs(trend) < 1) return "text-muted-foreground";
		const isPositive = inverse ? trend < 0 : trend > 0;
		return isPositive ? "text-green-600" : "text-red-600";
	};

	const formatBytes = (bytes: number) => {
		const sizes = ["B", "KB", "MB", "GB"];
		if (bytes === 0) return "0 B";
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i];
	};

	const formatDuration = (ms: number) => {
		if (ms < 1000) return `${Math.round(ms)}ms`;
		if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
		return `${(ms / 60000).toFixed(1)}m`;
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold">Performance Dashboard</h1>
					<p className="text-muted-foreground">Comprehensive performance metrics and system analytics</p>
				</div>
				<div className="flex items-center space-x-2">
					<Select value={selectedQueue} onValueChange={setSelectedQueue}>
						<SelectTrigger className="w-48">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{queueNames.map((name) => (
								<SelectItem key={name} value={name}>
									{name === "all" ? "All Queues" : name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
						<RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
						Refresh
					</Button>
				</div>
			</div>

			{/* Performance Overview */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium flex items-center">
							<Zap className="h-4 w-4 mr-2" />
							Avg Throughput
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{performanceOverview.avgThroughput.toFixed(1)}</div>
						<div className="flex items-center text-xs mt-1">
							{getTrendIcon(performanceOverview.trends.throughput)}
							<span className={getTrendColor(performanceOverview.trends.throughput)}>
								{Math.abs(performanceOverview.trends.throughput).toFixed(1)}% jobs/min
							</span>
						</div>
						<div className="text-xs text-muted-foreground mt-1">
							Peak: {performanceOverview.peakThroughput.toFixed(1)} jobs/min
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium flex items-center">
							<Clock className="h-4 w-4 mr-2" />
							Avg Latency
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{formatDuration(performanceOverview.avgLatency)}</div>
						<div className="flex items-center text-xs mt-1">
							{getTrendIcon(performanceOverview.trends.latency)}
							<span className={getTrendColor(performanceOverview.trends.latency, true)}>
								{Math.abs(performanceOverview.trends.latency).toFixed(1)}%
							</span>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium flex items-center">
							<Activity className="h-4 w-4 mr-2" />
							Success Rate
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold text-green-600">{performanceOverview.successRate.toFixed(1)}%</div>
						<div className="flex items-center text-xs mt-1">
							{getTrendIcon(performanceOverview.trends.successRate)}
							<span className={getTrendColor(performanceOverview.trends.successRate)}>
								{Math.abs(performanceOverview.trends.successRate).toFixed(1)}%
							</span>
						</div>
						<Progress value={performanceOverview.successRate} className="mt-2 h-2" />
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium flex items-center">
							<AlertTriangle className="h-4 w-4 mr-2" />
							Error Rate
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold text-red-600">{performanceOverview.errorRate.toFixed(1)}%</div>
						<div className="flex items-center text-xs mt-1">
							{getTrendIcon(performanceOverview.trends.errorRate)}
							<span className={getTrendColor(performanceOverview.trends.errorRate, true)}>
								{Math.abs(performanceOverview.trends.errorRate).toFixed(1)}%
							</span>
						</div>
						<Progress value={performanceOverview.errorRate} className="mt-2 h-2" />
					</CardContent>
				</Card>
			</div>

			{/* System Resources */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center">
						<Server className="h-5 w-5 mr-2" />
						System Resources
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
						{/* System Resources */}
						<div className="space-y-4">
							<h4 className="font-medium">System</h4>
							<div className="space-y-3">
								<div>
									<div className="flex justify-between text-sm mb-1">
										<span>CPU Usage</span>
										<span>{systemOverview.avgCpuUsage.toFixed(1)}%</span>
									</div>
									<Progress value={systemOverview.avgCpuUsage} className="h-2" />
								</div>
								<div>
									<div className="flex justify-between text-sm mb-1">
										<span>Memory</span>
										<span>{formatBytes(systemOverview.avgMemoryUsage)}</span>
									</div>
									<Progress value={(systemOverview.avgMemoryUsage / (8 * 1024 * 1024 * 1024)) * 100} className="h-2" />
								</div>
								<div>
									<div className="flex justify-between text-sm mb-1">
										<span>Disk Usage</span>
										<span>{systemOverview.avgDiskUsage.toFixed(1)}%</span>
									</div>
									<Progress value={systemOverview.avgDiskUsage} className="h-2" />
								</div>
							</div>
						</div>

						{/* Redis Resources */}
						<div className="space-y-4">
							<h4 className="font-medium">Redis</h4>
							<div className="space-y-3">
								<div>
									<div className="flex justify-between text-sm mb-1">
										<span>Memory Usage</span>
										<span>{formatBytes(systemOverview.redisMemory)}</span>
									</div>
									<Progress value={(systemOverview.redisMemory / (2 * 1024 * 1024 * 1024)) * 100} className="h-2" />
								</div>
								<div className="flex justify-between text-sm">
									<span>Connections</span>
									<span>{systemOverview.redisConnections}</span>
								</div>
							</div>
						</div>

						{/* Database Resources */}
						<div className="space-y-4">
							<h4 className="font-medium">Database</h4>
							<div className="space-y-3">
								<div className="flex justify-between text-sm">
									<span>Connections</span>
									<span>{systemOverview.dbConnections}</span>
								</div>
								<div className="flex justify-between text-sm">
									<span>Avg Query Time</span>
									<span>{systemOverview.dbQueryTime.toFixed(2)}ms</span>
								</div>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Performance Charts */}
			<Tabs value={selectedMetric} onValueChange={(value: any) => setSelectedMetric(value)}>
				<TabsList className="grid w-full grid-cols-4">
					<TabsTrigger value="throughput">Throughput</TabsTrigger>
					<TabsTrigger value="latency">Latency</TabsTrigger>
					<TabsTrigger value="reliability">Reliability</TabsTrigger>
					<TabsTrigger value="resources">Resources</TabsTrigger>
				</TabsList>

				<TabsContent value="throughput" className="space-y-4">
					<MetricsChart
						data={filteredMetrics}
						title="Throughput Metrics"
						metric="throughput"
						timeRange={timeRange}
						showComparison={true}
						onExport={(format) => console.log("Export throughput as", format)}
					/>
				</TabsContent>

				<TabsContent value="latency" className="space-y-4">
					<MetricsChart
						data={filteredMetrics}
						title="Latency Metrics"
						metric="latency"
						timeRange={timeRange}
						showComparison={true}
						onExport={(format) => console.log("Export latency as", format)}
					/>
				</TabsContent>

				<TabsContent value="reliability" className="space-y-4">
					<MetricsChart
						data={filteredMetrics}
						title="Reliability Metrics"
						metric="reliability"
						timeRange={timeRange}
						showComparison={true}
						onExport={(format) => console.log("Export reliability as", format)}
					/>
				</TabsContent>

				<TabsContent value="resources" className="space-y-4">
					<MetricsChart
						data={filteredMetrics}
						title="Resource Usage Metrics"
						metric="resources"
						timeRange={timeRange}
						showComparison={true}
						onExport={(format) => console.log("Export resources as", format)}
					/>
				</TabsContent>
			</Tabs>

			{/* Performance Insights */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center">
						<BarChart3 className="h-5 w-5 mr-2" />
						Performance Insights
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
						<div>
							<h4 className="font-medium mb-3">Key Metrics</h4>
							<div className="space-y-2 text-sm">
								<div className="flex justify-between">
									<span>Total Jobs Processed</span>
									<span className="font-medium">{performanceOverview.totalJobs.toLocaleString()}</span>
								</div>
								<div className="flex justify-between">
									<span>Peak Throughput</span>
									<span className="font-medium">{performanceOverview.peakThroughput.toFixed(1)} jobs/min</span>
								</div>
								<div className="flex justify-between">
									<span>Average Processing Time</span>
									<span className="font-medium">{formatDuration(performanceOverview.avgLatency)}</span>
								</div>
								<div className="flex justify-between">
									<span>System Efficiency</span>
									<span
										className={`font-medium ${
											performanceOverview.successRate >= 95
												? "text-green-600"
												: performanceOverview.successRate >= 90
													? "text-yellow-600"
													: "text-red-600"
										}`}
									>
										{performanceOverview.successRate >= 95
											? "Excellent"
											: performanceOverview.successRate >= 90
												? "Good"
												: "Needs Attention"}
									</span>
								</div>
							</div>
						</div>

						<div>
							<h4 className="font-medium mb-3">Recommendations</h4>
							<div className="space-y-2 text-sm">
								{performanceOverview.errorRate > 5 && (
									<div className="flex items-start space-x-2 p-2 bg-red-50 border border-red-200 rounded">
										<AlertTriangle className="h-4 w-4 text-red-600 mt-0.5" />
										<span className="text-red-800">High error rate detected. Consider investigating failed jobs.</span>
									</div>
								)}

								{performanceOverview.avgLatency > 5000 && (
									<div className="flex items-start space-x-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
										<Clock className="h-4 w-4 text-yellow-600 mt-0.5" />
										<span className="text-yellow-800">High latency detected. Consider optimizing job processing.</span>
									</div>
								)}

								{systemOverview.avgCpuUsage > 80 && (
									<div className="flex items-start space-x-2 p-2 bg-orange-50 border border-orange-200 rounded">
										<Server className="h-4 w-4 text-orange-600 mt-0.5" />
										<span className="text-orange-800">High CPU usage. Consider scaling resources.</span>
									</div>
								)}

								{performanceOverview.successRate >= 95 && performanceOverview.errorRate < 2 && (
									<div className="flex items-start space-x-2 p-2 bg-green-50 border border-green-200 rounded">
										<Activity className="h-4 w-4 text-green-600 mt-0.5" />
										<span className="text-green-800">System is performing optimally.</span>
									</div>
								)}
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
