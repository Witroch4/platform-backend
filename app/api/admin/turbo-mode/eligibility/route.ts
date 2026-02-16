/**
 * TURBO Mode Eligibility API
 * Checks if a user is eligible for TURBO mode
 * Based on requirements 2.4, 3.1, 3.2
 */

import { NextRequest, NextResponse } from "next/server";
import { TurboModeAccessService } from "@/lib/turbo-mode/user-access-service";
import { getPrismaInstance } from "@/lib/connections";
import log from "@/lib/utils/logger";
import { authenticateTurboModeUser, validateUserAccess, createAuthErrorResponse } from "@/lib/auth/turbo-mode-auth";

export async function POST(request: NextRequest) {
	try {
		// Authenticate user with TURBO mode access
		const authResult = await authenticateTurboModeUser(request);
		if (!authResult.success) {
			return authResult.response!;
		}

		const { session, verification } = authResult;

		// Parse request body
		const { userId } = await request.json();

		// Validate input
		if (!userId) {
			return NextResponse.json({ error: "userId é obrigatório." }, { status: 400 });
		}

		// Verify user can check this account (user can check their own, admins can check any)
		const accessValidation = validateUserAccess(verification!.userId!, userId, verification!.role!);

		if (!accessValidation.hasAccess) {
			return createAuthErrorResponse(accessValidation.reason!, 403);
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

		log.info("Checking TURBO mode eligibility", {
			userId,
			accountId,
			requestedBy: session.user.id,
		});

		// Check user access
		const hasAccess = await TurboModeAccessService.hasAccess(userId);
		const config = TurboModeAccessService.getConfig();

		const eligibility = {
			eligible: hasAccess,
			reason: hasAccess ? "Usuário possui acesso ao Modo Turbo" : "Usuário não possui acesso ao Modo Turbo",
			config: hasAccess ? config : undefined,
		};

		log.info("TURBO mode eligibility result", {
			userId,
			accountId,
			eligible: eligibility.eligible,
			reason: eligibility.reason,
		});

		return NextResponse.json(eligibility);
	} catch (error) {
		log.error("Error checking TURBO mode eligibility", {
			error: error instanceof Error ? error.message : "Unknown error",
			stack: error instanceof Error ? error.stack : undefined,
		});

		return NextResponse.json({ error: "Erro interno do servidor." }, { status: 500 });
	}
}

export async function GET() {
	return NextResponse.json({ error: "Método não permitido. Use POST." }, { status: 405 });
}
