/**
 * SocialWise Flow Monitoring API
 * Provides real-time dashboard metrics and health status
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSocialWiseDashboardMetrics } from "@/lib/socialwise-flow/monitoring-dashboard";
import { getClassificationRates, getErrorRates, getPerformancePercentiles } from "@/lib/socialwise-flow/metrics";
import { createLogger } from "@/lib/utils/logger";

const monitoringLogger = createLogger("SocialWise-Monitoring-API");

/**
 * GET /api/admin/socialwise-flow/monitoring
 * Get current dashboard metrics
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
	try {
		// Authentication check
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
		}

		// Get dashboard metrics
		const metrics = await getSocialWiseDashboardMetrics();

		monitoringLogger.info("Dashboard metrics retrieved", {
			userId: session.user.id,
			overallStatus: metrics.healthStatus.overall_status,
			activeAlertsCount: metrics.activeAlerts.length,
			p95Latency: metrics.currentLatency.overall_p95,
		});

		return NextResponse.json({
			success: true,
			data: metrics,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		monitoringLogger.error("Failed to get dashboard metrics", {
			error: error instanceof Error ? error.message : String(error),
		});

		return NextResponse.json(
			{
				error: "Erro interno do servidor",
				details: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 },
		);
	}
}

/**
 * GET /api/admin/socialwise-flow/monitoring/historical
 * Get historical metrics for a date range
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
	try {
		// Authentication check
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
		}

		// Parse request body
		const body = await request.json();
		const { startDate, endDate, metrics: requestedMetrics } = body;

		if (!startDate || !endDate) {
			return NextResponse.json({ error: "startDate e endDate são obrigatórios" }, { status: 400 });
		}

		// Validate date format (YYYY-MM-DD)
		const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
		if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
			return NextResponse.json({ error: "Formato de data inválido. Use YYYY-MM-DD" }, { status: 400 });
		}

		// Validate date range (max 30 days)
		const start = new Date(startDate);
		const end = new Date(endDate);
		const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

		if (daysDiff > 30) {
			return NextResponse.json({ error: "Intervalo máximo de 30 dias" }, { status: 400 });
		}

		if (daysDiff < 0) {
			return NextResponse.json({ error: "Data de início deve ser anterior à data de fim" }, { status: 400 });
		}

		// Get requested metrics
		const results: any = {};

		if (!requestedMetrics || requestedMetrics.includes("classification")) {
			results.classificationRates = await getClassificationRates(startDate, endDate);
		}

		if (!requestedMetrics || requestedMetrics.includes("errors")) {
			results.errorRates = await getErrorRates(startDate, endDate);
		}

		if (!requestedMetrics || requestedMetrics.includes("performance")) {
			results.performancePercentiles = await getPerformancePercentiles(startDate, endDate);
		}

		monitoringLogger.info("Historical metrics retrieved", {
			userId: session.user.id,
			startDate,
			endDate,
			requestedMetrics: requestedMetrics || "all",
		});

		return NextResponse.json({
			success: true,
			data: results,
			dateRange: { startDate, endDate },
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		monitoringLogger.error("Failed to get historical metrics", {
			error: error instanceof Error ? error.message : String(error),
		});

		return NextResponse.json(
			{
				error: "Erro interno do servidor",
				details: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 },
		);
	}
}
