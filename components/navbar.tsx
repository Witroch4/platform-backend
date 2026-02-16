"use client";
// components/navbar.tsx
import { ThemeToggle } from "./theme-toggle";
import { SidebarTrigger, useSidebar } from "./ui/sidebar";
import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { User, LogOut, Settings, HelpCircle, PanelLeft, PanelRightClose } from "lucide-react";
import Link from "next/link";
import { Button } from "./ui/button";
import { useEffect, useState } from "react";
import { NotificationDropdown } from "./notifications/notification-dropdown";

const Navbar = () => {
	const { data: session } = useSession();
	const pathname = usePathname();
	const router = useRouter();
	const [isMounted, setIsMounted] = useState(false);
	const { toggleSidebar, state } = useSidebar();

	// Evitar erro de hidratação
	useEffect(() => {
		setIsMounted(true);
	}, []);

	if (!isMounted) {
		return null;
	}

	// Extrair o accountId da URL
	const accountId = pathname?.split("/")[1];

	return (
		<header className="sticky top-0 left-0 right-0 h-16 border-b border-border bg-background z-40 w-full">
			<div className="flex items-center justify-between h-full px-4 w-full bg-background">
				<div className="flex items-center">
					<Button variant="ghost" size="icon" className="h-8 w-8 mr-2 hover:bg-accent" onClick={toggleSidebar}>
						{state === "expanded" ? <PanelRightClose className="h-5 w-5" /> : <PanelLeft className="h-5 w-5" />}
						<span className="sr-only">Toggle Sidebar</span>
					</Button>
					<h1 className="text-xl font-semibold hidden md:block text-foreground">Dashboard</h1>
				</div>

				<div className="flex items-center space-x-4">
					<NotificationDropdown />

					<Button variant="ghost" size="icon" className="hover:bg-accent">
						<HelpCircle className="h-5 w-5" />
						<span className="sr-only">Ajuda</span>
					</Button>

					<ThemeToggle />

					{session?.user && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Avatar className="h-8 w-8 cursor-pointer hover:ring-2 hover:ring-ring transition-all">
									<AvatarImage src={session.user.image || ""} alt={session.user.name || "Usuário"} />
									<AvatarFallback className="bg-primary text-primary-foreground">
										{session.user.name?.charAt(0) || "U"}
									</AvatarFallback>
								</Avatar>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="bg-popover border-border">
								<div className="flex items-center justify-start gap-2 p-2">
									<div className="flex flex-col space-y-1 leading-none">
										{session.user.name && <p className="font-medium text-popover-foreground">{session.user.name}</p>}
										{session.user.email && (
											<p className="w-[200px] truncate text-sm text-muted-foreground">{session.user.email}</p>
										)}
									</div>
								</div>
								<DropdownMenuSeparator className="bg-border" />
								<DropdownMenuItem asChild className="hover:bg-accent text-popover-foreground">
									<Link href="/perfil">
										<User className="mr-2 h-4 w-4" />
										<span>Perfil</span>
									</Link>
								</DropdownMenuItem>
								<DropdownMenuItem asChild className="hover:bg-accent text-popover-foreground">
									<Link href="/configuracoes">
										<Settings className="mr-2 h-4 w-4" />
										<span>Configurações</span>
									</Link>
								</DropdownMenuItem>
								<DropdownMenuSeparator className="bg-border" />
								<DropdownMenuItem
									onClick={() => signOut({ callbackUrl: "/" })}
									className="hover:bg-accent text-popover-foreground"
								>
									<LogOut className="mr-2 h-4 w-4" />
									<span>Sair</span>
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>
			</div>
		</header>
	);
};

export default Navbar;
