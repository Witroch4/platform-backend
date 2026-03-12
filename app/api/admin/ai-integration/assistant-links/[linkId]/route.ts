// app/api/admin/ai-integration/assistant-links/[linkId]/route.ts
// API para gerenciar links entre assistentes IA e caixas de entrada

import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import { invalidateAssistantConfigurationCache } from "@/lib/socialwise-flow/processor-components/assistant-config-cache";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Schema de validação para atualizar link
const updateLinkSchema = z.object({
	isActive: z.boolean(),
});

// PATCH /api/admin/ai-integration/assistant-links/[linkId]
export async function PATCH(
	request: NextRequest,
	{ params }: { params: Promise<{ linkId: string }> },
): Promise<NextResponse> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
		}

		const { linkId } = await params;
		const body = await request.json();

		// Validar dados de entrada
		const validatedData = updateLinkSchema.parse(body);

		const prisma = getPrismaInstance();

		// Verificar se o link existe e pertence ao usuário
		const existingLink = await prisma.aiAssistantInbox.findFirst({
			where: {
				id: linkId,
				assistant: {
					userId: session.user.id,
				},
			},
			include: {
				assistant: {
					select: {
						name: true,
					},
				},
				inbox: {
					select: {
						nome: true,
					},
				},
			},
		});

		if (!existingLink) {
			return NextResponse.json({ error: "Link não encontrado ou acesso negado." }, { status: 404 });
		}

		// Atualizar o status do link
		const updatedLink = await prisma.aiAssistantInbox.update({
			where: {
				id: linkId,
			},
			data: {
				isActive: validatedData.isActive,
			},
			include: {
				assistant: {
					select: {
						name: true,
					},
				},
				inbox: {
					select: {
						nome: true,
					},
				},
			},
		});

		console.log(
			`[Assistant Link] ${validatedData.isActive ? "Ativado" : "Desativado"} link entre assistente "${existingLink.assistant.name}" e caixa "${existingLink.inbox.nome}"`,
		);
		await invalidateAssistantConfigurationCache("assistant_link_status_updated");

		return NextResponse.json({
			success: true,
			data: updatedLink,
			message: `Assistente ${validatedData.isActive ? "ativado" : "desativado"} na caixa com sucesso.`,
		});
	} catch (error) {
		console.error("[Assistant Link PATCH] Error:", error);

		if (error instanceof z.ZodError) {
			return NextResponse.json({ error: "Dados inválidos.", details: error.errors }, { status: 400 });
		}

		return NextResponse.json({ error: "Erro interno do servidor." }, { status: 500 });
	}
}

// GET /api/admin/ai-integration/assistant-links/[linkId]
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ linkId: string }> },
): Promise<NextResponse> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
		}

		const { linkId } = await params;
		const prisma = getPrismaInstance();

		// Buscar o link
		const link = await prisma.aiAssistantInbox.findFirst({
			where: {
				id: linkId,
				assistant: {
					userId: session.user.id,
				},
			},
			include: {
				assistant: {
					select: {
						id: true,
						name: true,
						description: true,
						model: true,
						isActive: true,
					},
				},
				inbox: {
					select: {
						id: true,
						nome: true,
						inboxId: true,
						channelType: true,
					},
				},
			},
		});

		if (!link) {
			return NextResponse.json({ error: "Link não encontrado." }, { status: 404 });
		}

		return NextResponse.json({
			success: true,
			data: link,
		});
	} catch (error) {
		console.error("[Assistant Link GET] Error:", error);
		return NextResponse.json({ error: "Erro interno do servidor." }, { status: 500 });
	}
}
