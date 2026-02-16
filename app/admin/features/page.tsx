"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
	Loader2,
	Zap,
	Users,
	Activity,
	Settings,
	Cpu,
	Brain,
	Flag,
	Info,
	TrendingUp,
	Clock,
	CheckCircle,
	XCircle,
	AlertTriangle,
	BarChart3,
	Gauge,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "next-auth/react";
import { FeatureFlagCard } from "@/components/admin/feature-flags/FeatureFlagCard";
import { UserFlagOverrideDialog } from "@/components/admin/feature-flags/UserFlagOverrideDialog";
import { FeatureFlagMetricsDashboard } from "@/components/admin/feature-flags/FeatureFlagMetricsDashboard";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";

interface User {
	id: string;
	name: string | null;
	email: string;
	role: string;
	turboModeEnabled?: boolean;
	flashIntentEnabled?: boolean;
	turboModeActivatedAt?: string | null;
	turboModeUpdatedAt?: string | null;
}

interface DashboardMetrics {
	flashIntent: {
		enabled: boolean;
		totalUsers: number;
		enabledUsers: number;
		components: {
			newWebhookProcessing: boolean;
			highPriorityQueue: boolean;
			lowPriorityQueue: boolean;
			unifiedLeadModel: boolean;
			intelligentCaching: boolean;
			applicationMonitoring: boolean;
		};
	};
	turboMode: {
		totalUsers: number;
		turboEnabledUsers: number;
		totalSessions: number;
		timeSavedMinutes: number;
		avgSpeedImprovement: number;
		successRate: number;
	};
	system: {
		featureFlags: {
			total: number;
			active: number;
			categories: { [key: string]: number };
		};
		performance: {
			avgResponseTime: number;
			systemLoad: number;
			errorRate: number;
		};
		queues: {
			respostaRapida: boolean;
			persistenciaCredenciais: boolean;
		};
	};
}

interface FeatureFlag {
	id: string;
	name: string;
	description: string;
	category: string;
	enabled: boolean;
	rolloutPercentage: number;
	userSpecific: boolean;
	systemCritical: boolean;
	metadata: Record<string, any>;
	createdAt: string;
	updatedAt: string;
	userOverrides?: any[];
	metrics?: any[];
}

