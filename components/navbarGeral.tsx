// components/navbarGeral.tsx
"use client";

import React from "react";
import Image from "next/image";
import { ThemeToggle } from "./theme-toggle";
import { useSession, signIn } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { NotificationDropdown } from "./notifications/notification-dropdown";

const NavbarGeral = () => {
	const { data: session } = useSession();
	const pathname = usePathname();

	// Verifica se a rota atual é do dashboard (contém [accountid]/dashboard)
	const isDashboardRoute = pathname ? pathname.includes("/dashboard") || pathname.match(/\/[^\/]+\/dashboard/) : false;

	// Não renderiza o NavbarGeral nas rotas do dashboard
	if (isDashboardRoute) {
		return null;
	}

	return (
		<nav className="navbar bg-background border-b z-10 fixed top-0 left-0 right-0 h-16">
			<div className="container mx-auto px-4 py-2 flex items-center justify-between h-full">
				{/* Link para a página inicial envolvendo a logo */}
				<Link href="/" className="relative h-12 w-36 sm:h-16 sm:w-48 md:h-60 md:w-60 cursor-pointer">
					<Image src="/ChatWit.svg" alt="ChatWit Logo" fill className="object-contain" />
				</Link>
				<div className="flex items-center space-x-4">
					{session?.user && <NotificationDropdown />}
					{!session?.user && pathname !== "/auth/login" && (
						<button
							onClick={() => signIn()}
							className="bg-primary text-white px-4 py-2 rounded hover:bg-primary-foreground transition-all"
						>
							Inscrever-se
						</button>
					)}
					<ThemeToggle />
				</div>
			</div>
		</nav>
	);
};

export default NavbarGeral;
