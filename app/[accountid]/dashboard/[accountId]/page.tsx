"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Instagram } from "lucide-react";
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

export default function AccountDashboardPage() {
	const params = useParams() as DashboardParams;
	const accountId = params.accountId as string;
	const [account, setAccount] = useState<InstagramAccount | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const fetchAccountDetails = async () => {
			try {
				setIsLoading(true);
				const response = await fetch(`/api/auth/instagram/account/${accountId}`);

				if (response.ok) {
					const data = await response.json();
					setAccount(data.account);
				}
			} catch (error) {
				console.error("Erro ao buscar detalhes da conta:", error);
			} finally {
				setIsLoading(false);
			}
		};

		if (accountId) {
			fetchAccountDetails();
		}
	}, [accountId]);

	if (isLoading) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-8 w-1/3" />
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					<Skeleton className="h-32" />
					<Skeleton className="h-32" />
					<Skeleton className="h-32" />
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<h1 className="text-2xl font-bold">Dashboard {account?.igUsername ? `- @${account.igUsername}` : ""}</h1>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-lg flex items-center gap-2">
							<Instagram className="h-5 w-5 text-pink-500" />
							Conta do Instagram
						</CardTitle>
						<CardDescription>Detalhes da conta conectada</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							<div className="flex justify-between">
								<span className="text-sm text-muted-foreground">Usuário:</span>
								<span className="font-medium">{account?.igUsername || "N/A"}</span>
							</div>
							<div className="flex justify-between">
								<span className="text-sm text-muted-foreground">ID da Conta:</span>
								<span className="font-medium">{account?.id.substring(0, 8)}...</span>
							</div>
							<div className="flex justify-between">
								<span className="text-sm text-muted-foreground">ID do Instagram:</span>
								<span className="font-medium">{account?.igUserId || "N/A"}</span>
							</div>
							<div className="flex justify-between">
								<span className="text-sm text-muted-foreground">Conta Principal:</span>
								<span className="font-medium">{account?.isMain ? "Sim" : "Não"}</span>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Adicione mais cards com estatísticas e informações relevantes */}
			</div>
		</div>
	);
}
