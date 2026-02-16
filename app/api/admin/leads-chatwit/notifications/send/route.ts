import { type NextRequest, NextResponse } from "next/server";
// Lazy import to avoid Edge Runtime issues
const getSseManager = () => import("@/lib/sse-manager").then((m) => m.sseManager);

export async function POST(request: NextRequest) {
	try {
		const { leadId, data } = await request.json();

		if (!leadId || !data) {
			return NextResponse.json({ error: "leadId e data são obrigatórios" }, { status: 400 });
		}

		console.log(`[SSE Send] Enviando notificação via HTTP para ${leadId}:`, data);

		const sseManager = await getSseManager();
		const sent = await sseManager.sendNotification(leadId, data);

		return NextResponse.json({
			success: true,
			leadId,
			notificationsSent: sent,
			message: sent ? "Notificação enviada com sucesso" : "Nenhuma conexão ativa encontrada",
		});
	} catch (error: any) {
		console.error("[SSE Send] Erro ao enviar notificação via HTTP:", error);
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
}
