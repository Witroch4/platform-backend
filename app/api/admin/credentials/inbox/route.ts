// app/api/admin/credentials/inbox/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
const prisma = getPrismaInstance();
/**
 * GET - Lista configurações de credenciais de inbox
 */
export async function GET(request: NextRequest): Promise<Response> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		const { searchParams } = new URL(request.url);
		const inboxId = searchParams.get("inboxId"); // Filtrar por inbox específico

		// Buscar usuário Chatwit
		const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
			where: { appUserId: session.user.id },
		});

		if (!usuarioChatwit) {
			return NextResponse.json({ error: "Usuário Chatwit não encontrado" }, { status: 404 });
		}

		// Construir condições de filtro
		const whereConditions: any = {
			usuarioChatwitId: usuarioChatwit.id,
		};

		if (inboxId) {
			whereConditions.inboxId = inboxId;
		}

		// Buscar configurações de inbox
		const inboxConfigs = await prisma.chatwitInbox.findMany({
			where: whereConditions,
			include: {
				fallbackParaInbox: {
					select: { id: true, nome: true, inboxId: true },
				},
				fallbackDeInboxes: {
					select: { id: true, nome: true, inboxId: true },
				},
				agentes: {
					select: { id: true, nome: true, ativo: true },
				},
				templates: {
					select: { id: true, name: true, type: true, isActive: true },
					where: { isActive: true },
					take: 5, // Últimos 5 templates ativos
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
			orderBy: { nome: "asc" },
		});

		// Formatar resposta
		const formattedConfigs = inboxConfigs.map((inbox) => ({
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
		}));

		console.log(`[Inbox Credentials API] ${formattedConfigs.length} configurações encontradas`);

		return NextResponse.json({
			inboxConfigs: formattedConfigs,
			total: formattedConfigs.length,
		});
	} catch (error) {
		console.error("[Inbox Credentials API] Erro ao buscar configurações:", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}

/**
 * POST - Cria uma nova configuração de inbox
 */
export async function POST(request: NextRequest): Promise<Response> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		const body = await request.json();
		const {
			nome,
			inboxId,
			channelType = "whatsapp",
			whatsappApiKey,
			phoneNumberId,
			whatsappBusinessAccountId,
			fallbackParaInboxId,
		} = body;

		// Validações básicas
		if (!nome || !inboxId) {
			return NextResponse.json({ error: "Nome e inboxId são obrigatórios" }, { status: 400 });
		}

		// Buscar usuário Chatwit
		const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
			where: { appUserId: session.user.id },
		});

		if (!usuarioChatwit) {
			return NextResponse.json({ error: "Usuário Chatwit não encontrado" }, { status: 404 });
		}

		// Verificar se já existe um inbox com o mesmo inboxId
		const existingInbox = await prisma.chatwitInbox.findFirst({
			where: {
				usuarioChatwitId: usuarioChatwit.id,
				inboxId,
			},
		});

		if (existingInbox) {
			return NextResponse.json({ error: "Já existe um inbox com este ID" }, { status: 409 });
		}

		// Validar fallback se fornecido
		if (fallbackParaInboxId) {
			const fallbackInbox = await prisma.chatwitInbox.findFirst({
				where: {
					id: fallbackParaInboxId,
					usuarioChatwitId: usuarioChatwit.id,
				},
			});

			if (!fallbackInbox) {
				return NextResponse.json({ error: "Inbox de fallback não encontrado" }, { status: 400 });
			}
		}

		// Criar configuração de inbox
		const newInbox = await prisma.chatwitInbox.create({
			data: {
				nome,
				inboxId,
				channelType,
				whatsappApiKey,
				phoneNumberId,
				whatsappBusinessAccountId,
				fallbackParaInboxId,
				usuarioChatwitId: usuarioChatwit.id,
			},
			include: {
				fallbackParaInbox: {
					select: { id: true, nome: true, inboxId: true },
				},
				fallbackDeInboxes: {
					select: { id: true, nome: true, inboxId: true },
				},
			},
		});

		console.log(`[Inbox Credentials API] Inbox criado: ${newInbox.id} (${inboxId})`);

		return NextResponse.json(
			{
				id: newInbox.id,
				nome: newInbox.nome,
				inboxId: newInbox.inboxId,
				channelType: newInbox.channelType,
				whatsappApiKey: newInbox.whatsappApiKey ? "***" : null,
				phoneNumberId: newInbox.phoneNumberId,
				whatsappBusinessAccountId: newInbox.whatsappBusinessAccountId,
				fallbackParaInboxId: newInbox.fallbackParaInboxId,
				fallbackParaInbox: newInbox.fallbackParaInbox,
				fallbackDeInboxes: newInbox.fallbackDeInboxes,
				createdAt: newInbox.createdAt,
				updatedAt: newInbox.updatedAt,
				hasCredentials: !!(newInbox.whatsappApiKey || newInbox.phoneNumberId || newInbox.whatsappBusinessAccountId),
				hasFallback: !!newInbox.fallbackParaInboxId,
				isUsedAsFallback: false,
			},
			{ status: 201 },
		);
	} catch (error) {
		console.error("[Inbox Credentials API] Erro ao criar inbox:", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}
