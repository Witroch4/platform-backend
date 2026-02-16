"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
	Loader2,
	Search,
	UserCog,
	X,
	RefreshCw,
	UserCheck,
	ChevronDown,
	ChevronRight,
	Copy,
	Check,
	ExternalLink,
	ChevronLeft,
	CheckCircle,
	KeyRound,
} from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogClose,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import NavbarAdmin from "@/components/admin/navbar-admin";
import Link from "next/link";

interface Account {
	id: string;
	provider: string;
	providerAccountId: string;
	type: string;
	access_token?: string | null;
	refresh_token?: string | null;
	expires_at?: number | null;
	token_type?: string | null;
	scope?: string | null;
	id_token?: string | null;
	session_state?: string | null;
	igUserId?: string | null;
	igUsername?: string | null;
	isMain: boolean;
	createdAt: string;
	updatedAt: string;
}

interface User {
	id: string;
	name: string | null;
	email: string;
	role: string;
	isTwoFactorAuthEnabled: boolean;
	createdAt: string;
	emailVerified: string | null;
	accounts?: Account[];
}

const UsersPage = () => {
	const [users, setUsers] = useState<User[]>([]);
	const [loading, setLoading] = useState(true);
	const [searchTerm, setSearchTerm] = useState("");
	const [editingUser, setEditingUser] = useState<User | null>(null);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
	const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
	const [copiedTokens, setCopiedTokens] = useState<Set<string>>(new Set());
	// Estado para armazenar a conta clonada
	const [clonedAccount, setClonedAccount] = useState<Account | null>(null);
	// Estado para controlar o diálogo de confirmação de clonagem
	const [isCloneDialogOpen, setIsCloneDialogOpen] = useState(false);
	// Estado para armazenar o usuário de destino para colar a conta
	const [targetUserId, setTargetUserId] = useState<string | null>(null);
	// Estado para controlar o diálogo de confirmação de colagem
	const [isPasteDialogOpen, setIsPasteDialogOpen] = useState(false);
	// Estado para controlar o carregamento durante as operações
	const [isCloning, setIsCloning] = useState(false);
	// Estado para controlar o diálogo de redefinição de senha
	const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
	// Estado para armazenar o usuário para redefinição de senha
	const [passwordUser, setPasswordUser] = useState<User | null>(null);
	// Estado para armazenar a nova senha
	const [newPassword, setNewPassword] = useState("");
	// Estado para controlar o carregamento durante a redefinição de senha
	const [isSettingPassword, setIsSettingPassword] = useState(false);
	// Referência para controlar o estado do menu de contexto
	const contextMenuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		fetchUsers();
	}, []);

	const fetchUsers = async () => {
		try {
			setLoading(true);
			const response = await fetch("/api/admin/users");
			if (!response.ok) {
				throw new Error("Falha ao buscar usuários");
			}
			const data = await response.json();
			setUsers(data.users);
		} catch (error) {
			console.error("Erro ao buscar usuários:", error);
			toast("Erro", { description: "Não foi possível carregar os usuários." });
		} finally {
			setLoading(false);
		}
	};

	const filteredUsers = users.filter(
		(user) =>
			user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
			user.email.toLowerCase().includes(searchTerm.toLowerCase()),
	);

	const handleEditUser = (user: User) => {
		// Adicionar um pequeno atraso para garantir que qualquer menu aberto seja fechado primeiro
		setTimeout(() => {
			setEditingUser({ ...user });
			setIsDialogOpen(true);
		}, 100);
	};

	const handleCloseDialog = () => {
		setEditingUser(null);
		setIsDialogOpen(false);
	};

	const handleSaveUser = async () => {
		if (!editingUser) return;

		try {
			const response = await fetch(`/api/admin/users/${editingUser.id}`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					name: editingUser.name,
					email: editingUser.email,
					role: editingUser.role,
				}),
			});

			if (!response.ok) {
				throw new Error("Falha ao atualizar usuário");
			}

			// Atualizar o usuário na lista
			setUsers((prevUsers) =>
				prevUsers.map((user) => (user.id === editingUser.id ? { ...user, ...editingUser } : user)),
			);

			toast("Sucesso", { description: "Usuário atualizado com sucesso." });

			handleCloseDialog();
		} catch (error) {
			console.error("Erro ao atualizar usuário:", error);
			toast("Erro", { description: "Não foi possível atualizar o usuário." });
		}
	};

	const toggleUserExpand = (userId: string) => {
		setExpandedUsers((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(userId)) {
				newSet.delete(userId);
			} else {
				newSet.add(userId);
			}
			return newSet;
		});
	};

	const toggleAccountExpand = (accountId: string) => {
		setExpandedAccounts((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(accountId)) {
				newSet.delete(accountId);
			} else {
				newSet.add(accountId);
			}
			return newSet;
		});
	};

	const copyToClipboard = (text: string, accountId: string) => {
		navigator.clipboard.writeText(text);
		setCopiedTokens((prev) => new Set(prev).add(accountId));
		setTimeout(() => {
			setCopiedTokens((prev) => {
				const newSet = new Set(prev);
				newSet.delete(accountId);
				return newSet;
			});
		}, 2000);
		toast("Token copiado", { description: "Token copiado para a área de transferência." });
	};

	const formatDate = (dateString: string) => {
		return new Intl.DateTimeFormat("pt-BR", {
			dateStyle: "short",
			timeStyle: "short",
		}).format(new Date(dateString));
	};

	const formatExpiresAt = (expiresAt: number | null | undefined) => {
		if (!expiresAt) return "Nunca";
		const date = new Date(expiresAt * 1000);
		return new Intl.DateTimeFormat("pt-BR", {
			dateStyle: "short",
			timeStyle: "short",
		}).format(date);
	};

	const handleCloneAccount = (
		account: Account,
		setClonedAccount: React.Dispatch<React.SetStateAction<Account | null>>,
		setIsCloneDialogOpen: React.Dispatch<React.SetStateAction<boolean>>,
	) => {
		setClonedAccount(account);
		setIsCloneDialogOpen(true);
	};

	const confirmClone = () => {
		setIsCloneDialogOpen(false);
		toast("Conta clonada", {
			description: "Conta copiada. Agora clique com o botão direito em qualquer usuário para colar.",
		});
	};

	const handlePasteAccount = (
		userId: string,
		clonedAccount: Account | null,
		setTargetUserId: React.Dispatch<React.SetStateAction<string | null>>,
		setIsPasteDialogOpen: React.Dispatch<React.SetStateAction<boolean>>,
		toast: any,
	) => {
		if (!clonedAccount) {
			toast("Erro", { description: "Nenhuma conta foi clonada. Clone uma conta primeiro." });
			return;
		}

		const targetUser = users.find((u) => u.id === userId);
		if (!targetUser) {
			toast("Erro", { description: "Usuário não encontrado." });
			return;
		}

		setTargetUserId(userId);
		setIsPasteDialogOpen(true);
	};

	const confirmPaste = async () => {
		if (!clonedAccount || !targetUserId) return;

		try {
			setIsCloning(true);

			const payload = {
				provider: clonedAccount.provider,
				providerAccountId: clonedAccount.providerAccountId,
				type: clonedAccount.type,
				access_token: clonedAccount.access_token,
				refresh_token: clonedAccount.refresh_token,
				expires_at: clonedAccount.expires_at,
				token_type: clonedAccount.token_type,
				scope: clonedAccount.scope,
				id_token: clonedAccount.id_token,
				session_state: clonedAccount.session_state,
				igUserId: clonedAccount.igUserId,
				igUsername: clonedAccount.igUsername,
				isMain: clonedAccount.isMain,
			};

			const response = await fetch(`/api/admin/users/${targetUserId}/accounts`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Falha ao colar conta");
			}

			await fetchUsers();
			setIsPasteDialogOpen(false);
			setClonedAccount(null);
			setTargetUserId(null);

			toast("Conta colada", { description: "Conta colada com sucesso no usuário de destino." });
		} catch (error) {
			console.error("Erro ao colar conta:", error);
			toast("Erro", { description: (error as Error).message });
		} finally {
			setIsCloning(false);
		}
	};

	const handleValidateEmail = async (userId: string, userEmail: string) => {
		try {
			const response = await fetch(`/api/admin/users/${userId}/validate-email`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
			});

			if (!response.ok) {
				throw new Error("Falha ao validar email");
			}

			// Atualizar o usuário na lista
			setUsers((prevUsers) =>
				prevUsers.map((user) => (user.id === userId ? { ...user, emailVerified: new Date().toISOString() } : user)),
			);

			toast("Email validado", { description: `Email ${userEmail} foi marcado como verificado.` });
		} catch (error) {
			console.error("Erro ao validar email:", error);
			toast("Erro", { description: "Não foi possível validar o email." });
		}
	};

	const handleSetPassword = (user: User) => {
		setPasswordUser(user);
		setNewPassword("");
		setIsPasswordDialogOpen(true);
	};

	const confirmSetPassword = async () => {
		if (!passwordUser || !newPassword.trim()) {
			toast("Erro", { description: "Digite uma senha válida." });
			return;
		}

		try {
			setIsSettingPassword(true);

			const response = await fetch(`/api/admin/users/${passwordUser.id}/set-password`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					password: newPassword.trim(),
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Falha ao definir senha");
			}

			setIsPasswordDialogOpen(false);
			setPasswordUser(null);
			setNewPassword("");

			toast("Senha definida", { description: `Nova senha definida para ${passwordUser.email}.` });
		} catch (error) {
			console.error("Erro ao definir senha:", error);
			toast("Erro", { description: (error as Error).message });
		} finally {
			setIsSettingPassword(false);
		}
	};

	const formatEmailVerified = (dateString: string | null) => {
		if (!dateString) return "Não verificado";
		return formatDate(dateString);
	};

	return (
		<div className="min-h-screen bg-background">
			<NavbarAdmin />
			<div className="container mx-auto py-10 px-4">
				<div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
					<div>
						<h1 className="text-3xl font-bold text-foreground">Gerenciamento de Usuários</h1>
						<p className="text-muted-foreground mt-2">Visualize e gerencie todos os usuários cadastrados no sistema.</p>
						<div className="mt-4">
							<Button variant="outline" asChild className="border-border hover:bg-accent">
								<Link href="/admin">
									<ChevronLeft className="mr-2 h-4 w-4" />
									Voltar ao Painel
								</Link>
							</Button>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<div className="relative">
							<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
							<Input
								type="search"
								placeholder="Buscar usuários..."
								className="pl-8 w-[250px] border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring"
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
							/>
						</div>
						<Button
							variant="outline"
							size="icon"
							onClick={fetchUsers}
							disabled={loading}
							className="border-border hover:bg-accent"
						>
							{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
						</Button>
					</div>
				</div>

				{loading ? (
					<div className="flex justify-center items-center h-64">
						<Loader2 className="h-8 w-8 animate-spin" />
						<span className="ml-2 text-foreground">Carregando usuários...</span>
					</div>
				) : filteredUsers.length === 0 ? (
					<div className="text-center py-10">
						<p className="text-muted-foreground">Nenhum usuário encontrado.</p>
					</div>
				) : (
					<div className="space-y-4">
						{filteredUsers.map((user) => (
							<ContextMenu key={user.id}>
								<ContextMenuTrigger>
									<Card className="border-border bg-card">
										<CardHeader className="pb-2">
											<div className="flex justify-between items-start">
												<div>
													<CardTitle className="text-xl flex items-center gap-2 text-card-foreground">
														<Button
															variant="ghost"
															className="p-0 h-6 w-6 hover:bg-accent"
															onClick={(e) => {
																e.stopPropagation();
																toggleUserExpand(user.id);
															}}
														>
															{expandedUsers.has(user.id) ? (
																<ChevronDown className="h-5 w-5" />
															) : (
																<ChevronRight className="h-5 w-5" />
															)}
														</Button>
														{user.name || "Sem nome"}
														{user.emailVerified && (
															<Badge
																variant="secondary"
																className="ml-2 text-xs bg-green-100 text-green-800 dark:bg-green-800/20 dark:text-green-400 border-border"
															>
																Verificado
															</Badge>
														)}
													</CardTitle>
													<CardDescription className="text-muted-foreground">{user.email}</CardDescription>
												</div>
												<div className="flex items-center gap-2">
													<Badge variant={user.role === "ADMIN" ? "default" : "outline"} className="border-border">
														{user.role}
													</Badge>
													<TooltipProvider>
														<Tooltip>
															<TooltipTrigger asChild>
																<Button
																	variant="ghost"
																	size="icon"
																	onClick={() => handleEditUser(user)}
																	className="hover:bg-accent"
																>
																	<UserCog className="h-4 w-4" />
																</Button>
															</TooltipTrigger>
															<TooltipContent className="bg-popover border-border">
																<p>Editar usuário</p>
															</TooltipContent>
														</Tooltip>
													</TooltipProvider>
												</div>
											</div>
										</CardHeader>
										<Collapsible open={expandedUsers.has(user.id)}>
											<CollapsibleContent>
												<CardContent className="pt-0">
													<div className="space-y-2">
														<div className="flex justify-between text-sm">
															<span className="text-muted-foreground">ID:</span>
															<span className="font-mono text-card-foreground">{user.id}</span>
														</div>
														<div className="flex justify-between text-sm">
															<span className="text-muted-foreground">Criado em:</span>
															<span className="text-card-foreground">{formatDate(user.createdAt)}</span>
														</div>
														<div className="flex justify-between text-sm">
															<span className="text-muted-foreground">Email verificado:</span>
															<span className="text-card-foreground">{formatEmailVerified(user.emailVerified)}</span>
														</div>
														<div className="flex justify-between text-sm">
															<span className="text-muted-foreground">2FA:</span>
															<span className="text-card-foreground">
																{user.isTwoFactorAuthEnabled ? "Ativado" : "Desativado"}
															</span>
														</div>
														{user.accounts && user.accounts.length > 0 && (
															<div className="mt-4">
																<h4 className="text-sm font-medium mb-2 text-card-foreground">Contas vinculadas:</h4>
																<div className="space-y-3">
																	{user.accounts.map((account) => (
																		<ContextMenu key={account.id}>
																			<ContextMenuTrigger>
																				<Card className="border-dashed border-border bg-card">
																					<CardHeader className="py-2 px-4">
																						<div className="flex justify-between items-center">
																							<div className="flex items-center gap-2">
																								<Button
																									variant="ghost"
																									className="p-0 h-6 w-6 hover:bg-accent"
																									onClick={(e) => {
																										e.stopPropagation();
																										toggleAccountExpand(account.id);
																									}}
																								>
																									{expandedAccounts.has(account.id) ? (
																										<ChevronDown className="h-4 w-4" />
																									) : (
																										<ChevronRight className="h-4 w-4" />
																									)}
																								</Button>
																								<div>
																									<div className="font-medium text-card-foreground">
																										{account.provider.charAt(0).toUpperCase() +
																											account.provider.slice(1)}
																										{account.isMain && (
																											<Badge variant="secondary" className="ml-2 border-border">
																												Principal
																											</Badge>
																										)}
																									</div>
																									<div className="text-xs text-muted-foreground">
																										{account.igUsername
																											? `@${account.igUsername}`
																											: account.providerAccountId}
																									</div>
																								</div>
																							</div>
																						</div>
																					</CardHeader>
																					<Collapsible open={expandedAccounts.has(account.id)}>
																						<CollapsibleContent>
																							<CardContent className="py-2 px-4 text-xs">
																								<div className="space-y-2">
																									<div className="flex justify-between">
																										<span className="text-muted-foreground">ID:</span>
																										<span className="font-mono text-card-foreground">{account.id}</span>
																									</div>
																									<div className="flex justify-between">
																										<span className="text-muted-foreground">Provider ID:</span>
																										<span className="font-mono text-card-foreground">
																											{account.providerAccountId}
																										</span>
																									</div>
																									{account.igUsername && (
																										<div className="flex justify-between">
																											<span className="text-muted-foreground">Username:</span>
																											<span className="text-card-foreground">
																												@{account.igUsername}
																											</span>
																										</div>
																									)}
																									{account.expires_at && (
																										<div className="flex justify-between">
																											<span className="text-muted-foreground">Expira em:</span>
																											<span className="text-card-foreground">
																												{formatExpiresAt(account.expires_at)}
																											</span>
																										</div>
																									)}
																									{account.access_token && (
																										<div className="flex justify-between items-center">
																											<span className="text-muted-foreground">Token:</span>
																											<div className="flex items-center gap-1">
																												<span className="font-mono truncate max-w-[150px] text-card-foreground">
																													{account.access_token.substring(0, 10)}...
																												</span>
																												<Button
																													variant="ghost"
																													size="icon"
																													className="h-5 w-5 hover:bg-accent"
																													onClick={() =>
																														copyToClipboard(account.access_token!, account.id)
																													}
																												>
																													{copiedTokens.has(account.id) ? (
																														<Check className="h-3 w-3" />
																													) : (
																														<Copy className="h-3 w-3" />
																													)}
																												</Button>
																											</div>
																										</div>
																									)}
																									<div className="flex justify-between">
																										<span className="text-muted-foreground">Criado em:</span>
																										<span className="text-card-foreground">
																											{formatDate(account.createdAt)}
																										</span>
																									</div>
																								</div>
																							</CardContent>
																						</CollapsibleContent>
																					</Collapsible>
																				</Card>
																			</ContextMenuTrigger>
																			<ContextMenuContent className="w-64 bg-popover border-border">
																				<ContextMenuItem
																					onClick={() =>
																						handleCloneAccount(account, setClonedAccount, setIsCloneDialogOpen)
																					}
																					className="text-popover-foreground hover:bg-accent"
																				>
																					<Copy className="mr-2 h-4 w-4" />
																					Clonar conta
																				</ContextMenuItem>
																				<ContextMenuItem
																					onClick={() => copyToClipboard(account.access_token!, account.id)}
																					className="text-popover-foreground hover:bg-accent"
																				>
																					<Copy className="mr-2 h-4 w-4" />
																					Copiar token
																				</ContextMenuItem>
																				<ContextMenuSeparator className="bg-border" />
																				<ContextMenuItem className="text-popover-foreground hover:bg-accent">
																					<ExternalLink className="mr-2 h-4 w-4" />
																					Abrir no Instagram
																				</ContextMenuItem>
																				<ContextMenuSub>
																					<ContextMenuSubTrigger className="text-popover-foreground hover:bg-accent">
																						<RefreshCw className="mr-2 h-4 w-4" />
																						Renovar token
																					</ContextMenuSubTrigger>
																					<ContextMenuSubContent className="w-48 bg-popover border-border">
																						<ContextMenuItem className="text-popover-foreground hover:bg-accent">
																							Renovar manualmente
																						</ContextMenuItem>
																						<ContextMenuItem className="text-popover-foreground hover:bg-accent">
																							Solicitar reautenticação
																						</ContextMenuItem>
																					</ContextMenuSubContent>
																				</ContextMenuSub>
																				<ContextMenuSeparator className="bg-border" />
																				<ContextMenuItem className="text-red-600 hover:bg-accent">
																					<X className="mr-2 h-4 w-4" />
																					Desvincular conta
																				</ContextMenuItem>
																			</ContextMenuContent>
																		</ContextMenu>
																	))}
																</div>
															</div>
														)}
													</div>
												</CardContent>
											</CollapsibleContent>
										</Collapsible>
									</Card>
								</ContextMenuTrigger>
								<ContextMenuContent className="w-64 bg-popover border-border">
									<ContextMenuItem
										onClick={() => handleEditUser(user)}
										className="text-popover-foreground hover:bg-accent"
									>
										<UserCog className="mr-2 h-4 w-4" />
										Editar usuário
									</ContextMenuItem>
									<ContextMenuItem
										onClick={() => handleSetPassword(user)}
										className="text-popover-foreground hover:bg-accent"
									>
										<KeyRound className="mr-2 h-4 w-4" />
										Definir senha
									</ContextMenuItem>
									<ContextMenuSeparator className="bg-border" />
									{!user.emailVerified && (
										<ContextMenuItem
											onClick={() => handleValidateEmail(user.id, user.email)}
											className="text-popover-foreground hover:bg-accent"
										>
											<CheckCircle className="mr-2 h-4 w-4" />
											Validar email
										</ContextMenuItem>
									)}
									{clonedAccount && (
										<ContextMenuItem
											onClick={() =>
												handlePasteAccount(user.id, clonedAccount, setTargetUserId, setIsPasteDialogOpen, toast)
											}
											className="text-popover-foreground hover:bg-accent"
										>
											<UserCheck className="mr-2 h-4 w-4" />
											Colar conta clonada
										</ContextMenuItem>
									)}
									<ContextMenuSeparator className="bg-border" />
									<ContextMenuItem className="text-red-600 hover:bg-accent">
										<X className="mr-2 h-4 w-4" />
										Remover usuário
									</ContextMenuItem>
								</ContextMenuContent>
							</ContextMenu>
						))}
					</div>
				)}

				{/* Dialog de edição de usuário */}
				<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
					<DialogContent className="bg-background border-border">
						<DialogHeader>
							<DialogTitle className="text-foreground">Editar Usuário</DialogTitle>
							<DialogDescription className="text-muted-foreground">
								Faça alterações nas informações do usuário aqui.
							</DialogDescription>
						</DialogHeader>
						{editingUser && (
							<div className="grid gap-4 py-4">
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor="name" className="text-right text-foreground">
										Nome
									</Label>
									<Input
										id="name"
										value={editingUser.name || ""}
										onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
										className="col-span-3 border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring"
									/>
								</div>
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor="email" className="text-right text-foreground">
										Email
									</Label>
									<Input
										id="email"
										value={editingUser.email}
										onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
										className="col-span-3 border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring"
									/>
								</div>
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor="role" className="text-right text-foreground">
										Função
									</Label>
									<Select
										value={editingUser.role}
										onValueChange={(value) => setEditingUser({ ...editingUser, role: value })}
									>
										<SelectTrigger className="col-span-3 border-border bg-background text-foreground">
											<SelectValue />
										</SelectTrigger>
										<SelectContent className="bg-popover border-border">
											<SelectItem value="USER" className="text-popover-foreground hover:bg-accent">
												Usuário
											</SelectItem>
											<SelectItem value="ADMIN" className="text-popover-foreground hover:bg-accent">
												Administrador
											</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>
						)}
						<DialogFooter>
							<Button onClick={handleSaveUser}>Salvar alterações</Button>
							<DialogClose asChild>
								<Button variant="outline" className="border-border hover:bg-accent">
									Cancelar
								</Button>
							</DialogClose>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				{/* Dialog de confirmação de clonagem */}
				<Dialog open={isCloneDialogOpen} onOpenChange={setIsCloneDialogOpen}>
					<DialogContent className="bg-background border-border">
						<DialogHeader>
							<DialogTitle className="text-foreground">Confirmar Clonagem</DialogTitle>
							<DialogDescription className="text-muted-foreground">
								Você está prestes a clonar a conta{" "}
								{clonedAccount?.igUsername ? `@${clonedAccount.igUsername}` : clonedAccount?.providerAccountId} do{" "}
								{clonedAccount?.provider}.
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button onClick={confirmClone}>Confirmar Clonagem</Button>
							<DialogClose asChild>
								<Button variant="outline" className="border-border hover:bg-accent">
									Cancelar
								</Button>
							</DialogClose>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				{/* Dialog de confirmação de colagem */}
				<Dialog open={isPasteDialogOpen} onOpenChange={setIsPasteDialogOpen}>
					<DialogContent className="bg-background border-border">
						<DialogHeader>
							<DialogTitle className="text-foreground">Confirmar Colagem</DialogTitle>
							<DialogDescription className="text-muted-foreground">
								Você está prestes a colar a conta clonada{" "}
								{clonedAccount?.igUsername ? `@${clonedAccount.igUsername}` : clonedAccount?.providerAccountId} no
								usuário {users.find((u) => u.id === targetUserId)?.email}.
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button onClick={confirmPaste} disabled={isCloning}>
								{isCloning ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Colando...
									</>
								) : (
									"Confirmar Colagem"
								)}
							</Button>
							<DialogClose asChild>
								<Button variant="outline" disabled={isCloning} className="border-border hover:bg-accent">
									Cancelar
								</Button>
							</DialogClose>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				{/* Dialog de redefinição de senha */}
				<Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
					<DialogContent className="bg-background border-border">
						<DialogHeader>
							<DialogTitle className="text-foreground">Definir Nova Senha</DialogTitle>
							<DialogDescription className="text-muted-foreground">
								Defina uma nova senha para o usuário {passwordUser?.email}.
							</DialogDescription>
						</DialogHeader>
						<div className="grid gap-4 py-4">
							<div className="grid grid-cols-4 items-center gap-4">
								<Label htmlFor="newPassword" className="text-right text-foreground">
									Nova Senha
								</Label>
								<Input
									id="newPassword"
									type="password"
									value={newPassword}
									onChange={(e) => setNewPassword(e.target.value)}
									className="col-span-3 border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring"
									placeholder="Digite a nova senha"
								/>
							</div>
						</div>
						<DialogFooter>
							<Button onClick={confirmSetPassword} disabled={isSettingPassword || !newPassword.trim()}>
								{isSettingPassword ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Definindo...
									</>
								) : (
									"Definir Senha"
								)}
							</Button>
							<DialogClose asChild>
								<Button variant="outline" disabled={isSettingPassword} className="border-border hover:bg-accent">
									Cancelar
								</Button>
							</DialogClose>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>
		</div>
	);
};

export default UsersPage;
