/**
 * Admin API for Queue Management
 * [CLEANUP 2026-02-16] AI queues removidas - eram código morto
 * Este endpoint agora retorna informação de que as filas AI foram desativadas.
 * Use /api/admin/queue-management/queues para gerenciar as filas ativas do sistema.
 */

import { NextRequest, NextResponse } from "next/server";

// GET /api/admin/queues - Get queue statistics
export async function GET() {
	return NextResponse.json({
		success: true,
		data: {
			message: "AI Integration queues foram removidas (eram código morto).",
			redirect: "/api/admin/queue-management/queues",
			note: "Use o endpoint queue-management para gerenciar filas ativas.",
		},
		timestamp: Date.now(),
	});
}

// POST /api/admin/queues - Queue control actions
export async function POST(request: NextRequest) {
	return NextResponse.json(
		{
			success: false,
			error: "AI Integration queues foram removidas. Use /api/admin/queue-management/queues",
		},
		{ status: 410 }, // 410 Gone
	);
}
