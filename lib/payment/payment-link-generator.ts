/**
 * Payment Link Generator — Factory provider-agnostica.
 *
 * Seleciona o provider correto e gera o link de checkout.
 * Extensível: adicionar novos providers em `lib/payment/providers/`.
 */

import log from "@/lib/log";
import type { PaymentLinkRequest, PaymentLinkResult, PaymentProvider } from "./payment-provider";
import { InfinitePayProvider } from "./providers/infinitepay";

const providers: Record<string, PaymentProvider> = {
	infinitepay: new InfinitePayProvider(),
};

/**
 * Retorna o provider pelo nome.
 * @throws Se o provider não estiver registrado.
 */
export function getPaymentProvider(name: string): PaymentProvider {
	const provider = providers[name];
	if (!provider) {
		throw new Error(`Payment provider desconhecido: "${name}". Disponíveis: ${Object.keys(providers).join(", ")}`);
	}
	return provider;
}

/**
 * Gera um link de pagamento usando o provider especificado.
 */
export async function generatePaymentLink(
	providerName: string,
	request: PaymentLinkRequest,
): Promise<PaymentLinkResult> {
	const provider = getPaymentProvider(providerName);

	log.debug("[PaymentLinkGenerator] Gerando link", {
		provider: providerName,
		amountCents: request.amountCents,
		orderNsu: request.orderNsu,
	});

	return provider.generateLink(request);
}
