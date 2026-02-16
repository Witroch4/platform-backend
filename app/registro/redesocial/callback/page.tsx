"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

// Subcomponente que contém toda a lógica e o uso de "useSearchParams"
function CallbackPageInner() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
	const [message, setMessage] = useState<string>("");
	const [isMainAccount, setIsMainAccount] = useState<boolean>(false);
	const [username, setUsername] = useState<string>("");

	useEffect(() => {
		if (!searchParams) return;

		const code = searchParams.get("code");
		const error = searchParams.get("error");
		const errorReason = searchParams.get("error_reason");
		const errorDescription = searchParams.get("error_description");
		const accountAlreadyConnected = searchParams.get("error") === "account_already_connected";

		if (error || accountAlreadyConnected) {
			setStatus("error");
			if (accountAlreadyConnected) {
				setMessage("Esta conta do Instagram já está conectada a outro usuário.");
			} else {
				setMessage(errorDescription || errorReason || "Ocorreu um erro durante a autorização. Tente novamente.");
			}
			return;
		}

		if (!code) {
			setStatus("error");
			setMessage("Código de autorização não encontrado. Por favor, tente novamente.");
			return;
		}

		// Enviar o código para a API
		const connectAccount = async () => {
			try {
				console.log("Enviando código para API de conexão:", code);
				const response = await fetch("/api/auth/instagram/connect", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ code }),
				});

				const data = await response.json();
				console.log("Resposta da API de conexão:", data);

				if (response.ok && data.success) {
					setStatus("success");
					setMessage("Conta do Instagram conectada com sucesso!");
					if (data.username) {
						setUsername(data.username);
					}

					// Verificar se é a conta principal
					setIsMainAccount(data.isMain || false);

					// Redirecionar para o dashboard após 2 segundos
					setTimeout(() => {
						router.push(`/${data.providerAccountId}/dashboard`);
					}, 2000);
				} else {
					setStatus("error");
					setMessage(data.error || "Ocorreu um erro ao conectar a conta. Por favor, tente novamente.");
				}
			} catch (error) {
				console.error("Erro ao conectar conta:", error);
				setStatus("error");
				setMessage("Ocorreu um erro ao processar a solicitação. Por favor, tente novamente.");
			}
		};

		connectAccount();
	}, [searchParams, router]);

	return (
		<div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
			{status === "loading" && (
				<div className="text-center">
					<Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
					<h2 className="text-2xl font-bold mb-2">Conectando sua conta...</h2>
					<p className="text-muted-foreground">Estamos processando sua autorização. Por favor, aguarde um momento.</p>
				</div>
			)}

			{status === "success" && (
				<Alert className="max-w-md bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800">
					<div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center mb-4 mx-auto">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							className="h-6 w-6 text-green-600 dark:text-green-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
						</svg>
					</div>
					<AlertTitle className="text-center text-xl font-bold text-green-800 dark:text-green-300">
						Conexão bem-sucedida!
					</AlertTitle>
					<AlertDescription className="text-center text-green-700 dark:text-green-400">
						{message}
						{username && <p className="mt-1 font-medium">@{username}</p>}
						{isMainAccount && (
							<div className="flex justify-center mt-1">
								<Badge
									variant="outline"
									className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300 border-green-300 dark:border-green-700"
								>
									Conta Principal
								</Badge>
							</div>
						)}
						<p className="mt-2">Você será redirecionado para o dashboard em alguns segundos...</p>
					</AlertDescription>
				</Alert>
			)}

			{status === "error" && (
				<Alert className="max-w-md bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800">
					<div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center mb-4 mx-auto">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							className="h-6 w-6 text-red-600 dark:text-red-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
						</svg>
					</div>
					<AlertTitle className="text-center text-xl font-bold text-red-800 dark:text-red-300">
						Erro de conexão
					</AlertTitle>
					<AlertDescription className="text-center text-red-700 dark:text-red-400">
						{message}
						<div className="mt-4 flex justify-center">
							<button
								onClick={() => router.push("/registro/redesocial")}
								className="px-4 py-2 bg-red-100 hover:bg-red-200 dark:bg-red-900/50 dark:hover:bg-red-800/50 text-red-700 dark:text-red-300 rounded-md transition-colors"
							>
								Tentar novamente
							</button>
						</div>
					</AlertDescription>
				</Alert>
			)}
		</div>
	);
}

// Componente principal que envolve tudo em <Suspense>
export default function CallbackPage() {
	return (
		<Suspense fallback={<div>Carregando página de callback...</div>}>
			<CallbackPageInner />
		</Suspense>
	);
}
