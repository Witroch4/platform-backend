"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Instagram, Trash2, Plus, RefreshCw, AlertCircle, ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface InstagramAccount {
	id: string;
	providerAccountId: string;
	igUsername?: string;
	igUserId?: string;
	isMain?: boolean;
}

export default function ContasPage() {
	const { data: session, status } = useSession();
	const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);

	const fetchAccounts = async () => {
		try {
			setIsLoading(true);
			const response = await fetch("/api/auth/instagram/accounts");
			if (!response.ok) {
				throw new Error("Falha ao buscar contas");
			}
			const data = await response.json();
			setAccounts(data.accounts || []);
		} catch (error) {
			console.error("Erro ao buscar contas:", error);
			toast.error("Não foi possível carregar suas contas do Instagram");
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		if (status === "authenticated") {
			fetchAccounts();
		}
	}, [status]);

	const handleRefresh = async () => {
		setIsRefreshing(true);
		await fetchAccounts();
		setIsRefreshing(false);
	};

	const handleDisconnect = async (accountId: string) => {
		try {
			const response = await fetch("/api/auth/instagram/disconnect", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ accountId }),
			});

			if (!response.ok) {
				throw new Error("Falha ao desconectar conta");
			}

			toast.success("Conta desconectada com sucesso");
			fetchAccounts();
		} catch (error) {
			console.error("Erro ao desconectar conta:", error);
			toast.error("Não foi possível desconectar a conta");
		}
	};

	if (status === "loading" || !session) {
		return (
			<div className="max-w-6xl mx-auto py-8 px-4">
				<div className="flex items-center justify-between mb-8">
					<h1 className="text-3xl font-bold">Carregando...</h1>
				</div>
			</div>
		);
	}

	return (
		<div className="max-w-6xl mx-auto py-8 px-4">
			<div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
				<div className="flex items-center gap-4">
					<div className="relative h-16 w-16">
						<Image src="/ChatWit.svg" alt="WitDev Logo" fill className="object-contain" />
					</div>
					<div>
						<h1 className="text-3xl font-bold">Minhas Contas</h1>
						<p className="text-muted-foreground">Gerencie suas contas conectadas do Instagram</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
						<RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
						Atualizar
					</Button>
					<Link href="/registro/redesocial">
						<Button variant="default">
							<Plus className="h-4 w-4 mr-2" />
							Adicionar Conta
						</Button>
					</Link>
				</div>
			</div>

			<Separator className="mb-8" />

			{isLoading ? (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{[1, 2, 3].map((i) => (
						<Card key={i} className="overflow-hidden">
							<CardHeader className="pb-2">
								<Skeleton className="h-6 w-32" />
								<Skeleton className="h-4 w-24" />
							</CardHeader>
							<CardContent>
								<div className="flex items-center gap-4 mb-4">
									<Skeleton className="h-12 w-12 rounded-full" />
									<div className="space-y-2">
										<Skeleton className="h-4 w-24" />
										<Skeleton className="h-4 w-32" />
									</div>
								</div>
							</CardContent>
							<CardFooter>
								<Skeleton className="h-9 w-full" />
							</CardFooter>
						</Card>
					))}
				</div>
			) : accounts.length === 0 ? (
				<Card className="border-dashed border-2 p-8">
					<div className="flex flex-col items-center justify-center text-center gap-4">
						<AlertCircle className="h-12 w-12 text-muted-foreground" />
						<div>
							<h3 className="text-xl font-semibold">Nenhuma conta conectada</h3>
							<p className="text-muted-foreground mt-1">Você ainda não conectou nenhuma conta do Instagram.</p>
						</div>
						<Link href="/registro/redesocial">
							<Button variant="default" className="mt-2">
								<Instagram className="h-4 w-4 mr-2" />
								Conectar Instagram
							</Button>
						</Link>
					</div>
				</Card>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{accounts.map((account) => (
						<Card key={account.id} className="overflow-hidden">
							<CardHeader className="pb-2">
								<div className="flex items-center justify-between">
									<CardTitle className="text-lg flex items-center gap-2">
										<Instagram className="h-5 w-5 text-pink-500" />
										Instagram
										{account.isMain && (
											<span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full">Principal</span>
										)}
									</CardTitle>
								</div>
								<CardDescription>Conta conectada</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="flex items-center gap-4 mb-4">
									<div className="h-12 w-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
										{account.igUsername ? account.igUsername.charAt(0).toUpperCase() : "?"}
									</div>
									<div>
										<h3 className="font-medium">{account.igUsername || "Usuário Instagram"}</h3>
										<p className="text-xs text-muted-foreground">ID: {account.providerAccountId.substring(0, 8)}...</p>
									</div>
								</div>
							</CardContent>
							<CardFooter>
								<Button variant="destructive" className="w-full" onClick={() => handleDisconnect(account.id)}>
									<Trash2 className="h-4 w-4 mr-2" />
									Desconectar
								</Button>
							</CardFooter>
						</Card>
					))}

					<Link href="/registro/redesocial">
						<Card className="border-dashed border-2 h-full flex flex-col items-center justify-center p-6 hover:border-primary/50 transition-colors cursor-pointer">
							<div className="rounded-full bg-primary/10 p-4 mb-4">
								<Plus className="h-8 w-8 text-primary" />
							</div>
							<h3 className="font-medium text-center">Adicionar Nova Conta</h3>
							<p className="text-sm text-muted-foreground text-center mt-1">Conecte outra conta do Instagram</p>
						</Card>
					</Link>
				</div>
			)}

			<div className="mt-12 bg-muted p-6 rounded-lg">
				<div className="flex items-center gap-4 mb-4">
					<div className="relative h-12 w-12 flex-shrink-0">
						<Image src="/01%20WitdeT.png" alt="WitDev Logo" fill className="object-contain" />
					</div>
					<div>
						<h2 className="text-xl font-bold">WitDev</h2>
						<p className="text-sm text-muted-foreground">Soluções inteligentes para automação de redes sociais</p>
					</div>
				</div>
				<Separator className="my-4" />
				<div className="text-sm text-muted-foreground">
					<p>
						Conecte múltiplas contas do Instagram para gerenciar diferentes perfis e marcas em um único lugar. Cada
						conta conectada pode ter suas próprias automações, fluxos de mensagens e configurações.
					</p>
					<p className="mt-2">
						Precisa de ajuda? Entre em contato com nosso suporte através do e-mail{" "}
						<a href="mailto:suporte@witdev.com.br" className="text-primary hover:underline">
							suporte@witdev.com.br
						</a>
					</p>
				</div>
			</div>
		</div>
	);
}
