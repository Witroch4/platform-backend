import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import { createLogger } from "@/lib/utils/logger";

const prisma = getPrismaInstance();
const logger = createLogger("SocialWise-Config-History");

export async function GET(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
	}

	try {
		const { searchParams } = new URL(request.url);
		const inboxId = searchParams.get("inboxId");

		if (!inboxId) {
			return NextResponse.json({ error: "inboxId é obrigatório" }, { status: 400 });
		}

		// Find the ChatwitInbox by inboxId
		const chatwitInbox = await prisma.chatwitInbox.findFirst({
			where: {
				inboxId: inboxId,
				usuarioChatwit: {
					appUserId: session.user.id,
				},
			},
		});

		if (!chatwitInbox) {
			return NextResponse.json({ error: "Inbox não encontrada" }, { status: 404 });
		}

		// Get config history for this inbox
		const configHistory = await prisma.inboxConfigHistory.findMany({
			where: {
				inboxId: chatwitInbox.id,
			},
			include: {
				user: {
					select: {
						name: true,
						email: true,
					},
				},
			},
			orderBy: {
				createdAt: "desc",
			},
			take: 50, // Limit to last 50 changes
		});

		const changes = configHistory.map((entry) => ({
			id: entry.id,
			timestamp: entry.createdAt.toISOString(),
			changeType: entry.changeType,
			description: entry.description || `Configuração ${entry.changeType}`,
			user: {
				name: entry.user.name || "Usuário desconhecido",
				email: entry.user.email,
			},
			previousConfig: entry.previousConfig,
			newConfig: entry.newConfig,
			userId: entry.userId,
			userName: entry.user.name || "Usuário",
		}));

		logger.info("Histórico de configuração carregado", {
			userId: session.user.id,
			inboxId,
			changesCount: changes.length,
		});

		return NextResponse.json({ changes });
	} catch (error: any) {
		logger.error("Erro ao carregar histórico de configuração", error);
		return NextResponse.json(
			{
				error: "Erro interno do servidor",
				details: error.message,
			},
			{ status: 500 },
		);
	}
}
