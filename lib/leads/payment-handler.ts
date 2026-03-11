/**
 * Lead Payment Handler
 * Processes payment.confirmed events from Chatwit/InfinitePay webhook
 * and manages manual payment registration.
 */

import { getPrismaInstance } from "@/lib/connections";
import { PaymentServiceType, PaymentStatus } from "@prisma/client";

const prisma = getPrismaInstance();

export interface PaymentConfirmedData {
	payment_link_id: number;
	order_nsu: string;
	amount_cents: number;
	paid_amount_cents: number;
	capture_method: string;
	receipt_url?: string;
	conversation_id: number;
	contact: {
		id: number;
		name: string;
		phone_number: string;
	};
}

export interface PaymentConfirmedPayload {
	event_type: "payment.confirmed";
	data: PaymentConfirmedData;
	metadata: {
		account_id: number;
		chatwit_base_url: string;
		timestamp: string;
	};
}

/**
 * Handles an incoming payment.confirmed event from Chatwit.
 * Looks up the lead by phone, creates a payment record, and auto-tags.
 */
export async function handlePaymentConfirmed(
	payload: PaymentConfirmedPayload,
	traceId: string,
): Promise<{ ok: boolean; leadId?: string; paymentId?: string; skipped?: boolean }> {
	const { data, metadata } = payload;

	// Idempotency: check if payment with this externalId already exists
	if (data.order_nsu) {
		const existing = await prisma.leadPayment.findUnique({
			where: { externalId: data.order_nsu },
		});
		if (existing) {
			console.log(`[PaymentHandler] Duplicate payment skipped: ${data.order_nsu}`, { traceId });
			return { ok: true, skipped: true, leadId: existing.leadId, paymentId: existing.id };
		}
	}

	// Look up lead by phone number (normalize to digits only for matching)
	const phoneDigits = data.contact.phone_number.replace(/\D/g, "");
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
		console.warn(`[PaymentHandler] No CHATWIT_OAB lead found for phone ${phoneDigits}`, { traceId });
		return { ok: true, skipped: true };
	}

	// Create payment record
	const payment = await prisma.leadPayment.create({
		data: {
			leadId: lead.id,
			amountCents: data.amount_cents,
			paidAmountCents: data.paid_amount_cents,
			serviceType: PaymentServiceType.OUTRO,
			status: PaymentStatus.CONFIRMED,
			captureMethod: data.capture_method,
			receiptUrl: data.receipt_url || null,
			externalId: data.order_nsu,
			confirmedAt: new Date(),
			confirmedBy: "webhook",
			chatwitConversationId: data.conversation_id,
			contactPhone: data.contact.phone_number,
			metadata: payload as any,
		},
	});

	// Auto-tag the lead
	const paymentTag = "pago";
	if (!lead.tags.includes(paymentTag)) {
		await prisma.lead.update({
			where: { id: lead.id },
			data: { tags: { push: paymentTag } },
		});
	}

	console.log(
		`[PaymentHandler] Payment recorded: ${payment.id} for lead ${lead.id} (R$ ${(data.paid_amount_cents / 100).toFixed(2)})`,
		{ traceId },
	);

	return { ok: true, leadId: lead.id, paymentId: payment.id };
}
