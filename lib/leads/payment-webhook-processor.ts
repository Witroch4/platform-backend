/**
 * Payment Webhook Processor
 * Handles payment confirmation events from Chatwit account_webhook format.
 * Separate from payment-handler.ts which handles the InfinitePay direct webhook format.
 *
 * Seção 17 do contrato Chatwit: o payload inclui `payment_data` (dados estruturados)
 * como alternativa ao parsing via regex do campo `content`.
 * Esta implementação prefere `payment_data` quando disponível, com fallback para regex.
 */

import { getPrismaInstance } from "@/lib/connections";
import { PaymentServiceType, PaymentStatus } from "@prisma/client";

const prisma = getPrismaInstance();

/** Structured payment data sent by Chatwit (Seção 17) */
export interface ChatwitPaymentData {
	payment_link_id?: number;
	order_nsu?: string;
	amount_cents?: number;
	paid_amount_cents?: number;
	capture_method?: string; // "pix" | "credit_card" | "debit_card" | "boleto"
	receipt_url?: string;
	conversation_id?: number;
	contact?: {
		id?: number;
		name?: string;
		phone_number?: string;
	};
}

export interface ChatwitPaymentWebhookPayload {
	event?: string;
	message_type?: string;
	content?: string;
	content_type?: string;
	additional_attributes?: {
		payment_link_id?: number;
		infinitepay_event?: string;
	};
	conversation?: {
		id?: number;
		meta?: {
			sender?: {
				phone_number?: string;
				name?: string;
			};
		};
	};
	account?: { id?: number; name?: string };
	/** Structured data from Chatwit (preferred over regex parsing) */
	payment_data?: ChatwitPaymentData;
	ACCESS_TOKEN?: string;
}

export interface ParsedPaymentDetails {
	amountCents: number;
	paidAmountCents: number;
	captureMethod: string;
	captureMethodTag: string;
	orderNsu: string | null;
	receiptUrl: string | null;
	contactPhone: string | null;
	contactName: string | null;
	conversationId: number;
	paymentLinkId: number | null;
}

/**
 * Detects if a raw Chatwit account_webhook payload is a payment confirmation.
 */
export function isChatwitPaymentConfirmation(payload: unknown): boolean {
	if (!payload || typeof payload !== "object") return false;
	const p = payload as Record<string, unknown>;
	const attrs = p.additional_attributes as Record<string, unknown> | undefined;
	return attrs?.infinitepay_event === "payment_confirmed";
}

// --- Regex fallback parsers (used when payment_data is absent) ---

function parseAmountCents(content: string): number {
	const match = content.match(/Valor:\s*R\$\s*([\d.,]+)/i);
	if (!match) return 0;
	const raw = match[1];
	const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
	const amount = parseFloat(normalized);
	return isNaN(amount) ? 0 : Math.round(amount * 100);
}

function parseCaptureMethodFromText(content: string): { method: string; tag: string } {
	const match = content.match(/Forma de pagamento:\s*(.+)/i);
	if (!match) return { method: "other", tag: "outro" };
	const raw = match[1].trim().toLowerCase();
	if (raw.includes("pix")) return { method: "pix", tag: "pix" };
	if (raw.includes("credito") || raw.includes("crédito") || raw.includes("credit"))
		return { method: "credit_card", tag: "credito" };
	if (raw.includes("debito") || raw.includes("débito") || raw.includes("debit"))
		return { method: "debit_card", tag: "debito" };
	if (raw.includes("boleto")) return { method: "boleto", tag: "boleto" };
	return { method: "other", tag: "outro" };
}

function parseCaptureMethodFromString(method: string): string {
	const m = method.toLowerCase();
	if (m === "pix") return "pix";
	if (m.includes("credit")) return "credit_card";
	if (m.includes("debit")) return "debit_card";
	if (m === "boleto") return "boleto";
	return "other";
}

function captureMethodToTag(method: string): string {
	if (method === "pix") return "pix";
	if (method === "credit_card") return "credito";
	if (method === "debit_card") return "debito";
	if (method === "boleto") return "boleto";
	return "outro";
}

function parseTransactionCodeFromReceipt(content: string): string | null {
	// Extract UUID from receipt URL — e.g. https://recibo.infinitepay.io/abc-123-def
	const match = content.match(/recibo\.infinitepay\.io\/([A-Za-z0-9-]+)/i);
	return match ? match[1] : null;
}

function parseReceiptUrl(content: string): string | null {
	const match = content.match(/https:\/\/recibo\.infinitepay\.io\/[A-Za-z0-9-]+(?:\?[\w%=&.-]+)?\/?/i);
	return match ? match[0] : null;
}

/**
 * Parses payment details from Chatwit webhook payload.
 * Prefers structured `payment_data` (Seção 17); falls back to regex on `content`.
 */
