// Lazy import to avoid Edge Runtime issues
const getSseManager = () => import("@/lib/sse-manager").then((m) => m.sseManager);
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url);
	const action = searchParams.get("action");

	// Endpoint de status (debug) — sem auth para simplicidade
	if (action === "status") {
		const sseManager = await getSseManager();
		return NextResponse.json(sseManager.getStatus());
	}

	// Auth obrigatória para SSE stream
	const session = await auth();
	if (!session?.user?.id) {
		return new Response("Unauthorized", { status: 401 });
	}

	const userId = session.user.id;
	const role = (session.user as any).role || "ADMIN";

	console.log(`[SSE API] Iniciando stream SSE para user: ${userId} (${role})`);

	let connectionId = "";
	let keepAliveInterval: NodeJS.Timeout | null = null;

	const stream = new ReadableStream({
		async start(controller) {
			const sseManager = await getSseManager();
			connectionId = await sseManager.addUserConnection(userId, role, controller);
			console.log(`[SSE API] Stream iniciado para user: ${userId}, connectionId: ${connectionId}`);

			// Heartbeat para evitar timeout silencioso em conexoes longas.
			keepAliveInterval = setInterval(() => {
				try {
					controller.enqueue(`: keepalive ${Date.now()}\n\n`);
				} catch (error) {
					console.warn(
						`[SSE API] Falha ao enviar heartbeat: user=${userId}, connectionId=${connectionId}`,
						error,
					);

					if (keepAliveInterval) {
						clearInterval(keepAliveInterval);
						keepAliveInterval = null;
					}
				}
			}, 25000);
		},
		async cancel() {
			console.log(`[SSE API] Stream cancelado pelo cliente: user=${userId}, connectionId=${connectionId}`);

			if (keepAliveInterval) {
				clearInterval(keepAliveInterval);
				keepAliveInterval = null;
			}

			if (connectionId) {
				const sseManager = await getSseManager();
				sseManager.removeUserConnection(userId, connectionId);
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
		},
	});
}

// Endpoint POST para enviar notificações via HTTP (usado por API routes internas)
export async function POST(request: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
		}

		const { leadId, data } = await request.json();

		if (!leadId || !data) {
			return NextResponse.json({ error: "leadId e data são obrigatórios" }, { status: 400 });
		}

		const sseManager = await getSseManager();
		const sent = await sseManager.sendNotification(leadId, data);

		return NextResponse.json({
			success: sent,
			leadId,
			message: sent ? "Notificação enviada com sucesso" : "Erro ao enviar notificação",
		});
	} catch (error: any) {
		console.error("[SSE API] Erro ao enviar notificação via HTTP:", error);
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
}
