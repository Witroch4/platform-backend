import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import { createLogger } from "@/lib/utils/logger";

const prisma = getPrismaInstance();
const logger = createLogger("AI-Prompt-Versions");

export async function GET(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
	}

	const { searchParams } = new URL(request.url);
	const assistantId = searchParams.get("assistantId");

	if (!assistantId) {
		return NextResponse.json({ error: "assistantId é obrigatório" }, { status: 400 });
	}

	try {
		// Verify assistant ownership
		const assistant = await prisma.aiAssistant.findUnique({
			where: { id: assistantId, userId: session.user.id },
		});

		if (!assistant) {
			return NextResponse.json({ error: "Assistente não encontrado" }, { status: 404 });
		}

		const promptVersions = await prisma.promptVersion.findMany({
			where: { assistantId },
			include: {
				metrics: {
					orderBy: { date: "desc" },
					take: 30, // Last 30 days
				},
				_count: {
					select: { auditLogs: true },
				},
			},
			orderBy: { createdAt: "desc" },
		});

		return NextResponse.json({ promptVersions });
	} catch (error: any) {
		logger.error("Erro ao carregar versões de prompt", error);
		return NextResponse.json(
			{
				error: "Erro interno do servidor",
				details: error.message,
			},
			{ status: 500 },
		);
	}
}

export async function POST(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { assistantId, name, promptType, content, systemPrompt, temperature, maxTokens, isDefault } = body;

		if (!assistantId || !name || !promptType || !content) {
			return NextResponse.json(
				{
					error: "assistantId, name, promptType e content são obrigatórios",
				},
				{ status: 400 },
			);
		}

		// Verify assistant ownership
		const assistant = await prisma.aiAssistant.findUnique({
			where: { id: assistantId, userId: session.user.id },
		});

		if (!assistant) {
			return NextResponse.json({ error: "Assistente não encontrado" }, { status: 404 });
		}

		// Generate version number
		const existingVersions = await prisma.promptVersion.count({
			where: { assistantId, name },
		});
		const version = `v${existingVersions + 1}`;

		// If this is set as default, unset other defaults for this prompt type
		if (isDefault) {
			await prisma.promptVersion.updateMany({
				where: { assistantId, promptType, isDefault: true },
				data: { isDefault: false },
			});
		}

		const promptVersion = await prisma.promptVersion.create({
			data: {
				assistantId,
				name,
				version,
				promptType,
				content,
				systemPrompt,
				temperature,
				maxTokens,
				isActive: true,
				isDefault: !!isDefault,
				createdById: session.user.id,
			},
			include: {
				metrics: true,
				_count: {
					select: { auditLogs: true },
				},
			},
		});

		logger.info("Versão de prompt criada", {
			userId: session.user.id,
			assistantId,
			promptVersionId: promptVersion.id,
			name,
			version,
		});

		return NextResponse.json({ promptVersion }, { status: 201 });
	} catch (error: any) {
		logger.error("Erro ao criar versão de prompt", error);
		return NextResponse.json(
			{
				error: "Erro interno do servidor",
				details: error.message,
			},
			{ status: 500 },
		);
	}
}

export async function PATCH(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { id, isActive, isDefault, abTestWeight } = body;

		if (!id) {
			return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
		}

		// Verify ownership through assistant
		const promptVersion = await prisma.promptVersion.findUnique({
			where: { id },
			include: { assistant: true },
		});

		if (!promptVersion || promptVersion.assistant.userId !== session.user.id) {
			return NextResponse.json({ error: "Versão de prompt não encontrada" }, { status: 404 });
		}

		const updateData: any = {};
		if (typeof isActive === "boolean") updateData.isActive = isActive;
		if (typeof isDefault === "boolean") {
			updateData.isDefault = isDefault;
			// If setting as default, unset others
			if (isDefault) {
				await prisma.promptVersion.updateMany({
					where: {
						assistantId: promptVersion.assistantId,
						promptType: promptVersion.promptType,
						isDefault: true,
						id: { not: id },
					},
					data: { isDefault: false },
				});
			}
		}
		if (typeof abTestWeight === "number") updateData.abTestWeight = abTestWeight;

		const updated = await prisma.promptVersion.update({
			where: { id },
			data: updateData,
			include: {
				metrics: true,
				_count: {
					select: { auditLogs: true },
				},
			},
		});

		return NextResponse.json({ promptVersion: updated });
	} catch (error: any) {
		logger.error("Erro ao atualizar versão de prompt", error);
		return NextResponse.json(
			{
				error: "Erro interno do servidor",
				details: error.message,
			},
			{ status: 500 },
		);
	}
}
