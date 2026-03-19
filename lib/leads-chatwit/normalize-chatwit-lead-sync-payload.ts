import type { WebhookPayload } from "@/types/webhook";
import {
	sanitizeChatwitPayload,
	type SanitizedArquivo,
} from "@/lib/leads-chatwit/sanitize-chatwit-payload";
import { buildChatwitConversationUrl } from "@/lib/logging/socialwise-correlation";

type LooseObject = Record<string, any>;

export type ChatwitLeadSyncMode = "specific" | "legacy_contact" | "legacy_message";

export interface NormalizedLeadSyncResult {
	mode: ChatwitLeadSyncMode;
	event: string;
	payload?: WebhookPayload;
	skipReason?: "message_without_attachments" | "outgoing_message" | "private_message";
}

const GENERIC_MESSAGE_EVENTS = new Set(["message_created", "message_updated"]);
const LEAD_CONTACT_EVENTS = new Set(["contact_created", "contact_updated"]);
const SPECIFIC_LEAD_SYNC_INTEGRATIONS = new Set(["socialwise_lead_sync", "chatwit_lead_sync"]);

function unwrapPayload(rawPayload: any): LooseObject {
	const item = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload;

	if (!item || typeof item !== "object") {
		throw new Error("Payload vazio ou inválido");
	}

	return item.body && typeof item.body === "object" ? item.body : item;
}

function normalizeChannel(channel?: string): string {
	if (!channel) {
		return "whatsapp";
	}

	return String(channel).replace("Channel::", "").toLowerCase();
}

function buildLeadUrl(body: LooseObject): string {
	if (typeof body.leadUrl === "string" && body.leadUrl.trim()) {
		return body.leadUrl;
	}

	return (
		buildChatwitConversationUrl(
			process.env.CHATWIT_BASE_URL || "https://chatwit.witdev.com.br",
			body.account?.id,
			body.conversation?.display_id || body.conversation?.id,
		) || ""
	);
}

function normalizeAttachment(rawAttachment: LooseObject): SanitizedArquivo | null {
	const rawId = rawAttachment.chatwitFileId ?? rawAttachment.id;
	const chatwitFileId = Number(rawId);
	const dataUrl =
		typeof rawAttachment.data_url === "string"
			? rawAttachment.data_url
			: typeof rawAttachment.dataUrl === "string"
				? rawAttachment.dataUrl
				: typeof rawAttachment.url === "string"
					? rawAttachment.url
					: "";

	if (!dataUrl.trim()) {
		return null;
	}

	if (!Number.isInteger(chatwitFileId) || chatwitFileId <= 0) {
		return null;
	}

	return {
		file_type: String(rawAttachment.file_type || rawAttachment.fileType || "file"),
		data_url: dataUrl,
		chatwitFileId,
	};
}

function normalizeAttachments(rawAttachments: unknown): SanitizedArquivo[] {
	const attachments = Array.isArray(rawAttachments) ? rawAttachments : [];
	const deduplicatedAttachments = new Map<number, SanitizedArquivo>();

	attachments.forEach((attachment) => {
		if (!attachment || typeof attachment !== "object") {
			return;
		}

		const normalizedAttachment = normalizeAttachment(attachment as LooseObject);
		if (!normalizedAttachment) {
			return;
		}

		if (!deduplicatedAttachments.has(normalizedAttachment.chatwitFileId)) {
			deduplicatedAttachments.set(normalizedAttachment.chatwitFileId, normalizedAttachment);
		}
	});

	return Array.from(deduplicatedAttachments.values());
}

function getRootMessageType(body: LooseObject): string | undefined {
	return body.message_type || body.message?.message_type;
}

function hasRelevantAttachments(body: LooseObject): boolean {
	if (Array.isArray(body.attachments) && body.attachments.length > 0) {
		return true;
	}

	const conversationMessages = body.conversation?.messages;
	return (
		Array.isArray(conversationMessages) &&
		conversationMessages.some(
			(message: any) => Array.isArray(message?.attachments) && message.attachments.length > 0,
		)
	);
}

function isSpecificLeadSyncPayload(body: LooseObject): boolean {
	const integration = String(body.integration || body.metadata?.integration || body.metadata?.purpose || "").trim();
	return SPECIFIC_LEAD_SYNC_INTEGRATIONS.has(integration) || body.metadata?.purpose === "lead_sync";
}

function isLegacyContactEvent(body: LooseObject): boolean {
	return LEAD_CONTACT_EVENTS.has(String(body.event || ""));
}

function isLegacyMessageEvent(body: LooseObject): boolean {
	return GENERIC_MESSAGE_EVENTS.has(String(body.event || ""));
}

function mapBodyToWebhookPayload(body: LooseObject): WebhookPayload {
	const contact = body.contact || body.sender || body.origemLead || body;
	const account = body.account || body.usuario?.account || {};
	const inbox = body.inbox || body.usuario?.inbox || {};
	const sourceId = contact.id ?? body.id ?? body.contact_id ?? body.source_id ?? body.origemLead?.source_id;

	if (!account.id || !sourceId) {
		throw new Error("Payload de lead sync sem account.id ou contact/source_id");
	}

	return {
		usuario: {
			account: {
				id: String(account.id),
				name: String(account.name || "Conta Chatwit"),
			},
			inbox: {
				id: String(inbox.id || "lead_sync"),
				name: String(inbox.name || "Lead Sync"),
			},
			channel: normalizeChannel(body.channel_type || body.channel || body.usuario?.channel),
			CHATWIT_ACCESS_TOKEN: String(
				body.ACCESS_TOKEN || body.access_token || body.chatwitAccessToken || body.usuario?.CHATWIT_ACCESS_TOKEN || "",
			),
		},
		origemLead: {
			source_id: String(sourceId),
			name: String(contact.name || body.contact_name || body.origemLead?.name || "Lead sem nome"),
			phone_number: String(contact.phone_number || body.contact_phone || body.origemLead?.phone_number || ""),
			thumbnail: String(
				contact.thumbnail || contact.avatar || body.thumbnail || body.avatar || body.origemLead?.thumbnail || "",
			),
			leadUrl: buildLeadUrl(body),
			arquivos: normalizeAttachments(body.attachments || body.files || body.origemLead?.arquivos),
		},
	};
}

export function normalizeChatwitLeadSyncPayload(rawPayload: any): NormalizedLeadSyncResult {
	const body = unwrapPayload(rawPayload);
	const event = String(body.event || "message_created");
	const rootMessageType = String(getRootMessageType(body) || "").toLowerCase();

	if (rootMessageType === "outgoing") {
		return { mode: "legacy_message", event, skipReason: "outgoing_message" };
	}

	if (body.private === true) {
		return { mode: "legacy_message", event, skipReason: "private_message" };
	}

	if (isSpecificLeadSyncPayload(body)) {
		return {
			mode: "specific",
			event,
			payload: mapBodyToWebhookPayload(body),
		};
	}

	if (isLegacyContactEvent(body)) {
		return {
			mode: "legacy_contact",
			event,
			payload: mapBodyToWebhookPayload(body),
		};
	}

	if (isLegacyMessageEvent(body) && !hasRelevantAttachments(body)) {
		return { mode: "legacy_message", event, skipReason: "message_without_attachments" };
	}

	return {
		mode: "legacy_message",
		event,
		payload: sanitizeChatwitPayload(rawPayload),
	};
}