export function parseChatwitPaymentDetails(payload: ChatwitPaymentWebhookPayload): ParsedPaymentDetails {
	const pd = payload.payment_data;
	const content = payload.content ?? "";

	if (pd) {
		// Structured path — clean data from Chatwit
		const method = pd.capture_method
			? parseCaptureMethodFromString(pd.capture_method)
			: parseCaptureMethodFromText(content).method;

		return {
			amountCents: pd.amount_cents ?? parseAmountCents(content),
			paidAmountCents: pd.paid_amount_cents ?? pd.amount_cents ?? parseAmountCents(content),
			captureMethod: method,
			captureMethodTag: captureMethodToTag(method),
			orderNsu: pd.order_nsu ?? null,
			receiptUrl: pd.receipt_url ?? parseReceiptUrl(content),
			contactPhone: pd.contact?.phone_number ?? payload.conversation?.meta?.sender?.phone_number ?? null,
			contactName: pd.contact?.name ?? payload.conversation?.meta?.sender?.name ?? null,
			conversationId: pd.conversation_id ?? payload.conversation?.id ?? 0,
			paymentLinkId: pd.payment_link_id ?? payload.additional_attributes?.payment_link_id ?? null,
		};
	}

	// Regex fallback — parse content text
	const { method, tag } = parseCaptureMethodFromText(content);
	const receiptUrl = parseReceiptUrl(content);
	const txCode = parseTransactionCodeFromReceipt(content);
	return {
		amountCents: parseAmountCents(content),
		paidAmountCents: parseAmountCents(content),
		captureMethod: method,
		captureMethodTag: tag,
		orderNsu: txCode,
		receiptUrl,
		contactPhone: payload.conversation?.meta?.sender?.phone_number ?? null,
		contactName: payload.conversation?.meta?.sender?.name ?? null,
		conversationId: payload.conversation?.id ?? 0,
		paymentLinkId: payload.additional_attributes?.payment_link_id ?? null,
	};
}

/**
 * Processes a payment confirmation from Chatwit.
 * Finds the lead, creates a LeadPayment record, and tags the lead.
 */
export async function processPaymentWebhook(
	payload: ChatwitPaymentWebhookPayload,
	traceId?: string,
): Promise<{ ok: boolean; leadId?: string; paymentId?: string; skipped?: boolean; reason?: string }> {
	const details = parseChatwitPaymentDetails(payload);

	// Idempotency: prefer order_nsu (from payment_data) as externalId
	if (details.orderNsu) {
		const existing = await prisma.leadPayment.findUnique({
			where: { externalId: details.orderNsu },
			select: { id: true, leadId: true },
		});
		if (existing) {
			console.log(
				`[PaymentWebhookProcessor] Duplicate payment skipped: orderNsu=${details.orderNsu}`,
				{ traceId },
			);
			return { ok: true, skipped: true, leadId: existing.leadId, paymentId: existing.id };
		}
	}

	// Find lead by phone number
	const phoneDigits = details.contactPhone?.replace(/\D/g, "") ?? "";
	if (!phoneDigits) {
		console.warn("[PaymentWebhookProcessor] No contact phone in payload", { traceId });
		return { ok: true, skipped: true, reason: "no_phone" };
	}

	const lead = await prisma.lead.findFirst({
		where: {
			OR: [
				{ phone: { contains: phoneDigits } },
				{ sourceIdentifier: { contains: phoneDigits } },
			],
			source: "CHATWIT_OAB",
		},
		select: { id: true, tags: true },
	});

	if (!lead) {
		console.warn(`[PaymentWebhookProcessor] No lead found for phone ${phoneDigits}`, { traceId });
		return { ok: true, skipped: true, reason: "lead_not_found" };
	}

	// Create payment record
	const payment = await prisma.leadPayment.create({
		data: {
			leadId: lead.id,
			amountCents: details.amountCents,
			paidAmountCents: details.paidAmountCents,
			serviceType: PaymentServiceType.OUTRO,
			status: PaymentStatus.CONFIRMED,
			captureMethod: details.captureMethod,
			receiptUrl: details.receiptUrl,
			externalId: details.orderNsu ?? undefined,
			confirmedAt: new Date(),
			confirmedBy: "chatwit_webhook",
			chatwitConversationId: details.conversationId || undefined,
			contactPhone: details.contactPhone ?? undefined,
			metadata: payload as object,
		},
	});

	// Add luminous tags (only if not already present)
	const newTags = ["pagamento-recebido", "pago", details.captureMethodTag].filter(
		(tag) => !lead.tags.includes(tag),
	);
	for (const tag of newTags) {
		await prisma.lead.update({
			where: { id: lead.id },
			data: { tags: { push: tag } },
		});
	}

	console.log(
		`[PaymentWebhookProcessor] Payment recorded: ${payment.id} for lead ${lead.id}` +
			` (R$ ${(details.amountCents / 100).toFixed(2)} via ${details.captureMethod}` +
			`${details.orderNsu ? ` nsu=${details.orderNsu}` : ""})`,
		{ traceId },
	);

	return { ok: true, leadId: lead.id, paymentId: payment.id };
}
