"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	PieChart,
	Pie,
	Cell,
	LineChart,
	Line,
	Area,
	AreaChart,
} from "recharts";
import {
	Calendar,
	Filter,
	TrendingUp,
	PieChart as PieChartIcon,
	BarChart3,
	Activity,
	RefreshCw,
	Download,
} from "lucide-react";
import { toast } from "sonner";
import { DateRange } from "react-day-picker";
import { addDays, format } from "date-fns";

interface CostBreakdown {
	breakdown: Array<{
		provider?: string;
		product?: string;
		inboxId?: string;
		userId?: string;
		intent?: string;
		period?: string;
		cost: number;
		events: number;
		units: number;
		currency: string;
	}>;
	stats: {
		totalCost: number;
		totalEvents: number;
		averageCostPerEvent: number;
		uniqueProviders: number;
		uniqueProducts: number;
		currency: string;
	};
	filters: {
		startDate?: string;
		endDate?: string;
		provider?: string;
		product?: string;
		inboxId?: string;
		userId?: string;
		intent?: string;
		groupBy: string;
		period: string;
	};
}

const CHART_COLORS = [
	"#8884d8",
	"#82ca9d",
	"#ffc658",
	"#ff7300",
	"#00ff00",
	"#ff00ff",
	"#00ffff",
	"#ff0000",
	"#0000ff",
	"#ffff00",
];

const PROVIDER_COLORS = {
	OPENAI: "#10b981",
	META_WHATSAPP: "#3b82f6",
	INFRA: "#8b5cf6",
	OTHER: "#6b7280",
};

