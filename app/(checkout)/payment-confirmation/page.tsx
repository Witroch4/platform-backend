// app/(checkout)/payment-confirmation/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function PaymentConfirmationPage() {
	const [status, setStatus] = useState<string | null>(null);
	const [customerEmail, setCustomerEmail] = useState<string>("");
	const [accounts, setAccounts] = useState<any[]>([]);
	const router = useRouter();

	useEffect(() => {
		// Buscar contas do Instagram do usuário
		const fetchAccounts = async () => {
			try {
				const res = await fetch("/api/auth/instagram/accounts");
				if (res.ok) {
					const data = await res.json();
					setAccounts(data.accounts || []);
				}
			} catch (error) {
				console.error("Erro ao buscar contas:", error);
			}
		};

		fetchAccounts();

		const searchParams = new URLSearchParams(window.location.search);
		const sessionId = searchParams.get("session_id");

		if (sessionId) {
			console.log("Buscando sessão com session_id:", sessionId);
			fetch(`/api/checkout-sessions?session_id=${sessionId}`, {
				method: "GET",
			})
				.then(async (res) => {
					// Tenta ler o corpo da resposta como texto
					const text = await res.text();
					// Log para debug
					console.log("Resposta bruta da API:", text);
					// Se houver texto, tenta converter para JSON; caso contrário, retorna um objeto vazio
					return text ? JSON.parse(text) : {};
				})
				.then((data) => {
					console.log("Dados recebidos da API:", data);
					setStatus(data.status);
					setCustomerEmail(data.customer_email);
				})
				.catch((err) => {
					console.error("Erro ao buscar dados da sessão:", err);
				});
		}
	}, []);

	// Se o status for "open", redireciona para a conta do Instagram ou página de registro
	useEffect(() => {
		if (status === "open") {
			if (accounts.length > 0) {
				const mainAccount = accounts.find((acc) => acc.isMain) || accounts[0];
				router.push(`/${mainAccount.providerAccountId}/dashboard`);
			} else {
				router.push("/registro/redesocial");
			}
		}
	}, [status, router, accounts]);

	if (status === "complete") {
		return (
			<div className="min-h-screen flex items-center justify-center bg-background p-4">
				<div className="max-w-md w-full bg-card border rounded-lg p-8 text-center space-y-4">
					<h1 className="text-3xl font-bold text-foreground">Assinatura Confirmada!</h1>
					<p className="text-muted-foreground">
						Obrigado por se juntar à comunidade ChatWit, que mais cresce no Brasil.
					</p>
					<p className="text-muted-foreground">
						Um email de confirmação foi enviado para{" "}
						<span className="font-medium text-foreground">{customerEmail}</span>.
					</p>
					<Button
						onClick={() => {
							if (accounts.length > 0) {
								const mainAccount = accounts.find((acc) => acc.isMain) || accounts[0];
								router.push(`/${mainAccount.providerAccountId}/dashboard`);
							} else {
								router.push("/registro/redesocial");
							}
						}}
					>
						Ir para o Meu Painel
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen flex items-center justify-center bg-background">
			<div className="text-center">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
				<p className="text-muted-foreground">Carregando...</p>
			</div>
		</div>
	);
}
