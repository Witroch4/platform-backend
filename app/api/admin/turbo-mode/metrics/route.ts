/**
 * TURBO Mode Metrics API
 * Retrieves performance metrics for TURBO mode
 * Based on requirements 4.3, 4.6
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { TurboModeAccessService } from "@/lib/turbo-mode/user-access-service";
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
		const { userId } = await request.json();

		// Validate input
		if (!userId) {
			return NextResponse.json({ error: "userId é obrigatório." }, { status: 400 });
		}

		// Verify user can access these metrics
		if (session.user.id !== userId) {
			return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
		}

		// Get user's Chatwit account ID from database
		const prisma = getPrismaInstance();
		const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
			where: { appUserId: userId },
			select: { chatwitAccountId: true },
		});

		if (!usuarioChatwit?.chatwitAccountId) {
			return NextResponse.json({ error: "Usuário não possui conta Chatwit configurada." }, { status: 400 });
		}

		const accountId = usuarioChatwit.chatwitAccountId;

		log.debug("Retrieving TURBO mode metrics", {
			userId,
			accountId,
			requestedBy: session.user.id,
		});

		// Check user access first
		const hasAccess = await TurboModeAccessService.hasAccess(userId);
		if (!hasAccess) {
			return NextResponse.json({ error: "Usuário não possui acesso ao Modo Turbo." }, { status: 403 });
		}

		// Get performance metrics from mock data (no database model yet)
		const metrics = {
			_sum: {
				totalLeads: 0,
				parallelProcessed: 0,
				sequentialProcessed: 0,
				timeSaved: 0,
			},
			_avg: {
				averageProcessingTime: 0,
				errorRate: 0,
			},
		};

		// Format metrics response
		const formattedMetrics = {
			totalLeads: metrics._sum.totalLeads || 0,
			parallelProcessed: metrics._sum.parallelProcessed || 0,
			sequentialProcessed: metrics._sum.sequentialProcessed || 0,
			timeSaved: metrics._sum.timeSaved || 0,
			errorRate: metrics._avg.errorRate || 0,
			averageProcessingTime: metrics._avg.averageProcessingTime || 0,
		};

		log.debug("TURBO mode metrics retrieved", {
			userId,
			accountId,
			formattedMetrics,
		});

		return NextResponse.json(formattedMetrics);
	} catch (error) {
		log.error("Error retrieving TURBO mode metrics", {
			error: error instanceof Error ? error.message : "Unknown error",
			stack: error instanceof Error ? error.stack : undefined,
		});

		return NextResponse.json({ error: "Erro interno do servidor." }, { status: 500 });
	}
}

export async function GET() {
	return NextResponse.json({ error: "Método não permitido. Use POST." }, { status: 405 });
}
