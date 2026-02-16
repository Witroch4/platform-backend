/**
 * API Route para listar conversas agrupadas por lead
 * GET /api/admin/leads-chatwit/all-messages?page=1&limit=20&search=termo
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import type { Prisma } from "@prisma/client";

const prisma = getPrismaInstance();

export interface LeadConversation {
	lead: {
		id: string;
		name: string | null;
		phone: string | null;
		avatarUrl: string | null;
		source: string | null;
	};
	lastActivity: string;
	messageCount: number;
	messages: {
		id: string;
		content: string;
		isFromLead: boolean;
		messageType: string;
		createdAt: string;
		metadata: Record<string, unknown> | null;
	}[];
}

export interface AllMessagesResponse {
	conversations: LeadConversation[];
	pagination: {
		total: number;
		page: number;
		limit: number;
		totalPages: number;
	};
}

export async function GET(request: NextRequest): Promise<Response> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
		}

		const { searchParams } = new URL(request.url);
		const page = Number.parseInt(searchParams.get("page") || "1", 10);
		const limit = Math.min(Number.parseInt(searchParams.get("limit") || "20", 10), 50);
		const search = searchParams.get("search") || "";
		const skip = (page - 1) * limit;

		// Verificar role do usuário
		const currentUser = await prisma.user.findUnique({
			where: { id: session.user.id },
			select: { role: true },
		});

		// Verificar se tem token Chatwit (para ADMIN)
		const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
			where: { appUserId: session.user.id },
			select: { id: true },
		});

		// Construir filtro base para chats (que têm mensagens)
		let chatWhere: Prisma.ChatWhereInput = {
			messages: {
				some: {}, // Apenas chats com pelo menos uma mensagem
			},
		};

		// Controle de acesso
		if (currentUser?.role !== "SUPERADMIN") {
			if (!usuarioChatwit) {
				return NextResponse.json({
					conversations: [],
					pagination: { total: 0, page, limit, totalPages: 0 },
				});
			}

			chatWhere = {
				...chatWhere,
				lead: {
					oabData: {
						usuarioChatwitId: usuarioChatwit.id,
					},
				},
			};
		}

		// Filtro de busca
		if (search.trim()) {
			chatWhere = {
				...chatWhere,
				OR: [
					{
						lead: {
							name: { contains: search, mode: "insensitive" as const },
						},
					},
					{
						lead: {
							phone: { contains: search, mode: "insensitive" as const },
						},
					},
					{
						messages: {
							some: {
								content: { contains: search, mode: "insensitive" as const },
							},
						},
					},
				],
			};
		}

		// Buscar chats com leads e suas mensagens mais recentes
		const [chats, total] = await Promise.all([
			prisma.chat.findMany({
				where: chatWhere,
				orderBy: {
					updatedAt: "desc", // Mais recentes primeiro
				},
				skip,
				take: limit,
				select: {
					id: true,
					updatedAt: true,
					lead: {
						select: {
							id: true,
							name: true,
							phone: true,
							avatarUrl: true,
							source: true,
						},
					},
					messages: {
						orderBy: { createdAt: "desc" },
						take: 5, // Últimas 5 mensagens por lead
						select: {
							id: true,
							content: true,
							isFromLead: true,
							messageType: true,
							createdAt: true,
							metadata: true,
						},
					},
					_count: {
						select: { messages: true },
					},
				},
			}),
			prisma.chat.count({ where: chatWhere }),
		]);

		// Transformar para o formato esperado
		const conversations: LeadConversation[] = chats.map((chat) => ({
			lead: {
				id: chat.lead.id,
				name: chat.lead.name,
				phone: chat.lead.phone,
				avatarUrl: chat.lead.avatarUrl,
				source: chat.lead.source,
			},
			lastActivity: chat.updatedAt.toISOString(),
			messageCount: chat._count.messages,
			messages: chat.messages.reverse().map((msg) => ({
				id: msg.id,
				content: msg.content,
				isFromLead: msg.isFromLead,
				messageType: msg.messageType,
				createdAt: msg.createdAt.toISOString(),
				metadata: msg.metadata as Record<string, unknown> | null,
			})),
		}));

		return NextResponse.json({
			conversations,
			pagination: {
				total,
				page,
				limit,
				totalPages: Math.ceil(total / limit),
			},
		});
	} catch (error) {
		console.error("[All Messages API] Erro:", error);
		return NextResponse.json({ error: "Erro ao buscar mensagens" }, { status: 500 });
	}
}
