import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import FxRateService from "@/lib/cost/fx-rate-service";
import { costAuditLogger } from "@/lib/cost/audit-logger";

export async function GET(request: NextRequest) {
	try {
		// Verificar autenticação e autorização
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
		}

		if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
			return NextResponse.json(
				{ error: "Acesso negado. Apenas administradores podem visualizar custos." },
				{ status: 403 },
			);
		}

		const prisma = getPrismaInstance();

		// Definir datas para agregações
		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);

		// Buscar dados em paralelo para otimizar performance
		const [
			todayCosts,
			yesterdayCosts,
			monthCosts,
			lastMonthCosts,
			topInboxes,
			recentEvents,
			totalEvents,
			pendingEvents,
		] = await Promise.all([
			// Custo do dia atual
			prisma.costEvent.aggregate({
				where: {
					ts: { gte: today },
					status: "PRICED",
				},
				_sum: { cost: true },
				_count: true,
			}),

			// Custo de ontem para comparação
			prisma.costEvent.aggregate({
				where: {
					ts: {
						gte: yesterday,
						lt: today,
					},
					status: "PRICED",
				},
				_sum: { cost: true },
			}),

			// Custo do mês atual
			prisma.costEvent.aggregate({
				where: {
					ts: { gte: monthStart },
					status: "PRICED",
				},
				_sum: { cost: true },
				_count: true,
			}),

			// Custo do mês passado para comparação
			prisma.costEvent.aggregate({
				where: {
					ts: {
						gte: new Date(now.getFullYear(), now.getMonth() - 1, 1),
						lt: monthStart,
					},
					status: "PRICED",
				},
				_sum: { cost: true },
			}),

			// Top 5 inboxes por custo hoje
			prisma.costEvent.groupBy({
				by: ["inboxId"],
				where: {
					ts: { gte: today },
					status: "PRICED",
					inboxId: { not: null },
				},
				_sum: { cost: true },
				orderBy: { _sum: { cost: "desc" } },
				take: 5,
			}),

			// Eventos recentes (últimos 10)
			prisma.costEvent.findMany({
				where: { status: "PRICED" },
				orderBy: { ts: "desc" },
				take: 10,
				select: {
					ts: true,
					provider: true,
					product: true,
					cost: true,
					currency: true,
					inboxId: true,
					intent: true,
					units: true,
					unit: true,
				},
			}),

			// Total de eventos processados
			prisma.costEvent.count({
				where: { status: "PRICED" },
			}),

			// Eventos pendentes de precificação
			prisma.costEvent.count({
				where: { status: "PENDING_PRICING" },
			}),
		]);

		// Calcular métricas e tendências
		const todayTotal = Number(todayCosts._sum.cost || 0);
		const yesterdayTotal = Number(yesterdayCosts._sum.cost || 0);
		const monthTotal = Number(monthCosts._sum.cost || 0);
		const lastMonthTotal = Number(lastMonthCosts._sum.cost || 0);

		// Calcular variações percentuais
		const dailyChange =
			yesterdayTotal > 0 ? ((todayTotal - yesterdayTotal) / yesterdayTotal) * 100 : todayTotal > 0 ? 100 : 0;

		const monthlyChange =
			lastMonthTotal > 0 ? ((monthTotal - lastMonthTotal) / lastMonthTotal) * 100 : monthTotal > 0 ? 100 : 0;

		// Buscar taxa de câmbio atual para conversão BRL
		const currentRate = await FxRateService.getRateForDate(new Date());
		const todayBRL = todayTotal * currentRate;
		const monthBRL = monthTotal * currentRate;

		// Buscar breakdown por provider para hoje
		const providerBreakdown = await prisma.costEvent.groupBy({
			by: ["provider"],
			where: {
				ts: { gte: today },
				status: "PRICED",
			},
			_sum: { cost: true },
			orderBy: { _sum: { cost: "desc" } },
		});

		// Formatar resposta
		const response = {
			summary: {
				today: {
					usd: todayTotal,
					brl: Math.round(todayBRL * 100) / 100,
					events: todayCosts._count,
					change: dailyChange,
					exchangeRate: currentRate,
				},
				month: {
					usd: monthTotal,
					brl: Math.round(monthBRL * 100) / 100,
					events: monthCosts._count,
					change: monthlyChange,
					exchangeRate: currentRate,
				},
			},
			breakdown: {
				byProvider: providerBreakdown.map((item) => {
					const usdCost = Number(item._sum.cost || 0);
					return {
						provider: item.provider,
						usd: usdCost,
						brl: Math.round(usdCost * currentRate * 100) / 100,
					};
				}),
				topInboxes: topInboxes.map((item) => {
					const usdCost = Number(item._sum.cost || 0);
					return {
						inboxId: item.inboxId,
						usd: usdCost,
						brl: Math.round(usdCost * currentRate * 100) / 100,
					};
				}),
			},
			recentEvents: recentEvents.map((event) => {
				const usdCost = Number(event.cost || 0);
				return {
					timestamp: event.ts,
					provider: event.provider,
					product: event.product,
					usd: usdCost,
					brl: Math.round(usdCost * currentRate * 100) / 100,
					inboxId: event.inboxId,
					intent: event.intent,
					units: Number(event.units),
					unit: event.unit,
				};
			}),
			systemHealth: {
				totalProcessedEvents: totalEvents,
				pendingEvents: pendingEvents,
				processingRate: totalEvents > 0 ? ((totalEvents - pendingEvents) / totalEvents) * 100 : 100,
			},
			lastUpdated: new Date().toISOString(),
		};

		// Audit logging
		await costAuditLogger.logCostDataAccessed({
			userId: session.user.id,
			action: "overview",
			resultCount: recentEvents.length,
			ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
			userAgent: request.headers.get("user-agent") || "unknown",
		});

		return NextResponse.json(response);
	} catch (error: any) {
		console.error("Erro ao buscar overview de custos:", error);
		return NextResponse.json({ error: "Erro interno do servidor ao buscar dados de custos." }, { status: 500 });
	}
}
