import { NextRequest, NextResponse } from "next/server";
import { QueueMetrics, SystemMetrics } from "@/types/queue-management";

interface AnalyticsData {
	trends: {
		metric: string;
		current: number;
		previous: number;
		change: number;
		changePercent: number;
		trend: "up" | "down" | "stable";
		status: "good" | "warning" | "critical";
		unit: string;
	}[];
	seasonalPatterns: {
		period: "hourly" | "daily" | "weekly";
		pattern: { label: string; value: number; peak: boolean }[];
		confidence: number;
	}[];
	anomalies: {
		timestamp: Date;
		metric: string;
		value: number;
		expected: number;
		severity: "low" | "medium" | "high";
		queueName?: string;
	}[];
	insights: {
		type: "performance" | "recommendation" | "alert";
		title: string;
		description: string;
		severity: "info" | "warning" | "critical";
		actionable: boolean;
		relatedMetric?: string;
	}[];
}

function generateMockQueueMetrics(queueName: string, hours: number = 24): QueueMetrics[] {
	const metrics: QueueMetrics[] = [];
	const now = new Date();
	const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);

	const baseMetrics = getBaseMetricsForQueue(queueName);

	// Generate data points every 5 minutes
	for (let time = startTime.getTime(); time <= now.getTime(); time += 5 * 60 * 1000) {
		const timestamp = new Date(time);
		const hour = timestamp.getHours();
		const dayOfWeek = timestamp.getDay();

		// Business hours multiplier (higher during 9-17)
		const businessHoursMultiplier = hour >= 9 && hour <= 17 ? 1.5 : 0.8;

		// Weekend multiplier (lower on weekends)
		const weekendMultiplier = dayOfWeek === 0 || dayOfWeek === 6 ? 0.6 : 1.0;

		// Random variation
		const randomVariation = 0.8 + Math.random() * 0.4;

		const multiplier = businessHoursMultiplier * weekendMultiplier * randomVariation;

		metrics.push({
			queueName,
			timestamp,
			throughput: {
				jobsPerMinute: baseMetrics.throughput.jobsPerMinute * multiplier,
				jobsPerHour: baseMetrics.throughput.jobsPerHour * multiplier,
				jobsPerDay: baseMetrics.throughput.jobsPerDay * multiplier,
			},
			latency: {
				p50: baseMetrics.latency.p50 * (2 - multiplier),
				p95: baseMetrics.latency.p95 * (2 - multiplier),
				p99: baseMetrics.latency.p99 * (2 - multiplier),
				max: baseMetrics.latency.max * (2 - multiplier),
			},
			reliability: {
				successRate: Math.max(85, Math.min(99.9, baseMetrics.reliability.successRate * (0.95 + multiplier * 0.1))),
				errorRate: Math.max(0.1, Math.min(15, baseMetrics.reliability.errorRate * (2 - multiplier))),
				retryRate: baseMetrics.reliability.retryRate * (2 - multiplier),
			},
			resources: {
				memoryUsage: baseMetrics.resources.memoryUsage * multiplier,
				cpuTime: baseMetrics.resources.cpuTime * multiplier,
				ioOperations: baseMetrics.resources.ioOperations * multiplier,
			},
		});
	}

	return metrics;
}

