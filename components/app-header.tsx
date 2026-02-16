//app-header

"use client";

import { useSession, signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CircleUser, Bell, HelpCircle, ArrowLeft, Menu } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import LoginBadge from "@/components/auth/login-badge";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { LeadsWaitingIndicator } from "@/app/admin/leads-chatwit/components/leads-waiting-indicator";

// Componente wrapper para o SidebarTrigger que verifica se está dentro de um SidebarProvider
const SafeSidebarTrigger = () => {
	try {
		// Tenta usar o hook useSidebar para verificar se estamos dentro do contexto
		useSidebar();
		// Se não lançar erro, renderiza o SidebarTrigger
		return <SidebarTrigger />;
	} catch (error) {
		// Se ocorrer um erro (fora do SidebarProvider), renderiza um botão simples
		return (
			<Button variant="ghost" size="icon">
				<Menu className="h-5 w-5" />
			</Button>
		);
	}
};

export function AppHeader() {
	const { data: session, status } = useSession();
	const pathname = usePathname() ?? "";
	const [isMounted, setIsMounted] = useState(false);

	// Verificar se estamos em uma rota específica
	const isContasRoute = pathname === "/contas" || pathname.startsWith("/contas/");
	const isDashboardRoute = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
	const isAuthRoute = pathname === "/auth/login" || pathname.startsWith("/auth/");

	// Verificar se estamos em uma rota de dashboard de conta
	const isAccountDashboardRoute = pathname.match(/^\/[^\/]+\/dashboard/) !== null;

	// Evitar erro de hidratação
	useEffect(() => {
		setIsMounted(true);
	}, []);

	if (!isMounted) {
		return null;
	}

	// Se estamos na rota de dashboard, não renderizar o header padrão
	if (isDashboardRoute) {
		return (
			<div className="fixed top-4 right-4 z-50 flex items-center space-x-4">
				<ThemeToggle />
			</div>
		);
	}

	// Se estamos na rota de dashboard de conta, renderizar apenas o SidebarTrigger e ThemeToggle
	if (isAccountDashboardRoute) {
		return (
			<header className="border-b border-border h-14 px-4 flex items-center justify-between bg-background">
				<div className="flex items-center gap-2">
					<SafeSidebarTrigger />
				</div>
				<div className="flex items-center gap-2">
					<LeadsWaitingIndicator />
					<ThemeToggle />
					<Button variant="ghost" size="icon" className="relative">
						<Bell className="h-5 w-5" />
						<span className="sr-only">Notificações</span>
						<span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary"></span>
					</Button>
					<Button variant="ghost" size="icon">
						<HelpCircle className="h-5 w-5" />
						<span className="sr-only">Ajuda</span>
					</Button>
				</div>
			</header>
		);
	}

	// Se estamos na rota de contas, renderizar o header específico
	if (isContasRoute) {
		return (
			<header className="border-b border-border h-14 px-4 flex items-center justify-between bg-background">
				<div className="flex items-center gap-2">
					<Link href="/dashboard">
						<Button variant="ghost" size="icon">
							<ArrowLeft className="h-5 w-5" />
							<span className="sr-only">Voltar para o Dashboard</span>
						</Button>
					</Link>
					<h1 className="text-lg font-medium hidden md:block">Gerenciamento de Contas</h1>
				</div>

				<div className="flex items-center gap-2">
					<LeadsWaitingIndicator />
					<ThemeToggle />

					<Button variant="ghost" size="icon" className="relative">
						<Bell className="h-5 w-5" />
						<span className="sr-only">Notificações</span>
						<span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary"></span>
					</Button>

					<Button variant="ghost" size="icon">
						<HelpCircle className="h-5 w-5" />
						<span className="sr-only">Ajuda</span>
					</Button>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" className="rounded-full">
								<Avatar className="h-8 w-8">
									<AvatarImage src={session?.user?.image || ""} />
									<AvatarFallback className="bg-primary/10">
										<CircleUser className="h-4 w-4 text-primary" />
									</AvatarFallback>
								</Avatar>
								<span className="sr-only">Perfil</span>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-60 p-0">
							<LoginBadge user={session?.user} />
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</header>
		);
	}

	// Para todas as outras rotas, renderizar o header geral (substituindo o NavbarGeral)
	return (
		<nav className="navbar bg-background border-b z-10 fixed top-0 left-0 right-0 h-16">
			<div className="container mx-auto px-4 py-2 flex items-center justify-between h-full">
				{/* Link para a página inicial envolvendo a logo */}
				<Link href="/" className="relative h-12 w-36 sm:h-16 sm:w-48 md:h-16 md:w-48 cursor-pointer">
					<Image src="/ChatWit.svg" alt="ChatWit Logo" fill className="object-contain" />
				</Link>
				<div className="flex items-center space-x-4">
					{!session?.user && !isAuthRoute && (
						<button
							onClick={() => signIn()}
							className="bg-primary text-white px-4 py-2 rounded hover:bg-primary/80 transition-all"
						>
							Inscrever-se
						</button>
					)}

					{session?.user && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" size="icon" className="rounded-full">
									<Avatar className="h-8 w-8">
										<AvatarImage src={session?.user?.image || ""} />
										<AvatarFallback className="bg-primary/10">
											<CircleUser className="h-4 w-4 text-primary" />
										</AvatarFallback>
									</Avatar>
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-60 p-0">
								<LoginBadge user={session?.user} />
							</DropdownMenuContent>
						</DropdownMenu>
					)}

					<ThemeToggle />
				</div>
			</div>
		</nav>
	);
}
