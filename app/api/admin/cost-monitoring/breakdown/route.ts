import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";

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

		const { searchParams } = new URL(request.url);

		// Parâmetros de filtro
		const startDate = searchParams.get("startDate");
		const endDate = searchParams.get("endDate");
		const provider = searchParams.get("provider");
		const product = searchParams.get("product");
		const inboxId = searchParams.get("inboxId");
		const userId = searchParams.get("userId");
		const intent = searchParams.get("intent");
		const groupBy = searchParams.get("groupBy") || "provider"; // provider, product, model, period, inbox, user
		const period = searchParams.get("period") || "day"; // hour, day, week, month

		const prisma = getPrismaInstance();

		// Construir filtros baseados nos parâmetros
		const whereClause: any = {
			status: "PRICED",
		};

		// Filtros de data
		if (startDate) {
			whereClause.ts = { ...whereClause.ts, gte: new Date(startDate) };
		}
		if (endDate) {
			whereClause.ts = { ...whereClause.ts, lte: new Date(endDate) };
		}

		// Filtros específicos
		if (provider) {
			whereClause.provider = provider;
		}
		if (product) {
			whereClause.product = product;
		}
		if (inboxId) {
			whereClause.inboxId = inboxId;
		}
		if (userId) {
			whereClause.userId = userId;
		}
		if (intent) {
			whereClause.intent = { contains: intent, mode: "insensitive" };
		}

		// Definir campos de agrupamento baseado no parâmetro groupBy
		let groupByFields: string[] = [];
		switch (groupBy) {
			case "provider":
				groupByFields = ["provider"];
				break;
			case "product":
				groupByFields = ["provider", "product"];
				break;
			case "model":
				groupByFields = ["provider", "product"];
				break;
			case "inbox":
				groupByFields = ["inboxId"];
				break;
			case "user":
				groupByFields = ["userId"];
				break;
			case "intent":
				groupByFields = ["intent"];
				break;
			case "period":
				// Para período, vamos agrupar por data truncada
				groupByFields = ["provider"]; // Será tratado especialmente
				break;
			default:
				groupByFields = ["provider"];
		}

		let breakdownData;

		if (groupBy === "period") {
			// Para agrupamento por período, precisamos de uma query SQL raw
			let dateFormat: string;
			switch (period) {
				case "hour":
					dateFormat = "DATE_TRUNC('hour', ts)";
					break;
				case "day":
					dateFormat = "DATE_TRUNC('day', ts)";
					break;
				case "week":
					dateFormat = "DATE_TRUNC('week', ts)";
					break;
				case "month":
					dateFormat = "DATE_TRUNC('month', ts)";
					break;
				default:
					dateFormat = "DATE_TRUNC('day', ts)";
			}

			// Construir condições WHERE para SQL raw
			let sqlWhere = "status = 'PRICED'";
			const sqlParams: any[] = [];
			let paramIndex = 1;

			if (startDate) {
				sqlWhere += ` AND ts >= $${paramIndex}`;
				sqlParams.push(new Date(startDate));
				paramIndex++;
			}
			if (endDate) {
				sqlWhere += ` AND ts <= $${paramIndex}`;
				sqlParams.push(new Date(endDate));
				paramIndex++;
			}
			if (provider) {
				sqlWhere += ` AND provider = $${paramIndex}`;
				sqlParams.push(provider);
				paramIndex++;
			}
			if (product) {
				sqlWhere += ` AND product = $${paramIndex}`;
				sqlParams.push(product);
				paramIndex++;
			}
			if (inboxId) {
				sqlWhere += ` AND "inboxId" = $${paramIndex}`;
				sqlParams.push(inboxId);
				paramIndex++;
			}
			if (userId) {
				sqlWhere += ` AND "userId" = $${paramIndex}`;
				sqlParams.push(userId);
				paramIndex++;
			}
			if (intent) {
				sqlWhere += ` AND intent ILIKE $${paramIndex}`;
				sqlParams.push(`%${intent}%`);
				paramIndex++;
			}

			const rawQuery = `
        SELECT 
          ${dateFormat} as period,
          provider,
          SUM(cost) as total_cost,
          COUNT(*) as event_count,
          SUM(units) as total_units
        FROM "CostEvent"
        WHERE ${sqlWhere}
        GROUP BY ${dateFormat}, provider
        ORDER BY period DESC, total_cost DESC
      `;

			breakdownData = await prisma.$queryRawUnsafe(rawQuery, ...sqlParams);
		} else {
			// Para outros tipos de agrupamento, usar groupBy do Prisma
			breakdownData = await prisma.costEvent.groupBy({
				by: groupByFields as any,
				where: whereClause,
				_sum: {
					cost: true,
					units: true,
				},
				_count: true,
				orderBy: {
					_sum: {
						cost: "desc",
					},
				},
				take: 50, // Limitar a 50 resultados para performance
			});
		}

		// Buscar dados adicionais para contexto
		const [totalCost, totalEvents, uniqueProviders, uniqueProducts] = await Promise.all([
			prisma.costEvent.aggregate({
				where: whereClause,
				_sum: { cost: true },
				_count: true,
			}),

			prisma.costEvent.count({
				where: whereClause,
			}),

			prisma.costEvent.groupBy({
				by: ["provider"],
				where: whereClause,
				_count: true,
			}),

			prisma.costEvent.groupBy({
				by: ["product"],
				where: whereClause,
				_count: true,
			}),
		]);

		// Formatar dados baseado no tipo de agrupamento
		let formattedBreakdown;

		if (groupBy === "period") {
			formattedBreakdown = (breakdownData as any[]).map((item) => ({
				period: item.period,
				provider: item.provider,
				cost: Number(item.total_cost || 0),
				events: Number(item.event_count || 0),
				units: Number(item.total_units || 0),
				currency: "USD",
			}));
		} else {
			formattedBreakdown = (breakdownData as any[]).map((item) => {
				const result: any = {
					cost: Number(item._sum.cost || 0),
					events: item._count,
					units: Number(item._sum.units || 0),
					currency: "USD",
				};

				// Adicionar campos de agrupamento
				groupByFields.forEach((field) => {
					result[field] = item[field];
				});

				return result;
			});
		}

		// Calcular estatísticas adicionais
		const stats = {
			totalCost: Number(totalCost._sum.cost || 0),
			totalEvents: totalEvents,
			averageCostPerEvent: totalEvents > 0 ? Number(totalCost._sum.cost || 0) / totalEvents : 0,
			uniqueProviders: uniqueProviders.length,
			uniqueProducts: uniqueProducts.length,
			currency: "USD",
		};

		const response = {
			breakdown: formattedBreakdown,
			stats,
			filters: {
				startDate,
				endDate,
				provider,
				product,
				inboxId,
				userId,
				intent,
				groupBy,
				period,
			},
			metadata: {
				totalResults: formattedBreakdown.length,
				maxResults: 50,
				generatedAt: new Date().toISOString(),
			},
		};

		return NextResponse.json(response);
	} catch (error: any) {
		console.error("Erro ao buscar breakdown de custos:", error);
		return NextResponse.json({ error: "Erro interno do servidor ao buscar breakdown de custos." }, { status: 500 });
	}
}