function getBaseMetricsForQueue(queueName: string): QueueMetrics {
	const baseMetrics: Record<string, QueueMetrics> = {
		"webhook-processing": {
			queueName: "webhook-processing",
			timestamp: new Date(),
			throughput: { jobsPerMinute: 125, jobsPerHour: 7500, jobsPerDay: 180000 },
			latency: { p50: 850, p95: 2100, p99: 4500, max: 8000 },
			reliability: { successRate: 98.2, errorRate: 1.8, retryRate: 2.1 },
			resources: { memoryUsage: 256 * 1024 * 1024, cpuTime: 450, ioOperations: 1200 },
		},
		"email-notifications": {
			queueName: "email-notifications",
			timestamp: new Date(),
			throughput: { jobsPerMinute: 45, jobsPerHour: 2700, jobsPerDay: 64800 },
			latency: { p50: 1200, p95: 3200, p99: 6800, max: 12000 },
			reliability: { successRate: 94.1, errorRate: 5.9, retryRate: 6.2 },
			resources: { memoryUsage: 128 * 1024 * 1024, cpuTime: 680, ioOperations: 890 },
		},
		"image-processing": {
			queueName: "image-processing",
			timestamp: new Date(),
			throughput: { jobsPerMinute: 12, jobsPerHour: 720, jobsPerDay: 17280 },
			latency: { p50: 5500, p95: 12000, p99: 25000, max: 45000 },
			reliability: { successRate: 87.2, errorRate: 12.8, retryRate: 14.5 },
			resources: { memoryUsage: 512 * 1024 * 1024, cpuTime: 2800, ioOperations: 450 },
		},
		"data-sync": {
			queueName: "data-sync",
			timestamp: new Date(),
			throughput: { jobsPerMinute: 78, jobsPerHour: 4680, jobsPerDay: 112320 },
			latency: { p50: 650, p95: 1800, p99: 3200, max: 6500 },
			reliability: { successRate: 99.1, errorRate: 0.9, retryRate: 1.2 },
			resources: { memoryUsage: 64 * 1024 * 1024, cpuTime: 320, ioOperations: 780 },
		},
	};

	return baseMetrics[queueName] || baseMetrics["webhook-processing"];
}

function calculateTrends(currentMetrics: QueueMetrics[], previousMetrics: QueueMetrics[]): AnalyticsData["trends"] {
	if (currentMetrics.length === 0 || previousMetrics.length === 0) return [];

	const calculateAverage = (metrics: QueueMetrics[], accessor: (m: QueueMetrics) => number) => {
		return metrics.reduce((sum, m) => sum + accessor(m), 0) / metrics.length;
	};

	const trends: AnalyticsData["trends"] = [];

	// Throughput trends
	const currentThroughput = calculateAverage(currentMetrics, (m) => m.throughput.jobsPerMinute);
	const previousThroughput = calculateAverage(previousMetrics, (m) => m.throughput.jobsPerMinute);
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
	const currentLatency = calculateAverage(currentMetrics, (m) => m.latency.p95);
	const previousLatency = calculateAverage(previousMetrics, (m) => m.latency.p95);
	const latencyChange = currentLatency - previousLatency;
	const latencyChangePercent = previousLatency > 0 ? (latencyChange / previousLatency) * 100 : 0;

	trends.push({
		metric: "P95 Latency",
		current: currentLatency,
		previous: previousLatency,
		change: latencyChange,
		changePercent: latencyChangePercent,
		trend: Math.abs(latencyChangePercent) < 5 ? "stable" : latencyChangePercent > 0 ? "up" : "down",
		status: latencyChangePercent < -10 ? "good" : latencyChangePercent > 25 ? "critical" : "warning",
		unit: "ms",
	});

	// Success rate trends
	const currentSuccessRate = calculateAverage(currentMetrics, (m) => m.reliability.successRate);
	const previousSuccessRate = calculateAverage(previousMetrics, (m) => m.reliability.successRate);
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
	const currentErrorRate = calculateAverage(currentMetrics, (m) => m.reliability.errorRate);
	const previousErrorRate = calculateAverage(previousMetrics, (m) => m.reliability.errorRate);
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
}

