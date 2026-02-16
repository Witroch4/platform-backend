/**
 * Alerts API Endpoint
 *
 * Provides quality alerts for flow monitoring.
 *
 * Validates Requirements: 6.1-6.5, 19.6
 */

import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateAlerts, type FlowAlert } from "@/lib/flow-analytics/alert-service";
import { getPrismaInstance } from "@/lib/connections";

// =============================================================================
// TYPES
// =============================================================================

interface ApiResponse<T> {
	success: boolean;
	data?: T;
	error?: string;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Verify user has access to the inbox
 */
async function verifyInboxAccess(inboxId: string, userId: string): Promise<boolean> {
	const prisma = getPrismaInstance();

	const inbox = await prisma.chatwitInbox.findFirst({
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
// GET - Obter alertas de qualidade
// =============================================================================

/**
 * GET /api/admin/mtf-diamante/flow-analytics/alerts
 *
 * Query Parameters:
 * - inboxId (required): ID da inbox
 * - flowId (optional): Filtrar por flow específico
 * - dateStart (optional): Data inicial (ISO string)
 * - dateEnd (optional): Data final (ISO string)
 *
 * Returns: FlowAlert[]
 *
 * Validates Requirement 19.6: Alerts API endpoint
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
		const inboxId = searchParams.get("inboxId");
		const flowId = searchParams.get("flowId");
		const dateStart = searchParams.get("dateStart");
		const dateEnd = searchParams.get("dateEnd");

		// Validar inboxId obrigatório
		if (!inboxId) {
			return NextResponse.json<ApiResponse<never>>({ success: false, error: "inboxId é obrigatório" }, { status: 400 });
		}

		// Verificar acesso à inbox
		const hasAccess = await verifyInboxAccess(inboxId, session.user.id);
		if (!hasAccess) {
			return NextResponse.json<ApiResponse<never>>(
				{ success: false, error: "Acesso negado a esta caixa" },
				{ status: 403 },
			);
		}

		// Parse dates
		const dateStartObj = dateStart ? new Date(dateStart) : undefined;
		const dateEndObj = dateEnd ? new Date(dateEnd) : undefined;

		// Generate alerts
		const alerts = await generateAlerts(inboxId, flowId || undefined, dateStartObj, dateEndObj);

		return NextResponse.json<ApiResponse<FlowAlert[]>>({
			success: true,
			data: alerts,
		});
	} catch (error) {
		console.error("[alerts] Error:", error);
		return NextResponse.json<ApiResponse<never>>(
			{
				success: false,
				error: error instanceof Error ? error.message : "Erro ao gerar alertas",
			},
			{ status: 500 },
		);
	}
}
