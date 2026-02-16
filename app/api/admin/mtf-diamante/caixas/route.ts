// app/api/admin/mtf-diamante/caixas/route.ts
// API endpoints for managing ChatwitInbox (Caixas) in MTF Diamante

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import type { ApiResponse } from "@/app/admin/mtf-diamante/lib/types";
import type { ChatwitInbox } from "@/types/dialogflow";

// Validation schemas
const createCaixaSchema = z.object({
	nome: z.string().min(1, "Nome é obrigatório"),
	inboxId: z.string().min(1, "InboxId é obrigatório"),
	channelType: z.string().min(1, "Tipo de canal é obrigatório"),
	whatsappApiKey: z.string().optional(),
	phoneNumberId: z.string().optional(),
	whatsappBusinessAccountId: z.string().optional(),
	fallbackParaInboxId: z.string().optional(),
	socialwiseInheritFromAgent: z.boolean().optional(),
	socialwiseReasoningEffort: z.enum(["minimal", "low", "medium", "high"]).optional(),
	socialwiseVerbosity: z.enum(["low", "medium", "high"]).optional(),
	socialwiseTemperature: z.number().min(0).max(2).optional(),
	socialwiseTempSchema: z.number().min(0).max(0.2).optional(),
	socialwiseWarmupDeadlineMs: z.number().positive().optional(),
	socialwiseHardDeadlineMs: z.number().positive().optional(),
	socialwiseSoftDeadlineMs: z.number().positive().optional(),
	socialwiseShortTitleLLM: z.boolean().optional(),
	socialwiseToolChoice: z.enum(["none", "auto"]).optional(),
});

const updateCaixaSchema = createCaixaSchema.partial();

// GET /api/admin/mtf-diamante/caixas
export async function GET(request: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ success: false, error: "Usuário não autenticado." } as ApiResponse, { status: 401 });
		}

		const prisma = getPrismaInstance();

		// Get user's ChatwitInboxes
		const caixas = await prisma.chatwitInbox.findMany({
			where: {
				usuarioChatwit: {
					appUserId: session.user.id,
				},
			},
			include: {
				usuarioChatwit: true,
				fallbackParaInbox: true,
				templates: {
					select: {
						id: true,
						name: true,
						type: true,
					},
				},
				aiAssistantLinks: {
					select: {
						id: true,
						assistantId: true,
					},
				},
				_count: {
					select: {
						templates: true,
						mapeamentosBotoes: true,
						mapeamentosIntencao: true,
					},
				},
			},
			orderBy: {
				createdAt: "desc",
			},
		});

		return NextResponse.json({
			success: true,
			data: caixas,
		} as ApiResponse<ChatwitInbox[]>);
	} catch (error) {
		console.error("Error fetching caixas:", error);
		return NextResponse.json({ success: false, error: "Erro interno do servidor" } as ApiResponse, { status: 500 });
	}
}

// POST /api/admin/mtf-diamante/caixas
export async function POST(request: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ success: false, error: "Usuário não autenticado." } as ApiResponse, { status: 401 });
		}

		const body = await request.json();

		// Validate request body
		const validationResult = createCaixaSchema.safeParse(body);
		if (!validationResult.success) {
			return NextResponse.json(
				{
					success: false,
					error: "Dados inválidos",
					details: validationResult.error.errors,
				} as ApiResponse,
				{ status: 400 },
			);
		}

		const data = validationResult.data;
		const prisma = getPrismaInstance();

		// Get user's UsuarioChatwit record
		const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
			where: { appUserId: session.user.id },
		});

		if (!usuarioChatwit) {
			return NextResponse.json({ success: false, error: "Usuário Chatwit não encontrado" } as ApiResponse, {
				status: 404,
			});
		}

		// Check if inboxId already exists for this user
		const existingCaixa = await prisma.chatwitInbox.findUnique({
			where: {
				usuarioChatwitId_inboxId: {
					usuarioChatwitId: usuarioChatwit.id,
					inboxId: data.inboxId,
				},
			},
		});

		if (existingCaixa) {
			return NextResponse.json({ success: false, error: "InboxId já existe para este usuário" } as ApiResponse, {
				status: 409,
			});
		}

		// Create new caixa
		const newCaixa = await prisma.chatwitInbox.create({
			data: {
				...data,
				usuarioChatwitId: usuarioChatwit.id,
			},
			include: {
				usuarioChatwit: true,
				fallbackParaInbox: true,
				templates: {
					select: {
						id: true,
						name: true,
						type: true,
					},
				},
				aiAssistantLinks: {
					select: {
						id: true,
						assistantId: true,
					},
				},
				_count: {
					select: {
						templates: true,
						mapeamentosBotoes: true,
						mapeamentosIntencao: true,
					},
				},
			},
		});

		return NextResponse.json(
			{
				success: true,
				data: newCaixa,
				message: "Caixa criada com sucesso",
			} as ApiResponse<ChatwitInbox>,
			{ status: 201 },
		);
	} catch (error) {
		console.error("Error creating caixa:", error);
		return NextResponse.json({ success: false, error: "Erro interno do servidor" } as ApiResponse, { status: 500 });
	}
}
