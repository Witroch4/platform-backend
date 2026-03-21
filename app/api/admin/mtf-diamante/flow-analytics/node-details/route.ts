import { type NextRequest, NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections";
import { auth } from "@/auth";
import { calculateNodeDetails } from "@/lib/flow-analytics/node-details-service";
import type { ApiResponse } from "@/types/flow-analytics";
import type { NodeDetails } from "@/app/mtf-diamante/components/flow-analytics/hooks/useNodeDetails";

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
// GET - Obter detalhes de um nó específico
// =============================================================================

/**
 * GET /api/admin/mtf-diamante/flow-analytics/node-details
 *
 * Query Parameters:
 * - flowId (required): ID do flow
 * - nodeId (required): ID do nó
 * - inboxId (optional): Filtrar por inbox específica
 * - dateStart (optional): Data inicial (ISO string)
 * - dateEnd (optional): Data final (ISO string)
 *
 * Returns: NodeDetails
 *
 * Validates Requirement 2.8: Node detail panel with execution logs and button metrics
 */
export async function GET(request: NextRequest) {
	try {
		// Autenticação
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json<ApiResponse<never>>(
				{ success: false, error: "Usuário não autenticado." },
				{ status: 401 },
			);
		}

		// Extrair parâmetros
		const { searchParams } = new URL(request.url);
		const flowId = searchParams.get("flowId");
		const nodeId = searchParams.get("nodeId");
		const inboxId = searchParams.get("inboxId");
		const dateStart = searchParams.get("dateStart");
		const dateEnd = searchParams.get("dateEnd");

		// Validar parâmetros obrigatórios
		if (!flowId) {
			return NextResponse.json<ApiResponse<never>>({ success: false, error: "flowId é obrigatório" }, { status: 400 });
		}

		if (!nodeId) {
			return NextResponse.json<ApiResponse<never>>({ success: false, error: "nodeId é obrigatório" }, { status: 400 });
		}

		// Verificar se o flow existe e obter inboxId
		const flow = await getPrismaInstance().flow.findUnique({
			where: { id: flowId },
			select: { id: true, inboxId: true, name: true },
		});

		if (!flow) {
			return NextResponse.json<ApiResponse<never>>({ success: false, error: "Flow não encontrado" }, { status: 404 });
		}

		// Verificar acesso à inbox do flow
		const hasAccess = await verifyInboxAccess(flow.inboxId, session.user.id);
		if (!hasAccess) {
			return NextResponse.json<ApiResponse<never>>(
				{ success: false, error: "Acesso negado a esta caixa" },
				{ status: 403 },
			);
		}

		// Construir filtros de data
		const dateFilter: { createdAt?: { gte?: Date; lte?: Date } } = {};
		if (dateStart || dateEnd) {
			dateFilter.createdAt = {};
			if (dateStart) {
				dateFilter.createdAt.gte = new Date(dateStart);
			}
			if (dateEnd) {
				dateFilter.createdAt.lte = new Date(dateEnd);
			}
		}

		// Buscar sessões do flow com filtros
		const sessions = await getPrismaInstance().flowSession.findMany({
			where: {
				flowId,
				...(inboxId ? { inboxId } : {}),
				...dateFilter,
			},
			select: {
				id: true,
				executionLog: true,
				status: true,
				createdAt: true,
				completedAt: true,
				conversationId: true,
			},
			orderBy: { createdAt: "desc" },
		});

		// Buscar definição do flow (nodes)
		const flowWithNodes = await getPrismaInstance().flow.findUnique({
			where: { id: flowId },
			include: {
				nodes: {
					select: {
						id: true,
						nodeType: true,
						config: true,
					},
				},
			},
		});

		if (!flowWithNodes) {
			return NextResponse.json<ApiResponse<never>>({ success: false, error: "Flow não encontrado" }, { status: 404 });
		}

		// Calcular detalhes do nó
		const nodeDetails = calculateNodeDetails(
			nodeId,
			sessions.map((s) => ({
				id: s.id,
				executionLog: s.executionLog as any[],
				status: s.status,
				createdAt: s.createdAt,
				completedAt: s.completedAt,
				conversationId: s.conversationId,
			})),
			{
				nodes: flowWithNodes.nodes.map((n) => ({
					id: n.id,
					nodeType: n.nodeType as any,
					config: n.config as Record<string, unknown>,
				})),
			},
		);

		if (!nodeDetails) {
			return NextResponse.json<ApiResponse<never>>({ success: false, error: "Nó não encontrado" }, { status: 404 });
		}

		return NextResponse.json<ApiResponse<NodeDetails>>({
			success: true,
			data: nodeDetails,
		});
	} catch (error) {
		console.error("[node-details] GET error:", error);
		return NextResponse.json<ApiResponse<never>>(
			{
				success: false,
				error: error instanceof Error ? error.message : "Erro interno",
			},
			{ status: 500 },
		);
	}
}
