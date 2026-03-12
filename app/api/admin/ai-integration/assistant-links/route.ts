// app/api/admin/ai-integration/assistant-links/route.ts
// API endpoints for managing AiAssistantInbox links

import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import { invalidateAssistantConfigurationCache } from "@/lib/socialwise-flow/processor-components/assistant-config-cache";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Validation schemas
const toggleLinkSchema = z.object({
	assistantId: z.string().min(1, "Assistant ID é obrigatório"),
	inboxId: z.string().min(1, "Inbox ID é obrigatório"),
	isActive: z.boolean(),
});

const createLinkSchema = z.object({
	assistantId: z.string().min(1, "ID do assistente é obrigatório"),
	inboxId: z.string().min(1, "ID da caixa é obrigatório"),
	isActive: z.boolean().optional().default(true),
});

// POST /api/admin/ai-integration/assistant-links
export async function POST(request: NextRequest): Promise<NextResponse> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
		}

		const body = await request.json();

		// Validar dados de entrada
		const validatedData = createLinkSchema.parse(body);

		const prisma = getPrismaInstance();

		// Verificar se o assistente pertence ao usuário
		const assistant = await prisma.aiAssistant.findFirst({
			where: {
				id: validatedData.assistantId,
				userId: session.user.id,
			},
		});

		if (!assistant) {
			return NextResponse.json({ error: "Assistente não encontrado ou acesso negado." }, { status: 404 });
		}

		// Verificar se a caixa pertence ao usuário
		const inbox = await prisma.chatwitInbox.findFirst({
			where: {
				inboxId: validatedData.inboxId,
				usuarioChatwit: {
					appUserId: session.user.id,
				},
			},
		});

		if (!inbox) {
			return NextResponse.json({ error: "Caixa não encontrada ou acesso negado." }, { status: 404 });
		}

		// Verificar se o link já existe
		const existingLink = await prisma.aiAssistantInbox.findFirst({
			where: {
				assistantId: validatedData.assistantId,
				inboxDbId: inbox.id, // usar o ID interno da caixa
			},
		});

		if (existingLink) {
			// Se já existe, apenas atualizar o isActive
			const updatedLink = await prisma.aiAssistantInbox.update({
				where: {
					id: existingLink.id,
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

			console.log(`[Assistant Link] Reativado link entre assistente "${assistant.name}" e caixa "${inbox.nome}"`);
			await invalidateAssistantConfigurationCache("assistant_link_reactivated");

			return NextResponse.json({
				success: true,
				data: updatedLink,
				message: "Link reativado com sucesso.",
			});
		}

		// Criar novo link
		const newLink = await prisma.aiAssistantInbox.create({
			data: {
				assistantId: validatedData.assistantId,
				inboxDbId: inbox.id, // usar o ID interno da caixa
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

		console.log(`[Assistant Link] Criado link entre assistente "${assistant.name}" e caixa "${inbox.nome}"`);
		await invalidateAssistantConfigurationCache("assistant_link_created");

		return NextResponse.json({
			success: true,
			data: newLink,
			message: "Assistente conectado à caixa com sucesso.",
		});
	} catch (error) {
		console.error("[Assistant Link POST] Error:", error);

		if (error instanceof z.ZodError) {
			return NextResponse.json({ error: "Dados inválidos.", details: error.errors }, { status: 400 });
		}

		return NextResponse.json({ error: "Erro interno do servidor." }, { status: 500 });
	}
}

// PATCH /api/admin/ai-integration/assistant-links
export async function PATCH(request: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ success: false, error: "Usuário não autenticado." }, { status: 401 });
		}

		const body = await request.json();
		const validation = toggleLinkSchema.safeParse(body);

		if (!validation.success) {
			return NextResponse.json(
				{ success: false, error: "Dados inválidos", details: validation.error.errors },
				{ status: 400 },
			);
		}

		const { assistantId, inboxId, isActive } = validation.data;
		const prisma = getPrismaInstance();

		// Verificar se o assistente pertence ao usuário
		const assistant = await prisma.aiAssistant.findFirst({
			where: {
				id: assistantId,
				userId: session.user.id,
			},
		});

		if (!assistant) {
			return NextResponse.json(
				{ success: false, error: "Assistente não encontrado ou não autorizado." },
				{ status: 404 },
			);
		}

		// Verificar se a inbox pertence ao usuário
		const inbox = await prisma.chatwitInbox.findFirst({
			where: {
				inboxId: inboxId,
				usuarioChatwit: {
					appUserId: session.user.id,
				},
			},
		});

		if (!inbox) {
			return NextResponse.json(
				{ success: false, error: "Caixa de entrada não encontrada ou não autorizada." },
				{ status: 404 },
			);
		}

		// Atualizar ou criar o link
		const link = await prisma.aiAssistantInbox.upsert({
			where: {
				assistantId_inboxDbId: {
					assistantId: assistantId,
					inboxDbId: inbox.id,
				},
			},
			update: {
				isActive: isActive,
			},
			create: {
				assistantId: assistantId,
				inboxDbId: inbox.id,
				isActive: isActive,
			},
			include: {
				assistant: {
					select: {
						id: true,
						name: true,
						model: true,
						description: true,
					},
				},
				inbox: {
					select: {
						id: true,
						nome: true,
						inboxId: true,
					},
				},
			},
		});
		await invalidateAssistantConfigurationCache("assistant_link_updated");

		return NextResponse.json({
			success: true,
			data: {
				linkId: link.id,
				assistantId: link.assistantId,
				inboxId: link.inbox.inboxId,
				isActive: link.isActive,
				assistant: link.assistant,
				inbox: link.inbox,
			},
		});
	} catch (error) {
		console.error("Error toggling assistant link:", error);
		return NextResponse.json({ success: false, error: "Erro interno do servidor" }, { status: 500 });
	}
}
