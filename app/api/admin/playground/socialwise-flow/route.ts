/**
 * API endpoint for SocialWise Flow Playground
 * Uses the production flow directly for accurate testing
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import { processSocialWiseFlow, ProcessorContext } from "@/lib/socialwise-flow/processor";
import { createLogger } from "@/lib/utils/logger";
import { nanoid } from "nanoid";

const playgroundLogger = createLogger("SocialWise-Playground");

const PlaygroundRequestSchema = z.object({
	userText: z.string().min(1, "Texto do usuário é obrigatório"),
	channelType: z.enum(["whatsapp", "instagram", "facebook"]).default("whatsapp"),
	assistantId: z.string().min(1, "ID do assistente é obrigatório"),
	embedipreview: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
	try {
		// Verificar autenticação
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
		}

		// Validar entrada
		const body = await request.json();
		const validation = PlaygroundRequestSchema.safeParse(body);

		if (!validation.success) {
			return NextResponse.json(
				{
					error: "Dados inválidos",
					details: validation.error.errors,
				},
				{ status: 400 },
			);
		}

		const { userText, channelType, assistantId, embedipreview } = validation.data;

		// Gerar IDs únicos para simulação
		const traceId = nanoid();

		// Verificar se o assistente existe e pertence ao usuário
		const { getPrismaInstance } = await import("@/lib/connections");
		const prisma = getPrismaInstance();

		const assistant = await prisma.aiAssistant.findFirst({
			where: {
				id: assistantId,
				userId: session.user.id,
				isActive: true,
			},
		});

		if (!assistant) {
			return NextResponse.json({ error: "Assistente não encontrado ou não autorizado." }, { status: 404 });
		}

		// Criar uma inbox simulada para o playground
		const mockInboxId = `playground_${assistantId}_${Date.now()}`;

		// Criar contexto do processador
		const context: ProcessorContext = {
			userText,
			channelType,
			inboxId: mockInboxId,
			chatwitAccountId: session.user.id,
			userId: session.user.id,
			assistantId, // Adicionar assistantId para o playground
			traceId,
		};

		playgroundLogger.info("Processing playground request", {
			userText: userText.substring(0, 100),
			channelType,
			assistantId,
			embedipreview,
			traceId,
		});

		// Usar o fluxo de produção diretamente
		const result = await processSocialWiseFlow(context, embedipreview);

		playgroundLogger.info("Playground processing completed", {
			band: result.metrics.band,
			strategy: result.metrics.strategy,
			routeTotalMs: result.metrics.routeTotalMs,
			traceId,
		});

		return NextResponse.json({
			success: true,
			response: result.response,
			metrics: result.metrics,
			traceId,
		});
	} catch (error) {
		playgroundLogger.error("Playground processing failed", {
			error: error instanceof Error ? error.message : String(error),
		});

		return NextResponse.json(
			{
				error: "Erro interno do servidor",
				details: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 },
		);
	}
}
