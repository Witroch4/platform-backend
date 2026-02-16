import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import logger from "@/lib/utils/logger";

export async function GET() {
	try {
		const session = await auth();

		if (!session?.user?.id || (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN")) {
			return NextResponse.json(
				{ error: "Acesso negado. Apenas administradores podem acessar feature flags." },
				{ status: 403 },
			);
		}

		const prisma = getPrismaInstance();

		const flags = await prisma.featureFlag.findMany({
			orderBy: [{ category: "asc" }, { name: "asc" }],
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
			},
		});

		logger.info("Feature flags retrieved successfully", {
			userId: session.user.id,
			flagCount: flags.length,
		});

		return NextResponse.json({
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
			})),
		});
	} catch (error) {
		logger.error("Error retrieving feature flags", {
			error: error instanceof Error ? error.message : "Unknown error",
		});

		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}

export async function POST(request: NextRequest) {
	try {
		const session = await auth();

		if (!session?.user?.id || (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN")) {
			return NextResponse.json(
				{ error: "Acesso negado. Apenas administradores podem criar feature flags." },
				{ status: 403 },
			);
		}

		const body = await request.json();
		const {
			name,
			description,
			category = "system",
			enabled = false,
			rolloutPercentage = 100,
			userSpecific = false,
			systemCritical = false,
			metadata = {},
		} = body;

		if (!name || !description) {
			return NextResponse.json({ error: "Nome e descrição são obrigatórios" }, { status: 400 });
		}

		const prisma = getPrismaInstance();

		// Check if flag with same name already exists
		const existingFlag = await prisma.featureFlag.findUnique({
			where: { name },
		});

		if (existingFlag) {
			return NextResponse.json({ error: "Já existe uma feature flag com este nome" }, { status: 409 });
		}

		const flag = await prisma.featureFlag.create({
			data: {
				name,
				description,
				category,
				enabled,
				rolloutPercentage,
				userSpecific,
				systemCritical,
				metadata,
				createdBy: session.user.id,
			},
		});

		logger.info("Feature flag created successfully", {
			userId: session.user.id,
			flagId: flag.id,
			flagName: flag.name,
		});

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
			},
		});
	} catch (error) {
		logger.error("Error creating feature flag", {
			error: error instanceof Error ? error.message : "Unknown error",
		});

		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}
