/**
 * Dedicated Payment Webhook Endpoint
 * Receives payment confirmation events from Chatwit account_webhook.
 *
 * Configure in Chatwit: Account Settings → Integrations → Webhooks
 * URL: /api/integrations/payment
 *
 * Chatwit sends this when InfinitePay confirms a payment (message outgoing with
 * additional_attributes.infinitepay_event: "payment_confirmed").
 */

import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import {
	isChatwitPaymentConfirmation,
	processPaymentWebhook,
	type ChatwitPaymentWebhookPayload,
} from "@/lib/leads/payment-webhook-processor";

const MAX_PAYLOAD_BYTES = 64 * 1024; // 64KB

export async function POST(req: NextRequest) {
	const traceId = randomUUID();

	try {
		const contentLength = Number(req.headers.get("content-length") ?? 0);
		if (contentLength > MAX_PAYLOAD_BYTES) {
			return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
		}

		let body: unknown;
		try {
			body = await req.json();
		} catch {
			return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
		}

		if (!isChatwitPaymentConfirmation(body)) {
			return NextResponse.json({ ok: true, skipped: true, reason: "not_payment_confirmation" }, { status: 200 });
		}

		const result = await processPaymentWebhook(body as ChatwitPaymentWebhookPayload, traceId);
		return NextResponse.json(result, { status: 200 });
	} catch (err) {
		console.error("[PaymentWebhook] Unexpected error", { error: String(err), traceId });
		return NextResponse.json({ ok: true, error: "processing_failed" }, { status: 200 });
	}
}

export async function GET() {
	return NextResponse.json({ status: "Payment webhook endpoint operational" }, { status: 200 });
}
