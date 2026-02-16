import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import logger from "@/lib/utils/logger";

interface RouteParams {
	params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
	try {
		const session = await auth();

		if (!session?.user?.id || session.user.role !== "SUPERADMIN") {
			return NextResponse.json({ error: "Acesso negado. Apenas SUPERADMIN pode acessar métricas." }, { status: 403 });
		}

		const { id } = await params;
		const { searchParams } = new URL(request.url);
		const days = parseInt(searchParams.get("days") || "30");

		const prisma = getPrismaInstance();

		// Check if flag exists
		const flag = await prisma.featureFlag.findUnique({
			where: { id },
		});

		if (!flag) {
			return NextResponse.json({ error: "Feature flag não encontrada" }, { status: 404 });
		}

		// Get metrics for the specified period
		const startDate = new Date();
		startDate.setDate(startDate.getDate() - days);

		const metrics = await prisma.featureFlagMetrics.findMany({
			where: {
				flagId: id,
				date: {
					gte: startDate,
				},
			},
			orderBy: { date: "desc" },
		});

		// Calculate summary statistics
		const totalEvaluations = metrics.reduce((sum, m) => sum + m.evaluations, 0);
		const totalEnabled = metrics.reduce((sum, m) => sum + m.enabledCount, 0);
		const totalDisabled = metrics.reduce((sum, m) => sum + m.disabledCount, 0);
		const averageLatency =
			metrics.length > 0 ? metrics.reduce((sum, m) => sum + m.averageLatencyMs, 0) / metrics.length : 0;
		const successRate = totalEnabled + totalDisabled > 0 ? (totalEnabled / (totalEnabled + totalDisabled)) * 100 : 0;
		const lastEvaluated = metrics.length > 0 && metrics[0].lastEvaluatedAt ? metrics[0].lastEvaluatedAt : null;

		return NextResponse.json({
			metrics: metrics.map((metric) => ({
				id: metric.id,
				evaluations: metric.evaluations,
				enabledCount: metric.enabledCount,
				disabledCount: metric.disabledCount,
				averageLatencyMs: metric.averageLatencyMs,
				date: metric.date.toISOString().split("T")[0], // YYYY-MM-DD format
				lastEvaluatedAt: metric.lastEvaluatedAt?.toISOString() || null,
			})),
			summary: {
				totalEvaluations,
				averageLatency,
				successRate,
				lastEvaluated: lastEvaluated?.toISOString() || null,
				period: {
					days,
					startDate: startDate.toISOString().split("T")[0],
					endDate: new Date().toISOString().split("T")[0],
				},
			},
		});
	} catch (error) {
		logger.error("Error retrieving feature flag metrics", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}
