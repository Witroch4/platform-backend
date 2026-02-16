import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { costAuditLogger, CostAuditEventType } from "@/lib/cost/audit-logger";
import log from "@/lib/log";

/**
 * GET /api/admin/cost-monitoring/audit
 * Retorna logs de auditoria do sistema de custos
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
				{
					error: "Acesso negado. Apenas administradores podem acessar logs de auditoria.",
				},
				{ status: 403 },
			);
		}

		// Obter parâmetros da query
		const { searchParams } = new URL(request.url);
		const eventType = searchParams.get("eventType") as CostAuditEventType | null;
		const userId = searchParams.get("userId") || undefined;
		const resourceType = searchParams.get("resourceType") || undefined;
		const resourceId = searchParams.get("resourceId") || undefined;
		const severity = searchParams.get("severity") || undefined;
		const startDate = searchParams.get("startDate") ? new Date(searchParams.get("startDate")!) : undefined;
		const endDate = searchParams.get("endDate") ? new Date(searchParams.get("endDate")!) : undefined;
		const limit = parseInt(searchParams.get("limit") || "100");
		const offset = parseInt(searchParams.get("offset") || "0");

		// Validar parâmetros
		if (limit > 1000) {
			return NextResponse.json({ error: "Limite máximo de 1000 registros por consulta." }, { status: 400 });
		}

		// Obter logs de auditoria
		const result = await costAuditLogger.getAuditLogs({
			eventType: eventType || undefined,
			userId,
			resourceType,
			resourceId,
			severity,
			startDate,
			endDate,
			limit,
			offset,
		});

		// Log do acesso aos dados de auditoria
		await costAuditLogger.logCostDataAccessed({
			userId: session.user.id,
			action: "export",
			filters: {
				eventType,
				userId,
				resourceType,
				resourceId,
				severity,
				startDate: startDate?.toISOString(),
				endDate: endDate?.toISOString(),
				limit,
				offset,
			},
			resultCount: result.logs.length,
			ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
			userAgent: request.headers.get("user-agent") || "unknown",
		});

		const response = {
			logs: result.logs,
			pagination: {
				total: result.total,
				limit,
				offset,
				hasMore: offset + limit < result.total,
			},
			filters: {
				eventType,
				userId,
				resourceType,
				resourceId,
				severity,
				startDate: startDate?.toISOString(),
				endDate: endDate?.toISOString(),
			},
			timestamp: new Date().toISOString(),
		};

		log.info("[CostAuditAPI] Logs de auditoria consultados", {
			userId: session.user.id,
			resultCount: result.logs.length,
			filters: { eventType, userId, resourceType, severity },
		});

		return NextResponse.json(response);
	} catch (error) {
		log.error("[CostAuditAPI] Erro ao obter logs de auditoria:", error);

		return NextResponse.json(
			{
				error: "Erro interno do servidor ao obter logs de auditoria.",
				details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
			},
			{ status: 500 },
		);
	}
}

/**
 * GET /api/admin/cost-monitoring/audit/stats
 * Retorna estatísticas dos logs de auditoria
 */
export async function POST(request: NextRequest) {
	try {
		// Verificar autenticação e autorização
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
		}

		if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
			return NextResponse.json(
				{
					error: "Acesso negado. Apenas administradores podem acessar estatísticas de auditoria.",
				},
				{ status: 403 },
			);
		}

		// Obter dados do corpo da requisição
		const body = await request.json();
		const { days = 30 } = body;

		// Validar parâmetros
		if (days < 1 || days > 365) {
			return NextResponse.json({ error: "Período deve estar entre 1 e 365 dias." }, { status: 400 });
		}

		// Obter estatísticas
		const stats = await costAuditLogger.getAuditStats(days);

		// Log do acesso às estatísticas
		await costAuditLogger.logCostDataAccessed({
			userId: session.user.id,
			action: "overview",
			filters: { days },
			resultCount: stats.totalEvents,
			ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
			userAgent: request.headers.get("user-agent") || "unknown",
		});

		const response = {
			...stats,
			period: {
				days,
				startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
				endDate: new Date().toISOString(),
			},
			timestamp: new Date().toISOString(),
		};

		log.info("[CostAuditAPI] Estatísticas de auditoria consultadas", {
			userId: session.user.id,
			days,
			totalEvents: stats.totalEvents,
		});

		return NextResponse.json(response);
	} catch (error) {
		log.error("[CostAuditAPI] Erro ao obter estatísticas de auditoria:", error);

		return NextResponse.json(
			{
				error: "Erro interno do servidor ao obter estatísticas de auditoria.",
				details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
			},
			{ status: 500 },
		);
	}
}
