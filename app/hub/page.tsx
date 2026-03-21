"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2, Headphones, Instagram, Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User2, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export default function HubPage() {
	const { data: session, status } = useSession();
	const router = useRouter();

	useEffect(() => {
		if (status === "unauthenticated") {
			router.push("/auth/login");
		}
	}, [status, router]);

	if (status === "loading" || !session?.user) {
		return (
			<div className="flex items-center justify-center min-h-screen bg-background">
				<Loader2 className="h-8 w-8 animate-spin text-primary" />
			</div>
		);
	}

	const user = session.user;
	const isAdmin = user.role === "ADMIN" || user.role === "SUPERADMIN";
	const isSuperAdmin = user.role === "SUPERADMIN";
	const hasInstagram = !!user.providerAccountId;

	return (
		<div className="min-h-screen bg-background">
			{/* Navbar mínima */}
			<header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
				<div className="container flex h-14 items-center justify-between px-4 mx-auto max-w-5xl">
					<span className="text-lg font-semibold">Socialwise</span>
					<div className="flex items-center gap-3">
						<ThemeToggle />
						<div className="flex items-center gap-2">
							{user.image ? (
								<Avatar className="h-8 w-8">
									<AvatarImage src={user.image} />
									<AvatarFallback><User2 className="h-4 w-4" /></AvatarFallback>
								</Avatar>
							) : (
								<Avatar className="h-8 w-8">
									<AvatarFallback><User2 className="h-4 w-4" /></AvatarFallback>
								</Avatar>
							)}
							<span className="text-sm font-medium hidden sm:inline">{user.name}</span>
						</div>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => signOut({ callbackUrl: "/auth/login" })}
							title="Sair"
						>
							<LogOut className="h-4 w-4" />
						</Button>
					</div>
				</div>
			</header>

			{/* Cards de navegação */}
			<main className="container mx-auto max-w-5xl px-4 py-12">
				<div className="mb-8 text-center">
					<h1 className="text-3xl font-bold tracking-tight">
						Bem-vindo, {user.name?.split(" ")[0] ?? ""}
					</h1>
					<p className="mt-2 text-muted-foreground">
						Escolha sua área de trabalho
					</p>
				</div>

				<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto">
					{/* MTF Diamante — visível para ADMIN/SUPERADMIN */}
					{isAdmin && (
						<Card
							className="cursor-pointer transition-all hover:shadow-lg hover:border-primary/50 hover:-translate-y-1"
							onClick={() => router.push("/mtf-diamante")}
						>
							<CardHeader className="text-center pb-2">
								<div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
									<Headphones className="h-7 w-7 text-primary" />
								</div>
								<CardTitle>MTF Diamante</CardTitle>
								<CardDescription>
									Automação WhatsApp & IA
								</CardDescription>
							</CardHeader>
							<CardContent className="text-center text-sm text-muted-foreground">
								Caixas de entrada, campanhas, assistentes IA, leads e fluxos
							</CardContent>
						</Card>
					)}

					{/* Gestão Social — visível para todos com Instagram */}
					<Card
						className={`transition-all ${
							hasInstagram
								? "cursor-pointer hover:shadow-lg hover:border-primary/50 hover:-translate-y-1"
								: "opacity-60 cursor-not-allowed"
						}`}
						onClick={() => {
							if (hasInstagram) {
								router.push(`/gestao-social/${user.providerAccountId}/dashboard`);
							}
						}}
					>
						<CardHeader className="text-center pb-2">
							<div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-pink-500/10">
								<Instagram className="h-7 w-7 text-pink-500" />
							</div>
							<CardTitle>Gestão Social</CardTitle>
							<CardDescription>
								{hasInstagram
									? "Gestão de Redes Sociais"
									: "Conecte seu Instagram primeiro"}
							</CardDescription>
						</CardHeader>
						<CardContent className="text-center text-sm text-muted-foreground">
							{hasInstagram
								? "Agendamento, calendário e automações de conteúdo"
								: "Acesse /registro/redesocial para conectar"}
						</CardContent>
					</Card>

					{/* Painel Admin — visível só para SUPERADMIN */}
					{isSuperAdmin && (
						<Card
							className="cursor-pointer transition-all hover:shadow-lg hover:border-orange-500/50 hover:-translate-y-1"
							onClick={() => router.push("/admin")}
						>
							<CardHeader className="text-center pb-2">
								<div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-orange-500/10">
									<Shield className="h-7 w-7 text-orange-500" />
								</div>
								<CardTitle>Painel Admin</CardTitle>
								<CardDescription>
									Administração do Sistema
								</CardDescription>
							</CardHeader>
							<CardContent className="text-center text-sm text-muted-foreground">
								Monitoramento, usuários, features, filas e configurações
							</CardContent>
						</Card>
					)}
				</div>
			</main>
		</div>
	);
}
