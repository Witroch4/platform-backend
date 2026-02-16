"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Search, Filter, Calendar, User, Activity } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AuditLog {
	id: string;
	action: string;
	resourceType: string;
	resourceId?: string;
	queueName?: string;
	details?: any;
	ipAddress?: string;
	userAgent?: string;
	createdAt: string;
	user: {
		id: string;
		name?: string;
		email: string;
	};
}

interface AuditLogResponse {
	logs: AuditLog[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
}

export default function AuditLogsViewer() {
	const [logs, setLogs] = useState<AuditLog[]>([]);
	const [loading, setLoading] = useState(true);
	const [pagination, setPagination] = useState({
		page: 1,
		limit: 50,
		total: 0,
		totalPages: 0,
	});

	// Filtros
	const [filters, setFilters] = useState({
		action: "",
		resource: "",
		userId: "",
		startDate: "",
		endDate: "",
	});

	useEffect(() => {
		fetchLogs();
	}, [pagination.page, filters]);

	const fetchLogs = async () => {
		setLoading(true);
		try {
			const params = new URLSearchParams({
				page: pagination.page.toString(),
				limit: pagination.limit.toString(),
				...Object.fromEntries(Object.entries(filters).filter(([_, value]) => value !== "" && value !== "all")),
			});

			const response = await fetch(`/api/admin/queue-management/audit-logs?${params}`);
			if (response.ok) {
				const data: AuditLogResponse = await response.json();
				setLogs(data.logs);
				setPagination(data.pagination);
			}
		} catch (error) {
			console.error("Erro ao buscar logs de auditoria:", error);
		} finally {
			setLoading(false);
		}
	};

	const handleFilterChange = (key: string, value: string) => {
		setFilters((prev) => ({ ...prev, [key]: value }));
		setPagination((prev) => ({ ...prev, page: 1 })); // Reset para primeira página
	};

	const clearFilters = () => {
		setFilters({
			action: "",
			resource: "",
			userId: "",
			startDate: "",
			endDate: "",
		});
	};

	const getActionBadgeColor = (action: string) => {
		switch (action) {
			case "QUEUE_PAUSED":
				return "bg-yellow-500";
			case "QUEUE_RESUMED":
				return "bg-green-500";
			case "QUEUE_RETRY_FAILED":
				return "bg-blue-500";
			case "QUEUE_CLEANED":
				return "bg-red-500";
			default:
				return "bg-gray-500";
		}
	};

	const formatActionName = (action: string) => {
		const actionMap: Record<string, string> = {
			QUEUE_PAUSED: "Fila Pausada",
			QUEUE_RESUMED: "Fila Retomada",
			QUEUE_RETRY_FAILED: "Retry de Jobs Falhados",
			QUEUE_CLEANED: "Fila Limpa",
		};
		return actionMap[action] || action;
	};

	return (
		<div className="space-y-6">
			{/* Filtros */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center">
						<Filter className="h-5 w-5 mr-2" />
						Filtros
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
						<Select value={filters.action} onValueChange={(value) => handleFilterChange("action", value)}>
							<SelectTrigger>
								<SelectValue placeholder="Ação" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">Todas as ações</SelectItem>
								<SelectItem value="QUEUE_PAUSED">Fila Pausada</SelectItem>
								<SelectItem value="QUEUE_RESUMED">Fila Retomada</SelectItem>
								<SelectItem value="QUEUE_RETRY_FAILED">Retry de Jobs</SelectItem>
								<SelectItem value="QUEUE_CLEANED">Fila Limpa</SelectItem>
							</SelectContent>
						</Select>

						<Select value={filters.resource} onValueChange={(value) => handleFilterChange("resource", value)}>
							<SelectTrigger>
								<SelectValue placeholder="Recurso" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">Todos os recursos</SelectItem>
								<SelectItem value="queue">Fila</SelectItem>
								<SelectItem value="job">Job</SelectItem>
								<SelectItem value="system">Sistema</SelectItem>
							</SelectContent>
						</Select>

						<Input
							type="date"
							placeholder="Data inicial"
							value={filters.startDate}
							onChange={(e) => handleFilterChange("startDate", e.target.value)}
						/>

						<Input
							type="date"
							placeholder="Data final"
							value={filters.endDate}
							onChange={(e) => handleFilterChange("endDate", e.target.value)}
						/>

						<Button variant="outline" onClick={clearFilters}>
							Limpar Filtros
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Tabela de Logs */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center justify-between">
						<span className="flex items-center">
							<Activity className="h-5 w-5 mr-2" />
							Logs de Auditoria
						</span>
						<span className="text-sm font-normal text-gray-500">Total: {pagination.total} registros</span>
					</CardTitle>
				</CardHeader>
				<CardContent>
					{loading ? (
						<div className="flex items-center justify-center h-32">
							<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
							<span className="ml-2">Carregando logs...</span>
						</div>
					) : (
						<>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Data/Hora</TableHead>
										<TableHead>Usuário</TableHead>
										<TableHead>Ação</TableHead>
										<TableHead>Recurso</TableHead>
										<TableHead>ID do Recurso</TableHead>
										<TableHead>IP</TableHead>
										<TableHead>Detalhes</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{logs.map((log) => (
										<TableRow key={log.id}>
											<TableCell className="font-mono text-sm">
												{format(new Date(log.createdAt), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
											</TableCell>
											<TableCell>
												<div className="flex items-center">
													<User className="h-4 w-4 mr-2 text-gray-400" />
													<div>
														<div className="font-medium">{log.user.name || "N/A"}</div>
														<div className="text-sm text-gray-500">{log.user.email}</div>
													</div>
												</div>
											</TableCell>
											<TableCell>
												<Badge className={getActionBadgeColor(log.action)}>{formatActionName(log.action)}</Badge>
											</TableCell>
											<TableCell className="capitalize">{log.resourceType}</TableCell>
											<TableCell className="font-mono text-sm">{log.resourceId || "-"}</TableCell>
											<TableCell className="font-mono text-sm">{log.ipAddress || "-"}</TableCell>
											<TableCell>
												{log.details && (
													<details className="cursor-pointer">
														<summary className="text-blue-600 hover:text-blue-800">Ver detalhes</summary>
														<pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto max-w-xs">
															{JSON.stringify(log.details, null, 2)}
														</pre>
													</details>
												)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>

							{/* Paginação */}
							<div className="flex items-center justify-between mt-4">
								<div className="text-sm text-gray-500">
									Mostrando {(pagination.page - 1) * pagination.limit + 1} a{" "}
									{Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total} registros
								</div>
								<div className="flex items-center space-x-2">
									<Button
										variant="outline"
										onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
										disabled={pagination.page <= 1}
									>
										<ChevronLeft className="h-4 w-4" />
										Anterior
									</Button>
									<span className="text-sm">
										Página {pagination.page} de {pagination.totalPages}
									</span>
									<Button
										variant="outline"
										onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
										disabled={pagination.page >= pagination.totalPages}
									>
										Próxima
										<ChevronRight className="h-4 w-4" />
									</Button>
								</div>
							</div>
						</>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
