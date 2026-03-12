import { getPrismaInstance } from "@/lib/connections";
import { saveChatwitSystemConfig } from "@/lib/chatwit/system-config";
import { createLogger } from "@/lib/utils/logger";
import { openaiService } from "@/services/openai";
import type { ChannelType, IntentCandidate, RouterDecision } from "@/services/openai-components/types";
import type { DeliveryContext, DeliveryPayload } from "@/types/flow-engine";
import { createDeliveryService } from "@/services/flow-engine/chatwit-delivery-service";
import {
	buildFacebookPageByGlobalIntent,
	buildFacebookPageByIntentRaw,
	buildInstagramByGlobalIntent,
	buildInstagramByIntentRaw,
	buildWhatsAppByGlobalIntent,
	buildWhatsAppByIntentRaw,
} from "@/lib/socialwise/templates";
import { buildChannelResponse, type ChannelResponse } from "../channel-formatting";
import { routerLLMClaude } from "../services/claude-band-processor";
import { routerLLMGemini } from "../services/gemini-band-processor";
import { normalizeChannelType, isFacebookChannel, isInstagramChannel, isWhatsAppChannel } from "./utils";
import type { ProcessorContext } from "./button-reactions";
import type { AssistantConfig } from "./assistant-config";

const logger = createLogger("SocialWise-Router-Runtime");

type WhatsAppAsyncResponse = {
	interactive?: Record<string, unknown>;
	text?: { body?: string };
	context?: { message_id?: string };
};

interface RouterPayloadContext {
	conversation?: { id?: string | number; display_id?: string | number; account_id?: string | number };
	contact?: { id?: string | number };
	inbox?: { id?: string | number; account_id?: string | number };
}

interface RouterPayloadMetadata {
	conversation_id?: string | number;
	conversation_display_id?: string | number;
	contact_id?: string | number;
	chatwit_agent_bot_token?: string;
	chatwit_base_url?: string;
}

interface RouterWebhookPayload {
	context?: RouterPayloadContext;
	metadata?: RouterPayloadMetadata;
	conversation?: { id?: string | number };
	sender?: { id?: string | number };
}

export async function dispatchRouterLLM(
	userText: string,
	agentConfig: AssistantConfig,
	opts: {
		channelType: string;
		sessionId?: string;
		intentHints?: IntentCandidate[];
		profile?: "lite" | "full";
		supplementalContext?: string;
	},
): Promise<RouterDecision | null> {
	const provider = agentConfig.provider || "OPENAI";
	const typedOpts = { ...opts, channelType: opts.channelType as ChannelType };

	switch (provider) {
		case "GEMINI":
			return routerLLMGemini(userText, agentConfig, opts);
		case "CLAUDE":
			return routerLLMClaude(userText, agentConfig, opts);
		default:
			return openaiService.routerLLM(userText, agentConfig, typedOpts);
	}
}

export async function resolveRouterDecisionResponse(
	context: ProcessorContext,
	routerResult: RouterDecision,
): Promise<ChannelResponse> {
	if (routerResult.mode === "intent" && routerResult.intent_payload) {
		const intentName = routerResult.intent_payload.replace(/^@/, "");

		if (isWhatsAppChannel(context.channelType)) {
			const contactContext = { contactName: context.contactName, contactPhone: context.contactPhone };
			let mapped = await buildWhatsAppByIntentRaw(intentName, context.inboxId, context.wamid, contactContext);
			if (!mapped) {
				mapped = await buildWhatsAppByGlobalIntent(intentName, context.inboxId, context.wamid, contactContext);
			}
			if (mapped) {
				return mapped;
			}
		} else if (isFacebookChannel(context.channelType)) {
			const contactContext = { contactName: context.contactName, contactPhone: context.contactPhone };
			let mapped = await buildFacebookPageByIntentRaw(intentName, context.inboxId, contactContext);
			if (!mapped) {
				mapped = await buildFacebookPageByGlobalIntent(intentName, context.inboxId, contactContext);
			}
			if (mapped) {
				return mapped;
			}
		} else if (isInstagramChannel(context.channelType)) {
			const contactContext = { contactName: context.contactName, contactPhone: context.contactPhone };
			let mapped = await buildInstagramByIntentRaw(intentName, context.inboxId, contactContext);
			if (!mapped) {
				mapped = await buildInstagramByGlobalIntent(intentName, context.inboxId, contactContext);
			}
			if (mapped) {
				return mapped;
			}
		}
	}

	const buttons = routerResult.buttons?.map((button) => ({
		title: button.title,
		payload: button.payload,
	}));

	return buildChannelResponse(context.channelType, routerResult.response_text, buttons);
}

