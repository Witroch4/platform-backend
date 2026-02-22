/**
 * Chatwit System Config — bot token + base URL persistidos em SystemConfig
 *
 * O Agent Bot do Chatwit é global (account_id=NULL). Token e URL são
 * config de sistema, não pertencem a nenhum UsuarioChatwit.
 *
 * Fontes (prioridade):
 *   1. SystemConfig (banco) — atualizado pelo init do Chatwit ou webhook
 *   2. ENV — CHATWIT_AGENT_BOT_TOKEN, CHATWIT_BASE_URL (fallback)
 *
 * Cache em memória (5 min) para não bater no banco a cada campanha.
 */

import { getPrismaInstance } from "@/lib/connections";
import log from "@/lib/log";

export interface ChatwitSystemConfig {
	botToken: string;
	baseUrl: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
let cached: ChatwitSystemConfig | null = null;
let cachedAt = 0;

/**
 * Retorna bot token e base URL do Chatwit.
 * Lê do SystemConfig (banco) com fallback para ENV.
 */
export async function getChatwitSystemConfig(): Promise<ChatwitSystemConfig> {
	if (cached && Date.now() - cachedAt < CACHE_TTL_MS) {
		return cached;
	}

	try {
		const prisma = getPrismaInstance();
		const rows = await prisma.systemConfig.findMany({
			where: { key: { in: ["chatwit.agentBotToken", "chatwit.baseUrl"] } },
		});

		const tokenRow = rows.find((r) => r.key === "chatwit.agentBotToken");
		const urlRow = rows.find((r) => r.key === "chatwit.baseUrl");

		const botToken =
			(tokenRow?.value as Record<string, unknown>)?.token as string | undefined ||
			process.env.CHATWIT_AGENT_BOT_TOKEN ||
			"";

		const baseUrl =
			(urlRow?.value as Record<string, unknown>)?.url as string | undefined ||
			process.env.CHATWIT_BASE_URL ||
			"";

		cached = { botToken, baseUrl };
		cachedAt = Date.now();

		return cached;
	} catch (err) {
		log.warn("[ChatwitSystemConfig] Falha ao ler SystemConfig, usando ENV", {
			error: err instanceof Error ? err.message : String(err),
		});

		return {
			botToken: process.env.CHATWIT_AGENT_BOT_TOKEN || "",
			baseUrl: process.env.CHATWIT_BASE_URL || "",
		};
	}
}

/**
 * Salva bot token e/ou base URL no SystemConfig (upsert).
 * Invalida o cache local.
 */
export async function saveChatwitSystemConfig(
	data: Partial<{ botToken: string; baseUrl: string }>,
): Promise<void> {
	const prisma = getPrismaInstance();

	const ops: Promise<unknown>[] = [];

	if (data.botToken) {
		ops.push(
			prisma.systemConfig.upsert({
				where: { key: "chatwit.agentBotToken" },
				update: { value: { token: data.botToken }, updatedAt: new Date() },
				create: {
					key: "chatwit.agentBotToken",
					value: { token: data.botToken },
					description: "Token do Agent Bot global do Chatwit",
					category: "chatwit",
				},
			}),
		);
	}

	if (data.baseUrl) {
		ops.push(
			prisma.systemConfig.upsert({
				where: { key: "chatwit.baseUrl" },
				update: { value: { url: data.baseUrl }, updatedAt: new Date() },
				create: {
					key: "chatwit.baseUrl",
					value: { url: data.baseUrl },
					description: "URL base da instância Chatwit",
					category: "chatwit",
				},
			}),
		);
	}

	if (ops.length > 0) {
		await Promise.all(ops);
		// Invalidar cache
		cached = null;
		cachedAt = 0;

		log.info("[ChatwitSystemConfig] Config atualizada", {
			hasToken: !!data.botToken,
			hasUrl: !!data.baseUrl,
		});
	}
}
