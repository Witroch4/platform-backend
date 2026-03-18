/**
 * Payment Webhook Processor
 * Handles payment confirmation events from Chatwit account_webhook format.
 * Separate from payment-handler.ts which handles the InfinitePay direct webhook format.
 */

import { getPrismaInstance } from "@/lib/connections";
import { PaymentServiceType, PaymentStatus } from "@prisma/client";

const prisma = getPrismaInstance();

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
	ACCESS_TOKEN?: string;
}

export interface ParsedPaymentDetails {
	amountCents: number;
	captureMethod: string;
	captureMethodTag: string;
	transactionCode: string | null;
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

function parseAmountCents(content: string): number {
	const match = content.match(/Valor:\s*R\$\s*([\d.,]+)/i);
	if (!match) return 0;
	// Brazilian number format: "2,12" or "1.234,56" or "2.12"
	const raw = match[1];
	const hasCommaDecimal = raw.includes(",");
	const normalized = hasCommaDecimal
		? raw.replace(/\./g, "").replace(",", ".")
		: raw;
	const amount = parseFloat(normalized);
	return isNaN(amount) ? 0 : Math.round(amount * 100);
}

function parseCaptureMethod(content: string): { method: string; tag: string } {
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

function parseTransactionCode(content: string): string | null {
	const match = content.match(/Codigo:\s*([a-f0-9-]{36})/i);
	return match ? match[1] : null;
}

function parseReceiptUrl(content: string): string | null {
	const match = content.match(/https:\/\/recibo\.infinitepay\.io\/[A-Za-z0-9-]+(?:\?[\w%=&.-]+)?\/?/i);
	return match ? match[0] : null;
}

export function parseChatwitPaymentDetails(payload: ChatwitPaymentWebhookPayload): ParsedPaymentDetails {
	const content = payload.content ?? "";
	const { method, tag } = parseCaptureMethod(content);
	return {
		amountCents: parseAmountCents(content),
		captureMethod: method,
		captureMethodTag: tag,
		transactionCode: parseTransactionCode(content),
		receiptUrl: parseReceiptUrl(content),
		contactPhone: payload.conversation?.meta?.sender?.phone_number ?? null,
		contactName: payload.conversation?.meta?.sender?.name ?? null,
		conversationId: payload.conversation?.id ?? 0,
		paymentLinkId: payload.additional_attributes?.payment_link_id ?? null,
	};
}

/**
 * Processes a payment confirmation from Chatwit account_webhook.
 * Finds the lead, creates a LeadPayment record, and tags the lead.
 */
export async function processPaymentWebhook(
	payload: ChatwitPaymentWebhookPayload,
	traceId?: string,
): Promise<{ ok: boolean; leadId?: string; paymentId?: string; skipped?: boolean; reason?: string }> {
	const details = parseChatwitPaymentDetails(payload);

	// Idempotency: use transaction code (UUID) as externalId
	if (details.transactionCode) {
		const existing = await prisma.leadPayment.findUnique({
			where: { externalId: details.transactionCode },
			select: { id: true, leadId: true },
		});
		if (existing) {
			console.log(
				`[PaymentWebhookProcessor] Duplicate payment skipped: txCode=${details.transactionCode}`,
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
			paidAmountCents: details.amountCents,
			serviceType: PaymentServiceType.OUTRO,
			status: PaymentStatus.CONFIRMED,
			captureMethod: details.captureMethod,
			receiptUrl: details.receiptUrl,
			externalId: details.transactionCode ?? undefined,
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
			` (R$ ${(details.amountCents / 100).toFixed(2)} via ${details.captureMethod})`,
		{ traceId },
	);

	return { ok: true, leadId: lead.id, paymentId: payment.id };
}
