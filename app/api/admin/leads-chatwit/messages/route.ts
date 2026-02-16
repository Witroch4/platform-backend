/**
 * API Route para histórico de mensagens de leads
 * GET /api/admin/leads-chatwit/messages?leadId=X&cursor=Y&limit=50
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { messageService } from "@/lib/services/message-service";

export async function GET(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
	}

	const { searchParams } = new URL(request.url);
	const leadId = searchParams.get("leadId");
	const cursor = searchParams.get("cursor") || undefined;
	const limit = parseInt(searchParams.get("limit") || "50", 10);

	if (!leadId) {
		return NextResponse.json({ error: "leadId é obrigatório" }, { status: 400 });
	}

	try {
		const result = await messageService.getMessagesByLeadId(leadId, {
			limit: Math.min(limit, 100), // Máximo 100 por request
			cursor,
		});

		return NextResponse.json(result);
	} catch (error) {
		console.error("[Messages API] Erro:", error);
		return NextResponse.json({ error: "Erro ao buscar mensagens" }, { status: 500 });
	}
}
