// app/checkout/page.tsx
"use client";

import React, { useCallback, useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";

// Inicializa o Stripe com a chave publicável
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export default function CheckoutPage() {
	const { data: session, status } = useSession();
	const router = useRouter();
	const [isLoading, setIsLoading] = useState(true);
	const [clientSecret, setClientSecret] = useState<string | null>(null);

	// Usa o user.id se existir, senão utiliza o user.email
	const userId = session?.user?.id || session?.user?.email;

	// Função para buscar o clientSecret da Checkout Session via API
	const fetchClientSecret = useCallback(async () => {
		if (!userId) return null;

		try {
			const response = await fetch("/api/checkout-sessions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ userId }),
			});

			if (!response.ok) {
				throw new Error("Falha ao obter o clientSecret");
			}

			const data = await response.json();
			return data.clientSecret;
		} catch (error) {
			console.error("Erro ao buscar clientSecret:", error);
			return null;
		}
	}, [userId]);

	useEffect(() => {
		// Só tenta buscar o clientSecret quando o usuário estiver autenticado
		if (status === "authenticated" && userId) {
			fetchClientSecret()
				.then((secret) => {
					if (secret) {
						setClientSecret(secret);
					}
					setIsLoading(false);
				})
				.catch((error) => {
					console.error("Erro ao buscar clientSecret:", error);
					setIsLoading(false);
				});
		} else if (status !== "loading") {
			setIsLoading(false);
		}
	}, [status, userId, fetchClientSecret]);

	// Renderização para estado de carregamento
	if (isLoading) {
		return (
			<div className="min-h-screen bg-gray-50 dark:bg-neutral-900 flex flex-col items-center justify-center p-4">
				<p>Carregando...</p>
			</div>
		);
	}

	// Renderização para usuário não autenticado
	if (!session) {
		return (
			<div className="min-h-screen bg-gray-50 dark:bg-neutral-900 flex flex-col items-center justify-center p-4">
				<p>Você precisa estar autenticado para acessar o checkout.</p>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-gray-50 dark:bg-neutral-900 flex flex-col items-center justify-center p-4">
			<div className="w-full max-w-xl">
				<h1 className="text-3xl font-bold text-center mb-6">Checkout - Assinatura Mensal</h1>

				{clientSecret ? (
					<EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
						<EmbeddedCheckout />
					</EmbeddedCheckoutProvider>
				) : (
					<p className="text-center">Não foi possível carregar o checkout. Tente novamente mais tarde.</p>
				)}
			</div>
		</div>
	);
}
