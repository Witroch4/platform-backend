"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { SidebarProvider } from "@/components/ui/sidebar";
import ConditionalSidebar from "@/components/conditional-sidebar";
import { AppHeader } from "@/components/app-header";
import { Skeleton } from "@/components/ui/skeleton";

interface InstagramAccount {
	id: string;
	providerAccountId: string;
	igUsername?: string;
	igUserId?: string;
	isMain?: boolean;
}

interface DashboardParams {
	accountId: string;
	[key: string]: string | string[];
}

export default function AccountDashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const params = useParams() as DashboardParams;
	const router = useRouter();
	const { data: session, status } = useSession();
	const [account, setAccount] = useState<InstagramAccount | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const accountId = params.accountId as string;

	useEffect(() => {
		const validateAccount = async () => {
			try {
				setIsLoading(true);
				// Verificar se o accountId é válido e pertence ao usuário
				const response = await fetch(`/api/auth/instagram/account/${accountId}`);

				if (!response.ok) {
					if (response.status === 404) {
						// Conta não encontrada, redirecionar para a página de registro de rede social
						router.push("/registro/redesocial");
						return;
					}
					throw new Error("Falha ao validar conta");
				}

				const data = await response.json();
				setAccount(data.account);
			} catch (error) {
				console.error("Erro ao validar conta:", error);
				setError("Não foi possível validar a conta. Redirecionando...");
				// Redirecionar após um breve atraso
				setTimeout(() => {
					router.push("/registro/redesocial");
				}, 2000);
			} finally {
				setIsLoading(false);
			}
		};

		if (status === "authenticated" && accountId) {
			validateAccount();
		}
	}, [accountId, router, status]);

	if (status === "loading" || isLoading) {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="w-full max-w-md space-y-4 p-4">
					<Skeleton className="h-8 w-3/4" />
					<Skeleton className="h-32 w-full" />
					<Skeleton className="h-8 w-1/2" />
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="w-full max-w-md p-4 text-center">
					<p className="text-red-500">{error}</p>
				</div>
			</div>
		);
	}

	return (
		<SidebarProvider>
			<div className="flex h-full min-h-screen">
				<ConditionalSidebar />
				<AppHeader />
				<main className="flex-1 p-4 md:p-8">{children}</main>
			</div>
		</SidebarProvider>
	);
}