function detectSeasonalPatterns(metrics: QueueMetrics[]): AnalyticsData["seasonalPatterns"] {
	if (metrics.length < 24) return [];

	const patterns: AnalyticsData["seasonalPatterns"] = [];

	// Hourly pattern
	const hourlyData = new Array(24).fill(0).map(() => ({ sum: 0, count: 0 }));

	metrics.forEach((metric) => {
		const hour = metric.timestamp.getHours();
		hourlyData[hour].sum += metric.throughput.jobsPerMinute;
		hourlyData[hour].count += 1;
	});

	const hourlyPattern = hourlyData.map((data, hour) => ({
		label: `${hour}:00`,
		value: data.count > 0 ? data.sum / data.count : 0,
		peak: false,
	}));

	// Identify peaks
	const avgValue = hourlyPattern.reduce((sum, p) => sum + p.value, 0) / hourlyPattern.length;
	const threshold = avgValue * 1.5;
	hourlyPattern.forEach((p) => {
		p.peak = p.value > threshold;
	});

	patterns.push({
		period: "hourly",
		pattern: hourlyPattern,
		confidence: Math.min(metrics.length / 168, 1),
	});

	// Daily pattern (if we have enough data)
	if (metrics.length >= 7 * 24 * 12) {
		// 7 days of 5-minute intervals
		const dailyData = new Array(7).fill(0).map(() => ({ sum: 0, count: 0 }));

		metrics.forEach((metric) => {
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

		const avgDailyValue = dailyPattern.reduce((sum, p) => sum + p.value, 0) / dailyPattern.length;
		const dailyThreshold = avgDailyValue * 1.3;
		dailyPattern.forEach((p) => {
			p.peak = p.value > dailyThreshold;
		});

		patterns.push({
			period: "daily",
			pattern: dailyPattern,
			confidence: Math.min(metrics.length / (7 * 24 * 12), 1),
		});
	}

	return patterns;
}

function detectAnomalies(metrics: QueueMetrics[]): AnalyticsData["anomalies"] {
	if (metrics.length < 10) return [];

	const anomalies: AnalyticsData["anomalies"] = [];
	const windowSize = Math.min(10, Math.floor(metrics.length / 3));

	for (let i = windowSize; i < metrics.length; i++) {
		const window = metrics.slice(i - windowSize, i);
		const current = metrics[i];

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
				queueName: current.queueName,
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
				queueName: current.queueName,
			});
		}
	}

	return anomalies.slice(-10); // Return last 10 anomalies
}

