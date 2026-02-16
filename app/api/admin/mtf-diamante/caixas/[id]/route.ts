// app/api/admin/mtf-diamante/caixas/[id]/route.ts
// Individual caixa endpoints for MTF Diamante

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import type { ApiResponse } from "@/app/admin/mtf-diamante/lib/types";
import type { ChatwitInbox } from "@/types/dialogflow";

// Validation schema for updates
const updateCaixaSchema = z.object({
	nome: z.string().min(1, "Nome é obrigatório").optional(),
	channelType: z.string().min(1, "Tipo de canal é obrigatório").optional(),
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

// GET /api/admin/mtf-diamante/caixas/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ success: false, error: "Usuário não autenticado." } as ApiResponse, { status: 401 });
		}

		const { id } = await params;
		const prisma = getPrismaInstance();

		// Find caixa with user access verification
		const caixa = await prisma.chatwitInbox.findFirst({
			where: {
				id,
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
		});

		if (!caixa) {
			return NextResponse.json({ success: false, error: "Caixa não encontrada" } as ApiResponse, { status: 404 });
		}

		return NextResponse.json({
			success: true,
			data: caixa,
		} as ApiResponse<ChatwitInbox>);
	} catch (error) {
		console.error("Error fetching caixa:", error);
		return NextResponse.json({ success: false, error: "Erro interno do servidor" } as ApiResponse, { status: 500 });
	}
}

// PUT /api/admin/mtf-diamante/caixas/[id]
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ success: false, error: "Usuário não autenticado." } as ApiResponse, { status: 401 });
		}

		const { id } = await params;
		const body = await request.json();

		// Validate request body
		const validationResult = updateCaixaSchema.safeParse(body);
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

		// Verify caixa exists and user has access
		const existingCaixa = await prisma.chatwitInbox.findFirst({
			where: {
				id,
				usuarioChatwit: {
					appUserId: session.user.id,
				},
			},
		});

		if (!existingCaixa) {
			return NextResponse.json({ success: false, error: "Caixa não encontrada" } as ApiResponse, { status: 404 });
		}

		// Update caixa
		const updatedCaixa = await prisma.chatwitInbox.update({
			where: { id },
			data,
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

		return NextResponse.json({
			success: true,
			data: updatedCaixa,
			message: "Caixa atualizada com sucesso",
		} as ApiResponse<ChatwitInbox>);
	} catch (error) {
		console.error("Error updating caixa:", error);
		return NextResponse.json({ success: false, error: "Erro interno do servidor" } as ApiResponse, { status: 500 });
	}
}

// DELETE /api/admin/mtf-diamante/caixas/[id]
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ success: false, error: "Usuário não autenticado." } as ApiResponse, { status: 401 });
		}

		const { id } = await params;
		const prisma = getPrismaInstance();

		// Verify caixa exists and user has access
		const existingCaixa = await prisma.chatwitInbox.findFirst({
			where: {
				id,
				usuarioChatwit: {
					appUserId: session.user.id,
				},
			},
		});

		if (!existingCaixa) {
			return NextResponse.json({ success: false, error: "Caixa não encontrada" } as ApiResponse, { status: 404 });
		}

		// Check if caixa is being used as fallback by other inboxes
		const fallbackUsage = await prisma.chatwitInbox.findFirst({
			where: {
				fallbackParaInboxId: id,
			},
		});

		if (fallbackUsage) {
			return NextResponse.json(
				{ success: false, error: "Não é possível deletar caixa que está sendo usada como fallback" } as ApiResponse,
				{ status: 409 },
			);
		}

		// Delete the caixa (cascade should handle related data)
		await prisma.chatwitInbox.delete({
			where: { id },
		});

		return NextResponse.json({
			success: true,
			message: "Caixa deletada com sucesso",
		} as ApiResponse);
	} catch (error) {
		console.error("Error deleting caixa:", error);
		return NextResponse.json({ success: false, error: "Erro interno do servidor" } as ApiResponse, { status: 500 });
	}
}
