"use client";

import { useSession } from "next-auth/react";
import { useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar";
import {
	ChevronDown,
	LayoutDashboard,
	Shield,
	Users,
	Bell,
	Activity,
	Settings,
	User2,
	Zap,
	FlaskConical,
	Flag,
	Play,
	HelpCircle,
	Atom,
	Calendar,
	Brain,
	ArrowLeft,
	Megaphone,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import LoginBadge from "@/components/auth/login-badge";

export function AdminSidebar() {
	const { data: session } = useSession();
	const { state } = useSidebar();
	const pathname = usePathname();
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	const navItems = [
		{ href: "/admin", label: "Dashboard Admin", icon: LayoutDashboard },
		{ href: "/admin/monitoring", label: "Monitoramento", icon: Shield },
		{ href: "/admin/users", label: "Usuários", icon: Users },
		{ href: "/admin/features", label: "Features", icon: Flag },
		{ href: "/admin/notifications", label: "Notificações", icon: Bell },
		{ href: "/admin/monitoring/queue-management", label: "Gerenciar Filas", icon: Activity },
		{ href: "/admin/webhook-test", label: "Teste de Webhook", icon: FlaskConical },
		{ href: "/admin/flow-playground", label: "Flow Playground", icon: Play },
		{ href: "/admin/disparo-oab", label: "Disparo OAB", icon: Users },
		{ href: "/admin/disparo-em-massa", label: "Disparo em Massa", icon: Zap },
		{ href: "/admin/templates", label: "Templates WhatsApp", icon: HelpCircle },
		{ href: "/admin/hooklist", label: "Hooks Chatwit", icon: Zap },
		{ href: "/admin/openai-source-test-biblia", label: "Teste OpenAI", icon: Atom },
		{ href: "/admin/queue", label: "Fila de Processamento", icon: Calendar },
		{ href: "/admin/ai-integration", label: "IA Integration", icon: Brain },
		{ href: "/admin/ai-integration/intents", label: "Gerenciar Intents", icon: Settings },
		{ href: "/admin/iframe-config", label: "Config Iframe", icon: Settings },
		{ href: "/admin/resposta-rapida", label: "Resposta Rápida", icon: Megaphone },
	];

	return (
		<Sidebar collapsible="icon" side="left" variant="sidebar" className="bg-background z-50 border-r">
			<SidebarHeader>
				<div className="px-3 py-2">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							{session?.user?.image ? (
								<Avatar className="h-8 w-8">
									<AvatarImage src={session.user.image} />
									<AvatarFallback><User2 className="h-4 w-4" /></AvatarFallback>
								</Avatar>
							) : (
								<Avatar className="h-8 w-8">
									<AvatarFallback><User2 className="h-4 w-4" /></AvatarFallback>
								</Avatar>
							)}
							{state !== "collapsed" && (
								<div className="flex flex-col">
									<span className="text-sm font-medium">{session?.user?.name ?? "Usuário"}</span>
									<span className="text-xs text-muted-foreground">SUPERADMIN</span>
								</div>
							)}
						</div>
						{state !== "collapsed" && (
							<DropdownMenu>
								<DropdownMenuTrigger className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-accent">
									<ChevronDown className="h-4 w-4" />
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="w-60 p-0">
									<LoginBadge user={session?.user} />
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</div>
				</div>
			</SidebarHeader>

			<SidebarContent className="bg-background">
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							{/* Voltar ao Hub */}
							<SidebarMenuItem>
								<SidebarMenuButton asChild>
									<Link href="/hub" className="flex items-center">
										<ArrowLeft className="mr-2" />
										{state !== "collapsed" && <span>Voltar ao Hub</span>}
									</Link>
								</SidebarMenuButton>
							</SidebarMenuItem>

							{navItems.map((item) => {
								const isActive = pathname === item.href || (item.href !== "/admin" && pathname?.startsWith(item.href));
								return (
									<SidebarMenuItem key={item.href}>
										<SidebarMenuButton
											onClick={(e) => {
												e.preventDefault();
												startTransition(() => { router.push(item.href); });
											}}
											onMouseEnter={() => {
												try { router.prefetch(item.href); } catch {}
											}}
											className={`flex items-center transition-colors ${isActive ? "bg-accent" : "hover:bg-accent"} ${isPending ? "opacity-75" : ""}`}
										>
											<item.icon className="mr-2" />
											{state !== "collapsed" && <span>{item.label}</span>}
										</SidebarMenuButton>
									</SidebarMenuItem>
								);
							})}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>

			<SidebarFooter>
				<div className="p-4">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								className={`flex items-center w-full px-2 py-1 hover:bg-accent rounded ${session?.user && state === "collapsed" ? "justify-center" : "justify-start pl-2"}`}
							>
								{session?.user?.image ? (
									<Avatar className="h-6 w-6">
										<AvatarImage src={session.user.image} />
										<AvatarFallback><User2 className="h-4 w-4" /></AvatarFallback>
									</Avatar>
								) : (
									<User2 className="h-6 w-6" />
								)}
								{state !== "collapsed" && <span className="ml-2">{session?.user?.name ?? "Minha Conta"}</span>}
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent side="top" className="w-[--radix-popper-anchor-width]">
							<LoginBadge user={session?.user} />
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</SidebarFooter>
		</Sidebar>
	);
}

export default AdminSidebar;
