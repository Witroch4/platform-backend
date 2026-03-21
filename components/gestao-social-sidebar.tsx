"use client";

import { useSession } from "next-auth/react";
import { useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useParams } from "next/navigation";
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
	LayoutDashboard,
	Calendar,
	CalendarDays,
	Zap,
	ArrowLeft,
	User2,
	ChevronDown,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import LoginBadge from "@/components/auth/login-badge";

export function GestaoSocialSidebar() {
	const { data: session } = useSession();
	const { state } = useSidebar();
	const pathname = usePathname();
	const router = useRouter();
	const params = useParams();
	const [isPending, startTransition] = useTransition();

	const accountId = params?.accountid as string;
	const basePath = `/gestao-social/${accountId}/dashboard`;

	const navItems = [
		{ href: basePath, label: "Dashboard", icon: LayoutDashboard },
		{ href: `${basePath}/agendamento`, label: "Agendamento", icon: Calendar },
		{ href: `${basePath}/calendario`, label: "Calendário", icon: CalendarDays },
		{ href: `${basePath}/automacao`, label: "Automação", icon: Zap },
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
									<span className="text-xs text-muted-foreground">Gestão Social</span>
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
								const isActive = pathname === item.href || (item.href !== basePath && pathname?.startsWith(item.href));
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

export default GestaoSocialSidebar;
