/**
 * Payment Webhook Processor
 * Handles payment confirmation events from Chatwit account_webhook format.
 * Separate from payment-handler.ts which handles the InfinitePay direct webhook format.
 *
 * Seção 17 do contrato Chatwit: o payload SEMPRE inclui `payment_data` (dados estruturados).
 * Este é o único caminho — parsing via regex do campo `content` está deprecado.
 */

import { getPrismaInstance } from "@/lib/connections";
import { PaymentServiceType, PaymentStatus } from "@prisma/client";
import { FlowOrchestrator } from "@/services/flow-engine/flow-orchestrator";

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
	/** Structured data from Chatwit — always present per Seção 17 */
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

/**
 * Parses payment details from Chatwit webhook payload.
 * Uses structured `payment_data` exclusively (Seção 17 — always present).
 */
export function parseChatwitPaymentDetails(payload: ChatwitPaymentWebhookPayload): ParsedPaymentDetails {
	const pd = payload.payment_data;

	if (!pd) {
		console.warn("[PaymentWebhookProcessor] payment_data absent — Seção 17 guarantees it should always be present");
	}

	const method = pd?.capture_method
		? parseCaptureMethodFromString(pd.capture_method)
		: "other";

	return {
		amountCents: pd?.amount_cents ?? 0,
		paidAmountCents: pd?.amount_cents ?? 0, // use amount (líquido), não paid_amount (inclui juros do cliente)
		captureMethod: method,
		captureMethodTag: captureMethodToTag(method),
		orderNsu: pd?.order_nsu ?? null,
		receiptUrl: pd?.receipt_url ?? null,
		contactPhone: pd?.contact?.phone_number ?? payload.conversation?.meta?.sender?.phone_number ?? null,
		contactName: pd?.contact?.name ?? payload.conversation?.meta?.sender?.name ?? null,
		conversationId: pd?.conversation_id ?? payload.conversation?.id ?? 0,
		paymentLinkId: pd?.payment_link_id ?? payload.additional_attributes?.payment_link_id ?? null,
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

	// Idempotency: order_nsu from payment_data is the unique transaction identifier
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

	// Auto-resume flow via payment anchor (non-blocking)
	try {
		// Extract conversationId from details or order_nsu fallback
		let targetConvId = details.conversationId;
		if ((!targetConvId || targetConvId === 0) && details.orderNsu) {
			const nsuParts = details.orderNsu.split("-");
			if (nsuParts.length >= 3 && nsuParts[0] === "chatwit") {
				targetConvId = Number(nsuParts[2]) || 0;
			}
		}
		if (targetConvId && targetConvId !== 0) {
			const orchestrator = new FlowOrchestrator();
			await orchestrator.resumeFromPayment(String(targetConvId), details.orderNsu || "", traceId);
		}
	} catch (resumeErr) {
		console.warn("[PaymentWebhookProcessor] Flow auto-resume failed (non-critical)", {
			error: String(resumeErr),
			traceId,
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
