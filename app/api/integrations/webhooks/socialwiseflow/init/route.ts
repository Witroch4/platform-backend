/**
 * Chatwit Init Endpoint
 *
 * Chamado pelo Chatwit no startup (config/initializers/socialwise_bot.rb)
 * após auto-provisionar o Agent Bot global. Persiste bot token + base URL
 * no SystemConfig para uso em campanhas (que não têm webhook).
 *
 * POST /api/integrations/webhooks/socialwiseflow/init
 * Body: { agent_bot_token, base_url, secret }
 */

import { NextRequest, NextResponse } from "next/server";
import { saveChatwitSystemConfig } from "@/lib/chatwit/system-config";
import log from "@/lib/log";

interface InitPayload {
	agent_bot_token: string;
	base_url: string;
	secret: string;
}

export async function POST(req: NextRequest) {
	try {
		const body = (await req.json()) as Partial<InitPayload>;

		// Validar secret
		const expectedSecret = process.env.CHATWIT_WEBHOOK_SECRET;
		if (!expectedSecret || body.secret !== expectedSecret) {
			log.warn("[ChatwitInit] Secret inválido");
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		if (!body.agent_bot_token || !body.base_url) {
			return NextResponse.json(
				{ error: "agent_bot_token e base_url são obrigatórios" },
				{ status: 400 },
			);
		}

		await saveChatwitSystemConfig({
			botToken: body.agent_bot_token,
			baseUrl: body.base_url,
		});

		log.info("[ChatwitInit] Config do Agent Bot salva com sucesso", {
			baseUrl: body.base_url,
			hasToken: true,
		});

		return NextResponse.json({ status: "ok" });
	} catch (err) {
		log.error("[ChatwitInit] Erro ao processar init", {
			error: err instanceof Error ? err.message : String(err),
		});
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
