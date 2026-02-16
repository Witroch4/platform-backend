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
			return NextResponse.json(
				{ error: "Acesso negado. Apenas SUPERADMIN pode acessar feature flags." },
				{ status: 403 },
			);
		}

		const { id } = await params;
		const prisma = getPrismaInstance();

		const flag = await prisma.featureFlag.findUnique({
			where: { id },
			include: {
				metrics: {
					orderBy: { date: "desc" },
					take: 30, // Last 30 days
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
			},
		});

		if (!flag) {
			return NextResponse.json({ error: "Feature flag não encontrada" }, { status: 404 });
		}

		return NextResponse.json({
			flag: {
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
			},
		});
	} catch (error) {
		logger.error("Error retrieving feature flag", {
			error: error instanceof Error ? error.message : "Unknown error",
		});

		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
	try {
		const session = await auth();

		if (!session?.user?.id || session.user.role !== "SUPERADMIN") {
			return NextResponse.json(
				{ error: "Acesso negado. Apenas SUPERADMIN pode atualizar feature flags." },
				{ status: 403 },
			);
		}

		const { id } = await params;
		const body = await request.json();
		const prisma = getPrismaInstance();

		// Check if flag exists
		const existingFlag = await prisma.featureFlag.findUnique({
			where: { id },
		});

		if (!existingFlag) {
			return NextResponse.json({ error: "Feature flag não encontrada" }, { status: 404 });
		}

		// Update flag
		const updatedFlag = await prisma.featureFlag.update({
			where: { id },
			data: {
				...body,
				updatedAt: new Date(),
			},
		});

		// If this is a global toggle, also update Redis cache
		if (body.enabled !== undefined) {
			try {
				// Import Redis dynamically to avoid edge runtime issues
				const { getRedisInstance } = await import("@/lib/connections");
				const redis = getRedisInstance();

				const cacheKey = `feature_flag:${updatedFlag.name}`;
				await redis.setex(
					cacheKey,
					3600,
					JSON.stringify({
						enabled: updatedFlag.enabled,
						rolloutPercentage: updatedFlag.rolloutPercentage,
						userSpecific: updatedFlag.userSpecific,
					}),
				);

				logger.info("Feature flag cache updated", {
					flagId: id,
					flagName: updatedFlag.name,
					enabled: updatedFlag.enabled,
				});
			} catch (redisError) {
				logger.warn("Failed to update Redis cache for feature flag", {
					flagId: id,
					error: redisError instanceof Error ? redisError.message : "Unknown error",
				});
			}
		}

		logger.info("Feature flag updated successfully", {
			userId: session.user.id,
			flagId: id,
			flagName: updatedFlag.name,
			changes: body,
		});

		return NextResponse.json({
			flag: {
				id: updatedFlag.id,
				name: updatedFlag.name,
				description: updatedFlag.description,
				category: updatedFlag.category,
				enabled: updatedFlag.enabled,
				rolloutPercentage: updatedFlag.rolloutPercentage,
				userSpecific: updatedFlag.userSpecific,
				systemCritical: updatedFlag.systemCritical,
				metadata: updatedFlag.metadata,
				createdAt: updatedFlag.createdAt.toISOString(),
				updatedAt: updatedFlag.updatedAt.toISOString(),
			},
		});
	} catch (error) {
		logger.error("Error updating feature flag", {
			error: error instanceof Error ? error.message : "Unknown error",
		});

		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
	try {
		const session = await auth();

		if (!session?.user?.id || session.user.role !== "SUPERADMIN") {
			return NextResponse.json(
				{ error: "Acesso negado. Apenas SUPERADMIN pode deletar feature flags." },
				{ status: 403 },
			);
		}

		const { id } = await params;
		const prisma = getPrismaInstance();

		// Check if flag exists and is not system critical
		const existingFlag = await prisma.featureFlag.findUnique({
			where: { id },
		});

		if (!existingFlag) {
			return NextResponse.json({ error: "Feature flag não encontrada" }, { status: 404 });
		}

		if (existingFlag.systemCritical) {
			return NextResponse.json({ error: "Não é possível deletar feature flags críticas do sistema" }, { status: 400 });
		}

		// Delete flag (cascade will handle related records)
		await prisma.featureFlag.delete({
			where: { id },
		});

		// Remove from Redis cache
		try {
			const { getRedisInstance } = await import("@/lib/connections");
			const redis = getRedisInstance();

			const cacheKey = `feature_flag:${existingFlag.name}`;
			await redis.del(cacheKey);
		} catch (redisError) {
			logger.warn("Failed to remove feature flag from Redis cache", {
				flagId: id,
				error: redisError instanceof Error ? redisError.message : "Unknown error",
			});
		}

		logger.info("Feature flag deleted successfully", {
			userId: session.user.id,
			flagId: id,
			flagName: existingFlag.name,
		});

		return NextResponse.json({ success: true });
	} catch (error) {
		logger.error("Error deleting feature flag", {
			error: error instanceof Error ? error.message : "Unknown error",
		});

		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}
