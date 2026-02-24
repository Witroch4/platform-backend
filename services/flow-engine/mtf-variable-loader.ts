/**
 * MTF Variable Loader for Flow Engine
 *
 * Pre-loads all MTF Diamante variables for a given inbox,
 * returning a flat Record<string, string> suitable for injection
 * as session variables in FlowExecutor.
 *
 * Loaded ONCE at session start. On resumeSession (button click),
 * variables are already persisted in FlowSession.variables.
 */

import log from "@/lib/log";
import { getPrismaInstance } from "@/lib/connections";
import {
	getCachedVariablesForUser,
	getLoteAtivoFormatado,
} from "@/lib/mtf-diamante/variables-resolver";

/**
 * Resolves userId from prismaInboxId and loads all MTF Diamante variables
 * (normal vars + lote_ativo) as a flat Record<string, string>.
 *
 * Returns empty object if inbox has no user or user has no MTF config.
 */
export async function loadMtfVariablesForInbox(
	prismaInboxId: string,
): Promise<Record<string, string>> {
	try {
		const prisma = getPrismaInstance();

		const inbox = await prisma.chatwitInbox.findFirst({
			where: { id: prismaInboxId },
			select: {
				usuarioChatwit: {
					select: { appUserId: true },
				},
			},
		});

		const userId = inbox?.usuarioChatwit?.appUserId;
		if (!userId) {
			log.debug("[MtfVariableLoader] No userId for inbox, skipping MTF vars", { prismaInboxId });
			return {};
		}

		// Normal variables (Redis cached, 10min TTL)
		const variables = await getCachedVariablesForUser(userId);
		const result: Record<string, string> = {};

		for (const v of variables) {
			result[v.chave] = v.valor;
		}

		// lote_ativo (fresh read — not included in getCachedVariablesForUser result)
		try {
			result.lote_ativo = await getLoteAtivoFormatado(userId);
		} catch (e) {
			log.warn("[MtfVariableLoader] Failed to load lote_ativo", {
				userId,
				error: e instanceof Error ? e.message : String(e),
			});
		}

		log.info("[MtfVariableLoader] MTF variables loaded", {
			userId,
			prismaInboxId,
			variableCount: Object.keys(result).length,
			keys: Object.keys(result),
		});

		return result;
	} catch (error) {
		log.error("[MtfVariableLoader] Error loading MTF variables", {
			prismaInboxId,
			error: error instanceof Error ? error.message : String(error),
		});
		return {};
	}
}