function generateInsights(
	trends: AnalyticsData["trends"],
	anomalies: AnalyticsData["anomalies"],
	patterns: AnalyticsData["seasonalPatterns"],
): AnalyticsData["insights"] {
	const insights: AnalyticsData["insights"] = [];

	// Performance insights
	const criticalTrends = trends.filter((t) => t.status === "critical");
	if (criticalTrends.length > 0) {
		insights.push({
			type: "alert",
			title: "Critical Performance Issues Detected",
			description: `${criticalTrends.length} metrics showing critical performance degradation`,
			severity: "critical",
			actionable: true,
			relatedMetric: criticalTrends[0].metric,
		});
	}

	const goodTrends = trends.filter((t) => t.status === "good");
	if (goodTrends.length > trends.length / 2) {
		insights.push({
			type: "performance",
			title: "System Performance Improving",
			description: `${goodTrends.length} out of ${trends.length} metrics showing positive trends`,
			severity: "info",
			actionable: false,
		});
	}

	// Anomaly insights
	const highSeverityAnomalies = anomalies.filter((a) => a.severity === "high");
	if (highSeverityAnomalies.length > 0) {
		insights.push({
			type: "alert",
			title: "High-Severity Anomalies Detected",
			description: `${highSeverityAnomalies.length} high-severity anomalies require immediate attention`,
			severity: "critical",
			actionable: true,
			relatedMetric: highSeverityAnomalies[0].metric,
		});
	}

	// Pattern insights
	const peakPatterns = patterns.filter((p) => p.pattern.some((point) => point.peak));
	if (peakPatterns.length > 0) {
		insights.push({
			type: "recommendation",
			title: "Optimize for Peak Usage Periods",
			description: "Seasonal patterns detected. Consider auto-scaling during peak periods",
			severity: "info",
			actionable: true,
		});
	}

	// Throughput insights
	const throughputTrend = trends.find((t) => t.metric === "Throughput");
	if (throughputTrend && throughputTrend.trend === "down" && throughputTrend.changePercent < -15) {
		insights.push({
			type: "recommendation",
			title: "Investigate Throughput Decline",
			description: `Throughput has decreased by ${Math.abs(throughputTrend.changePercent).toFixed(1)}%. Check for resource constraints or increased job complexity`,
			severity: "warning",
			actionable: true,
			relatedMetric: "Throughput",
		});
	}

	// Latency insights
	const latencyTrend = trends.find((t) => t.metric.includes("Latency"));
	if (latencyTrend && latencyTrend.trend === "up" && latencyTrend.changePercent > 20) {
		insights.push({
			type: "recommendation",
			title: "Address Rising Latency",
			description: `Latency has increased by ${latencyTrend.changePercent.toFixed(1)}%. Consider optimizing job processing or scaling resources`,
			severity: "warning",
			actionable: true,
			relatedMetric: latencyTrend.metric,
		});
	}

	// Error rate insights
	const errorRateTrend = trends.find((t) => t.metric === "Error Rate");
	if (errorRateTrend && errorRateTrend.trend === "up" && errorRateTrend.changePercent > 25) {
		insights.push({
			type: "alert",
			title: "Error Rate Increasing",
			description: `Error rate has increased by ${errorRateTrend.changePercent.toFixed(1)}%. Review recent deployments and investigate failing jobs`,
			severity: "critical",
			actionable: true,
			relatedMetric: "Error Rate",
		});
	}

	return insights;
}

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const queueName = searchParams.get("queue") || "all";
		const timeRangeParam = searchParams.get("timeRange") || "24h";
		const comparisonPeriod = searchParams.get("comparison") || "previous";

		// Parse time range
		let hours = 24;
		switch (timeRangeParam) {
			case "1h":
				hours = 1;
				break;
			case "24h":
				hours = 24;
				break;
			case "7d":
				hours = 7 * 24;
				break;
			case "30d":
				hours = 30 * 24;
				break;
		}

		// Generate metrics for current and previous periods
		const allQueueNames =
			queueName === "all"
				? ["webhook-processing", "email-notifications", "image-processing", "data-sync"]
				: [queueName];

		let currentMetrics: QueueMetrics[] = [];
		let previousMetrics: QueueMetrics[] = [];

		for (const name of allQueueNames) {
			// Current period metrics
			const current = generateMockQueueMetrics(name, hours);
			currentMetrics.push(...current);

			// Previous period metrics (for comparison)
			const previous = generateMockQueueMetrics(name, hours).map((m) => ({
				...m,
				timestamp: new Date(m.timestamp.getTime() - hours * 60 * 60 * 1000),
			}));
			previousMetrics.push(...previous);
		}

		// Calculate analytics
		const trends = calculateTrends(currentMetrics, previousMetrics);
		const seasonalPatterns = detectSeasonalPatterns(currentMetrics);
		const anomalies = detectAnomalies(currentMetrics);
		const insights = generateInsights(trends, anomalies, seasonalPatterns);

		const analyticsData: AnalyticsData = {
			trends,
			seasonalPatterns,
			anomalies,
			insights,
		};

		return NextResponse.json({
			success: true,
			data: analyticsData,
			metadata: {
				queueName,
				timeRange: timeRangeParam,
				comparisonPeriod,
				dataPoints: currentMetrics.length,
				queuesAnalyzed: allQueueNames.length,
				generatedAt: new Date().toISOString(),
			},
		});
	} catch (error) {
		console.error("Error generating analytics:", error);
		return NextResponse.json(
			{
				success: false,
				error: {
					code: "ANALYTICS_GENERATION_ERROR",
					message: "Failed to generate analytics data",
					details: error instanceof Error ? error.message : "Unknown error",
				},
			},
			{ status: 500 },
		);
	}
}

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { action, queueName, timeRange, parameters } = body;

		switch (action) {
			case "compare-periods":
				const { periods } = parameters;

				// Generate comparison data for multiple periods
				const comparisonData: Record<string, any> = {};

				for (const period of periods) {
					let hours = 24;
					switch (period) {
						case "1h":
							hours = 1;
							break;
						case "24h":
							hours = 24;
							break;
						case "7d":
							hours = 7 * 24;
							break;
						case "30d":
							hours = 30 * 24;
							break;
					}

					const allQueueNames =
						queueName === "all"
							? ["webhook-processing", "email-notifications", "image-processing", "data-sync"]
							: [queueName];

					let periodMetrics: QueueMetrics[] = [];
					for (const name of allQueueNames) {
						const metrics = generateMockQueueMetrics(name, hours);
						periodMetrics.push(...metrics);
					}

					// Calculate aggregated metrics for this period
					const aggregated = {
						period,
						avgThroughput: periodMetrics.reduce((sum, m) => sum + m.throughput.jobsPerMinute, 0) / periodMetrics.length,
						avgLatency: periodMetrics.reduce((sum, m) => sum + m.latency.p95, 0) / periodMetrics.length,
						avgSuccessRate: periodMetrics.reduce((sum, m) => sum + m.reliability.successRate, 0) / periodMetrics.length,
						avgErrorRate: periodMetrics.reduce((sum, m) => sum + m.reliability.errorRate, 0) / periodMetrics.length,
						dataPoints: periodMetrics.length,
					};

					comparisonData[period] = aggregated;
				}

				return NextResponse.json({
					success: true,
					data: comparisonData,
					action: "compare-periods",
					comparedAt: new Date().toISOString(),
				});

			case "forecast":
				const { horizon = 24 } = parameters; // hours to forecast

				// Simple linear trend forecasting
				const allQueueNames =
					queueName === "all"
						? ["webhook-processing", "email-notifications", "image-processing", "data-sync"]
						: [queueName];

				const forecastData: Record<string, any> = {};

				for (const name of allQueueNames) {
					const historicalMetrics = generateMockQueueMetrics(name, 48); // 48 hours of history

					// Calculate trend
					const recentMetrics = historicalMetrics.slice(-24); // Last 24 hours
					const olderMetrics = historicalMetrics.slice(-48, -24); // Previous 24 hours

					const recentAvgThroughput =
						recentMetrics.reduce((sum, m) => sum + m.throughput.jobsPerMinute, 0) / recentMetrics.length;
					const olderAvgThroughput =
						olderMetrics.reduce((sum, m) => sum + m.throughput.jobsPerMinute, 0) / olderMetrics.length;

					const throughputTrend = (recentAvgThroughput - olderAvgThroughput) / 24; // per hour

					// Generate forecast
					const forecast = [];
					const now = new Date();

					for (let i = 1; i <= horizon; i++) {
						const forecastTime = new Date(now.getTime() + i * 60 * 60 * 1000);
						const forecastThroughput = Math.max(0, recentAvgThroughput + throughputTrend * i);

						forecast.push({
							timestamp: forecastTime,
							predictedThroughput: forecastThroughput,
							confidence: Math.max(0.3, 1 - (i / horizon) * 0.7), // Decreasing confidence over time
						});
					}

					forecastData[name] = {
						queueName: name,
						currentThroughput: recentAvgThroughput,
						trend: throughputTrend,
						forecast,
						horizon,
					};
				}

				return NextResponse.json({
					success: true,
					data: forecastData,
					action: "forecast",
					forecastedAt: new Date().toISOString(),
				});

			default:
				return NextResponse.json(
					{
						success: false,
						error: {
							code: "INVALID_ACTION",
							message: `Invalid action: ${action}`,
							supportedActions: ["compare-periods", "forecast"],
						},
					},
					{ status: 400 },
				);
		}
	} catch (error) {
		console.error("Error processing analytics request:", error);
		return NextResponse.json(
			{
				success: false,
				error: {
					code: "ANALYTICS_PROCESSING_ERROR",
					message: "Failed to process analytics request",
					details: error instanceof Error ? error.message : "Unknown error",
				},
			},
			{ status: 500 },
		);
	}
}
