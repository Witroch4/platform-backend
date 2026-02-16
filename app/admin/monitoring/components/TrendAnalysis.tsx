"use client";

import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
	AlertTriangle,
	BarChart3,
	Calendar,
	TrendingDown,
	TrendingUp,
	Target,
	Zap,
	Clock,
	Activity,
} from "lucide-react";
import { QueueMetrics, TimeRange } from "@/types/queue-management";

interface TrendAnalysisProps {
	queueMetrics: QueueMetrics[];
	timeRange: TimeRange;
	onComparisonPeriodChange?: (period: "previous" | "lastWeek" | "lastMonth") => void;
}

interface TrendData {
	metric: string;
	current: number;
	previous: number;
	change: number;
	changePercent: number;
	trend: "up" | "down" | "stable";
	status: "good" | "warning" | "critical";
	unit: string;
}

interface SeasonalPattern {
	period: "hourly" | "daily" | "weekly";
	pattern: { label: string; value: number; peak: boolean }[];
	confidence: number;
}

export function TrendAnalysis({ queueMetrics, timeRange, onComparisonPeriodChange }: TrendAnalysisProps) {
	const [selectedMetric, setSelectedMetric] = useState<"throughput" | "latency" | "reliability">("throughput");
	const [comparisonPeriod, setComparisonPeriod] = useState<"previous" | "lastWeek" | "lastMonth">("previous");
	const [selectedQueue, setSelectedQueue] = useState<string>("all");

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

	// Calculate trend data
	const trendData = useMemo(() => {
		if (filteredMetrics.length < 2) return [];

		const midpoint = Math.floor(filteredMetrics.length / 2);
		const currentPeriod = filteredMetrics.slice(midpoint);
		const previousPeriod = filteredMetrics.slice(0, midpoint);

		if (currentPeriod.length === 0 || previousPeriod.length === 0) return [];

		const calculateAverage = (metrics: QueueMetrics[], accessor: (m: QueueMetrics) => number) => {
			return metrics.reduce((sum, m) => sum + accessor(m), 0) / metrics.length;
		};

		const trends: TrendData[] = [];

		// Throughput trends
		const currentThroughput = calculateAverage(currentPeriod, (m) => m.throughput.jobsPerMinute);
		const previousThroughput = calculateAverage(previousPeriod, (m) => m.throughput.jobsPerMinute);
		const throughputChange = currentThroughput - previousThroughput;
		const throughputChangePercent = previousThroughput > 0 ? (throughputChange / previousThroughput) * 100 : 0;

		trends.push({
			metric: "Throughput",
			current: currentThroughput,
			previous: previousThroughput,
			change: throughputChange,
			changePercent: throughputChangePercent,
			trend: Math.abs(throughputChangePercent) < 5 ? "stable" : throughputChangePercent > 0 ? "up" : "down",
			status: throughputChangePercent > 10 ? "good" : throughputChangePercent < -10 ? "critical" : "warning",
			unit: "jobs/min",
		});

		// Latency trends
		const currentLatency = calculateAverage(currentPeriod, (m) => m.latency.p50);
		const previousLatency = calculateAverage(previousPeriod, (m) => m.latency.p50);
		const latencyChange = currentLatency - previousLatency;
		const latencyChangePercent = previousLatency > 0 ? (latencyChange / previousLatency) * 100 : 0;

		trends.push({
			metric: "P50 Latency",
			current: currentLatency,
			previous: previousLatency,
			change: latencyChange,
			changePercent: latencyChangePercent,
			trend: Math.abs(latencyChangePercent) < 5 ? "stable" : latencyChangePercent > 0 ? "up" : "down",
			status: latencyChangePercent < -10 ? "good" : latencyChangePercent > 20 ? "critical" : "warning",
			unit: "ms",
		});

		// P95 Latency trends
		const currentP95 = calculateAverage(currentPeriod, (m) => m.latency.p95);
		const previousP95 = calculateAverage(previousPeriod, (m) => m.latency.p95);
		const p95Change = currentP95 - previousP95;
		const p95ChangePercent = previousP95 > 0 ? (p95Change / previousP95) * 100 : 0;

		trends.push({
			metric: "P95 Latency",
			current: currentP95,
			previous: previousP95,
			change: p95Change,
			changePercent: p95ChangePercent,
			trend: Math.abs(p95ChangePercent) < 5 ? "stable" : p95ChangePercent > 0 ? "up" : "down",
			status: p95ChangePercent < -10 ? "good" : p95ChangePercent > 25 ? "critical" : "warning",
			unit: "ms",
		});

		// Success rate trends
		const currentSuccessRate = calculateAverage(currentPeriod, (m) => m.reliability.successRate);
		const previousSuccessRate = calculateAverage(previousPeriod, (m) => m.reliability.successRate);
		const successRateChange = currentSuccessRate - previousSuccessRate;
		const successRateChangePercent = previousSuccessRate > 0 ? (successRateChange / previousSuccessRate) * 100 : 0;

		trends.push({
			metric: "Success Rate",
			current: currentSuccessRate,
			previous: previousSuccessRate,
			change: successRateChange,
			changePercent: successRateChangePercent,
			trend: Math.abs(successRateChangePercent) < 1 ? "stable" : successRateChangePercent > 0 ? "up" : "down",
			status: successRateChangePercent > 1 ? "good" : successRateChangePercent < -2 ? "critical" : "warning",
			unit: "%",
		});

		// Error rate trends
		const currentErrorRate = calculateAverage(currentPeriod, (m) => m.reliability.errorRate);
		const previousErrorRate = calculateAverage(previousPeriod, (m) => m.reliability.errorRate);
		const errorRateChange = currentErrorRate - previousErrorRate;
		const errorRateChangePercent = previousErrorRate > 0 ? (errorRateChange / previousErrorRate) * 100 : 0;

		trends.push({
			metric: "Error Rate",
			current: currentErrorRate,
			previous: previousErrorRate,
			change: errorRateChange,
			changePercent: errorRateChangePercent,
			trend: Math.abs(errorRateChangePercent) < 5 ? "stable" : errorRateChangePercent > 0 ? "up" : "down",
			status: errorRateChangePercent < -10 ? "good" : errorRateChangePercent > 20 ? "critical" : "warning",
			unit: "%",
		});

		return trends;
	}, [filteredMetrics]);

	// Detect seasonal patterns
	const seasonalPatterns = useMemo(() => {
		if (filteredMetrics.length < 24) return []; // Need at least 24 data points

		const patterns: SeasonalPattern[] = [];

		// Hourly pattern (if we have enough data)
		if (filteredMetrics.length >= 24) {
			const hourlyData = new Array(24).fill(0).map(() => ({ sum: 0, count: 0 }));

			filteredMetrics.forEach((metric) => {
				const hour = metric.timestamp.getHours();
				hourlyData[hour].sum += metric.throughput.jobsPerMinute;
				hourlyData[hour].count += 1;
			});

			const hourlyPattern = hourlyData.map((data, hour) => ({
				label: `${hour}:00`,
				value: data.count > 0 ? data.sum / data.count : 0,
				peak: false,
			}));

			// Identify peaks (values significantly above average)
			const avgValue = hourlyPattern.reduce((sum, p) => sum + p.value, 0) / hourlyPattern.length;
			const threshold = avgValue * 1.5;
			hourlyPattern.forEach((p) => {
				p.peak = p.value > threshold;
			});

			patterns.push({
				period: "hourly",
				pattern: hourlyPattern,
				confidence: Math.min(filteredMetrics.length / 168, 1), // Confidence based on data completeness
			});
		}

		// Daily pattern (if we have enough data)
		if (filteredMetrics.length >= 7) {
			const dailyData = new Array(7).fill(0).map(() => ({ sum: 0, count: 0 }));

			filteredMetrics.forEach((metric) => {
				const day = metric.timestamp.getDay();
				dailyData[day].sum += metric.throughput.jobsPerMinute;
				dailyData[day].count += 1;
			});

			const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
			const dailyPattern = dailyData.map((data, day) => ({
				label: dayNames[day],
				value: data.count > 0 ? data.sum / data.count : 0,
				peak: false,
			}));

			const avgValue = dailyPattern.reduce((sum, p) => sum + p.value, 0) / dailyPattern.length;
			const threshold = avgValue * 1.3;
			dailyPattern.forEach((p) => {
				p.peak = p.value > threshold;
			});

			patterns.push({
				period: "daily",
				pattern: dailyPattern,
				confidence: Math.min(filteredMetrics.length / 168, 1),
			});
		}

		return patterns;
	}, [filteredMetrics]);

	// Anomaly detection
	const anomalies = useMemo(() => {
		if (filteredMetrics.length < 10) return [];

		const anomalies: {
			timestamp: Date;
			metric: string;
			value: number;
			expected: number;
			severity: "low" | "medium" | "high";
		}[] = [];

		// Simple anomaly detection using moving average and standard deviation
		const windowSize = Math.min(10, Math.floor(filteredMetrics.length / 3));

		for (let i = windowSize; i < filteredMetrics.length; i++) {
			const window = filteredMetrics.slice(i - windowSize, i);
			const current = filteredMetrics[i];

			// Check throughput anomalies
			const avgThroughput = window.reduce((sum, m) => sum + m.throughput.jobsPerMinute, 0) / window.length;
			const stdThroughput = Math.sqrt(
				window.reduce((sum, m) => sum + Math.pow(m.throughput.jobsPerMinute - avgThroughput, 2), 0) / window.length,
			);

			const throughputDeviation = Math.abs(current.throughput.jobsPerMinute - avgThroughput) / (stdThroughput || 1);
			if (throughputDeviation > 2) {
				anomalies.push({
					timestamp: current.timestamp,
					metric: "Throughput",
					value: current.throughput.jobsPerMinute,
					expected: avgThroughput,
					severity: throughputDeviation > 3 ? "high" : throughputDeviation > 2.5 ? "medium" : "low",
				});
			}

			// Check latency anomalies
			const avgLatency = window.reduce((sum, m) => sum + m.latency.p95, 0) / window.length;
			const stdLatency = Math.sqrt(
				window.reduce((sum, m) => sum + Math.pow(m.latency.p95 - avgLatency, 2), 0) / window.length,
			);

			const latencyDeviation = Math.abs(current.latency.p95 - avgLatency) / (stdLatency || 1);
			if (latencyDeviation > 2) {
				anomalies.push({
					timestamp: current.timestamp,
					metric: "P95 Latency",
					value: current.latency.p95,
					expected: avgLatency,
					severity: latencyDeviation > 3 ? "high" : latencyDeviation > 2.5 ? "medium" : "low",
				});
			}
		}

		return anomalies.slice(-10); // Return last 10 anomalies
	}, [filteredMetrics]);

	const getTrendIcon = (trend: "up" | "down" | "stable") => {
		switch (trend) {
			case "up":
				return <TrendingUp className="h-4 w-4" />;
			case "down":
				return <TrendingDown className="h-4 w-4" />;
			case "stable":
				return <Target className="h-4 w-4" />;
		}
	};

	const getTrendColor = (status: "good" | "warning" | "critical") => {
		switch (status) {
			case "good":
				return "text-green-600";
			case "warning":
				return "text-yellow-600";
			case "critical":
				return "text-red-600";
		}
	};

	const getStatusBadgeVariant = (status: "good" | "warning" | "critical") => {
		switch (status) {
			case "good":
				return "default" as const;
			case "warning":
				return "secondary" as const;
			case "critical":
				return "destructive" as const;
		}
	};

	const formatValue = (value: number, unit: string) => {
		if (unit === "ms") {
			if (value < 1000) return `${Math.round(value)}ms`;
			return `${(value / 1000).toFixed(1)}s`;
		}
		if (unit === "%") return `${value.toFixed(1)}%`;
		return `${value.toFixed(1)} ${unit}`;
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold">Trend Analysis</h1>
					<p className="text-muted-foreground">Performance trends, patterns, and anomaly detection</p>
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

					<Select
						value={comparisonPeriod}
						onValueChange={(value: any) => {
							setComparisonPeriod(value);
							onComparisonPeriodChange?.(value);
						}}
					>
						<SelectTrigger className="w-32">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="previous">Previous</SelectItem>
							<SelectItem value="lastWeek">Last Week</SelectItem>
							<SelectItem value="lastMonth">Last Month</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Trend Overview */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{trendData.map((trend) => (
					<Card key={trend.metric}>
						<CardHeader className="pb-2">
							<CardTitle className="text-sm font-medium flex items-center justify-between">
								<span>{trend.metric}</span>
								<div className={`flex items-center ${getTrendColor(trend.status)}`}>
									{getTrendIcon(trend.trend)}
									<Badge variant={getStatusBadgeVariant(trend.status)} className="ml-2">
										{trend.status}
									</Badge>
								</div>
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-2">
								<div className="flex justify-between items-end">
									<div>
										<div className="text-2xl font-bold">{formatValue(trend.current, trend.unit)}</div>
										<div className="text-sm text-muted-foreground">Current</div>
									</div>
									<div className="text-right">
										<div className={`text-lg font-semibold ${getTrendColor(trend.status)}`}>
											{trend.changePercent >= 0 ? "+" : ""}
											{trend.changePercent.toFixed(1)}%
										</div>
										<div className="text-sm text-muted-foreground">vs {comparisonPeriod}</div>
									</div>
								</div>

								<div className="text-xs text-muted-foreground">
									Previous: {formatValue(trend.previous, trend.unit)}({trend.change >= 0 ? "+" : ""}
									{formatValue(Math.abs(trend.change), trend.unit)})
								</div>
							</div>
						</CardContent>
					</Card>
				))}
			</div>

			{/* Seasonal Patterns */}
			{seasonalPatterns.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center">
							<Calendar className="h-5 w-5 mr-2" />
							Seasonal Patterns
						</CardTitle>
					</CardHeader>
					<CardContent>
						<Tabs defaultValue={seasonalPatterns[0]?.period}>
							<TabsList>
								{seasonalPatterns.map((pattern) => (
									<TabsTrigger key={pattern.period} value={pattern.period}>
										{pattern.period.charAt(0).toUpperCase() + pattern.period.slice(1)}
									</TabsTrigger>
								))}
							</TabsList>

							{seasonalPatterns.map((pattern) => (
								<TabsContent key={pattern.period} value={pattern.period} className="space-y-4">
									<div className="flex items-center justify-between">
										<h4 className="font-medium">
											{pattern.period.charAt(0).toUpperCase() + pattern.period.slice(1)} Pattern
										</h4>
										<Badge variant="outline">{Math.round(pattern.confidence * 100)}% confidence</Badge>
									</div>

									<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
										{pattern.pattern.map((point, index) => (
											<div
												key={index}
												className={`p-3 rounded-lg border text-center ${
													point.peak ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"
												}`}
											>
												<div className="text-sm font-medium">{point.label}</div>
												<div className="text-lg font-bold">{point.value.toFixed(1)}</div>
												{point.peak && (
													<Badge variant="default" className="text-xs mt-1">
														Peak
													</Badge>
												)}
											</div>
										))}
									</div>

									<div className="text-sm text-muted-foreground">
										Peak periods are highlighted in blue. Pattern confidence is based on data completeness.
									</div>
								</TabsContent>
							))}
						</Tabs>
					</CardContent>
				</Card>
			)}

			{/* Anomaly Detection */}
			{anomalies.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center">
							<AlertTriangle className="h-5 w-5 mr-2" />
							Recent Anomalies
							<Badge variant="destructive" className="ml-2">
								{anomalies.length}
							</Badge>
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-3">
							{anomalies.map((anomaly, index) => (
								<div
									key={index}
									className={`p-4 rounded-lg border-l-4 ${
										anomaly.severity === "high"
											? "border-red-500 bg-red-50"
											: anomaly.severity === "medium"
												? "border-yellow-500 bg-yellow-50"
												: "border-blue-500 bg-blue-50"
									}`}
								>
									<div className="flex items-center justify-between">
										<div>
											<h4 className="font-medium">{anomaly.metric} Anomaly</h4>
											<p className="text-sm text-muted-foreground">{anomaly.timestamp.toLocaleString()}</p>
										</div>
										<Badge
											variant={
												anomaly.severity === "high"
													? "destructive"
													: anomaly.severity === "medium"
														? "secondary"
														: "default"
											}
										>
											{anomaly.severity} severity
										</Badge>
									</div>

									<div className="mt-2 grid grid-cols-2 gap-4 text-sm">
										<div>
											<span className="text-muted-foreground">Observed:</span>
											<span className="ml-2 font-medium">
												{formatValue(
													anomaly.value,
													anomaly.metric.includes("Rate")
														? "%"
														: anomaly.metric.includes("Latency")
															? "ms"
															: "jobs/min",
												)}
											</span>
										</div>
										<div>
											<span className="text-muted-foreground">Expected:</span>
											<span className="ml-2 font-medium">
												{formatValue(
													anomaly.expected,
													anomaly.metric.includes("Rate")
														? "%"
														: anomaly.metric.includes("Latency")
															? "ms"
															: "jobs/min",
												)}
											</span>
										</div>
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Trend Insights */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center">
						<BarChart3 className="h-5 w-5 mr-2" />
						Trend Insights
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
						<div>
							<h4 className="font-medium mb-3">Performance Summary</h4>
							<div className="space-y-2 text-sm">
								{trendData.filter((t) => t.status === "good").length > 0 && (
									<div className="flex items-center space-x-2 text-green-600">
										<Activity className="h-4 w-4" />
										<span>{trendData.filter((t) => t.status === "good").length} metrics showing positive trends</span>
									</div>
								)}

								{trendData.filter((t) => t.status === "critical").length > 0 && (
									<div className="flex items-center space-x-2 text-red-600">
										<AlertTriangle className="h-4 w-4" />
										<span>
											{trendData.filter((t) => t.status === "critical").length} metrics need immediate attention
										</span>
									</div>
								)}

								{seasonalPatterns.length > 0 && (
									<div className="flex items-center space-x-2 text-blue-600">
										<Calendar className="h-4 w-4" />
										<span>
											{seasonalPatterns.length} seasonal pattern{seasonalPatterns.length > 1 ? "s" : ""} detected
										</span>
									</div>
								)}

								{anomalies.length > 0 && (
									<div className="flex items-center space-x-2 text-yellow-600">
										<Zap className="h-4 w-4" />
										<span>
											{anomalies.length} anomal{anomalies.length > 1 ? "ies" : "y"} detected recently
										</span>
									</div>
								)}
							</div>
						</div>

						<div>
							<h4 className="font-medium mb-3">Recommendations</h4>
							<div className="space-y-2 text-sm">
								{trendData.find((t) => t.metric === "Throughput" && t.trend === "down") && (
									<div className="p-2 bg-yellow-50 border border-yellow-200 rounded">
										Consider investigating throughput decline. Check for resource constraints or increased job
										complexity.
									</div>
								)}

								{trendData.find((t) => t.metric.includes("Latency") && t.trend === "up") && (
									<div className="p-2 bg-orange-50 border border-orange-200 rounded">
										Rising latency detected. Consider optimizing job processing or scaling resources.
									</div>
								)}

								{trendData.find((t) => t.metric === "Error Rate" && t.trend === "up") && (
									<div className="p-2 bg-red-50 border border-red-200 rounded">
										Error rate is increasing. Review recent deployments and investigate failing jobs.
									</div>
								)}

								{seasonalPatterns.some((p) => p.pattern.some((point) => point.peak)) && (
									<div className="p-2 bg-blue-50 border border-blue-200 rounded">
										Peak usage periods identified. Consider auto-scaling or resource pre-allocation during these times.
									</div>
								)}

								{anomalies.filter((a) => a.severity === "high").length > 0 && (
									<div className="p-2 bg-red-50 border border-red-200 rounded">
										High-severity anomalies detected. Immediate investigation recommended.
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
