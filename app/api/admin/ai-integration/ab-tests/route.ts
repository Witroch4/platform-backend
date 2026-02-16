import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import { createLogger } from "@/lib/utils/logger";

const prisma = getPrismaInstance();
const logger = createLogger("AI-AB-Tests");

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

		const abTests = await prisma.promptABTest.findMany({
			where: { assistantId },
			orderBy: { createdAt: "desc" },
		});

		return NextResponse.json({ abTests });
	} catch (error: any) {
		logger.error("Erro ao carregar testes A/B", error);
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
		const { assistantId, name, description, promptVersions, trafficSplit, endDate } = body;

		if (!assistantId || !name || !promptVersions || !trafficSplit) {
			return NextResponse.json(
				{
					error: "assistantId, name, promptVersions e trafficSplit são obrigatórios",
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

		// Verify all prompt versions belong to this assistant
		const versions = await prisma.promptVersion.findMany({
			where: {
				id: { in: promptVersions },
				assistantId,
			},
		});

		if (versions.length !== promptVersions.length) {
			return NextResponse.json(
				{
					error: "Uma ou mais versões de prompt não pertencem a este assistente",
				},
				{ status: 400 },
			);
		}

		const abTest = await prisma.promptABTest.create({
			data: {
				assistantId,
				name,
				description,
				promptVersions,
				trafficSplit,
				endDate: endDate ? new Date(endDate) : null,
				isActive: true,
				createdById: session.user.id,
			},
		});

		logger.info("Teste A/B criado", {
			userId: session.user.id,
			assistantId,
			abTestId: abTest.id,
			name,
		});

		return NextResponse.json({ abTest }, { status: 201 });
	} catch (error: any) {
		logger.error("Erro ao criar teste A/B", error);
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
		const { id, isActive, winnerVersionId, endDate } = body;

		if (!id) {
			return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
		}

		// Verify ownership through assistant
		const abTest = await prisma.promptABTest.findUnique({
			where: { id },
			include: { assistant: true },
		});

		if (!abTest || abTest.assistant.userId !== session.user.id) {
			return NextResponse.json({ error: "Teste A/B não encontrado" }, { status: 404 });
		}

		const updateData: any = {};
		if (typeof isActive === "boolean") updateData.isActive = isActive;
		if (winnerVersionId) updateData.winnerVersionId = winnerVersionId;
		if (endDate) updateData.endDate = new Date(endDate);

		const updated = await prisma.promptABTest.update({
			where: { id },
			data: updateData,
		});

		return NextResponse.json({ abTest: updated });
	} catch (error: any) {
		logger.error("Erro ao atualizar teste A/B", error);
		return NextResponse.json(
			{
				error: "Erro interno do servidor",
				details: error.message,
			},
			{ status: 500 },
		);
	}
}
