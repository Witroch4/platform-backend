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
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 800;
const MIN_CUSTOMER_NAME_LENGTH = 3;

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

	/**
	 * Sanitiza o nome do cliente para ter pelo menos 3 caracteres (exigência InfinitePay).
	 * Se vazio ou menor que 3, usa fallback "Cliente".
	 */
	private sanitizeCustomerName(name: string | undefined): string {
		const trimmed = (name ?? "").trim();
		if (trimmed.length < MIN_CUSTOMER_NAME_LENGTH) {
			return "Cliente";
		}
		return trimmed;
	}

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

		// Dados do cliente (pré-preenche checkout) — nome sanitizado (mín 3 chars)
		if (request.customer.name || request.customer.email || request.customer.phone) {
			payload.customer = {};
			const sanitizedName = this.sanitizeCustomerName(request.customer.name);
			payload.customer.name = sanitizedName;
			if (request.customer.email) payload.customer.email = request.customer.email;
			if (request.customer.phone) payload.customer.phone_number = request.customer.phone;
		}

		log.debug("[InfinitePay] Gerando link de checkout", {
			handle: request.handle,
			amountCents: request.amountCents,
			orderNsu: request.orderNsu,
			description: request.description.slice(0, 50),
		});

		// Retry com backoff exponencial (3 tentativas)
		let lastError = "";
		for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
			try {
				const result = await this.attemptGenerate(payload, request.orderNsu);
				if (result.success) return result;

				lastError = result.error ?? "Erro desconhecido";

				// Não retentar erros de validação (4xx) — exceto 429 (rate limit)
				if (result.error?.includes("API error: 4") && !result.error?.includes("API error: 429")) {
					log.warn("[InfinitePay] Erro de validação, sem retry", {
						attempt,
						error: lastError,
						orderNsu: request.orderNsu,
					});
					return result;
				}
			} catch (err) {
				lastError = err instanceof Error ? err.message : String(err);
			}

			if (attempt < MAX_RETRIES) {
				const delay = BASE_DELAY_MS * 2 ** (attempt - 1); // 800ms, 1600ms
				log.warn("[InfinitePay] Tentativa falhou, retentando", {
					attempt,
					nextDelayMs: delay,
					error: lastError,
					orderNsu: request.orderNsu,
				});
				await new Promise((r) => setTimeout(r, delay));
			}
		}

		log.error("[InfinitePay] Todas as tentativas falharam", {
			attempts: MAX_RETRIES,
			lastError,
			orderNsu: request.orderNsu,
		});
		return { success: false, error: lastError };
	}

	private async attemptGenerate(
		payload: InfinitePayCheckoutPayload,
		orderNsu: string | undefined,
	): Promise<PaymentLinkResult> {
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
					orderNsu,
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
					orderNsu,
				});
				return {
					success: false,
					error: "InfinitePay não retornou URL de checkout",
				};
			}

			log.info("[InfinitePay] Link gerado com sucesso", {
				orderNsu,
				checkoutUrl: checkoutUrl.slice(0, 60),
			});

			return {
				success: true,
				checkoutUrl,
				linkId: data.slug || data.id || orderNsu,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			log.error("[InfinitePay] Erro ao gerar link", {
				error: message,
				orderNsu,
			});
			return {
				success: false,
				error: `Erro de rede: ${message}`,
			};
		}
	}
}