export function CostBreakdownCharts() {
	const [breakdown, setBreakdown] = useState<CostBreakdown | null>(null);
	const [loading, setLoading] = useState(false);
	const [chartType, setChartType] = useState<"bar" | "pie" | "line" | "area">("bar");
	const [groupBy, setGroupBy] = useState("provider");
	const [period, setPeriod] = useState("day");
	const [dateRange, setDateRange] = useState<DateRange | undefined>({
		from: addDays(new Date(), -7),
		to: new Date(),
	});

	// Filtros
	const [filters, setFilters] = useState({
		provider: "",
		product: "",
		inboxId: "",
		userId: "",
		intent: "",
	});

	const fetchBreakdown = async () => {
		try {
			setLoading(true);

			const params = new URLSearchParams();

			if (dateRange?.from) {
				params.append("startDate", dateRange.from.toISOString());
			}
			if (dateRange?.to) {
				params.append("endDate", dateRange.to.toISOString());
			}

			params.append("groupBy", groupBy);
			params.append("period", period);

			// Adicionar filtros não vazios (excluir "all" que significa todos)
			Object.entries(filters).forEach(([key, value]) => {
				if (value.trim() && value !== "all") {
					params.append(key, value);
				}
			});

			const response = await fetch(`/api/admin/cost-monitoring/breakdown?${params}`, {
				cache: "no-store",
			});

			if (!response.ok) {
				throw new Error("Falha ao carregar breakdown de custos");
			}

			const data = await response.json();
			setBreakdown(data);
		} catch (error: any) {
			console.error("Erro ao carregar breakdown:", error);
			toast.error("Erro ao carregar dados de breakdown");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchBreakdown();
	}, [groupBy, period, dateRange]);

	const formatCurrency = (amount: number, currency = "USD") => {
		return new Intl.NumberFormat("pt-BR", {
			style: "currency",
			currency: currency === "USD" ? "USD" : "BRL",
			minimumFractionDigits: 2,
			maximumFractionDigits: 4,
		}).format(amount);
	};

	const getProviderName = (provider: string) => {
		switch (provider) {
			case "OPENAI":
				return "OpenAI";
			case "META_WHATSAPP":
				return "WhatsApp";
			case "INFRA":
				return "Infraestrutura";
			default:
				return provider;
		}
	};

	const prepareChartData = () => {
		if (!breakdown) return [];

		return breakdown.breakdown.map((item, index) => {
			let label = "";
			let color = CHART_COLORS[index % CHART_COLORS.length];

			switch (groupBy) {
				case "provider":
					label = getProviderName(item.provider || "Unknown");
					color = PROVIDER_COLORS[item.provider as keyof typeof PROVIDER_COLORS] || color;
					break;
				case "product":
					label = `${getProviderName(item.provider || "")} - ${item.product || "Unknown"}`;
					break;
				case "inbox":
					label = item.inboxId || "N/A";
					break;
				case "user":
					label = item.userId || "N/A";
					break;
				case "intent":
					label = item.intent || "N/A";
					break;
				case "period":
					label = item.period ? format(new Date(item.period), "dd/MM HH:mm") : "N/A";
					break;
				default:
					label = "Unknown";
			}

			return {
				name: label,
				cost: item.cost,
				events: item.events,
				units: item.units,
				fill: color,
			};
		});
	};

	const renderChart = () => {
		const data = prepareChartData();

		if (data.length === 0) {
			return (
				<div className="flex items-center justify-center h-64 text-muted-foreground">
					Nenhum dado disponível para o período selecionado
				</div>
			);
		}

		const commonProps = {
			width: "100%",
			height: 400,
			data: data,
		};

		switch (chartType) {
			case "bar":
				return (
					<ResponsiveContainer {...commonProps}>
						<BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
							<CartesianGrid strokeDasharray="3 3" />
							<XAxis dataKey="name" angle={-45} textAnchor="end" height={100} interval={0} />
							<YAxis tickFormatter={(value) => formatCurrency(value)} />
							<Tooltip
								formatter={(value: number) => [formatCurrency(value), "Custo"]}
								labelFormatter={(label) => `${label}`}
							/>
							<Bar dataKey="cost" fill="#8884d8" />
						</BarChart>
					</ResponsiveContainer>
				);

			case "pie":
				return (
					<ResponsiveContainer {...commonProps}>
						<PieChart>
							<Pie
								data={data}
								cx="50%"
								cy="50%"
								labelLine={false}
								label={({ name, percent }) => `${name} (${(percent * 100).toFixed(1)}%)`}
								outerRadius={120}
								fill="#8884d8"
								dataKey="cost"
							>
								{data.map((entry, index) => (
									<Cell key={`cell-${index}`} fill={entry.fill} />
								))}
							</Pie>
							<Tooltip formatter={(value: number) => [formatCurrency(value), "Custo"]} />
						</PieChart>
					</ResponsiveContainer>
				);

			case "line":
				return (
					<ResponsiveContainer {...commonProps}>
						<LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
							<CartesianGrid strokeDasharray="3 3" />
							<XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
							<YAxis tickFormatter={(value) => formatCurrency(value)} />
							<Tooltip formatter={(value: number) => [formatCurrency(value), "Custo"]} />
							<Line type="monotone" dataKey="cost" stroke="#8884d8" strokeWidth={2} dot={{ fill: "#8884d8" }} />
						</LineChart>
					</ResponsiveContainer>
				);

			case "area":
				return (
					<ResponsiveContainer {...commonProps}>
						<AreaChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
							<CartesianGrid strokeDasharray="3 3" />
							<XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
							<YAxis tickFormatter={(value) => formatCurrency(value)} />
							<Tooltip formatter={(value: number) => [formatCurrency(value), "Custo"]} />
							<Area type="monotone" dataKey="cost" stroke="#8884d8" fill="#8884d8" fillOpacity={0.3} />
						</AreaChart>
					</ResponsiveContainer>
				);

			default:
				return null;
		}
	};

	const handleFilterChange = (key: string, value: string) => {
		setFilters((prev) => ({ ...prev, [key]: value }));
	};

	const applyFilters = () => {
		fetchBreakdown();
	};

	const clearFilters = () => {
		setFilters({
			provider: "",
			product: "",
			inboxId: "",
			userId: "",
			intent: "",
		});
		setTimeout(fetchBreakdown, 100);
	};

	return (
		<div className="space-y-6">
			{/* Controles */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<BarChart3 className="h-5 w-5" />
						Análise Detalhada de Custos
					</CardTitle>
					<CardDescription>Visualize custos por diferentes dimensões e períodos</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
						{/* Seletor de agrupamento */}
						<div className="space-y-2">
							<Label>Agrupar por</Label>
							<Select value={groupBy} onValueChange={setGroupBy}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="provider">Provider</SelectItem>
									<SelectItem value="product">Produto</SelectItem>
									<SelectItem value="inbox">Inbox</SelectItem>
									<SelectItem value="user">Usuário</SelectItem>
									<SelectItem value="intent">Intent</SelectItem>
									<SelectItem value="period">Período</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{/* Seletor de período (apenas para agrupamento por período) */}
						{groupBy === "period" && (
							<div className="space-y-2">
								<Label>Granularidade</Label>
								<Select value={period} onValueChange={setPeriod}>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="hour">Por Hora</SelectItem>
										<SelectItem value="day">Por Dia</SelectItem>
										<SelectItem value="week">Por Semana</SelectItem>
										<SelectItem value="month">Por Mês</SelectItem>
									</SelectContent>
								</Select>
							</div>
						)}

						{/* Seletor de tipo de gráfico */}
						<div className="space-y-2">
							<Label>Tipo de Gráfico</Label>
							<Select value={chartType} onValueChange={(value: any) => setChartType(value)}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="bar">Barras</SelectItem>
									<SelectItem value="pie">Pizza</SelectItem>
									<SelectItem value="line">Linha</SelectItem>
									<SelectItem value="area">Área</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{/* Seletor de data */}
						<div className="space-y-2">
							<Label>Período</Label>
							<DatePickerWithRange date={dateRange} onDateChange={setDateRange} />
						</div>
					</div>

					{/* Filtros avançados */}
					<div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
						<div className="space-y-2">
							<Label>Provider</Label>
							<Select value={filters.provider} onValueChange={(value) => handleFilterChange("provider", value)}>
								<SelectTrigger>
									<SelectValue placeholder="Todos" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">Todos</SelectItem>
									<SelectItem value="OPENAI">OpenAI</SelectItem>
									<SelectItem value="META_WHATSAPP">WhatsApp</SelectItem>
									<SelectItem value="INFRA">Infraestrutura</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label>Produto</Label>
							<Input
								placeholder="Filtrar por produto"
								value={filters.product}
								onChange={(e) => handleFilterChange("product", e.target.value)}
							/>
						</div>

						<div className="space-y-2">
							<Label>Inbox ID</Label>
							<Input
								placeholder="Filtrar por inbox"
								value={filters.inboxId}
								onChange={(e) => handleFilterChange("inboxId", e.target.value)}
							/>
						</div>

						<div className="space-y-2">
							<Label>User ID</Label>
							<Input
								placeholder="Filtrar por usuário"
								value={filters.userId}
								onChange={(e) => handleFilterChange("userId", e.target.value)}
							/>
						</div>

						<div className="space-y-2">
							<Label>Intent</Label>
							<Input
								placeholder="Filtrar por intent"
								value={filters.intent}
								onChange={(e) => handleFilterChange("intent", e.target.value)}
							/>
						</div>
					</div>

					<div className="flex gap-2">
						<Button onClick={applyFilters} disabled={loading}>
							<Filter className="h-4 w-4 mr-1" />
							Aplicar Filtros
						</Button>
						<Button variant="outline" onClick={clearFilters}>
							Limpar Filtros
						</Button>
						<Button variant="outline" onClick={fetchBreakdown} disabled={loading}>
							<RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
							Atualizar
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Estatísticas */}
			{breakdown && (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
					<Card>
						<CardContent className="pt-6">
							<div className="text-2xl font-bold">{formatCurrency(breakdown.stats.totalCost)}</div>
							<p className="text-xs text-muted-foreground">Custo Total</p>
						</CardContent>
					</Card>

					<Card>
						<CardContent className="pt-6">
							<div className="text-2xl font-bold">{breakdown.stats.totalEvents.toLocaleString()}</div>
							<p className="text-xs text-muted-foreground">Total de Eventos</p>
						</CardContent>
					</Card>

					<Card>
						<CardContent className="pt-6">
							<div className="text-2xl font-bold">{formatCurrency(breakdown.stats.averageCostPerEvent)}</div>
							<p className="text-xs text-muted-foreground">Custo Médio/Evento</p>
						</CardContent>
					</Card>

					<Card>
						<CardContent className="pt-6">
							<div className="text-2xl font-bold">{breakdown.stats.uniqueProviders}</div>
							<p className="text-xs text-muted-foreground">Providers Únicos</p>
						</CardContent>
					</Card>

					<Card>
						<CardContent className="pt-6">
							<div className="text-2xl font-bold">{breakdown.stats.uniqueProducts}</div>
							<p className="text-xs text-muted-foreground">Produtos Únicos</p>
						</CardContent>
					</Card>
				</div>
			)}

			{/* Gráfico */}
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle>
								Breakdown de Custos -{" "}
								{groupBy === "provider"
									? "Por Provider"
									: groupBy === "product"
										? "Por Produto"
										: groupBy === "inbox"
											? "Por Inbox"
											: groupBy === "user"
												? "Por Usuário"
												: groupBy === "intent"
													? "Por Intent"
													: "Por Período"}
							</CardTitle>
							<CardDescription>
								{dateRange?.from &&
									dateRange?.to &&
									`${format(dateRange.from, "dd/MM/yyyy")} - ${format(dateRange.to, "dd/MM/yyyy")}`}
							</CardDescription>
						</div>
						<Button variant="outline">
							<Download className="h-4 w-4 mr-1" />
							Exportar
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					{loading ? (
						<div className="flex items-center justify-center h-64">
							<RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
							<span className="ml-2 text-muted-foreground">Carregando dados...</span>
						</div>
					) : (
						renderChart()
					)}
				</CardContent>
			</Card>
		</div>
	);
}