export async function buildDeliveryContextFromProcessorContext(
	context: ProcessorContext,
): Promise<DeliveryContext | null> {
	const payload = (context.originalPayload || {}) as RouterWebhookPayload;
	const payloadContext = payload.context || {};
	const payloadMetadata = payload.metadata || {};

	const conversationId =
		payloadContext.conversation?.id || payloadMetadata.conversation_id || payload.conversation?.id || 0;
	const conversationDisplayId =
		payloadMetadata.conversation_display_id || payloadContext.conversation?.display_id || undefined;
	const contactId = payloadContext.contact?.id || payloadMetadata.contact_id || payload.sender?.id || 0;
	const chatwitAccessToken =
		(payloadMetadata.chatwit_agent_bot_token as string) || process.env.CHATWIT_AGENT_BOT_TOKEN || "";
	const chatwitBaseUrl = (payloadMetadata.chatwit_base_url as string) || process.env.CHATWIT_BASE_URL || "";

	if (!conversationId || !contactId || !chatwitAccessToken || !chatwitBaseUrl) {
		logger.warn("Missing data to build async delivery context", {
			hasConversationId: !!conversationId,
			hasContactId: !!contactId,
			hasChatwitAccessToken: !!chatwitAccessToken,
			hasChatwitBaseUrl: !!chatwitBaseUrl,
			traceId: context.traceId,
		});
		return null;
	}

	if (payloadMetadata.chatwit_agent_bot_token && payloadMetadata.chatwit_base_url) {
		void saveChatwitSystemConfig({
			botToken: payloadMetadata.chatwit_agent_bot_token as string,
			baseUrl: payloadMetadata.chatwit_base_url as string,
		});
	}

	const prisma = getPrismaInstance();
	const prismaInbox = await prisma.chatwitInbox.findFirst({
		where: { inboxId: context.inboxId },
		select: { id: true },
	});

	return {
		accountId: Number(context.chatwitAccountId || payloadContext.inbox?.account_id || 0),
		conversationId: typeof conversationId === "string" ? Number(conversationId) : conversationId,
		conversationDisplayId: conversationDisplayId ? Number(conversationDisplayId) : undefined,
		inboxId: Number(context.inboxId || payloadContext.inbox?.id || 0),
		contactId: typeof contactId === "string" ? Number(contactId) : contactId,
		contactName: context.contactName || "",
		contactPhone: context.contactPhone || "",
		channelType: normalizeChannelType(context.channelType) as "whatsapp" | "instagram" | "facebook",
		sourceMessageId: context.wamid,
		prismaInboxId: prismaInbox?.id || undefined,
		chatwitAccessToken,
		chatwitBaseUrl,
	};
}

function toAsyncDeliveryPayloads(channelType: string, response: ChannelResponse): DeliveryPayload[] {
	const normalizedChannel = normalizeChannelType(channelType);

	if (response.text) {
		return [{ type: "text", content: response.text }];
	}

	if (normalizedChannel === "whatsapp") {
		const whatsapp = response.whatsapp as WhatsAppAsyncResponse | undefined;

		if (whatsapp?.interactive) {
			return [{ type: "interactive", interactivePayload: whatsapp.interactive }];
		}
		if (whatsapp?.text?.body) {
			return [
				{
					type: "text",
					content: whatsapp.text.body,
					contextMessageId: whatsapp.context?.message_id,
				},
			];
		}
	}

	if (normalizedChannel === "instagram" && response.instagram) {
		return [{ type: "interactive", interactivePayload: response.instagram as unknown as Record<string, unknown> }];
	}

	if (normalizedChannel === "facebook" && response.facebook) {
		return [{ type: "interactive", interactivePayload: response.facebook as unknown as Record<string, unknown> }];
	}

	return [];
}

export async function deliverChannelResponseAsync(
	context: DeliveryContext,
	channelType: string,
	response: ChannelResponse,
): Promise<boolean> {
	const payloads = toAsyncDeliveryPayloads(channelType, response);

	if (payloads.length === 0) {
		logger.warn("No async delivery payload could be built from channel response", {
			channelType,
			conversationId: context.conversationId,
		});
		return false;
	}

	const delivery = createDeliveryService(context);

	for (const payload of payloads) {
		const result = await delivery.deliver(context, payload);
		if (!result.success) {
			logger.error("Async router fallback delivery failed", {
				channelType,
				conversationId: context.conversationId,
				payloadType: payload.type,
				error: result.error,
			});
			return false;
		}
	}

	return true;
}
