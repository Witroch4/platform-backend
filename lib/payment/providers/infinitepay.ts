/**
 * InfinitePay Provider — Geração de links de checkout via API pública.
 *
 * API: POST https://api.infinitepay.io/invoices/public/checkout/links
 * Autenticação: via handle (InfiniteTag), sem API key.
 * Preço: em centavos.
 *
 * @see /home/wital/chatwit/chatwitdocs/infinitpay.md
 */

import log from "@/lib/log";
import type { PaymentLinkRequest, PaymentLinkResult, PaymentProvider } from "../payment-provider";

const INFINITEPAY_API_URL = "https://api.infinitepay.io/invoices/public/checkout/links";

interface InfinitePayCheckoutPayload {
	handle: string;
	items: Array<{
		quantity: number;
		price: number;
		description: string;
	}>;
	order_nsu?: string;
	webhook_url?: string;
	redirect_url?: string;
	customer?: {
		name?: string;
		email?: string;
		phone_number?: string;
	};
}

export class InfinitePayProvider implements PaymentProvider {
	readonly name = "infinitepay";

	async generateLink(request: PaymentLinkRequest): Promise<PaymentLinkResult> {
		const payload: InfinitePayCheckoutPayload = {
			handle: request.handle,
			items: [
				{
					quantity: 1,
					price: request.amountCents,
					description: request.description,
				},
			],
			order_nsu: request.orderNsu,
		};

		if (request.webhookUrl) {
			payload.webhook_url = request.webhookUrl;
		}
		if (request.redirectUrl) {
			payload.redirect_url = request.redirectUrl;
		}

		// Dados do cliente (pré-preenche checkout)
		if (request.customer.name || request.customer.email || request.customer.phone) {
			payload.customer = {};
			if (request.customer.name) payload.customer.name = request.customer.name;
			if (request.customer.email) payload.customer.email = request.customer.email;
			if (request.customer.phone) payload.customer.phone_number = request.customer.phone;
		}

		log.debug("[InfinitePay] Gerando link de checkout", {
			handle: request.handle,
			amountCents: request.amountCents,
			orderNsu: request.orderNsu,
			description: request.description.slice(0, 50),
		});

		try {
			const response = await fetch(INFINITEPAY_API_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				const errorText = await response.text();
				log.error("[InfinitePay] Erro na API", {
					status: response.status,
					error: errorText.slice(0, 200),
					orderNsu: request.orderNsu,
				});
				return {
					success: false,
					error: `InfinitePay API error: ${response.status} - ${errorText.slice(0, 100)}`,
				};
			}

			const data = await response.json();

			// A API retorna o link de checkout diretamente
			const checkoutUrl = data.checkout_url || data.url || data.link;
			if (!checkoutUrl) {
				log.error("[InfinitePay] Resposta sem checkout URL", {
					responseKeys: Object.keys(data),
					orderNsu: request.orderNsu,
				});
				return {
					success: false,
					error: "InfinitePay não retornou URL de checkout",
				};
			}

			log.info("[InfinitePay] Link gerado com sucesso", {
				orderNsu: request.orderNsu,
				checkoutUrl: checkoutUrl.slice(0, 60),
			});

			return {
				success: true,
				checkoutUrl,
				linkId: data.slug || data.id || request.orderNsu,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			log.error("[InfinitePay] Erro ao gerar link", {
				error: message,
				orderNsu: request.orderNsu,
			});
			return {
				success: false,
				error: `Erro de rede: ${message}`,
			};
		}
	}
}
