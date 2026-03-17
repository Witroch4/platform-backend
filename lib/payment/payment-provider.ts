/**
 * Payment Provider — Interface genérica para geração de links de pagamento.
 *
 * Provider-agnostic: InfinitePay agora, MercadoPago/Asaas depois.
 * Cada provider implementa `generateLink()` e retorna uma URL de checkout.
 */

export interface PaymentLinkRequest {
	/** Identificador do merchant no provider (ex: InfiniteTag sem $) */
	handle: string;
	/** Valor em centavos (ex: 2790 = R$ 27,90) */
	amountCents: number;
	/** Descrição do item/serviço */
	description: string;
	/** Dados do cliente (pré-preenche checkout) */
	customer: {
		name: string;
		email?: string;
		phone?: string;
	};
	/** URL para receber notificação de pagamento */
	webhookUrl?: string;
	/** URL de redirecionamento após pagamento */
	redirectUrl?: string;
	/** Identificador único do pedido (idempotency) */
	orderNsu: string;
	/** Metadados extras (provider-specific) */
	metadata?: Record<string, unknown>;
}

export interface PaymentLinkResult {
	success: boolean;
	/** URL do checkout gerado */
	checkoutUrl?: string;
	/** ID do link no provider */
	linkId?: string;
	/** Mensagem de erro (se success=false) */
	error?: string;
}

export interface PaymentProvider {
	/** Nome do provider (ex: "infinitepay") */
	readonly name: string;
	/** Gera link de pagamento e retorna URL */
	generateLink(request: PaymentLinkRequest): Promise<PaymentLinkResult>;
}
