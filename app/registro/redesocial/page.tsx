"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import {
	Instagram,
	Facebook,
	Send,
	AlertCircle,
	Plus,
	Trash2,
	RefreshCw,
	CheckCircle,
	Users,
	BarChart,
	Calendar,
	LogOut,
	Bot,
	Star,
	ArrowRight,
	MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { NotificationDropdown } from "@/components/notifications/notification-dropdown";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "sonner";

interface InstagramAccount {
	id: string;
	providerAccountId: string;
	igUsername: string;
	isMain: boolean;
}

/**
 * ⚠️ NÃO use window no escopo do módulo.
 * Pegue primeiro o valor do .env (estático), e só caia para window dentro de um useEffect.
 */
const ENV_REDIRECT = process.env.NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI || null;

export default function RedeSocialPage() {
	const { data: session, update } = useSession();
	const router = useRouter();

	const [selectedPlatform, setSelectedPlatform] = useState<string | null>("instagram");
	const [isConnecting, setIsConnecting] = useState(false);
	const [connectionError, setConnectionError] = useState<string | null>(null);
	const [connectedAccounts, setConnectedAccounts] = useState<InstagramAccount[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [sessionChecked, setSessionChecked] = useState(false);

	// ✅ redirectUri começa pelo .env (estático). Se vazio, completa no cliente.
	const [redirectUri, setRedirectUri] = useState<string | null>(ENV_REDIRECT);

	useEffect(() => {
		if (!redirectUri && typeof window !== "undefined") {
			setRedirectUri(`${window.location.origin}/registro/redesocial/callback`);
		}
	}, [redirectUri]);

	// Gera a URL do Instagram só quando tiver redirectUri disponível
	const instagramAuthUrl = useMemo(() => {
		if (!redirectUri) return null;
		const params = new URLSearchParams({
			enable_fb_login: "0",
			force_authentication: "1",
			client_id: process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID || "",
			redirect_uri: redirectUri,
			response_type: "code",
			scope: [
				"instagram_business_basic",
				"instagram_business_manage_messages",
				"instagram_business_manage_comments",
				"instagram_business_content_publish",
			].join(","),
		});
		return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
	}, [redirectUri]);

	// Debug do redirectUri somente no cliente
	useEffect(() => {
		if (redirectUri) {
			console.log(`redirectUri na página de registro: ${redirectUri}`);
		}
	}, [redirectUri]);

	// Função para enviar notificação de boas-vindas
	const sendWelcomeNotification = async () => {
		try {
			const response = await fetch("/api/auth/welcome-notification", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			});
			const data = await response.json();
			if (data.success) {
				toast("Bem-vindo!", {
					description: "Notificação de boas-vindas enviada com sucesso.",
				});
			}
		} catch (error) {
			console.error("Erro ao chamar a API de notificação de boas-vindas:", error);
		}
	};

	// useEffect principal simplificado
	useEffect(() => {
		if (session === undefined) return;

		if (!session?.user?.id) {
			setIsLoading(false);
			return;
		}

		if (session?.user && !sessionChecked) {
			setSessionChecked(true);
			fetchAccounts();
			sendWelcomeNotification();
		}
	}, [session, sessionChecked]);

	// useEffect para detectar redirecionamento após login
	useEffect(() => {
		if (typeof window !== "undefined") {
			const urlParams = new URLSearchParams(window.location.search);
			const fromLogin = urlParams.get("fromLogin");
			if (fromLogin === "true") {
				window.history.replaceState({}, document.title, window.location.pathname);
				update().then(() => setSessionChecked(false));
			}
		}
	}, []);

	const fetchAccounts = async () => {
		if (!session?.user?.id) return;
		try {
			setIsLoading(true);
			const timestamp = Date.now();
			const response = await fetch(`/api/auth/instagram/accounts?t=${timestamp}`, {
				method: "GET",
				headers: {
					"Cache-Control": "no-cache, no-store, must-revalidate",
					Pragma: "no-cache",
					Expires: "0",
				},
				credentials: "include",
				cache: "no-store",
			});

			console.log("Status da resposta API:", response.status);
			if (!response.ok) throw new Error(`Erro na API: ${response.status} ${response.statusText}`);

			const responseText = await response.text();
			console.log("Resposta bruta da API:", responseText);

			try {
				const data = JSON.parse(responseText);
				if (Array.isArray(data)) {
					setConnectedAccounts(data);
				} else if (data.accounts && Array.isArray(data.accounts)) {
					setConnectedAccounts(data.accounts);
				} else {
					console.error("Formato de resposta inesperado:", data);
					setConnectedAccounts([]);
				}
			} catch (parseError) {
				console.error("Erro ao analisar JSON:", parseError);
			}
		} catch (error) {
			console.error("Erro ao buscar contas:", error);
		} finally {
			setIsLoading(false);
			setIsRefreshing(false);
		}
	};

	const handleRefresh = () => {
		setIsRefreshing(true);
		fetchAccounts();
	};

	const handleInstagramConnect = async () => {
		try {
			setIsConnecting(true);
			setConnectionError(null);
			if (!instagramAuthUrl) return; // aguarda resolver redirectUri
			window.location.href = instagramAuthUrl;
		} catch (error) {
			console.error("Erro ao conectar com Instagram:", error);
			setConnectionError("Ocorreu um erro ao tentar conectar com o Instagram. Tente novamente mais tarde.");
			toast.error("Erro de conexão", {
				description: "Não foi possível conectar ao Instagram. Tente novamente mais tarde.",
			});
		} finally {
			setIsConnecting(false);
		}
	};

	const handleDisconnectAccount = async (accountId: string) => {
		try {
			const response = await fetch("/api/auth/instagram/disconnect", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ accountId }),
			});

			if (response.ok) {
				setConnectedAccounts((prev) => prev.filter((a) => a.id !== accountId));
				toast("Conta desconectada", { description: "A conta do Instagram foi desconectada com sucesso." });
			} else {
				const data = await response.json();
				toast.error("Erro ao desconectar", {
					description: data.error || "Não foi possível desconectar a conta. Tente novamente.",
				});
			}
		} catch (error) {
			console.error("Erro ao desconectar conta:", error);
			toast.error("Erro ao desconectar", {
				description: "Ocorreu um erro ao tentar desconectar a conta. Tente novamente.",
			});
		}
	};

	const navigateToDashboard = (providerAccountId: string) => {
		router.push(`/${providerAccountId}/dashboard`);
	};

	return (
		<div className="min-h-screen bg-white dark:bg-gray-900">
			{/* Navbar */}
			<header className="sticky top-0 left-0 right-0 h-16 border-b bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm z-40">
				<div className="flex items-center justify-between h-full px-4 max-w-7xl mx-auto">
					<div className="flex items-center">
						<Link href="/" className="flex items-center">
							<Image
								src="/assets/iconssvg/socialwise-logo.png"
								alt="Socialwise Logo"
								width={40}
								height={40}
								className="mr-3"
							/>
							<h1 className="text-xl font-bold bg-gradient-to-r from-primary via-blue-600 to-purple-600 text-transparent bg-clip-text hidden md:block">
								Socialwise
							</h1>
						</Link>
					</div>

					<div className="flex items-center space-x-4">
						<NotificationDropdown />
						<ThemeToggle />

						{session?.user && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Avatar className="h-8 w-8 cursor-pointer ring-2 ring-primary/20 hover:ring-primary/40 transition-all">
										<AvatarImage src={session.user.image || ""} alt={session.user.name || "Usuário"} />
										<AvatarFallback className="bg-primary/10 text-primary">
											{session.user.name?.charAt(0) || "U"}
										</AvatarFallback>
									</Avatar>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="w-56">
									<div className="flex items-center justify-start gap-2 p-2">
										<div className="flex flex-col space-y-1 leading-none">
											{session.user.name && <p className="font-medium">{session.user.name}</p>}
											{session.user.email && (
												<p className="w-[200px] truncate text-sm text-muted-foreground">{session.user.email}</p>
											)}
										</div>
									</div>
									<DropdownMenuSeparator />
									<DropdownMenuItem asChild>
										<Link href="/perfil" className="flex items-center">
											<Users className="mr-2 h-4 w-4" />
											<span>Perfil</span>
										</Link>
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									{(session?.user?.role === "ADMIN" || session?.user?.role === "SUPERADMIN") && (
										<>
											<DropdownMenuItem asChild>
												<Link href="/admin" className="flex items-center">
													<BarChart className="mr-2 h-4 w-4" />
													<span>Painel Admin</span>
												</Link>
											</DropdownMenuItem>
											<DropdownMenuSeparator />
										</>
									)}
									<DropdownMenuItem
										onClick={() => signOut({ callbackUrl: "/" })}
										className="flex items-center text-red-600 dark:text-red-400"
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

			<div className="max-w-7xl mx-auto px-4 py-8 space-y-12">
				{/* Hero Section */}
				<section className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-purple-600 to-pink-500 rounded-3xl p-8 md:p-12">
					<div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-10" />
					<div className="absolute -right-20 -top-20 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
					<div className="absolute -left-20 -bottom-20 w-60 h-60 bg-purple-300/20 rounded-full blur-3xl" />

					<div className="relative z-10">
						<div className="text-center md:text-left max-w-2xl">
							<h1 className="text-4xl md:text-5xl font-bold text-white mb-4 text-wrap-balance">
								Conecte Suas Redes Sociais
							</h1>
							<p className="text-lg md:text-xl text-white/90 mb-8">
								Potencialize seu engajamento com automação inteligente. Transforme seguidores em clientes com nossa IA
								avançada.
							</p>

							<div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
								<Button
									onClick={handleInstagramConnect}
									disabled={isConnecting}
									size="lg"
									className="bg-white text-purple-700 hover:bg-gray-100 font-semibold rounded-xl px-8 py-6 text-lg shadow-lg hover:shadow-xl transition-all duration-200"
								>
									<Instagram className="h-5 w-5 mr-2" />
									{isConnecting ? "Conectando..." : "Conectar Instagram"}
								</Button>
								<Button
									variant="outline"
									onClick={handleRefresh}
									disabled={isRefreshing}
									size="lg"
									className="bg-white/10 backdrop-blur-sm text-white border-white/30 hover:bg-white/20 font-medium rounded-xl px-8 py-6 text-lg transition-all duration-200"
								>
									<RefreshCw className={`h-5 w-5 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
									Atualizar Contas
								</Button>
							</div>
						</div>
					</div>
				</section>

				{/* Contas Conectadas */}
				{isLoading ? (
					<div className="flex justify-center items-center p-12">
						<div className="text-center">
							<div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4"></div>
							<p className="text-lg text-gray-600 dark:text-gray-400">Carregando suas contas...</p>
						</div>
					</div>
				) : connectedAccounts.length > 0 ? (
					<section>
						<div className="flex justify-between items-center mb-8">
							<div>
								<h2 className="text-3xl font-bold text-gray-900 dark:text-white">Suas Contas Conectadas</h2>
								<p className="text-gray-600 dark:text-gray-400 mt-2">
									Gerencie todas suas redes sociais em um só lugar
								</p>
							</div>
							<Badge variant="secondary" className="px-4 py-2 text-lg bg-primary/10 text-primary">
								{connectedAccounts.length} {connectedAccounts.length === 1 ? "conta" : "contas"}
							</Badge>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
							{connectedAccounts.map((account) => (
								<Card
									key={account.id}
									role="button"
									tabIndex={0}
									aria-label={`Gerenciar conta @${account.igUsername}`}
									className="group cursor-pointer hover:shadow-xl transition-all duration-300 border-2 hover:border-primary/50 bg-white dark:bg-gray-800 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
									onClick={() => navigateToDashboard(account.providerAccountId)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											navigateToDashboard(account.providerAccountId);
										}
									}}
								>
									<CardHeader className="pb-4">
										<div className="flex items-center gap-4">
											<div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white shadow-lg">
												<Instagram className="h-8 w-8" />
											</div>
											<div className="flex-1">
												<CardTitle className="text-xl text-gray-900 dark:text-white">Instagram</CardTitle>
												<p className="text-sm text-gray-600 dark:text-gray-400">@{account.igUsername}</p>
												{account.isMain && (
													<Badge variant="secondary" className="bg-primary/10 text-primary mt-2">
														<Star className="h-3 w-3 mr-1" />
														Principal
													</Badge>
												)}
											</div>
										</div>
									</CardHeader>

									<CardContent>
										<div className="space-y-3">
											<div className="flex items-center gap-2">
												<Badge
													variant="secondary"
													className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
												>
													<CheckCircle className="h-3 w-3 mr-1" />
													Ativo
												</Badge>
											</div>
											<p className="text-sm text-gray-600 dark:text-gray-400">
												{account.isMain
													? "Conta principal para autenticação e gestão"
													: "Conta conectada para automação"}
											</p>
										</div>
									</CardContent>

									<CardFooter className="flex justify-between pt-4">
										<Button
											variant="outline"
											onClick={(e) => {
												e.stopPropagation();
												navigateToDashboard(account.providerAccountId);
											}}
											className="flex-1 mr-2"
										>
											<ArrowRight className="h-4 w-4 mr-2" />
											Gerenciar
										</Button>
										<Button
											variant="ghost"
											size="icon"
											aria-label={`Desconectar conta @${account.igUsername}`}
											className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
											onClick={(e) => {
												e.stopPropagation();
												handleDisconnectAccount(account.id);
											}}
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									</CardFooter>
								</Card>
							))}

							{/* Card para adicionar nova conta */}
							<Card
								role="button"
								tabIndex={0}
								aria-label="Adicionar nova conta do Instagram"
								className="group cursor-pointer border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-primary hover:shadow-xl transition-all duration-300 flex flex-col items-center justify-center py-12 bg-gray-50/50 dark:bg-gray-800/50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
								onClick={handleInstagramConnect}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										handleInstagramConnect();
									}
								}}
							>
								<div className="rounded-2xl bg-primary/10 p-6 mb-4 group-hover:bg-primary/20 transition-colors">
									<Plus className="h-10 w-10 text-primary" />
								</div>
								<h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">Adicionar Nova Conta</h3>
								<p className="text-sm text-gray-600 dark:text-gray-400 text-center max-w-[200px]">
									Conecte outra conta do Instagram para ampliar seu alcance
								</p>
							</Card>
						</div>
					</section>
				) : session?.user?.id ? (
					<section className="text-center py-16">
						<div className="max-w-md mx-auto">
							<div className="bg-gray-100 dark:bg-gray-800 rounded-full p-6 w-24 h-24 mx-auto mb-6 flex items-center justify-center">
								<Instagram className="h-12 w-12 text-gray-400" />
							</div>
							<h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Nenhuma conta conectada</h3>
							<p className="text-gray-600 dark:text-gray-400 mb-8">
								Comece conectando sua primeira conta do Instagram para aproveitar todos os benefícios da automação.
							</p>
							<Button
								onClick={handleInstagramConnect}
								size="lg"
								className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
							>
								<Instagram className="h-5 w-5 mr-2" />
								Conectar Instagram
							</Button>
						</div>
					</section>
				) : null}

				{/* Error Message */}
				{connectionError && (
					<div className="p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-2xl flex items-start">
						<AlertCircle className="h-6 w-6 text-red-500 mr-3 flex-shrink-0 mt-0.5" />
						<div>
							<h4 className="font-medium text-red-800 dark:text-red-400">Erro de Conexão</h4>
							<p className="text-sm text-red-700 dark:text-red-300 mt-1">{connectionError}</p>
						</div>
					</div>
				)}

				{/* Plataformas Disponíveis */}
				<section>
					<div className="text-center mb-12">
						<h2 className="text-3xl md:text-4xl font-bold mb-4 text-gray-900 dark:text-white">
							Plataformas Disponíveis
						</h2>
						<p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
							Conecte-se com seus clientes em todas as plataformas com uma única solução inteligente
						</p>
					</div>

					<div className="grid grid-cols-2 md:grid-cols-3 gap-6">
						{/* Instagram - Disponível */}
						<Card
							className={`group cursor-pointer border-2 transition-all duration-300 ${
								selectedPlatform === "instagram"
									? "border-pink-500 bg-pink-50 dark:bg-pink-950/20 shadow-lg"
									: "border-gray-200 dark:border-gray-700 hover:border-pink-300 hover:shadow-md"
							}`}
							onClick={() => setSelectedPlatform("instagram")}
						>
							<CardContent className="p-6 text-center">
								<div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
									<Instagram className="h-8 w-8 text-white" />
								</div>
								<h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">Instagram</h3>
								<Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">
									Disponível ✅
								</Badge>
							</CardContent>
						</Card>

						{/* WhatsApp - Ativo */}
						<Card className="group border-2 border-gray-200 dark:border-gray-700 hover:border-green-300 hover:shadow-md transition-all duration-300">
							<CardContent className="p-6 text-center">
								<div className="w-16 h-16 bg-green-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
									<MessageCircle className="h-8 w-8 text-white" />
								</div>
								<h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">WhatsApp</h3>
								<Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">
									Ativo ✅
								</Badge>
							</CardContent>
						</Card>

						{/* Facebook - Em breve */}
						<Card className="group border-2 border-gray-200 dark:border-gray-700 opacity-70">
							<CardContent className="p-6 text-center">
								<div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
									<Facebook className="h-8 w-8 text-white" />
								</div>
								<h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">Facebook</h3>
								<Badge
									variant="secondary"
									className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
								>
									Em Desenvolvimento 🚧
								</Badge>
							</CardContent>
						</Card>

						{/* TikTok - Em breve */}
						<Card className="group border-2 border-gray-200 dark:border-gray-700 opacity-70">
							<CardContent className="p-6 text-center">
								<div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mx-auto mb-4">
									<Image src="/tiktok-icon.svg" alt="TikTok" width={32} height={32} className="invert" />
								</div>
								<h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">TikTok</h3>
								<Badge
									variant="secondary"
									className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
								>
									Em Breve 🔄
								</Badge>
							</CardContent>
						</Card>

						{/* Telegram - Em breve */}
						<Card className="group border-2 border-gray-200 dark:border-gray-700 opacity-70">
							<CardContent className="p-6 text-center">
								<div className="w-16 h-16 bg-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
									<Send className="h-8 w-8 text-white" />
								</div>
								<h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">Telegram</h3>
								<Badge
									variant="secondary"
									className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
								>
									Em Breve 🔄
								</Badge>
							</CardContent>
						</Card>

						{/* Messenger - Em breve */}
						<Card className="group border-2 border-gray-200 dark:border-gray-700 opacity-70">
							<CardContent className="p-6 text-center">
								<div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
									<Image src="/messenger-icon.svg" alt="Messenger" width={32} height={32} />
								</div>
								<h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">Messenger</h3>
								<Badge
									variant="secondary"
									className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
								>
									Em Breve 🔄
								</Badge>
							</CardContent>
						</Card>
					</div>

					<div className="text-center mt-8">
						<Button
							size="lg"
							onClick={handleInstagramConnect}
							disabled={selectedPlatform !== "instagram" || isConnecting}
							className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-8 py-4 text-lg font-medium"
						>
							<Instagram className="mr-2 h-6 w-6" />
							{isConnecting
								? "Conectando..."
								: connectedAccounts.length > 0
									? "Adicionar Nova Conta do Instagram"
									: "Conectar ao Instagram"}
						</Button>
						<p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
							Ao conectar sua conta, você concorda com nossos{" "}
							<Link href="/termos" className="text-primary hover:underline font-medium">
								Termos de Serviço
							</Link>{" "}
							e{" "}
							<Link href="/privacidade" className="text-primary hover:underline font-medium">
								Política de Privacidade
							</Link>
							.
						</p>
					</div>
				</section>

				{/* Benefícios */}
				<section className="py-16 bg-gray-50 dark:bg-gray-800 rounded-3xl">
					<div className="text-center mb-12">
						<h2 className="text-3xl md:text-4xl font-bold mb-4 text-gray-900 dark:text-white">Por que Socialwise?</h2>
						<p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
							Ferramentas poderosas para automatizar e otimizar sua presença nas redes sociais
						</p>
					</div>

					<div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 px-8">
						<div className="text-center">
							<div className="w-16 h-16 rounded-2xl bg-blue-500 flex items-center justify-center mx-auto mb-4">
								<Bot className="h-8 w-8 text-white" />
							</div>
							<h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">IA Avançada</h3>
							<p className="text-gray-600 dark:text-gray-400">
								Chatbots inteligentes com GPT-4, Gemini e Claude para atendimento automatizado 24/7.
							</p>
						</div>

						<div className="text-center">
							<div className="w-16 h-16 rounded-2xl bg-green-500 flex items-center justify-center mx-auto mb-4">
								<Users className="h-8 w-8 text-white" />
							</div>
							<h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">Engajamento</h3>
							<p className="text-gray-600 dark:text-gray-400">
								Aumente o engajamento com respostas rápidas e personalizadas para cada seguidor.
							</p>
						</div>

						<div className="text-center">
							<div className="w-16 h-16 rounded-2xl bg-purple-500 flex items-center justify-center mx-auto mb-4">
								<Calendar className="h-8 w-8 text-white" />
							</div>
							<h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">Agendamento</h3>
							<p className="text-gray-600 dark:text-gray-400">
								Programe publicações para os melhores horários e maximize seu alcance.
							</p>
						</div>

						<div className="text-center">
							<div className="w-16 h-16 rounded-2xl bg-orange-500 flex items-center justify-center mx-auto mb-4">
								<BarChart className="h-8 w-8 text-white" />
							</div>
							<h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">Analytics</h3>
							<p className="text-gray-600 dark:text-gray-400">
								Métricas detalhadas e insights valiosos para otimizar sua estratégia de conteúdo.
							</p>
						</div>
					</div>
				</section>

				{/* Estatísticas */}
				<section className="py-16 px-8 bg-gradient-to-r from-primary via-blue-600 to-purple-600 rounded-3xl text-white">
					<div className="text-center mb-12">
						<h2 className="text-3xl md:text-4xl font-bold mb-4">Resultados Comprovados</h2>
						<p className="text-xl opacity-90 max-w-2xl mx-auto">
							Veja o impacto que o Socialwise pode ter na sua presença digital
						</p>
					</div>

					<div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
						<div>
							<p className="text-4xl md:text-5xl font-bold mb-2">2.500+</p>
							<p className="text-sm opacity-90">Profissionais Ativos</p>
						</div>
						<div>
							<p className="text-4xl md:text-5xl font-bold mb-2">85%</p>
							<p className="text-sm opacity-90">Melhoria no Tempo de Resposta</p>
						</div>
						<div>
							<p className="text-4xl md:text-5xl font-bold mb-2">3.2x</p>
							<p className="text-sm opacity-90">Mais Engajamento</p>
						</div>
						<div>
							<p className="text-4xl md:text-5xl font-bold mb-2">24/7</p>
							<p className="text-sm opacity-90">Disponibilidade</p>
						</div>
					</div>
				</section>

				{/* Depoimentos */}
				<section>
					<div className="text-center mb-12">
						<h2 className="text-3xl md:text-4xl font-bold mb-4 text-gray-900 dark:text-white">Casos de Sucesso</h2>
						<p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
							Profissionais que transformaram seus negócios com Socialwise
						</p>
					</div>

					<div className="grid md:grid-cols-3 gap-8">
						{[
							{
								name: "Maria Silva",
								username: "@mariaempreendedora",
								initial: "M",
								color: "bg-blue-500",
								testimonial:
									"O Socialwise revolucionou minha presença no Instagram. Consigo responder a todos os comentários e mensagens em tempo recorde!",
							},
							{
								name: "João Mendes",
								username: "@joaofotografia",
								initial: "J",
								color: "bg-green-500",
								testimonial:
									"A automação de respostas me ajudou a converter mais seguidores em clientes. Meu engajamento aumentou 200% em apenas um mês!",
							},
							{
								name: "Carolina Alves",
								username: "@carolinafitness",
								initial: "C",
								color: "bg-purple-500",
								testimonial:
									"As análises detalhadas me ajudaram a entender melhor meu público. Agora sei exatamente que tipo de conteúdo gera mais engajamento.",
							},
						].map((testimonial, index) => (
							<Card
								key={index}
								className="bg-gray-50 dark:bg-gray-800 border-2 hover:shadow-lg transition-all duration-300"
							>
								<CardContent className="pt-6">
									<div className="flex items-center gap-3 mb-4">
										<div
											className={`w-12 h-12 rounded-full ${testimonial.color} flex items-center justify-center text-white font-bold text-lg`}
										>
											{testimonial.initial}
										</div>
										<div>
											<p className="font-bold text-gray-900 dark:text-white">{testimonial.name}</p>
											<p className="text-sm text-gray-600 dark:text-gray-400">{testimonial.username}</p>
										</div>
									</div>
									<p className="italic text-gray-700 dark:text-gray-300">"{testimonial.testimonial}"</p>
									<div className="flex items-center mt-3">
										{[...Array(5)].map((_, i) => (
											<Star key={i} className="h-4 w-4 text-yellow-400 fill-current" />
										))}
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				</section>

				{/* CTA Final */}
				<section className="text-center py-16">
					<div className="max-w-2xl mx-auto">
						<div className="mb-8">
							<Image
								src="/assets/iconssvg/socialwise-logo.png"
								alt="Socialwise Logo"
								width={120}
								height={120}
								className="mx-auto mb-6"
							/>
						</div>
						<h2 className="text-3xl md:text-4xl font-bold mb-6 text-gray-900 dark:text-white">
							Transforme Sua Presença Digital Hoje
						</h2>
						<p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
							Conecte sua primeira conta agora e comece a aproveitar todos os benefícios da automação inteligente com IA
						</p>
						<Button
							size="lg"
							onClick={handleInstagramConnect}
							className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-10 py-4 text-xl font-bold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
						>
							<Instagram className="mr-3 h-6 w-6" />
							Começar Agora - Grátis
							<ArrowRight className="ml-3 h-6 w-6" />
						</Button>
					</div>
				</section>

				{/* Debug Info */}
				{process.env.NODE_ENV === "development" && (
					<div className="p-6 bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-800 rounded-2xl">
						<h3 className="font-bold mb-4 text-yellow-800 dark:text-yellow-400">Informações de Depuração:</h3>
						<div className="grid grid-cols-2 gap-4 text-sm">
							<div>
								<p>
									<strong>Sessão:</strong> {session ? "Autenticado" : "Não autenticado"}
								</p>
								<p>
									<strong>ID do usuário:</strong> {session?.user?.id || "N/A"}
								</p>
							</div>
							<div>
								<p>
									<strong>Contas carregadas:</strong> {connectedAccounts.length}
								</p>
								<p>
									<strong>Estado:</strong> {isLoading ? "Carregando..." : "Concluído"}
								</p>
							</div>
						</div>
						{(session?.user?.role === "ADMIN" || session?.user?.role === "SUPERADMIN") && (
							<Button onClick={() => router.push("/admin")} variant="outline" className="mt-4">
								<BarChart className="mr-2 h-4 w-4" />
								Painel de Administração
							</Button>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
