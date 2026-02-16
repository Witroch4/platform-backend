/**
 * Session Detail API Endpoint
 *
 * Provides detailed session information including execution log for replay.
 *
 * Validates Requirements: 4.1-4.10, 19.5
 */

import { type NextRequest, NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections";
import { auth } from "@/auth";

// =============================================================================
// TYPES
// =============================================================================

interface ApiResponse<T> {
	success: boolean;
	data?: T;
	error?: string;
}

interface ExecutionLogEntry {
	timestamp: string;
	nodeId: string;
	nodeName: string;
	nodeType: string;
	action: string;
	durationMs: number;
	deliveryMode: "sync" | "async";
	status: "ok" | "error" | "skipped";
	errorDetail?: string;
}

interface SessionDetail {
	id: string;
	flowId: string;
	flowName: string;
	conversationId: string;
	contactId: string;
	status: string;
	createdAt: string;
	completedAt: string | null;
	variables: Record<string, any>;
	executionLog: ExecutionLogEntry[];
	lastNodeVisited?: string;
	inactivityTime?: number;
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

/**
 * Parse execution log from session data
 */
function parseExecutionLog(session: any): ExecutionLogEntry[] {
	// The execution log might be stored in different formats
	// Try to parse from executionLog field or reconstruct from other data

	if (session.executionLog && Array.isArray(session.executionLog)) {
		return session.executionLog.map((entry: any) => ({
			timestamp: entry.timestamp || entry.createdAt || new Date().toISOString(),
			nodeId: entry.nodeId || "",
			nodeName: entry.nodeName || entry.nodeId || "Unknown",
			nodeType: entry.nodeType || "UNKNOWN",
			action: entry.action || "executed",
			durationMs: entry.durationMs || entry.duration || 0,
			deliveryMode: entry.deliveryMode || "sync",
			status: entry.status || "ok",
			errorDetail: entry.errorDetail || entry.error,
		}));
	}

	// If no execution log, create a minimal one from session data
	const log: ExecutionLogEntry[] = [];

	if (session.currentNodeId) {
		log.push({
			timestamp: session.updatedAt || session.createdAt,
			nodeId: session.currentNodeId,
			nodeName: session.currentNodeId,
			nodeType: "UNKNOWN",
			action: "current",
			durationMs: 0,
			deliveryMode: "sync",
			status: session.status === "ERROR" ? "error" : "ok",
		});
	}

	return log;
}

// =============================================================================
// GET - Obter detalhes de uma sessão específica
// =============================================================================

/**
 * GET /api/admin/mtf-diamante/flow-analytics/sessions/:sessionId
 *
 * Returns: SessionDetail
 *
 * Validates Requirement 19.5: Session replay endpoint
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
	try {
		// Autenticação
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json<ApiResponse<never>>(
				{ success: false, error: "Usuário não autenticado." },
				{ status: 401 },
			);
		}

		// Extrair sessionId dos params
		const { sessionId } = await params;

		if (!sessionId) {
			return NextResponse.json<ApiResponse<never>>(
				{ success: false, error: "sessionId é obrigatório" },
				{ status: 400 },
			);
		}

		const prisma = getPrismaInstance();

		// Buscar sessão com flow relacionado
		const flowSession = await prisma.flowSession.findUnique({
			where: { id: sessionId },
			include: {
				flow: {
					select: {
						id: true,
						name: true,
						inboxId: true,
					},
				},
			},
		});

		if (!flowSession) {
			return NextResponse.json<ApiResponse<never>>({ success: false, error: "Sessão não encontrada" }, { status: 404 });
		}

		// Verificar acesso à inbox
		const hasAccess = await verifyInboxAccess(flowSession.flow.inboxId, session.user.id);
		if (!hasAccess) {
			return NextResponse.json<ApiResponse<never>>(
				{ success: false, error: "Acesso negado a esta caixa" },
				{ status: 403 },
			);
		}

		// Parse execution log
		const executionLog = parseExecutionLog(flowSession);

		// Calculate inactivity time for waiting/error sessions
		let inactivityTime: number | undefined;
		if (["WAITING_INPUT", "ERROR"].includes(flowSession.status) && flowSession.updatedAt) {
			inactivityTime = Date.now() - new Date(flowSession.updatedAt).getTime();
		}

		// Build response
		const sessionDetail: SessionDetail = {
			id: flowSession.id,
			flowId: flowSession.flowId,
			flowName: flowSession.flow.name,
			conversationId: flowSession.conversationId,
			contactId: flowSession.contactId,
			status: flowSession.status,
			createdAt: flowSession.createdAt.toISOString(),
			completedAt: flowSession.completedAt?.toISOString() || null,
			variables: (flowSession.variables as Record<string, any>) || {},
			executionLog,
			lastNodeVisited: flowSession.currentNodeId || undefined,
			inactivityTime,
		};

		return NextResponse.json<ApiResponse<SessionDetail>>({
			success: true,
			data: sessionDetail,
		});
	} catch (error) {
		console.error("[session-detail] Error:", error);
		return NextResponse.json<ApiResponse<never>>(
			{
				success: false,
				error: error instanceof Error ? error.message : "Erro ao buscar detalhes da sessão",
			},
			{ status: 500 },
		);
	}
}
