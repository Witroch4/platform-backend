import { type NextRequest, NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections";
import { auth } from "@/auth";
import { z } from "zod";

// =============================================================================
// TYPES
// =============================================================================

export interface FlowListItem {
	id: string;
	name: string;
	inboxId: string;
	isActive: boolean;
	nodeCount: number;
	createdAt: Date;
	updatedAt: Date;
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const CreateFlowSchema = z.object({
	inboxId: z.string().min(1, "inboxId é obrigatório"),
	name: z.string().min(1, "Nome é obrigatório").max(100, "Nome muito longo"),
});

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Verifica se o usuário tem acesso à inbox
 */
async function verifyInboxAccess(inboxId: string, userId: string): Promise<boolean> {
	const inbox = await getPrismaInstance().chatwitInbox.findFirst({
		where: {
			id: inboxId,
			usuarioChatwit: {
				appUserId: userId,
			},
		},
	});

	return !!inbox;
}

// =============================================================================
// GET - Listar flows por inboxId
// =============================================================================

export async function GET(request: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ success: false, error: "Não autorizado" }, { status: 401 });
		}

		const { searchParams } = new URL(request.url);
		const inboxId = searchParams.get("inboxId");

		if (!inboxId) {
			return NextResponse.json({ success: false, error: "inboxId é obrigatório" }, { status: 400 });
		}

		// Verificar acesso
		const hasAccess = await verifyInboxAccess(inboxId, session.user.id);
		if (!hasAccess) {
			return NextResponse.json({ success: false, error: "Acesso negado a esta caixa" }, { status: 403 });
		}

		// Buscar flows — canvasJson contém a fonte de verdade para contagem de nós
		const flows = await getPrismaInstance().flow.findMany({
			where: { inboxId },
			select: {
				id: true,
				name: true,
				inboxId: true,
				isActive: true,
				createdAt: true,
				updatedAt: true,
				canvasJson: true, // Fonte de verdade para contagem de nós
			},
			orderBy: { updatedAt: "desc" },
		});

		const formattedFlows: FlowListItem[] = flows.map((flow) => {
			// Contar nós do canvasJson (fonte de verdade) em vez de FlowNode table
			const canvas = flow.canvasJson as unknown as { nodes?: unknown[] } | null;
			const nodeCount = canvas?.nodes?.length ?? 0;

			return {
				id: flow.id,
				name: flow.name,
				inboxId: flow.inboxId,
				isActive: flow.isActive,
				nodeCount,
				createdAt: flow.createdAt,
				updatedAt: flow.updatedAt,
			};
		});

		return NextResponse.json({
			success: true,
			data: formattedFlows,
		});
	} catch (error) {
		console.error("[flows] GET error:", error);
		return NextResponse.json(
			{
				success: false,
				error: error instanceof Error ? error.message : "Erro interno",
			},
			{ status: 500 },
		);
	}
}

// =============================================================================
// POST - Criar novo flow vazio
// =============================================================================

export async function POST(request: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ success: false, error: "Não autorizado" }, { status: 401 });
		}

		const body = await request.json();

		// Validar payload
		const validation = CreateFlowSchema.safeParse(body);
		if (!validation.success) {
			return NextResponse.json(
				{
					success: false,
					error: "Dados inválidos",
					details: validation.error.flatten(),
				},
				{ status: 400 },
			);
		}

		const { inboxId, name } = validation.data;

		// Verificar acesso
		const hasAccess = await verifyInboxAccess(inboxId, session.user.id);
		if (!hasAccess) {
			return NextResponse.json({ success: false, error: "Acesso negado a esta caixa" }, { status: 403 });
		}

		// Criar novo flow
		const flow = await getPrismaInstance().flow.create({
			data: {
				name,
				inboxId,
				isActive: true,
			},
		});

		return NextResponse.json({
			success: true,
			data: {
				id: flow.id,
				name: flow.name,
				inboxId: flow.inboxId,
				isActive: flow.isActive,
				nodeCount: 0,
				createdAt: flow.createdAt,
				updatedAt: flow.updatedAt,
			} as FlowListItem,
			message: "Flow criado com sucesso",
		});
	} catch (error) {
		console.error("[flows] POST error:", error);
		return NextResponse.json(
			{
				success: false,
				error: error instanceof Error ? error.message : "Erro interno",
			},
			{ status: 500 },
		);
	}
}
