import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCostAlerts, costMonitor } from "@/lib/cost/cost-monitor";
import log from "@/lib/log";

/**
 * GET /api/admin/cost-monitoring/alerts
 * Retorna alertas do sistema de custos
 */
export async function GET(request: NextRequest) {
	try {
		// Verificar autenticação e autorização
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
		}

		if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
			return NextResponse.json(
				{ error: "Acesso negado. Apenas administradores podem acessar alertas de custos." },
				{ status: 403 },
			);
		}

		// Obter parâmetros da query
		const { searchParams } = new URL(request.url);
		const severity = searchParams.get("severity"); // LOW, MEDIUM, HIGH, CRITICAL
		const type = searchParams.get("type"); // HIGH_ERROR_RATE, PROCESSING_DELAY, etc.
		const resolved = searchParams.get("resolved"); // true, false, all

		// Obter todos os alertas
		let alerts = getCostAlerts();

		// Aplicar filtros
		if (severity) {
			alerts = alerts.filter((alert) => alert.severity === severity);
		}

		if (type) {
			alerts = alerts.filter((alert) => alert.type === type);
		}

		if (resolved === "true") {
			alerts = alerts.filter((alert) => alert.resolved);
		} else if (resolved === "false") {
			alerts = alerts.filter((alert) => !alert.resolved);
		}
		// Se resolved === 'all' ou não especificado, retorna todos

		// Ordenar por timestamp (mais recentes primeiro)
		alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

		const response = {
			alerts,
			summary: {
				total: alerts.length,
				active: alerts.filter((a) => !a.resolved).length,
				resolved: alerts.filter((a) => a.resolved).length,
				bySeverity: {
					critical: alerts.filter((a) => a.severity === "CRITICAL").length,
					high: alerts.filter((a) => a.severity === "HIGH").length,
					medium: alerts.filter((a) => a.severity === "MEDIUM").length,
					low: alerts.filter((a) => a.severity === "LOW").length,
				},
				byType: alerts.reduce(
					(acc, alert) => {
						acc[alert.type] = (acc[alert.type] || 0) + 1;
						return acc;
					},
					{} as Record<string, number>,
				),
			},
		};

		log.info("[CostMonitoringAPI] Alertas de custos consultados", {
			userId: session.user.id,
			totalAlerts: alerts.length,
			filters: { severity, type, resolved },
		});

		return NextResponse.json(response);
	} catch (error) {
		log.error("[CostMonitoringAPI] Erro ao obter alertas de custos:", error);

		return NextResponse.json(
			{
				error: "Erro interno do servidor ao obter alertas de custos.",
				details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
			},
			{ status: 500 },
		);
	}
}

/**
 * PATCH /api/admin/cost-monitoring/alerts
 * Resolve alertas de custos
 */
export async function PATCH(request: NextRequest) {
	try {
		// Verificar autenticação e autorização
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
		}

		if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
			return NextResponse.json(
				{ error: "Acesso negado. Apenas administradores podem resolver alertas de custos." },
				{ status: 403 },
			);
		}

		// Obter dados do corpo da requisição
		const body = await request.json();
		const { alertIds, action } = body;

		if (!alertIds || !Array.isArray(alertIds) || alertIds.length === 0) {
			return NextResponse.json({ error: "IDs de alertas são obrigatórios." }, { status: 400 });
		}

		if (action !== "resolve") {
			return NextResponse.json({ error: "Ação não suportada. Use 'resolve'." }, { status: 400 });
		}

		// Resolver alertas
		const results = await Promise.all(
			alertIds.map(async (alertId: string) => {
				try {
					const resolved = await costMonitor.resolveAlert(alertId);
					return { alertId, resolved, error: null };
				} catch (error) {
					return {
						alertId,
						resolved: false,
						error: (error as Error).message,
					};
				}
			}),
		);

		const successCount = results.filter((r) => r.resolved).length;
		const errorCount = results.filter((r) => !r.resolved).length;

		log.info("[CostMonitoringAPI] Alertas de custos resolvidos", {
			userId: session.user.id,
			alertIds,
			successCount,
			errorCount,
		});

		return NextResponse.json({
			message: `${successCount} alertas resolvidos com sucesso, ${errorCount} falharam.`,
			results,
			summary: {
				total: alertIds.length,
				resolved: successCount,
				failed: errorCount,
			},
		});
	} catch (error) {
		log.error("[CostMonitoringAPI] Erro ao resolver alertas de custos:", error);

		return NextResponse.json(
			{
				error: "Erro interno do servidor ao resolver alertas de custos.",
				details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
			},
			{ status: 500 },
		);
	}
}
