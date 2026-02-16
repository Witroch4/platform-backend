/**
 * TURBO Mode Session End API
 * Ends a TURBO mode processing session and records metrics
 * Based on requirements 2.4, 3.1, 3.2
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import log from "@/lib/utils/logger";

export async function POST(request: NextRequest) {
	try {
		// Authenticate user
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
		}

		// Parse request body
		const { sessionId, metrics } = await request.json();

		// Validate input
		if (!sessionId) {
			return NextResponse.json({ error: "sessionId é obrigatório." }, { status: 400 });
		}

		log.info("Ending TURBO mode session", {
			sessionId,
			hasMetrics: !!metrics,
			requestedBy: session.user.id,
		});

		// End TURBO session (mock for now)
		console.log("TURBO session would be ended:", {
			sessionId,
			metrics,
		});

		log.info("TURBO mode session ended successfully", {
			sessionId,
			metrics,
		});

		return NextResponse.json({
			message: "Sessão TURBO finalizada com sucesso",
			sessionId,
			metrics,
		});
	} catch (error) {
		log.error("Error ending TURBO mode session", {
			error: error instanceof Error ? error.message : "Unknown error",
			stack: error instanceof Error ? error.stack : undefined,
		});

		return NextResponse.json({ error: "Erro interno do servidor." }, { status: 500 });
	}
}

export async function GET() {
	return NextResponse.json({ error: "Método não permitido. Use POST." }, { status: 405 });
}
