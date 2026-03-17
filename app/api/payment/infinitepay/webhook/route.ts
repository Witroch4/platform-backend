/**
 * InfinitePay Webhook — Recebe confirmações de pagamento.
 *
 * A InfinitePay envia POST quando um pagamento é confirmado.
 * Mapeamos para o formato PaymentConfirmedPayload e delegamos
 * ao handlePaymentConfirmed() existente.
 *
 * @see /home/wital/chatwit/chatwitdocs/infinitpay.md (seção Webhook)
 */

import { NextResponse } from "next/server";
import log from "@/lib/log";
import { handlePaymentConfirmed, type PaymentConfirmedPayload } from "@/lib/leads/payment-handler";

export const runtime = "nodejs";

interface InfinitePayWebhookBody {
	invoice_slug: string;
	amount: number;
	paid_amount: number;
	installments: number;
	capture_method: string;
	transaction_nsu: string;
	order_nsu: string;
	receipt_url?: string;
	items?: Array<{ description?: string; price?: number; quantity?: number }>;
}

export async function POST(request: Request) {
	const traceId = `ipay-wh-${Date.now()}`;

	try {
		const body: InfinitePayWebhookBody = await request.json();

		log.info("[InfinitePay Webhook] Recebido", {
			traceId,
			orderNsu: body.order_nsu,
			amount: body.amount,
			captureMethod: body.capture_method,
		});

		// Verificar se é um pagamento gerado pelo Socialwise (prefixo sw-)
		if (!body.order_nsu?.startsWith("sw-")) {
			log.debug("[InfinitePay Webhook] order_nsu sem prefixo sw-, ignorando (provavelmente do Chatwit)", {
				traceId,
				orderNsu: body.order_nsu,
			});
			return NextResponse.json({ ok: true, skipped: true });
		}

		// Extrair contactId do order_nsu: "sw-{contactId}-{timestamp}"
		const parts = body.order_nsu.split("-");
		const contactId = parts.length >= 2 ? Number.parseInt(parts[1], 10) : 0;

		// Mapear para formato PaymentConfirmedPayload
		const payload: PaymentConfirmedPayload = {
			event_type: "payment.confirmed",
			data: {
				payment_link_id: 0, // Gerado fora do Chatwit, sem ID de PaymentLink
				order_nsu: body.order_nsu,
				amount_cents: body.amount,
				paid_amount_cents: body.paid_amount,
				capture_method: body.capture_method,
				receipt_url: body.receipt_url,
				conversation_id: 0, // Será ignorado — busca por phone
				contact: {
					id: contactId,
					name: "",
					phone_number: "", // handlePaymentConfirmed busca lead por phone no order_nsu context
				},
			},
			metadata: {
				account_id: 0,
				chatwit_base_url: "",
				timestamp: new Date().toISOString(),
			},
		};

		const result = await handlePaymentConfirmed(payload, traceId);

		log.info("[InfinitePay Webhook] Processado", {
			traceId,
			result,
		});

		return NextResponse.json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		log.error("[InfinitePay Webhook] Erro ao processar", { traceId, error: message });
		return NextResponse.json({ ok: false, error: message }, { status: 400 });
	}
}
