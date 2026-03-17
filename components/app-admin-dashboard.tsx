"use client";

import { useSession } from "next-auth/react";
import React, { useState, useTransition } from "react";
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
	SidebarMenuSub,
	SidebarMenuSubItem,
	SidebarMenuSubButton,
	useSidebar,
} from "@/components/ui/sidebar";
import {
	ChevronDown,
	LayoutDashboard,
	Shield,
	Users,
	Bell,
	MessageCircle,
	Instagram,
	Headphones,
	HelpCircle,
	Zap,
	Calendar,
	Activity,
	Brain,
	Bot,
	FileText,
	Settings,
	User2,
	Plus,
	Atom,
	Copy,
	FlaskConical,
	Flag,
	AlertCircle,
	Megaphone,
	Play,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import LoginBadge from "@/components/auth/login-badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AdicionarCaixaDialog } from "@/app/admin/mtf-diamante/components/DialogflowCaixasAgentes";
import { InboxContextMenu } from "./inbox-context-menu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useMtfData } from "@/app/admin/mtf-diamante/context/SwrProvider";
import { WhatsAppAnimatedIcon } from "@/components/whatsapp-animated-icon";
import { InstagramAnimatedIcon } from "@/components/instagram-animated-icon";
import { RobotAnimatedIcon } from "@/components/robot-animated-icon";

export function AppAdminDashboard() {
	const { data: session } = useSession();
	const { state } = useSidebar();
	const pathname = usePathname();
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	// Consome do Provider (BFF + SWR)
	const { caixas: inboxes, apiKeys, refreshCaixas, prefetchInbox } = useMtfData();
	const [creating, setCreating] = useState(false);
	const [newLabel, setNewLabel] = useState("");
	const [newToken, setNewToken] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	// Função para verificar se uma inbox está ativa (suporta subpaths)
	const isInboxActive = (inboxId: string) => {
		return pathname?.startsWith(`/admin/mtf-diamante/inbox/${inboxId}`);
	};

	// Observação: o Provider já carrega inboxes/apiKeys do BFF e mantém cache.
	// Quando precisar atualizar (ex.: criou/removou chave), chame refreshCaixas()
	// que dispara mutate() e recarrega TODO o bundle do BFF.

	const createApiKey = async () => {
		try {
			setCreating(true);
			const r = await fetch("/api/admin/ai-integration/api-keys", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ label: newLabel }),
			});
			if (r.ok) {
				const j = await r.json();
				setNewToken(j?.token || null);
				setNewLabel("");
				await refreshCaixas(); // revalida o BFF (traz apiKeys atualizadas)
			}
		} finally {
			setCreating(false);
		}
	};

	const revokeApiKey = async (id: string) => {
		await fetch(`/api/admin/ai-integration/api-keys?id=${encodeURIComponent(id)}`, { method: "DELETE" });
		await refreshCaixas();
	};

	const copyNewToken = async () => {
		if (!newToken) return;
		try {
			await navigator.clipboard.writeText(newToken);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch { }
	};

	// Sem useEffect: dados já vêm do contexto com fallback + keepPreviousData (sem flicker)

	const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "SUPERADMIN";
	const isSuperAdmin = session?.user?.role === "SUPERADMIN";

	return (
		<Sidebar collapsible="icon" side="left" variant="sidebar" className="bg-background z-50 border-r">
			<SidebarHeader>
				<div className="px-3 py-2">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							{session?.user?.image ? (
								<Avatar className="h-8 w-8">
									<AvatarImage src={session.user.image} />
									<AvatarFallback>
										<User2 className="h-4 w-4" />
									</AvatarFallback>
								</Avatar>
							) : (
								<Avatar className="h-8 w-8">
									<AvatarFallback>
										<User2 className="h-4 w-4" />
									</AvatarFallback>
								</Avatar>
							)}
							{state !== "collapsed" && (
								<div className="flex flex-col">
									<span className="text-sm font-medium">{session?.user?.name ?? "Usuário"}</span>
									<span className="text-xs text-muted-foreground">{session?.user?.role ?? ""}</span>
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
				{isAdmin && (
					<SidebarGroup>
						<SidebarGroupContent>
							<SidebarMenu>
								<SidebarMenuItem>
									<SidebarMenuButton asChild>
										<Link href="/admin" className="flex items-center">
											<LayoutDashboard className="mr-2" />
											{state !== "collapsed" && <span>Dashboard Admin</span>}
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>

								{/* Grupo: Caixas de Entrada (Canais) */}
								<SidebarMenuItem>
									<SidebarMenuButton asChild>
										<Link href="/admin/mtf-diamante" className="flex items-center">
											<Headphones className="mr-2" />
											{state !== "collapsed" && <span>MTF Diamante Global</span>}
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>

								{/* Caixas de Entrada (pai) com lista de caixas dentro e botão de criação) */}
								<Collapsible defaultOpen className="group/collapsible">
									<SidebarMenuItem>
										<CollapsibleTrigger asChild>
											<SidebarMenuButton className="text-base py-3">
												<Users className="mr-3 h-5 w-5" />
												{state !== "collapsed" && <span className="font-semibold">Caixas de Entrada</span>}
											</SidebarMenuButton>
										</CollapsibleTrigger>
										<CollapsibleContent>
											<div className="pl-2 py-1 space-y-1">
												<SidebarMenuSub>
													{!inboxes ? (
														// Skeleton para evitar "sumir e reaparecer"
														<div className="space-y-2 px-3 py-2">
															<div className="h-6 rounded bg-muted animate-pulse" />
															<div className="h-6 rounded bg-muted animate-pulse" />
															<div className="h-6 rounded bg-muted animate-pulse" />
														</div>
													) : (
														// Deduplicate inboxes by id to prevent React key errors
														React.useMemo(
															() => Array.from(new Map(inboxes.map((cx: any) => [cx.id, cx])).values()),
															[inboxes],
														).map((cx: any) => {
															const channel = (cx.channelType || "").toLowerCase();
															const isInstagram = channel.includes("instagram");
															const isWhatsApp = channel.includes("whatsapp") || (cx.nome || cx.inboxName || "").toLowerCase().includes("whatsapp");
															const Icon = isInstagram ? Instagram : MessageCircle; // WhatsApp/Outros
															const isActive = isInboxActive(cx.id);
															const targetHref = `/admin/mtf-diamante/inbox/${cx.id}`;
															const handleClick = (e: React.MouseEvent) => {
																e.preventDefault();
																startTransition(() => {
																	router.push(targetHref);
																});
															};

															const handleMouseEnter = () => {
																prefetchInbox(cx.id).catch(() => { });
																try {
																	router.prefetch(targetHref);
																} catch { }
															};
															return (
																<SidebarMenuSubItem key={cx.id}>
																	<InboxContextMenu
																		inbox={cx}
																		onInboxDeleted={() => {
																			// Refresh a lista de caixas após deletar
																			refreshCaixas();
																		}}
																	>
																		<SidebarMenuSubButton
																			href={targetHref}
																			onClick={handleClick}
																			onMouseEnter={handleMouseEnter}
																			className={`text-[0.95rem] py-2 transition-colors ${isActive ? "bg-accent" : "hover:bg-accent"
																				} ${isPending ? "opacity-75" : ""}`}
																		>
																			{isWhatsApp ? (
																				<div className="w-5 h-5 flex items-center justify-center shrink-0">
																					<WhatsAppAnimatedIcon isActive={isActive ?? false} />
																				</div>
																			) : isInstagram ? (
																				<div className="w-5 h-5 flex items-center justify-center shrink-0">
																					<InstagramAnimatedIcon isActive={isActive ?? false} />
																				</div>
																			) : (
																				<Icon className="text-gray-500" />
																			)}
																			<span className="font-medium ml-2">{cx.nome || cx.inboxName || "Inbox"}</span>
																		</SidebarMenuSubButton>
																	</InboxContextMenu>
																	{/* Sub-link: Campanhas */}
																	{state !== "collapsed" && (
																		<SidebarMenuSubButton
																			href={`/admin/mtf-diamante/inbox/${cx.id}/campanhas`}
																			onClick={(e) => {
																				e.preventDefault();
																				startTransition(() => {
																					router.push(`/admin/mtf-diamante/inbox/${cx.id}/campanhas`);
																				});
																			}}
																			onMouseEnter={() => {
																				try { router.prefetch(`/admin/mtf-diamante/inbox/${cx.id}/campanhas`); } catch {}
																			}}
																			className={`text-[0.85rem] py-1.5 pl-8 transition-colors ${
																				pathname?.includes(`/inbox/${cx.id}/campanhas`) ? "bg-accent" : "hover:bg-accent"
																			} ${isPending ? "opacity-75" : ""}`}
																		>
																			<Megaphone className="h-3.5 w-3.5 text-muted-foreground" />
																			<span className="ml-2 text-muted-foreground">Campanhas</span>
																		</SidebarMenuSubButton>
																	)}
																</SidebarMenuSubItem>
															);
														})
													)}
												</SidebarMenuSub>
												<AdicionarCaixaDialog
													onCaixaAdicionada={refreshCaixas}
													caixasConfiguradas={inboxes}
													trigger={
														<SidebarMenuButton className="mt-2 text-base py-3">
															<Plus className="mr-3" />
															{state !== "collapsed" && <span className="font-medium">Nova Caixa</span>}
														</SidebarMenuButton>
													}
												/>
											</div>
										</CollapsibleContent>
									</SidebarMenuItem>
								</Collapsible>

								{isAdmin && (
									<>
										{/* MTF Dashboard - Ecosystem LangGraph */}
										<Collapsible defaultOpen className="group/collapsible">
											<SidebarMenuItem>
												<CollapsibleTrigger asChild>
													<SidebarMenuButton className="text-base py-3">
														<Brain className="mr-3 h-5 w-5" />
														{state !== "collapsed" && <span className="font-semibold">🚀 MTF Dashboard</span>}
													</SidebarMenuButton>
												</CollapsibleTrigger>
												<CollapsibleContent>
													<div className="pl-2 py-1 space-y-1">
														<SidebarMenuSub>
															<SidebarMenuSubItem>
																<SidebarMenuSubButton
																	href="/admin/MTFdashboard"
																	onClick={(e) => {
																		e.preventDefault();
																		startTransition(() => {
																			router.push("/admin/MTFdashboard");
																		});
																	}}
																	onMouseEnter={() => {
																		try {
																			router.prefetch("/admin/MTFdashboard");
																		} catch { }
																	}}
																	className={`text-[0.95rem] py-2 transition-colors hover:bg-accent ${isPending ? "opacity-75" : ""}`}
																>
																	<Activity className="text-purple-500" />
																	<span className="font-medium">Dashboard</span>
																</SidebarMenuSubButton>
															</SidebarMenuSubItem>
															<SidebarMenuSubItem>
																<SidebarMenuSubButton
																	href="/admin/MTFdashboard/agentes"
																	onClick={(e) => {
																		e.preventDefault();
																		startTransition(() => {
																			router.push("/admin/MTFdashboard/agentes");
																		});
																	}}
																	onMouseEnter={() => {
																		try {
																			router.prefetch("/admin/MTFdashboard/agentes");
																		} catch { }
																	}}
																	className={`text-[0.95rem] py-2 transition-colors hover:bg-accent ${isPending ? "opacity-75" : ""}`}
																>
																	<Bot className="text-blue-500" />
																	<span className="font-medium">Agentes Nativos</span>
																</SidebarMenuSubButton>
															</SidebarMenuSubItem>
															<SidebarMenuSubItem>
																<SidebarMenuSubButton
																	href="/admin/MTFdashboard/mtf-oab"
																	onClick={(e) => {
																		e.preventDefault();
																		startTransition(() => {
																			router.push("/admin/MTFdashboard/mtf-oab");
																		});
																	}}
																	onMouseEnter={() => {
																		try {
																			router.prefetch("/admin/MTFdashboard/mtf-oab");
																		} catch { }
																	}}
																	className={`text-[0.95rem] py-2 transition-colors hover:bg-accent ${isPending ? "opacity-75" : ""}`}
																>
																	<FileText className="text-green-500" />
																	<span className="font-medium">Upload OAB</span>
																</SidebarMenuSubButton>
															</SidebarMenuSubItem>
															<SidebarMenuSubItem>
																<SidebarMenuSubButton
																	href="/admin/MTFdashboard/mtf-oab/oab-eval"
																	onClick={(e) => {
																		e.preventDefault();
																		startTransition(() => {
																			router.push("/admin/MTFdashboard/mtf-oab/oab-eval");
																		});
																	}}
																	onMouseEnter={() => {
																		try {
																			router.prefetch("/admin/MTFdashboard/mtf-oab/oab-eval");
																		} catch { }
																	}}
																	className={`text-[0.95rem] py-2 transition-colors hover:bg-accent ${isPending ? "opacity-75" : ""}`}
																>
																	<AlertCircle className="text-orange-500" />
																	<span className="font-medium">Avaliação OAB</span>
																</SidebarMenuSubButton>
															</SidebarMenuSubItem>
														</SidebarMenuSub>
													</div>
												</CollapsibleContent>
											</SidebarMenuItem>
										</Collapsible>

										{/* Capitão (pai) com lista de sub-itens */}
										<Collapsible defaultOpen className="group/collapsible">
											<SidebarMenuItem>
												<CollapsibleTrigger asChild>
													<SidebarMenuButton className="text-base py-3">
														<div className="mr-3 h-6 w-6">
															<RobotAnimatedIcon />
														</div>
														{state !== "collapsed" && <span className="font-semibold">Capitão</span>}
													</SidebarMenuButton>
												</CollapsibleTrigger>
												<CollapsibleContent>
													<div className="pl-2 py-1 space-y-1">
														<SidebarMenuSub>
															<SidebarMenuSubItem>
																<SidebarMenuSubButton
																	href="/admin/capitao"
																	onClick={(e) => {
																		e.preventDefault();
																		startTransition(() => {
																			router.push("/admin/capitao");
																		});
																	}}
																	onMouseEnter={() => {
																		try {
																			router.prefetch("/admin/capitao");
																		} catch { }
																	}}
																	className={`text-[0.95rem] py-2 transition-colors hover:bg-accent ${isPending ? "opacity-75" : ""}`}
																>
																	<Bot className="text-blue-500" />
																	<span className="font-medium">Assistentes</span>
																</SidebarMenuSubButton>
															</SidebarMenuSubItem>
															<SidebarMenuSubItem>
																<SidebarMenuSubButton
																	href="/admin/capitao/documentos"
																	onClick={(e) => {
																		e.preventDefault();
																		startTransition(() => {
																			router.push("/admin/capitao/documentos");
																		});
																	}}
																	onMouseEnter={() => {
																		try {
																			router.prefetch("/admin/capitao/documentos");
																		} catch { }
																	}}
																	className={`text-[0.95rem] py-2 transition-colors hover:bg-accent ${isPending ? "opacity-75" : ""}`}
																>
																	<FileText className="text-gray-600" />
																	<span className="font-medium">Documentos</span>
																</SidebarMenuSubButton>
															</SidebarMenuSubItem>
															<SidebarMenuSubItem>
																<SidebarMenuSubButton
																	href="/admin/capitao/faqs"
																	onClick={(e) => {
																		e.preventDefault();
																		startTransition(() => {
																			router.push("/admin/capitao/faqs");
																		});
																	}}
																	onMouseEnter={() => {
																		try {
																			router.prefetch("/admin/capitao/faqs");
																		} catch { }
																	}}
																	className={`text-[0.95rem] py-2 transition-colors hover:bg-accent ${isPending ? "opacity-75" : ""}`}
																>
																	<HelpCircle className="text-gray-600" />
																	<span className="font-medium">FAQs</span>
																</SidebarMenuSubButton>
															</SidebarMenuSubItem>
															<SidebarMenuSubItem>
																<SidebarMenuSubButton
																	href="/admin/capitao/intents"
																	onClick={(e) => {
																		e.preventDefault();
																		startTransition(() => {
																			router.push("/admin/capitao/intents");
																		});
																	}}
																	onMouseEnter={() => {
																		try {
																			router.prefetch("/admin/capitao/intents");
																		} catch { }
																	}}
																	className={`text-[0.95rem] py-2 transition-colors hover:bg-accent ${isPending ? "opacity-75" : ""}`}
																>
																	<Settings className="text-gray-600" />
																	<span className="font-medium">Intenções (IA)</span>
																</SidebarMenuSubButton>
															</SidebarMenuSubItem>
														</SidebarMenuSub>
													</div>
												</CollapsibleContent>
											</SidebarMenuItem>
										</Collapsible>
									</>
								)}

								{isAdmin && (
									<SidebarMenuItem>
										<SidebarMenuButton asChild>
											<Dialog>
												<DialogTrigger asChild>
													<Button variant="ghost" className="w-full justify-start">
														<Shield className="mr-2" />
														{state !== "collapsed" && <span>Chaves de API (IA)</span>}
													</Button>
												</DialogTrigger>
												<DialogContent className="w-[96vw] sm:max-w-2xl max-h-[85vh] p-0">
													<DialogHeader className="px-6 pt-6">
														<DialogTitle>Gerenciar Chaves de API</DialogTitle>
													</DialogHeader>
													<div className="px-6 pb-4 space-y-4">
														<div className="flex gap-2 items-center">
															<Input
																placeholder="Rótulo (opcional)"
																value={newLabel}
																onChange={(e) => setNewLabel(e.target.value)}
															/>
															<Button disabled={creating} onClick={createApiKey}>
																Gerar
															</Button>
														</div>
														{newToken && (
															<div className="rounded-md border p-3 bg-muted">
																<div className="flex items-center justify-between">
																	<div className="text-sm font-medium">
																		Nova chave (copie agora, será exibida apenas uma vez):
																	</div>
																	<Button variant="secondary" onClick={copyNewToken}>
																		<Copy className="mr-1 h-3 w-3" /> {copied ? "Copiado" : "Copiar"}
																	</Button>
																</div>
																<div className="mt-1 font-mono text-xs break-all">{newToken}</div>
															</div>
														)}
														<div className="space-y-2">
															<div className="text-sm text-muted-foreground">Minhas chaves</div>
															<div className="border rounded-md divide-y">
																{apiKeys.length === 0 && (
																	<div className="p-3 text-sm text-muted-foreground">Nenhuma chave criada.</div>
																)}
																{apiKeys.map((k) => (
																	<div key={k.id} className="p-3 flex items-center justify-between gap-4">
																		<div className="min-w-0">
																			<div className="text-sm font-medium truncate">{k.label || "Sem rótulo"}</div>
																			<div className="text-xs text-muted-foreground font-mono truncate">
																				{k.tokenPrefix}…{k.tokenSuffix}
																			</div>
																			<div className="text-xs text-muted-foreground">
																				{(k.active ?? k.isActive) ? "Ativa" : "Revogada"} •{" "}
																				{k.createdAt ? new Date(k.createdAt).toLocaleString() : "Data não disponível"}
																			</div>
																		</div>
																		<div className="flex items-center gap-2">
																			{(k.active ?? k.isActive) && k.id && (
																				<Button variant="destructive" onClick={() => revokeApiKey(k.id!)}>
																					Revogar
																				</Button>
																			)}
																		</div>
																	</div>
																))}
															</div>
														</div>
													</div>
													<DialogFooter className="px-6 pb-6" />
												</DialogContent>
											</Dialog>
										</SidebarMenuButton>
									</SidebarMenuItem>
								)}

								{isSuperAdmin && (
									<>
										<SidebarMenuItem>
											<SidebarMenuButton
												onClick={(e) => {
													e.preventDefault();
													startTransition(() => {
														router.push("/admin/notifications");
													});
												}}
												onMouseEnter={() => {
													try {
														router.prefetch("/admin/notifications");
													} catch { }
												}}
												className={`flex items-center transition-colors hover:bg-accent ${isPending ? "opacity-75" : ""}`}
											>
												<Bell className="mr-2" />
												{state !== "collapsed" && <span>Notificações</span>}
											</SidebarMenuButton>
										</SidebarMenuItem>

										<SidebarMenuItem>
											<SidebarMenuButton
												onClick={(e) => {
													e.preventDefault();
													startTransition(() => {
														router.push("/admin/users");
													});
												}}
												onMouseEnter={() => {
													try {
														router.prefetch("/admin/users");
													} catch { }
												}}
												className={`flex items-center transition-colors hover:bg-accent ${isPending ? "opacity-75" : ""}`}
											>
												<Users className="mr-2" />
												{state !== "collapsed" && <span>Usuários</span>}
											</SidebarMenuButton>
										</SidebarMenuItem>

										<SidebarMenuItem>
											<SidebarMenuButton
												onClick={(e) => {
													e.preventDefault();
													startTransition(() => {
														router.push("/admin/monitoring");
													});
												}}
												onMouseEnter={() => {
													try {
														router.prefetch("/admin/monitoring");
													} catch { }
												}}
												className={`flex items-center transition-colors hover:bg-accent ${isPending ? "opacity-75" : ""}`}
											>
												<Shield className="mr-2" />
												{state !== "collapsed" && <span>Monitoramento</span>}
											</SidebarMenuButton>
										</SidebarMenuItem>
									</>
								)}

								<SidebarMenuItem>
									<SidebarMenuButton
										onClick={(e) => {
											e.preventDefault();
											startTransition(() => {
												router.push("/admin/leads-chatwit");
											});
										}}
										onMouseEnter={() => {
											try {
												router.prefetch("/admin/leads-chatwit");
											} catch { }
										}}
										className={`flex items-center transition-colors hover:bg-accent ${isPending ? "opacity-75" : ""}`}
									>
										<MessageCircle className="mr-2" />
										{state !== "collapsed" && <span>Leads Chatwit</span>}
									</SidebarMenuButton>
								</SidebarMenuItem>

								<SidebarMenuItem>
									<SidebarMenuButton
										onClick={(e) => {
											e.preventDefault();
											startTransition(() => {
												router.push("/admin/disparo-oab");
											});
										}}
										onMouseEnter={() => {
											try {
												router.prefetch("/admin/disparo-oab");
											} catch { }
										}}
										className={`flex items-center transition-colors hover:bg-accent ${isPending ? "opacity-75" : ""}`}
									>
										<Users className="mr-2" />
										{state !== "collapsed" && <span>Disparo OAB</span>}
									</SidebarMenuButton>
								</SidebarMenuItem>

								<SidebarMenuItem>
									<SidebarMenuButton
										onClick={(e) => {
											e.preventDefault();
											startTransition(() => {
												router.push("/admin/templates");
											});
										}}
										onMouseEnter={() => {
											try {
												router.prefetch("/admin/templates");
											} catch { }
										}}
										className={`flex items-center transition-colors hover:bg-accent ${isPending ? "opacity-75" : ""}`}
									>
										<HelpCircle className="mr-2" />
										{state !== "collapsed" && <span>Templates WhatsApp</span>}
									</SidebarMenuButton>
								</SidebarMenuItem>

								<SidebarMenuItem>
									<SidebarMenuButton
										onClick={(e) => {
											e.preventDefault();
											startTransition(() => {
												router.push("/admin/disparo-em-massa");
											});
										}}
										onMouseEnter={() => {
											try {
												router.prefetch("/admin/disparo-em-massa");
											} catch { }
										}}
										className={`flex items-center transition-colors hover:bg-accent ${isPending ? "opacity-75" : ""}`}
									>
										<Zap className="mr-2" />
										{state !== "collapsed" && <span>Disparo em Massa</span>}
									</SidebarMenuButton>
								</SidebarMenuItem>

								{/* Teste de Webhook */}
								<SidebarMenuItem>
									<SidebarMenuButton
										onClick={(e) => {
											e.preventDefault();
											startTransition(() => {
												router.push("/admin/webhook-test");
											});
										}}
										onMouseEnter={() => {
											try {
												router.prefetch("/admin/webhook-test");
											} catch { }
										}}
										className={`flex items-center transition-colors hover:bg-accent ${isPending ? "opacity-75" : ""}`}
									>
										<FlaskConical className="mr-2" />
										{state !== "collapsed" && <span>Teste de Webhook</span>}
									</SidebarMenuButton>
								</SidebarMenuItem>

								{/* Flow Playground */}
								<SidebarMenuItem>
									<SidebarMenuButton
										onClick={(e) => {
											e.preventDefault();
											startTransition(() => {
												router.push("/admin/flow-playground");
											});
										}}
										onMouseEnter={() => {
											try {
												router.prefetch("/admin/flow-playground");
											} catch { }
										}}
										className={`flex items-center transition-colors hover:bg-accent ${isPending ? "opacity-75" : ""}`}
									>
										<Play className="mr-2" />
										{state !== "collapsed" && <span>Flow Playground</span>}
									</SidebarMenuButton>
								</SidebarMenuItem>

								{/* Debug - Lista de Hooks */}
								<SidebarMenuItem>
									<SidebarMenuButton
										onClick={(e) => {
											e.preventDefault();
											startTransition(() => {
												router.push("/admin/hooklist");
											});
										}}
										onMouseEnter={() => {
											try {
												router.prefetch("/admin/hooklist");
											} catch { }
										}}
										className={`flex items-center transition-colors hover:bg-accent ${isPending ? "opacity-75" : ""}`}
									>
										<Zap className="mr-2" />
										{state !== "collapsed" && <span>Debug - Hooks Chatwit ✅</span>}
									</SidebarMenuButton>
								</SidebarMenuItem>

								{/* Teste OpenAI Responses API */}
								<SidebarMenuItem>
									<SidebarMenuButton
										onClick={(e) => {
											e.preventDefault();
											startTransition(() => {
												router.push("/admin/openai-source-test-biblia");
											});
										}}
										onMouseEnter={() => {
											try {
												router.prefetch("/admin/openai-source-test-biblia");
											} catch { }
										}}
										className={`flex items-center transition-colors hover:bg-accent ${isPending ? "opacity-75" : ""}`}
									>
										<Atom className="mr-2" />
										{state !== "collapsed" && <span>Teste OpenAI Responses</span>}
									</SidebarMenuButton>
								</SidebarMenuItem>

								{/* Features & Feature Flags */}
								<SidebarMenuItem>
									<SidebarMenuButton
										onClick={(e) => {
											e.preventDefault();
											startTransition(() => {
												router.push("/admin/features");
											});
										}}
										onMouseEnter={() => {
											try {
												router.prefetch("/admin/features");
											} catch { }
										}}
										className={`flex items-center transition-colors hover:bg-accent ${isPending ? "opacity-75" : ""}`}
									>
										<Flag className="mr-2" />
										{state !== "collapsed" && <span>Features</span>}
									</SidebarMenuButton>
								</SidebarMenuItem>

								<SidebarMenuItem>
									<SidebarMenuButton
										onClick={(e) => {
											e.preventDefault();
											startTransition(() => {
												router.push("/admin/queue");
											});
										}}
										onMouseEnter={() => {
											try {
												router.prefetch("/admin/queue");
											} catch { }
										}}
										className={`flex items-center transition-colors hover:bg-accent ${isPending ? "opacity-75" : ""}`}
									>
										<Calendar className="mr-2" />
										{state !== "collapsed" && <span>Fila de Processamento</span>}
									</SidebarMenuButton>
								</SidebarMenuItem>

								{isSuperAdmin && (
									<>
										<SidebarMenuItem>
											<SidebarMenuButton
												onClick={(e) => {
													e.preventDefault();
													startTransition(() => {
														router.push("/admin/ai-integration");
													});
												}}
												onMouseEnter={() => {
													try {
														router.prefetch("/admin/ai-integration");
													} catch { }
												}}
												className={`flex items-center transition-colors hover:bg-accent ${isPending ? "opacity-75" : ""}`}
											>
												<Brain className="mr-2" />
												{state !== "collapsed" && <span>IA Integration</span>}
											</SidebarMenuButton>
										</SidebarMenuItem>

										<SidebarMenuItem>
											<SidebarMenuButton
												onClick={(e) => {
													e.preventDefault();
													startTransition(() => {
														router.push("/admin/ai-integration/intents");
													});
												}}
												onMouseEnter={() => {
													try {
														router.prefetch("/admin/ai-integration/intents");
													} catch { }
												}}
												className={`flex items-center transition-colors hover:bg-accent ${isPending ? "opacity-75" : ""}`}
											>
												<Settings className="mr-2" />
												{state !== "collapsed" && <span>Gerenciar Intents</span>}
											</SidebarMenuButton>
										</SidebarMenuItem>

										{/* [CLEANUP 2026-02-16] Redirecionado para queue-management (ai-integration/queues removido) */}
										<SidebarMenuItem>
											<SidebarMenuButton
												onClick={(e) => {
													e.preventDefault();
													startTransition(() => {
														router.push("/admin/monitoring/queue-management");
													});
												}}
												onMouseEnter={() => {
													try {
														router.prefetch("/admin/monitoring/queue-management");
													} catch { }
												}}
												className={`flex items-center transition-colors hover:bg-accent ${isPending ? "opacity-75" : ""}`}
											>
												<Activity className="mr-2" />
												{state !== "collapsed" && <span>Gerenciar Filas</span>}
											</SidebarMenuButton>
										</SidebarMenuItem>

										<SidebarMenuItem>
											<SidebarMenuButton
												onClick={(e) => {
													e.preventDefault();
													startTransition(() => {
														router.push("/admin/iframe-config");
													});
												}}
												onMouseEnter={() => {
													try {
														router.prefetch("/admin/iframe-config");
													} catch { }
												}}
												className={`flex items-center transition-colors hover:bg-accent ${isPending ? "opacity-75" : ""}`}
											>
												<Settings className="mr-2" />
												{state !== "collapsed" && <span>Config. Iframe</span>}
											</SidebarMenuButton>
										</SidebarMenuItem>
									</>
								)}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				)}
			</SidebarContent>

			<SidebarFooter>
				<div className="p-4">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								className={`flex items-center w-full px-2 py-1 hover:bg-accent rounded ${session?.user && state === "collapsed" ? "justify-center" : "justify-start pl-2"
									}`}
							>
								{session?.user?.image ? (
									<Avatar className="h-6 w-6">
										<AvatarImage src={session.user.image} />
										<AvatarFallback>
											<User2 className="h-4 w-4" />
										</AvatarFallback>
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

export default AppAdminDashboard;