export default function FeatureDashboardPage() {
	const { data: session, status } = useSession();
	const [users, setUsers] = useState<User[]>([]);
	const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics | null>(null);
	const [loading, setLoading] = useState(true);
	const [updating, setUpdating] = useState<string | null>(null);
	const [searchTerm, setSearchTerm] = useState("");
	const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);

	// SUPERADMIN role verification
	if (status === "loading") {
		return (
			<div className="container mx-auto py-10">
				<div className="flex items-center justify-center">
					<Loader2 className="h-8 w-8 animate-spin" />
				</div>
			</div>
		);
	}

	if (!session?.user || session.user.role !== "SUPERADMIN") {
		return (
			<div className="container mx-auto py-10">
				<Card>
					<CardContent className="p-8 text-center">
						<h2 className="text-2xl font-bold text-destructive mb-4">Acesso Negado</h2>
						<p className="text-muted-foreground">Você precisa ter permissões de SUPERADMIN para acessar esta página.</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	useEffect(() => {
		if (session?.user?.role === "SUPERADMIN") {
			loadData();
		}
	}, [session]);

	const loadData = async () => {
		try {
			setLoading(true);

			// Carregar dados em paralelo
			await Promise.all([loadUsers(), loadDashboardMetrics(), loadFeatureFlags()]);
		} catch (error) {
			console.error("Erro ao carregar dados:", error);
			toast.error("Erro ao carregar dados da página");
		} finally {
			setLoading(false);
		}
	};

	const loadUsers = async () => {
		try {
			// Carregar usuários com dados de ambas as features
			const [turboResponse, flashResponse] = await Promise.all([
				fetch("/api/admin/turbo-mode/users/status"),
				fetch("/api/admin/resposta-rapida/users"),
			]);

			// Verificar se ambas as respostas foram bem-sucedidas
			if (!turboResponse.ok) {
				console.error("Erro na API do Turbo Mode:", turboResponse.status, turboResponse.statusText);
				throw new Error(`Erro ao carregar usuários do Turbo Mode: ${turboResponse.status}`);
			}

			if (!flashResponse.ok) {
				console.error("Erro na API da Resposta Rápida:", flashResponse.status, flashResponse.statusText);
				throw new Error(`Erro ao carregar usuários da Resposta Rápida: ${flashResponse.status}`);
			}

			const turboData = await turboResponse.json();
			const flashData = await flashResponse.json();

			console.log("Dados do Turbo Mode:", turboData);
			console.log("Dados da Resposta Rápida:", flashData);

			// Combinar dados dos usuários
			const turboUsers = turboData.users || [];
			const flashUsers = flashData.users || [];

			console.log("Usuários do Turbo Mode:", turboUsers.length);
			console.log("Usuários da Resposta Rápida:", flashUsers.length);

			// Criar um mapa dos usuários da Resposta Rápida para facilitar a busca
			const flashUsersMap = new Map(flashUsers.map((user: any) => [user.id, user]));

			const combinedUsers = turboUsers.map((turboUser: any) => {
				const flashUser = flashUsersMap.get(turboUser.id);
				return {
					id: turboUser.id,
					name: turboUser.name,
					email: turboUser.email,
					role: turboUser.role,
					turboModeEnabled: turboUser.turboModeEnabled || false,
					flashIntentEnabled: (flashUser as any)?.flashIntentEnabled || false,
					config: turboUser.config || undefined,
				};
			});

			console.log("Usuários combinados:", combinedUsers.length);
			setUsers(combinedUsers);
		} catch (error) {
			console.error("Erro ao carregar usuários:", error);
			// Em caso de erro, tentar carregar apenas os usuários da Resposta Rápida
			try {
				const flashResponse = await fetch("/api/admin/resposta-rapida/users");
				if (flashResponse.ok) {
					const flashData = await flashResponse.json();
					const flashUsers = flashData.users || [];
					const fallbackUsers = flashUsers.map((user: any) => ({
						id: user.id,
						name: user.name,
						email: user.email,
						role: user.role,
						turboModeEnabled: false,
						flashIntentEnabled: user.flashIntentEnabled || false,
						config: undefined,
					}));
					setUsers(fallbackUsers);
				}
			} catch (fallbackError) {
				console.error("Erro no fallback:", fallbackError);
				setUsers([]);
			}
		}
	};

	const loadDashboardMetrics = async () => {
		try {
			// Carregar todas as métricas em paralelo
			const [flagsResponse, turboMetricsResponse, flashStatusResponse, statsResponse] = await Promise.all([
				fetch("/api/admin/feature-flags"),
				fetch("/api/admin/turbo-mode/dashboard-metrics"),
				fetch("/api/admin/resposta-rapida/global-status"),
				fetch("/api/admin/resposta-rapida/stats"),
			]);

			if (!flagsResponse.ok) throw new Error("Erro ao carregar feature flags");

			const flagsData = await flagsResponse.json();
			const flags = flagsData.flags || [];
			const activeFlags = flags.filter((f: FeatureFlag) => f.enabled);
			const categories = flags.reduce((acc: { [key: string]: number }, flag: FeatureFlag) => {
				acc[flag.category] = (acc[flag.category] || 0) + 1;
				return acc;
			}, {});

			// Combinar dados das métricas
			const turboMetrics = turboMetricsResponse.ok ? await turboMetricsResponse.json() : null;
			const flashStatus = flashStatusResponse.ok ? await flashStatusResponse.json() : null;
			const stats = statsResponse.ok ? await statsResponse.json() : null;

			setDashboardMetrics({
				flashIntent: {
					enabled: flashStatus?.enabled || false,
					totalUsers: stats?.totalUsers || 0,
					enabledUsers: stats?.flashIntentEnabledUsers || 0,
					components: flashStatus?.components || {
						newWebhookProcessing: false,
						highPriorityQueue: false,
						lowPriorityQueue: false,
						unifiedLeadModel: false,
						intelligentCaching: false,
						applicationMonitoring: false,
					},
				},
				turboMode: turboMetrics?.turboMetrics || {
					totalUsers: 0,
					turboEnabledUsers: 0,
					totalSessions: 0,
					timeSavedMinutes: 0,
					avgSpeedImprovement: 0,
					successRate: 0,
				},
				system: {
					featureFlags: {
						total: flags.length,
						active: activeFlags.length,
						categories,
					},
					performance: turboMetrics?.performance || {
						avgResponseTime: 250,
						systemLoad: 65,
						errorRate: 0.02,
					},
					queues: {
						respostaRapida: stats?.queueHealth?.respostaRapida || false,
						persistenciaCredenciais: stats?.queueHealth?.persistenciaCredenciais || false,
					},
				},
			});
		} catch (error) {
			console.error("Erro ao carregar métricas do dashboard:", error);
		}
	};

	const loadFeatureFlags = async () => {
		try {
			const response = await fetch("/api/admin/feature-flags");
			if (!response.ok) throw new Error("Erro ao carregar feature flags");
			const data = await response.json();
			setFeatureFlags(data.flags);
		} catch (error) {
			console.error("Erro ao carregar feature flags:", error);
			toast.error("Erro ao carregar feature flags");
		}
	};

	const toggleUserTurboMode = async (userId: string, enabled: boolean) => {
		try {
			setUpdating(userId);

			const response = await fetch("/api/admin/turbo-mode/user/toggle", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ userId, enabled }),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Erro ao alterar Modo Turbo");
			}

			// Atualizar estado local
			setUsers((prev) => prev.map((user) => (user.id === userId ? { ...user, turboModeEnabled: enabled } : user)));

			toast.success(enabled ? "Modo Turbo ativado para o usuário" : "Modo Turbo desativado para o usuário");

			// Recarregar métricas
			await loadDashboardMetrics();
		} catch (error) {
			console.error("Erro ao alterar Modo Turbo:", error);
			toast.error(error instanceof Error ? error.message : "Erro ao alterar Modo Turbo");
		} finally {
			setUpdating(null);
		}
	};

	const openUserFeaturesPage = (userId: string) => {
		window.location.href = `/admin/features/${userId}`;
	};

	const toggleUserFlashIntent = async (userId: string, enabled: boolean) => {
		try {
			setUpdating(userId);

			const response = await fetch("/api/admin/resposta-rapida/toggle-user", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ userId, enabled }),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Erro ao alterar Respostas Rápidas");
			}

			// Atualizar estado local
			setUsers((prev) => prev.map((user) => (user.id === userId ? { ...user, flashIntentEnabled: enabled } : user)));

			toast.success(
				enabled ? "Respostas Rápidas ativadas para o usuário" : "Respostas Rápidas desativadas para o usuário",
			);

			// Recarregar métricas
			await loadDashboardMetrics();
		} catch (error) {
			console.error("Erro ao alterar Respostas Rápidas:", error);
			toast.error(error instanceof Error ? error.message : "Erro ao alterar Respostas Rápidas");
		} finally {
			setUpdating(null);
		}
	};

	const toggleUserFeatureFlag = async (flagId: string, userId: string, enabled: boolean) => {
		try {
			setUpdating(flagId);

			const response = await fetch("/api/admin/feature-flags/user-overrides", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ flagId, userId, enabled }),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Erro ao alterar feature flag do usuário");
			}

			// Atualizar estado local das feature flags com o novo override
			setFeatureFlags((prev) =>
				prev.map((flag) => {
					if (flag.id === flagId) {
						const updatedOverrides = flag.userOverrides || [];
						const existingOverrideIndex = updatedOverrides.findIndex((o) => o.userId === userId);

						if (existingOverrideIndex >= 0) {
							updatedOverrides[existingOverrideIndex] = { ...updatedOverrides[existingOverrideIndex], enabled };
						} else {
							updatedOverrides.push({ userId, flagId, enabled });
						}

						return { ...flag, userOverrides: updatedOverrides };
					}
					return flag;
				}),
			);

			toast.success(enabled ? "Feature ativada para o usuário" : "Feature desativada para o usuário");
		} catch (error) {
			console.error("Erro ao alterar feature flag do usuário:", error);
			toast.error(error instanceof Error ? error.message : "Erro ao alterar feature flag do usuário");
		} finally {
			setUpdating(null);
		}
	};

	const toggleFeatureFlag = async (flagId: string, enabled: boolean) => {
		try {
			setUpdating(flagId);

			const response = await fetch(`/api/admin/feature-flags/${flagId}`, {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ enabled }),
			});

			if (!response.ok) throw new Error("Erro ao atualizar feature flag");

			// Atualizar estado local
			setFeatureFlags((prev) => prev.map((flag) => (flag.id === flagId ? { ...flag, enabled } : flag)));

			toast.success(enabled ? "Feature flag ativada com sucesso" : "Feature flag desativada com sucesso");

			// Recarregar métricas
			await loadDashboardMetrics();
		} catch (error) {
			console.error("Erro ao atualizar feature flag:", error);
			toast.error("Erro ao atualizar feature flag");
		} finally {
			setUpdating(null);
		}
	};

	const filteredUsers = users.filter(
		(user) =>
			user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
			user.email.toLowerCase().includes(searchTerm.toLowerCase()),
	);

	// Componente de Dashboard Unificado
	const UnifiedDashboard = () => (
		<div className="space-y-6">
			{/* Cards de Métricas Principais */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
				{/* Feature Flags */}
				<Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
					<CardContent className="p-6">
						<div className="flex items-center gap-2">
							<Flag className="h-8 w-8 text-blue-600 dark:text-blue-400" />
							<div>
								<p className="text-sm font-medium text-blue-700 dark:text-blue-300">Feature Flags</p>
								<p className="text-3xl font-bold text-blue-800 dark:text-blue-200">
									{dashboardMetrics?.system.featureFlags.active || 0}/{dashboardMetrics?.system.featureFlags.total || 0}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Respostas Rápidas */}
				<Card className="border-yellow-200 bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-950 dark:to-yellow-900">
					<CardContent className="p-6">
						<div className="flex items-center gap-2">
							<Zap className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
							<div>
								<p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">Respostas Rápidas</p>
								<p className="text-3xl font-bold text-yellow-800 dark:text-yellow-200">
									{dashboardMetrics?.flashIntent.enabledUsers || 0}
								</p>
								<p className="text-xs text-yellow-600 dark:text-yellow-400">usuários ativos</p>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Modo Turbo */}
				<Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900">
					<CardContent className="p-6">
						<div className="flex items-center gap-2">
							<Gauge className="h-8 w-8 text-purple-600 dark:text-purple-400" />
							<div>
								<p className="text-sm font-medium text-purple-700 dark:text-purple-300">Modo Turbo</p>
								<p className="text-3xl font-bold text-purple-800 dark:text-purple-200">
									{dashboardMetrics?.turboMode.turboEnabledUsers || 0}
								</p>
								<p className="text-xs text-purple-600 dark:text-purple-400">usuários ativos</p>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Performance Geral */}
				<Card className="border-green-200 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900">
					<CardContent className="p-6">
						<div className="flex items-center gap-2">
							<Activity className="h-8 w-8 text-green-600 dark:text-green-400" />
							<div>
								<p className="text-sm font-medium text-green-700 dark:text-green-300">Performance</p>
								<p className="text-3xl font-bold text-green-800 dark:text-green-200">
									{dashboardMetrics?.system.performance.avgResponseTime || 0}ms
								</p>
								<p className="text-xs text-green-600 dark:text-green-400">resposta média</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Cards de Status das Features */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Status Flash Intent */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Zap className="h-5 w-5 text-yellow-500" />
							Status Flash Intent (Respostas Rápidas)
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="flex items-center justify-between">
							<span className="text-sm">Status Global</span>
							<Badge variant={dashboardMetrics?.flashIntent.enabled ? "default" : "secondary"}>
								{dashboardMetrics?.flashIntent.enabled ? "Ativa" : "Inativa"}
							</Badge>
						</div>

						{dashboardMetrics?.flashIntent.components && (
							<div className="space-y-2">
								<p className="text-sm font-medium">Componentes:</p>
								{Object.entries(dashboardMetrics.flashIntent.components).map(([key, enabled]) => (
									<div key={key} className="flex items-center justify-between text-xs">
										<span className="capitalize">{key.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
										<Badge variant={enabled ? "default" : "outline"} className="text-xs">
											{enabled ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
										</Badge>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>

				{/* Status Sistema & Filas */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Settings className="h-5 w-5 text-gray-500" />
							Status do Sistema
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="flex items-center justify-between">
							<span className="text-sm">Fila Resposta Rápida</span>
							<Badge variant={dashboardMetrics?.system.queues.respostaRapida ? "default" : "destructive"}>
								{dashboardMetrics?.system.queues.respostaRapida ? "Ativa" : "Inativa"}
							</Badge>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-sm">Fila Persistência</span>
							<Badge variant={dashboardMetrics?.system.queues.persistenciaCredenciais ? "default" : "destructive"}>
								{dashboardMetrics?.system.queues.persistenciaCredenciais ? "Ativa" : "Inativa"}
							</Badge>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-sm">Carga do Sistema</span>
							<div className="flex items-center gap-2">
								<Progress value={dashboardMetrics?.system.performance.systemLoad || 0} className="w-20" />
								<span className="text-sm">{dashboardMetrics?.system.performance.systemLoad || 0}%</span>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);

	const UsersManagementSection = () => (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<CardTitle className="text-xl">Gestão de Usuários</CardTitle>
						<CardDescription>
							Configure Respostas Rápidas e Modo Turbo para cada usuário. Clique em um usuário para ver todas as
							features.
						</CardDescription>
					</div>
					<Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
						{users.length} usuários
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				<Input
					placeholder="Buscar usuários por nome ou email..."
					value={searchTerm}
					onChange={(e) => setSearchTerm(e.target.value)}
					className="max-w-md"
				/>

				<ScrollArea className="h-[500px] pr-4">
					<div className="space-y-3">
						{filteredUsers.map((user) => (
							<div
								key={user.id}
								className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
								onClick={() => openUserFeaturesPage(user.id)}
							>
								<div className="flex items-center gap-3">
									<div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
										<span className="text-white text-lg font-medium">{user.name?.charAt(0).toUpperCase() || "U"}</span>
									</div>
									<div className="flex-1">
										<p className="font-medium text-gray-900 dark:text-gray-100">{user.name || "Sem nome"}</p>
										<p className="text-sm text-gray-600 dark:text-gray-400">{user.email}</p>
										<div className="flex items-center gap-2 mt-2">
											<Badge variant={user.role === "SUPERADMIN" ? "default" : "secondary"} className="text-xs">
												{user.role}
											</Badge>
											{user.flashIntentEnabled && (
												<Badge variant="default" className="text-xs bg-yellow-500 text-white">
													<Zap className="h-3 w-3 mr-1" />
													FLASH
												</Badge>
											)}
											{user.turboModeEnabled && (
												<Badge variant="default" className="text-xs bg-purple-500 text-white">
													<Gauge className="h-3 w-3 mr-1" />
													TURBO
												</Badge>
											)}
										</div>
									</div>
								</div>
								<div className="flex items-center gap-4">
									{/* Flash Intent Toggle */}
									<div className="flex flex-col items-center gap-1">
										<span className="text-xs text-gray-500">Flash</span>
										<Switch
											checked={user.flashIntentEnabled || false}
											onCheckedChange={(enabled) => {
												event?.stopPropagation();
												toggleUserFlashIntent(user.id, enabled);
											}}
											disabled={updating === user.id}
											onClick={(e) => e.stopPropagation()}
										/>
									</div>

									{/* Turbo Mode Toggle */}
									<div className="flex flex-col items-center gap-1">
										<span className="text-xs text-gray-500">Turbo</span>
										<Switch
											checked={user.turboModeEnabled || false}
											onCheckedChange={(enabled) => {
												event?.stopPropagation();
												toggleUserTurboMode(user.id, enabled);
											}}
											disabled={updating === user.id}
											onClick={(e) => e.stopPropagation()}
										/>
									</div>

									{updating === user.id && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
								</div>
							</div>
						))}
					</div>
				</ScrollArea>

				{filteredUsers.length === 0 && (
					<div className="text-center py-8 text-muted-foreground">Nenhum usuário encontrado</div>
				)}
			</CardContent>
		</Card>
	);

	if (loading) {
		return (
			<div className="container mx-auto py-10">
				<div className="flex items-center justify-center">
					<Loader2 className="h-8 w-8 animate-spin" />
				</div>
			</div>
		);
	}

	return (
		<div className="container mx-auto py-6 space-y-6">
			{/* Header */}
			<div className="flex items-center gap-3">
				<Flag className="h-8 w-8 text-blue-500" />
				<div>
					<h1 className="text-3xl font-bold">Dashboard de Features</h1>
					<p className="text-muted-foreground">
						Controle completo de funcionalidades: Respostas Rápidas, Modo Turbo e Feature Flags
					</p>
				</div>
			</div>

			{/* Dashboard Unificado */}
			<UnifiedDashboard />

			{/* Gestão de Usuários */}
			<UsersManagementSection />
		</div>
	);
}
