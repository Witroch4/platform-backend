"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
	RefreshCw,
	Search,
	Filter,
	AlertCircle,
	CheckCircle,
	XCircle,
	Info,
	Zap,
	Database,
	Users,
	Settings,
	MessageCircle,
	ExternalLink,
	User,
	Globe,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface Hook {
	usuarioId: string;
	usuarioName: string;
	usuarioEmail: string;
	accountId: string;
	accountName: string;
	inboxId: number;
	inboxName: string;
	inboxChannel: string;
	appId: string;
	appName: string;
	hookId: string;
	hookStatus: boolean;
	hookInboxId: number;
	hookInboxName: string;
	hookSettings: any;
	hookCreatedAt: string;
	hookUpdatedAt: string;
	isDialogflow: boolean;
	projectId: string;
	region: string;
	agentName: string;
	hasCredentials: boolean;
	isLocalUser: boolean;
	isExternalUser: boolean;
	fetchedAt: string;
}

interface HookStats {
	totalUsuarios: number;
	totalContas: number;
	totalCaixas: number;
	totalHooks: number;
	hooksDialogflow: number;
	hooksAtivos: number;
	hooksInativos: number;
	hooksExternos: number;
	hooksLocais: number;
	totalErrors: number;
}

interface HookError {
	usuarioId?: string;
	usuarioName?: string;
	accountId?: string;
	accountName?: string;
	error: string;
	status?: number;
	data?: any;
}

