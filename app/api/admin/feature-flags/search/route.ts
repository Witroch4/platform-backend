import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import logger from "@/lib/utils/logger";

export async function GET(request: NextRequest) {
	try {
		const session = await auth();

		if (!session?.user?.id || session.user.role !== "SUPERADMIN") {
			return NextResponse.json(
				{ error: "Acesso negado. Apenas SUPERADMIN pode buscar feature flags." },
				{ status: 403 },
			);
		}

		const { searchParams } = new URL(request.url);
		const query = searchParams.get("q") || "";
		const category = searchParams.get("category");
		const enabled = searchParams.get("enabled");
		const userSpecific = searchParams.get("userSpecific");
		const systemCritical = searchParams.get("systemCritical");
		const sortBy = searchParams.get("sortBy") || "name";
		const sortOrder = searchParams.get("sortOrder") || "asc";
		const limit = parseInt(searchParams.get("limit") || "50");
		const offset = parseInt(searchParams.get("offset") || "0");

		const prisma = getPrismaInstance();

		// Build where clause
		const whereClause: any = {};

		if (query) {
			whereClause.OR = [
				{ name: { contains: query, mode: "insensitive" } },
				{ description: { contains: query, mode: "insensitive" } },
			];
		}

		if (category) {
			whereClause.category = category;
		}

		if (enabled !== null && enabled !== undefined) {
			whereClause.enabled = enabled === "true";
		}

		if (userSpecific !== null && userSpecific !== undefined) {
			whereClause.userSpecific = userSpecific === "true";
		}

		if (systemCritical !== null && systemCritical !== undefined) {
			whereClause.systemCritical = systemCritical === "true";
		}

		// Build order by clause
		const orderByClause: any = {};
		switch (sortBy) {
			case "name":
				orderByClause.name = sortOrder;
				break;
			case "category":
				orderByClause.category = sortOrder;
				break;
			case "enabled":
				orderByClause.enabled = sortOrder;
				break;
			case "createdAt":
				orderByClause.createdAt = sortOrder;
				break;
			case "updatedAt":
				orderByClause.updatedAt = sortOrder;
				break;
			default:
				orderByClause.name = "asc";
		}

		// Execute search with pagination
		const [flags, totalCount] = await Promise.all([
			prisma.featureFlag.findMany({
				where: whereClause,
				orderBy: orderByClause,
				take: limit,
				skip: offset,
				include: {
					metrics: {
						where: {
							date: {
								gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
							},
						},
						orderBy: { date: "desc" },
						take: 7,
					},
					userOverrides: {
						include: {
							user: {
								select: {
									id: true,
									name: true,
									email: true,
								},
							},
						},
					},
					_count: {
						select: {
							userOverrides: true,
							metrics: true,
						},
					},
				},
			}),
			prisma.featureFlag.count({ where: whereClause }),
		]);

		// Get category statistics
		const categoryStats = await prisma.featureFlag.groupBy({
			by: ["category"],
			where: whereClause,
			_count: {
				id: true,
			},
			_sum: {
				rolloutPercentage: true,
			},
		});

		// Get status statistics
		const statusStats = await prisma.featureFlag.groupBy({
			by: ["enabled"],
			where: whereClause,
			_count: {
				id: true,
			},
		});

		const response = {
			flags: flags.map((flag) => ({
				id: flag.id,
				name: flag.name,
				description: flag.description,
				category: flag.category,
				enabled: flag.enabled,
				rolloutPercentage: flag.rolloutPercentage,
				userSpecific: flag.userSpecific,
				systemCritical: flag.systemCritical,
				metadata: flag.metadata,
				createdAt: flag.createdAt.toISOString(),
				updatedAt: flag.updatedAt.toISOString(),
				metrics: flag.metrics,
				userOverrides: flag.userOverrides,
				stats: {
					userOverridesCount: flag._count.userOverrides,
					metricsCount: flag._count.metrics,
				},
			})),
			pagination: {
				total: totalCount,
				limit,
				offset,
				hasMore: offset + limit < totalCount,
				page: Math.floor(offset / limit) + 1,
				totalPages: Math.ceil(totalCount / limit),
			},
			statistics: {
				categories: categoryStats.map((stat) => ({
					category: stat.category,
					count: stat._count.id,
					averageRollout: stat._sum.rolloutPercentage ? Math.round(stat._sum.rolloutPercentage / stat._count.id) : 0,
				})),
				status: statusStats.map((stat) => ({
					enabled: stat.enabled,
					count: stat._count.id,
				})),
				total: totalCount,
			},
			filters: {
				query,
				category,
				enabled,
				userSpecific,
				systemCritical,
				sortBy,
				sortOrder,
			},
		};

		logger.info("Feature flags search completed", {
			userId: session.user.id,
			query,
			totalResults: totalCount,
			returnedResults: flags.length,
		});

		return NextResponse.json(response);
	} catch (error) {
		logger.error("Error searching feature flags", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}
