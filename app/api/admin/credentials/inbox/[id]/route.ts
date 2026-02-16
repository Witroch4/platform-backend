// app/api/admin/credentials/inbox/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
const prisma = getPrismaInstance();
/**
 * GET - Busca configuração específica de inbox
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		const { id } = await params;

		if (!id) {
			return NextResponse.json({ error: "ID do inbox é obrigatório" }, { status: 400 });
		}

		// Buscar usuário Chatwit
		const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
			where: { appUserId: session.user.id },
		});

		if (!usuarioChatwit) {
			return NextResponse.json({ error: "Usuário Chatwit não encontrado" }, { status: 404 });
		}

		// Buscar configuração de inbox
		const inbox = await prisma.chatwitInbox.findFirst({
			where: {
				id,
				usuarioChatwitId: usuarioChatwit.id,
			},
			include: {
				fallbackParaInbox: {
					select: { id: true, nome: true, inboxId: true },
				},
				fallbackDeInboxes: {
					select: { id: true, nome: true, inboxId: true },
				},
				agentes: {
					include: {
						usuarioChatwit: {
							select: { id: true, name: true },
						},
					},
				},
				templates: {
					select: {
						id: true,
						name: true,
						type: true,
						isActive: true,
						usageCount: true,
						createdAt: true,
					},
					orderBy: { createdAt: "desc" },
				},
				mapeamentosIntencao: {
					include: {
						template: {
							select: { id: true, name: true, type: true },
						},
					},
				},
				mapeamentosBotoes: {
					select: {
						id: true,
						buttonId: true,
						actionType: true,
						description: true,
					},
				},
				_count: {
					select: {
						agentes: true,
						templates: true,
						mapeamentosIntencao: true,
						mapeamentosBotoes: true,
					},
				},
			},
		});

		if (!inbox) {
			return NextResponse.json({ error: "Configuração de inbox não encontrada" }, { status: 404 });
		}

		console.log(`[Inbox Detail API] Configuração encontrada: ${inbox.id} (${inbox.inboxId})`);

		return NextResponse.json({
			id: inbox.id,
			nome: inbox.nome,
			inboxId: inbox.inboxId,
			channelType: inbox.channelType,
			whatsappApiKey: inbox.whatsappApiKey ? "***" : null, // Mascarar por segurança
			phoneNumberId: inbox.phoneNumberId,
			whatsappBusinessAccountId: inbox.whatsappBusinessAccountId,
			fallbackParaInboxId: inbox.fallbackParaInboxId,
			fallbackParaInbox: inbox.fallbackParaInbox,
			fallbackDeInboxes: inbox.fallbackDeInboxes,
			agentes: inbox.agentes,
			templates: inbox.templates,
			mapeamentosIntencao: inbox.mapeamentosIntencao,
			mapeamentosBotoes: inbox.mapeamentosBotoes,
			createdAt: inbox.createdAt,
			updatedAt: inbox.updatedAt,
			// Status e estatísticas
			hasCredentials: !!(inbox.whatsappApiKey || inbox.phoneNumberId || inbox.whatsappBusinessAccountId),
			hasFallback: !!inbox.fallbackParaInboxId,
			isUsedAsFallback: inbox.fallbackDeInboxes.length > 0,
			stats: {
				agentesCount: inbox._count.agentes,
				templatesCount: inbox._count.templates,
				mapeamentosIntencaoCount: inbox._count.mapeamentosIntencao,
				mapeamentosBotoesCount: inbox._count.mapeamentosBotoes,
			},
		});
	} catch (error) {
		console.error("[Inbox Detail API] Erro ao buscar configuração:", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}

/**
 * PUT - Atualiza configuração de inbox
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		const { id } = await params;
		const body = await request.json();

		if (!id) {
			return NextResponse.json({ error: "ID do inbox é obrigatório" }, { status: 400 });
		}

		// Buscar usuário Chatwit
		const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
			where: { appUserId: session.user.id },
		});

		if (!usuarioChatwit) {
			return NextResponse.json({ error: "Usuário Chatwit não encontrado" }, { status: 404 });
		}

		// Verificar se o inbox existe
		const existingInbox = await prisma.chatwitInbox.findFirst({
			where: {
				id,
				usuarioChatwitId: usuarioChatwit.id,
			},
		});

		if (!existingInbox) {
			return NextResponse.json({ error: "Configuração de inbox não encontrada" }, { status: 404 });
		}

		const { nome, whatsappApiKey, phoneNumberId, whatsappBusinessAccountId, fallbackParaInboxId } = body;

		// Validar fallback se fornecido
		if (fallbackParaInboxId && fallbackParaInboxId !== existingInbox.fallbackParaInboxId) {
			// Verificar se não está criando um loop
			if (fallbackParaInboxId === id) {
				return NextResponse.json({ error: "Um inbox não pode fazer fallback para si mesmo" }, { status: 400 });
			}

			// Verificar se o inbox de fallback existe
			const fallbackInbox = await prisma.chatwitInbox.findFirst({
				where: {
					id: fallbackParaInboxId,
					usuarioChatwitId: usuarioChatwit.id,
				},
			});

			if (!fallbackInbox) {
				return NextResponse.json({ error: "Inbox de fallback não encontrado" }, { status: 400 });
			}

			// Verificar se não está criando um loop indireto
			const checkLoop = async (
				currentId: string,
				targetId: string,
				visited: Set<string> = new Set(),
			): Promise<boolean> => {
				if (visited.has(currentId)) return true; // Loop detectado
				visited.add(currentId);

				const current = await prisma.chatwitInbox.findUnique({
					where: { id: currentId },
					select: { fallbackParaInboxId: true },
				});

				if (!current?.fallbackParaInboxId) return false;
				if (current.fallbackParaInboxId === targetId) return true; // Loop detectado

				return checkLoop(current.fallbackParaInboxId, targetId, visited);
			};

			if (await checkLoop(fallbackParaInboxId, id)) {
				return NextResponse.json({ error: "Esta configuração de fallback criaria um loop" }, { status: 400 });
			}
		}

		// Preparar dados de atualização
		const updateData: any = {};
		if (nome !== undefined) updateData.nome = nome;
		if (whatsappApiKey !== undefined) updateData.whatsappApiKey = whatsappApiKey;
		if (phoneNumberId !== undefined) updateData.phoneNumberId = phoneNumberId;
		if (whatsappBusinessAccountId !== undefined) updateData.whatsappBusinessAccountId = whatsappBusinessAccountId;
		if (fallbackParaInboxId !== undefined) updateData.fallbackParaInboxId = fallbackParaInboxId;

		// Atualizar configuração de inbox
		const updatedInbox = await prisma.chatwitInbox.update({
			where: { id },
			data: updateData,
			include: {
				fallbackParaInbox: {
					select: { id: true, nome: true, inboxId: true },
				},
				fallbackDeInboxes: {
					select: { id: true, nome: true, inboxId: true },
				},
			},
		});

		console.log(`[Inbox Detail API] Configuração atualizada: ${updatedInbox.id} (${updatedInbox.inboxId})`);

		return NextResponse.json({
			id: updatedInbox.id,
			nome: updatedInbox.nome,
			inboxId: updatedInbox.inboxId,
			channelType: updatedInbox.channelType,
			whatsappApiKey: updatedInbox.whatsappApiKey ? "***" : null,
			phoneNumberId: updatedInbox.phoneNumberId,
			whatsappBusinessAccountId: updatedInbox.whatsappBusinessAccountId,
			fallbackParaInboxId: updatedInbox.fallbackParaInboxId,
			fallbackParaInbox: updatedInbox.fallbackParaInbox,
			fallbackDeInboxes: updatedInbox.fallbackDeInboxes,
			createdAt: updatedInbox.createdAt,
			updatedAt: updatedInbox.updatedAt,
			hasCredentials: !!(
				updatedInbox.whatsappApiKey ||
				updatedInbox.phoneNumberId ||
				updatedInbox.whatsappBusinessAccountId
			),
			hasFallback: !!updatedInbox.fallbackParaInboxId,
			isUsedAsFallback: updatedInbox.fallbackDeInboxes.length > 0,
		});
	} catch (error) {
		console.error("[Inbox Detail API] Erro ao atualizar configuração:", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}

/**
 * DELETE - Remove configuração de inbox
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		const { id } = await params;

		if (!id) {
			return NextResponse.json({ error: "ID do inbox é obrigatório" }, { status: 400 });
		}

		// Buscar usuário Chatwit
		const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
			where: { appUserId: session.user.id },
		});

		if (!usuarioChatwit) {
			return NextResponse.json({ error: "Usuário Chatwit não encontrado" }, { status: 404 });
		}

		// Verificar se o inbox existe
		const existingInbox = await prisma.chatwitInbox.findFirst({
			where: {
				id,
				usuarioChatwitId: usuarioChatwit.id,
			},
			include: {
				fallbackDeInboxes: {
					select: { id: true, nome: true },
				},
				_count: {
					select: {
						agentes: true,
						templates: true,
						mapeamentosIntencao: true,
						mapeamentosBotoes: true,
					},
				},
			},
		});

		if (!existingInbox) {
			return NextResponse.json({ error: "Configuração de inbox não encontrada" }, { status: 404 });
		}

		// Verificar se o inbox está sendo usado como fallback
		if (existingInbox.fallbackDeInboxes.length > 0) {
			return NextResponse.json(
				{
					error: "Não é possível remover um inbox que está sendo usado como fallback por outros inboxes",
					usedBy: existingInbox.fallbackDeInboxes,
				},
				{ status: 409 },
			);
		}

		// Verificar se o inbox tem dados relacionados
		const hasRelatedData =
			existingInbox._count.agentes > 0 ||
			existingInbox._count.templates > 0 ||
			existingInbox._count.mapeamentosIntencao > 0 ||
			existingInbox._count.mapeamentosBotoes > 0;

		if (hasRelatedData) {
			return NextResponse.json(
				{
					error: "Não é possível remover um inbox que possui dados relacionados (agentes, templates, mapeamentos)",
					relatedData: {
						agentes: existingInbox._count.agentes,
						templates: existingInbox._count.templates,
						mapeamentosIntencao: existingInbox._count.mapeamentosIntencao,
						mapeamentosBotoes: existingInbox._count.mapeamentosBotoes,
					},
				},
				{ status: 409 },
			);
		}

		// Remover configuração de inbox
		await prisma.chatwitInbox.delete({
			where: { id },
		});

		console.log(`[Inbox Detail API] Configuração removida: ${id} (${existingInbox.inboxId})`);

		return NextResponse.json({ message: "Configuração de inbox removida com sucesso" });
	} catch (error) {
		console.error("[Inbox Detail API] Erro ao remover configuração:", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}