export default function HookListPage() {
	const { data: session, status } = useSession();
	const router = useRouter();
	const [hooks, setHooks] = useState<Hook[]>([]);
	const [stats, setStats] = useState<HookStats | null>(null);
	const [errors, setErrors] = useState<HookError[]>([]);
	const [loading, setLoading] = useState(false);
	const [searchTerm, setSearchTerm] = useState("");
	const [filterApp, setFilterApp] = useState("all");
	const [filterStatus, setFilterStatus] = useState("all");
	const [filterUser, setFilterUser] = useState("all");
	const [lastFetch, setLastFetch] = useState<string | null>(null);

	// Verificar autenticação
	useEffect(() => {
		if (status === "loading") return;
		if (!session?.user?.id) {
			router.push("/auth/signin");
		}
	}, [session, status, router]);

	const fetchHooks = async () => {
		try {
			setLoading(true);
			const response = await fetch("/api/admin/hooklist");

			if (!response.ok) {
				throw new Error(`Erro ${response.status}: ${response.statusText}`);
			}

			const data = await response.json();

			if (data.success) {
				setHooks(data.hooks || []);
				setStats(data.stats);
				setErrors(data.errors || []);
				setLastFetch(data.timestamp);
			} else {
				throw new Error(data.error || "Erro desconhecido");
			}
		} catch (error) {
			console.error("Erro ao buscar hooks:", error);
			alert(`Erro ao buscar hooks: ${error instanceof Error ? error.message : "Erro desconhecido"}`);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		if (session?.user?.id) {
			fetchHooks();
		}
	}, [session?.user?.id]);

	// Filtrar hooks
	const filteredHooks = hooks.filter((hook) => {
		const matchesSearch =
			hook.usuarioName.toLowerCase().includes(searchTerm.toLowerCase()) ||
			hook.accountName.toLowerCase().includes(searchTerm.toLowerCase()) ||
			hook.inboxName.toLowerCase().includes(searchTerm.toLowerCase()) ||
			hook.appName.toLowerCase().includes(searchTerm.toLowerCase()) ||
			hook.hookInboxName.toLowerCase().includes(searchTerm.toLowerCase()) ||
			hook.agentName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
			hook.projectId?.toLowerCase().includes(searchTerm.toLowerCase());

		const matchesApp =
			filterApp === "all" ||
			(filterApp === "dialogflow" && hook.isDialogflow) ||
			(filterApp === "other" && !hook.isDialogflow);

		const matchesStatus =
			filterStatus === "all" ||
			(filterStatus === "active" && hook.hookStatus) ||
			(filterStatus === "inactive" && !hook.hookStatus);

		const matchesUser =
			filterUser === "all" ||
			(filterUser === "local" && hook.isLocalUser) ||
			(filterUser === "external" && hook.isExternalUser);

		return matchesSearch && matchesApp && matchesStatus && matchesUser;
	});

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleString("pt-BR");
	};

	const getStatusIcon = (status: boolean) => {
		return status ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />;
	};

	const getStatusBadge = (status: boolean) => {
		return status ? (
			<Badge variant="default" className="bg-green-100 text-green-800">
				<CheckCircle className="h-3 w-3 mr-1" />
				Ativo
			</Badge>
		) : (
			<Badge variant="secondary" className="bg-red-100 text-red-800">
				<XCircle className="h-3 w-3 mr-1" />
				Inativo
			</Badge>
		);
	};

	const getUserTypeBadge = (isLocal: boolean) => {
		return isLocal ? (
			<Badge variant="outline" className="bg-blue-50 text-blue-700">
				<User className="h-3 w-3 mr-1" />
				Local
			</Badge>
		) : (
			<Badge variant="outline" className="bg-orange-50 text-orange-700">
				<Globe className="h-3 w-3 mr-1" />
				Externo
			</Badge>
		);
	};

	if (status === "loading") {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="text-center">
					<RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
					<p>Carregando...</p>
				</div>
			</div>
		);
	}

	if (!session?.user?.id) {
		return null;
	}

	return (
		<div className="container mx-auto p-6 space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold">Debug - Lista de Hooks Chatwit</h1>
					<p className="text-muted-foreground">Visualização completa de TODOS os hooks do Chatwit (origem completa)</p>
				</div>
				<Button onClick={fetchHooks} disabled={loading}>
					<RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
					{loading ? "Buscando..." : "Atualizar"}
				</Button>
			</div>

			{/* Estatísticas */}
			{stats && (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-8 gap-4">
					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-sm font-medium">Total Usuários</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold flex items-center">
								<Users className="h-4 w-4 mr-2 text-blue-500" />
								{stats.totalUsuarios}
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-sm font-medium">Total Contas</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold flex items-center">
								<Database className="h-4 w-4 mr-2 text-indigo-500" />
								{stats.totalContas}
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-sm font-medium">Total Caixas</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold flex items-center">
								<MessageCircle className="h-4 w-4 mr-2 text-purple-500" />
								{stats.totalCaixas}
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-sm font-medium">Total Hooks</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold flex items-center">
								<Zap className="h-4 w-4 mr-2 text-yellow-500" />
								{stats.totalHooks}
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-sm font-medium">Dialogflow</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold flex items-center">
								<Database className="h-4 w-4 mr-2 text-green-500" />
								{stats.hooksDialogflow}
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-sm font-medium">Ativos</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold flex items-center text-green-600">
								<CheckCircle className="h-4 w-4 mr-2" />
								{stats.hooksAtivos}
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-sm font-medium">Locais</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold flex items-center text-blue-600">
								<User className="h-4 w-4 mr-2" />
								{stats.hooksLocais}
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-sm font-medium">Externos</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold flex items-center text-orange-600">
								<Globe className="h-4 w-4 mr-2" />
								{stats.hooksExternos}
							</div>
						</CardContent>
					</Card>
				</div>
			)}

			{/* Filtros */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center">
						<Filter className="h-5 w-5 mr-2" />
						Filtros
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
						<div>
							<Label htmlFor="search">Buscar</Label>
							<div className="relative">
								<Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
								<Input
									id="search"
									placeholder="Usuário, conta, app, inbox, agente..."
									value={searchTerm}
									onChange={(e) => setSearchTerm(e.target.value)}
									className="pl-10"
								/>
							</div>
						</div>

						<div>
							<Label htmlFor="filterApp">Tipo de App</Label>
							<select
								id="filterApp"
								value={filterApp}
								onChange={(e) => setFilterApp(e.target.value)}
								className="w-full p-2 border rounded-md"
							>
								<option value="all">Todos os Apps</option>
								<option value="dialogflow">Dialogflow</option>
								<option value="other">Outros</option>
							</select>
						</div>

						<div>
							<Label htmlFor="filterStatus">Status</Label>
							<select
								id="filterStatus"
								value={filterStatus}
								onChange={(e) => setFilterStatus(e.target.value)}
								className="w-full p-2 border rounded-md"
							>
								<option value="all">Todos os Status</option>
								<option value="active">Ativos</option>
								<option value="inactive">Inativos</option>
							</select>
						</div>

						<div>
							<Label htmlFor="filterUser">Tipo de Usuário</Label>
							<select
								id="filterUser"
								value={filterUser}
								onChange={(e) => setFilterUser(e.target.value)}
								className="w-full p-2 border rounded-md"
							>
								<option value="all">Todos os Usuários</option>
								<option value="local">Usuários Locais</option>
								<option value="external">Usuários Externos</option>
							</select>
						</div>
					</div>

					{lastFetch && (
						<div className="text-sm text-muted-foreground">Última atualização: {formatDate(lastFetch)}</div>
					)}
				</CardContent>
			</Card>

			{/* Tabs */}
			<Tabs defaultValue="hooks" className="space-y-4">
				<TabsList>
					<TabsTrigger value="hooks">Hooks ({filteredHooks.length})</TabsTrigger>
					<TabsTrigger value="errors">Erros ({errors.length})</TabsTrigger>
				</TabsList>

				<TabsContent value="hooks" className="space-y-4">
					{filteredHooks.length === 0 ? (
						<Card>
							<CardContent className="flex items-center justify-center py-8">
								<div className="text-center">
									<Info className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
									<p className="text-muted-foreground">Nenhum hook encontrado com os filtros atuais</p>
								</div>
							</CardContent>
						</Card>
					) : (
						<div className="space-y-4">
							{filteredHooks.map((hook, index) => (
								<Card key={`${hook.usuarioId}-${hook.appId}-${hook.hookId}`}>
									<CardHeader>
										<div className="flex items-center justify-between">
											<div className="flex items-center space-x-2">
												{getStatusIcon(hook.hookStatus)}
												<CardTitle className="text-lg">
													{hook.agentName || hook.appName} - {hook.hookInboxName}
												</CardTitle>
											</div>
											<div className="flex items-center space-x-2">
												{getStatusBadge(hook.hookStatus)}
												{getUserTypeBadge(hook.isLocalUser)}
												{hook.isDialogflow && (
													<Badge variant="outline" className="bg-blue-50">
														Dialogflow
													</Badge>
												)}
											</div>
										</div>
										<CardDescription>
											<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
												<span>
													Usuário: {hook.usuarioName} ({hook.usuarioEmail})
												</span>
												<span>
													Conta: {hook.accountName} (ID: {hook.accountId})
												</span>
												<span>
													Caixa: {hook.inboxName} ({hook.inboxChannel})
												</span>
												<span>Hook ID: {hook.hookId}</span>
											</div>
										</CardDescription>
									</CardHeader>
									<CardContent>
										<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
											<div>
												<Label className="text-sm font-medium">Conta</Label>
												<p className="text-sm">
													{hook.accountName} (ID: {hook.accountId})
												</p>
											</div>

											<div>
												<Label className="text-sm font-medium">Caixa</Label>
												<p className="text-sm">
													{hook.inboxName} ({hook.inboxChannel})
												</p>
											</div>

											<div>
												<Label className="text-sm font-medium">App</Label>
												<p className="text-sm">
													{hook.appName} ({hook.appId})
												</p>
											</div>

											<div>
												<Label className="text-sm font-medium">Hook Inbox</Label>
												<p className="text-sm">
													{hook.hookInboxName} (ID: {hook.hookInboxId})
												</p>
											</div>

											{hook.isDialogflow && (
												<>
													<div>
														<Label className="text-sm font-medium">Project ID</Label>
														<p className="text-sm font-mono">{hook.projectId || "N/A"}</p>
													</div>

													<div>
														<Label className="text-sm font-medium">Região</Label>
														<p className="text-sm">{hook.region || "global"}</p>
													</div>

													<div>
														<Label className="text-sm font-medium">Credenciais</Label>
														<p className="text-sm">
															{hook.hasCredentials ? (
																<Badge variant="outline" className="bg-green-50 text-green-700">
																	Configuradas
																</Badge>
															) : (
																<Badge variant="outline" className="bg-red-50 text-red-700">
																	Não configuradas
																</Badge>
															)}
														</p>
													</div>
												</>
											)}

											<div>
												<Label className="text-sm font-medium">Criado em</Label>
												<p className="text-sm">{formatDate(hook.hookCreatedAt)}</p>
											</div>

											<div>
												<Label className="text-sm font-medium">Atualizado em</Label>
												<p className="text-sm">{formatDate(hook.hookUpdatedAt)}</p>
											</div>
										</div>

										{hook.hookSettings && (
											<div className="mt-4">
												<Label className="text-sm font-medium">Configurações</Label>
												<ScrollArea className="h-32 w-full border rounded-md p-2">
													<pre className="text-xs">{JSON.stringify(hook.hookSettings, null, 2)}</pre>
												</ScrollArea>
											</div>
										)}
									</CardContent>
								</Card>
							))}
						</div>
					)}
				</TabsContent>

				<TabsContent value="errors" className="space-y-4">
					{errors.length === 0 ? (
						<Card>
							<CardContent className="flex items-center justify-center py-8">
								<div className="text-center">
									<CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
									<p className="text-muted-foreground">Nenhum erro encontrado</p>
								</div>
							</CardContent>
						</Card>
					) : (
						<div className="space-y-4">
							{errors.map((error, index) => (
								<Card key={index} className="border-red-200">
									<CardHeader>
										<CardTitle className="text-red-600 flex items-center">
											<AlertCircle className="h-5 w-5 mr-2" />
											Erro ao buscar hooks
										</CardTitle>
										<CardDescription>
											{error.accountName && `Conta: ${error.accountName} (ID: ${error.accountId})`}
											{error.usuarioName && ` | Usuário: ${error.usuarioName}`}
										</CardDescription>
									</CardHeader>
									<CardContent>
										<div className="space-y-2">
											<div>
												<Label className="text-sm font-medium">Erro</Label>
												<p className="text-sm text-red-600">{error.error}</p>
											</div>

											{error.status && (
												<div>
													<Label className="text-sm font-medium">Status HTTP</Label>
													<p className="text-sm">{error.status}</p>
												</div>
											)}

											{error.data && (
												<div>
													<Label className="text-sm font-medium">Detalhes</Label>
													<ScrollArea className="h-24 w-full border rounded-md p-2">
														<pre className="text-xs">{JSON.stringify(error.data, null, 2)}</pre>
													</ScrollArea>
												</div>
											)}
										</div>
									</CardContent>
								</Card>
							))}
						</div>
					)}
				</TabsContent>
			</Tabs>
		</div>
	);
}
