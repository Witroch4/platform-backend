"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Activity, AlertTriangle, CheckCircle, Clock, Database, Server, Zap, XCircle } from "lucide-react";
import { QueueHealth, SystemMetrics } from "@/types/queue-management";

interface SystemOverviewProps {
	queues: QueueHealth[];
	systemMetrics: SystemMetrics;
	uptime: number;
	version: string;
	environment: string;
}

export function SystemOverview({ queues, systemMetrics, uptime, version, environment }: SystemOverviewProps) {
	// Calculate overall system health
	const calculateSystemHealth = () => {
		if (queues.length === 0) return { status: "warning" as const, score: 0 };

		const healthyQueues = queues.filter((q) => q.status === "healthy").length;
		const warningQueues = queues.filter((q) => q.status === "warning").length;
		const criticalQueues = queues.filter((q) => q.status === "critical").length;

		const score = (healthyQueues * 100 + warningQueues * 60) / queues.length;

		if (criticalQueues > 0) return { status: "critical" as const, score };
		if (warningQueues > 0) return { status: "warning" as const, score };
		return { status: "healthy" as const, score };
	};

	const systemHealth = calculateSystemHealth();

	const getStatusIcon = (status: string) => {
		switch (status) {
			case "healthy":
				return <CheckCircle className="h-4 w-4 text-green-600" />;
			case "warning":
				return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
			case "critical":
				return <XCircle className="h-4 w-4 text-red-600" />;
			default:
				return <Clock className="h-4 w-4 text-gray-600" />;
		}
	};

	const getStatusColor = (status: string) => {
		switch (status) {
			case "healthy":
				return "text-green-600";
			case "warning":
				return "text-yellow-600";
			case "critical":
				return "text-red-600";
			default:
				return "text-gray-600";
		}
	};

	const formatUptime = (seconds: number) => {
		const days = Math.floor(seconds / 86400);
		const hours = Math.floor((seconds % 86400) / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		return `${days}d ${hours}h ${minutes}m`;
	};

	const formatBytes = (bytes: number) => {
		const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
		if (bytes === 0) return "0 Bytes";
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i];
	};

	const totalJobs = queues.reduce(
		(sum, queue) =>
			sum +
			queue.counts.waiting +
			queue.counts.active +
			queue.counts.completed +
			queue.counts.failed +
			queue.counts.delayed,
		0,
	);

	const activeJobs = queues.reduce((sum, queue) => sum + queue.counts.active, 0);
	const failedJobs = queues.reduce((sum, queue) => sum + queue.counts.failed, 0);
	const avgThroughput = queues.reduce((sum, queue) => sum + queue.performance.throughput, 0) / queues.length || 0;

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
			{/* System Status */}
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="text-sm font-medium">System Status</CardTitle>
					{getStatusIcon(systemHealth.status)}
				</CardHeader>
				<CardContent>
					<div className="text-2xl font-bold">
						<span className={getStatusColor(systemHealth.status)}>{systemHealth.status.toUpperCase()}</span>
					</div>
					<p className="text-xs text-muted-foreground">Health Score: {systemHealth.score.toFixed(1)}%</p>
					<Progress value={systemHealth.score} className="mt-2" />
					<div className="mt-2 text-xs text-muted-foreground">{queues.length} queues monitored</div>
				</CardContent>
			</Card>

			{/* System Uptime */}
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="text-sm font-medium">System Uptime</CardTitle>
					<Clock className="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div className="text-2xl font-bold">{formatUptime(uptime)}</div>
					<p className="text-xs text-muted-foreground">Version: {version}</p>
					<div className="mt-2">
						<Badge variant="outline" className="text-xs">
							{environment}
						</Badge>
					</div>
				</CardContent>
			</Card>

			{/* Job Statistics */}
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="text-sm font-medium">Job Statistics</CardTitle>
					<Activity className="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div className="text-2xl font-bold">{totalJobs.toLocaleString()}</div>
					<p className="text-xs text-muted-foreground">Total jobs processed</p>
					<div className="mt-2 flex justify-between text-xs">
						<span className="text-blue-600">Active: {activeJobs}</span>
						<span className="text-red-600">Failed: {failedJobs}</span>
					</div>
				</CardContent>
			</Card>

			{/* Performance Metrics */}
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="text-sm font-medium">Performance</CardTitle>
					<Zap className="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div className="text-2xl font-bold">{avgThroughput.toFixed(1)}</div>
					<p className="text-xs text-muted-foreground">Jobs/min average</p>
					<div className="mt-2 text-xs text-muted-foreground">
						CPU: {systemMetrics.system.cpuUsage.toFixed(1)}% | RAM: {formatBytes(systemMetrics.system.memoryUsage)}
					</div>
				</CardContent>
			</Card>

			{/* System Resources */}
			<Card className="md:col-span-2 lg:col-span-4">
				<CardHeader>
					<CardTitle className="flex items-center">
						<Server className="h-5 w-5 mr-2" />
						System Resources
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
						{/* System Resources */}
						<div className="space-y-3">
							<h4 className="font-medium text-sm">System</h4>
							<div className="space-y-2">
								<div>
									<div className="flex justify-between text-sm">
										<span>CPU Usage</span>
										<span>{systemMetrics.system.cpuUsage.toFixed(1)}%</span>
									</div>
									<Progress value={systemMetrics.system.cpuUsage} className="h-2" />
								</div>
								<div>
									<div className="flex justify-between text-sm">
										<span>Memory</span>
										<span>{formatBytes(systemMetrics.system.memoryUsage)}</span>
									</div>
									<Progress
										value={(systemMetrics.system.memoryUsage / (8 * 1024 * 1024 * 1024)) * 100}
										className="h-2"
									/>
								</div>
								<div>
									<div className="flex justify-between text-sm">
										<span>Disk Usage</span>
										<span>{systemMetrics.system.diskUsage.toFixed(1)}%</span>
									</div>
									<Progress value={systemMetrics.system.diskUsage} className="h-2" />
								</div>
							</div>
						</div>

						{/* Redis Resources */}
						<div className="space-y-3">
							<h4 className="font-medium text-sm">Redis</h4>
							<div className="space-y-2">
								<div>
									<div className="flex justify-between text-sm">
										<span>Memory</span>
										<span>{formatBytes(systemMetrics.redis.memoryUsage)}</span>
									</div>
									<Progress
										value={(systemMetrics.redis.memoryUsage / (2 * 1024 * 1024 * 1024)) * 100}
										className="h-2"
									/>
								</div>
								<div>
									<div className="flex justify-between text-sm">
										<span>Connections</span>
										<span>{systemMetrics.redis.connections}</span>
									</div>
								</div>
								<div>
									<div className="flex justify-between text-sm">
										<span>Hit Rate</span>
										<span>{systemMetrics.redis.hitRate.toFixed(1)}%</span>
									</div>
									<Progress value={systemMetrics.redis.hitRate} className="h-2" />
								</div>
							</div>
						</div>

						{/* Database Resources */}
						<div className="space-y-3">
							<h4 className="font-medium text-sm">Database</h4>
							<div className="space-y-2">
								<div>
									<div className="flex justify-between text-sm">
										<span>Connections</span>
										<span>{systemMetrics.database.connections}</span>
									</div>
								</div>
								<div>
									<div className="flex justify-between text-sm">
										<span>Avg Query Time</span>
										<span>{systemMetrics.database.queryTime.toFixed(2)}ms</span>
									</div>
								</div>
								<div>
									<div className="flex justify-between text-sm">
										<span>Slow Queries</span>
										<span className={systemMetrics.database.slowQueries > 0 ? "text-red-600" : "text-green-600"}>
											{systemMetrics.database.slowQueries}
										</span>
									</div>
								</div>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
