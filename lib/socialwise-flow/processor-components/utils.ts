/**
 * SocialWise Flow Processor Utilities
 * Common utility functions for channel detection, session extraction, and threshold computation
 */

import { createLogger } from "@/lib/utils/logger";
import type { IntentCandidate } from "@/services/openai-components/types";

const utilsLogger = createLogger("SocialWise-Processor-Utils");

export function isWhatsAppChannel(channelType?: string) {
	return (channelType || "").toLowerCase().includes("whatsapp");
}

export function isInstagramChannel(channelType?: string) {
	const normalized = (channelType || "").toLowerCase();
	return normalized.includes("instagram");
}

export function isFacebookChannel(channelType?: string) {
	const normalized = (channelType || "").toLowerCase();
	return normalized.includes("facebook") || normalized.includes("messenger") || normalized.includes("facebookpage");
}

export function normalizeChannelType(
	channelType: string,
): import("../../../services/openai-components/types").ChannelType {
	const normalized = channelType.toLowerCase();
	if (normalized.includes("whatsapp")) return "whatsapp";
	if (normalized.includes("instagram")) return "instagram";
	return "facebook"; // fallback
}

// Dynamic threshold for hint adoption: defaults around 0.55 with bounds [0.4, 0.7]
export function computeDynamicHintThreshold(candidates?: IntentCandidate[]): number {
	const list = (candidates || []).filter((c) => typeof c.score === "number") as Required<
		Pick<IntentCandidate, "score">
	>[];
	const topScore = list.length ? ((list[0] as any).score as number) : 0;
	if (topScore >= 0.75) return 0.7;
	if (topScore >= 0.6) return 0.55;
	if (topScore >= 0.5) return 0.5;
	return 0.4;
}

/**
 * Extrai sessionId do payload conforme o canal:
 * - WhatsApp: número do telefone
 * - Instagram: ID da plataforma
 */
export function extractSessionId(payload: any, channelType: string): string | undefined {
	if (!payload) return undefined;

	// Debug log
	console.log("[SessionExtraction] DEBUG: Extracting sessionId", {
		channelType,
		hasPayload: !!payload,
		payloadKeys: Object.keys(payload || {}),
		sessionIdDirect: payload.session_id,
		contactPhone: payload.context?.contact?.phone_number,
	});

	// Primeiro, tenta extrair do campo session_id direto (formato Chatwit)
	if (payload.session_id) {
		console.log("[SessionExtraction] INFO: SessionId found directly", { sessionId: payload.session_id });
		return payload.session_id;
	}

	// WhatsApp: sessionId pode estar no contexto do contato
	if (isWhatsAppChannel(channelType)) {
		// Formato Chatwit: context.contact.phone_number
		const phoneFromContext = payload.context?.contact?.phone_number;
		if (phoneFromContext) {
			console.log("[SessionExtraction] INFO: SessionId from contact phone", { sessionId: phoneFromContext });
			return phoneFromContext;
		}

		// Formato Meta: payload direto
		const phoneFromMeta = payload.contacts?.[0]?.wa_id || payload.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id;
		if (phoneFromMeta) {
			console.log("[SessionExtraction] INFO: SessionId from Meta format", { sessionId: phoneFromMeta });
			return phoneFromMeta;
		}
	}

	// Instagram: sessionId pode estar no contexto
	if (isInstagramChannel(channelType)) {
		// Formato Chatwit: context.contact.identifier ou similar
		const instagramId =
			payload.context?.contact?.identifier || payload.entry?.[0]?.messaging?.[0]?.sender?.id || payload.sender?.id;
		if (instagramId) {
			console.log("[SessionExtraction] INFO: SessionId from Instagram", { sessionId: instagramId });
			return instagramId;
		}
	}

	console.log("[SessionExtraction] WARNING: No sessionId found", {
		channelType,
		payloadStructure: Object.keys(payload || {}),
	});
	return undefined;
}

/**
 * Map emoji to Instagram reaction name
 * Based on Instagram's supported reaction types
 */
export function mapEmojiToInstagramReaction(emoji: string): "love" | "like" | "haha" | "wow" | "sad" | "angry" | null {
	const e = (emoji || "").trim();
	switch (e) {
		case "❤️":
		case "❤":
		case "♥️":
			return "love";
		case "👍":
		case "👌":
		case "✅":
			return "like";
		case "😂":
		case "😹":
			return "haha";
		case "😮":
		case "😯":
			return "wow";
		case "😢":
		case "😭":
			return "sad";
		case "😡":
		case "😠":
			return "angry";
		default:
			return null;
	}
}
