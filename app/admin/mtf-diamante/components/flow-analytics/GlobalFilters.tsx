"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { DashboardFilters } from "@/types/flow-analytics";
import type { DateRange } from "react-day-picker";
import { mtfDiamanteQueryKeys } from "../../lib/query-keys";

// =============================================================================
// TYPES
// =============================================================================

interface GlobalFiltersProps {
	inboxId: string;
	filters: DashboardFilters;
	onFiltersChange: (filters: Partial<DashboardFilters>) => void;
}

interface FlowOption {
	id: string;
	name: string;
}

// =============================================================================
// FETCHER
// =============================================================================

const fetchFlows = async (url: string): Promise<FlowOption[]> => {
	const res = await fetch(url);
	if (!res.ok) throw new Error("Erro ao carregar dados");
	const json = await res.json();
	if (!json.success) throw new Error(json.error || "Erro");
	return json.data;
};

// =============================================================================
// DATE PRESETS
// =============================================================================

const DATE_PRESETS = [
	{
		label: "Hoje",
		value: "today",
		getRange: () => {
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const tomorrow = new Date(today);
			tomorrow.setDate(tomorrow.getDate() + 1);
			return { start: today, end: tomorrow };
		},
	},
	{
		label: "Últimos 7 dias",
		value: "last_7_days",
		getRange: () => {
			const end = new Date();
			const start = new Date();
			start.setDate(start.getDate() - 7);
			start.setHours(0, 0, 0, 0);
			return { start, end };
		},
	},
	{
		label: "Últimos 30 dias",
		value: "last_30_days",
		getRange: () => {
			const end = new Date();
			const start = new Date();
			start.setDate(start.getDate() - 30);
			start.setHours(0, 0, 0, 0);
			return { start, end };
		},
	},
] as const;

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function GlobalFilters({ inboxId, filters, onFiltersChange }: GlobalFiltersProps) {
	// Fetch flows for the inbox
	const { data: flows } = useQuery<FlowOption[]>({
		queryKey: mtfDiamanteQueryKeys.analytics.flows(inboxId),
		queryFn: () => fetchFlows(`/api/admin/mtf-diamante/flow-admin?inboxId=${inboxId}&dataType=flows`),
		staleTime: 5 * 60 * 1000, // 5min
		refetchOnWindowFocus: false,
	});

	// Current date range for display
	const dateRangeDisplay = useMemo(() => {
		if (!filters.dateRange) return "Selecionar período";

		const { start, end } = filters.dateRange;
		const startStr = format(start, "dd/MM/yyyy", { locale: ptBR });
		const endStr = format(end, "dd/MM/yyyy", { locale: ptBR });

		if (startStr === endStr) return startStr;
		return `${startStr} - ${endStr}`;
	}, [filters.dateRange]);

	// Handle date preset selection
	const handlePresetSelect = (preset: (typeof DATE_PRESETS)[number]["value"]) => {
		const presetConfig = DATE_PRESETS.find((p) => p.value === preset);
		if (presetConfig) {
			const range = presetConfig.getRange();
			onFiltersChange({
				dateRange: {
					...range,
					preset,
				},
			});
		}
	};

	// Handle custom date range selection
	const handleDateRangeSelect = (range: DateRange | undefined) => {
		if (range?.from) {
			onFiltersChange({
				dateRange: {
					start: range.from,
					end: range.to || range.from,
					preset: "custom",
				},
			});
		}
	};

	// Handle flow selection
	const handleFlowSelect = (flowId: string) => {
		onFiltersChange({
			flowId: flowId === "all" ? undefined : flowId,
		});
	};

	// Clear all filters
	const handleClearFilters = () => {
		onFiltersChange({
			flowId: undefined,
			dateRange: undefined,
			campaign: undefined,
			channelType: undefined,
			status: undefined,
		});
	};

	// Check if any filters are active
	const hasActiveFilters = !!(
		filters.flowId ||
		filters.dateRange ||
		filters.campaign ||
		filters.channelType ||
		filters.status?.length
	);

	return (
		<div className="flex flex-wrap items-center gap-3">
			{/* Flow Selector */}
			<div className="flex items-center gap-2">
				<span className="text-sm text-muted-foreground">Flow:</span>
				<Select value={filters.flowId || "all"} onValueChange={handleFlowSelect}>
					<SelectTrigger className="w-[200px]">
						<SelectValue placeholder="Todos os flows" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Todos os flows</SelectItem>
						{flows?.map((flow) => (
							<SelectItem key={flow.id} value={flow.id}>
								{flow.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* Date Range Picker */}
			<div className="flex items-center gap-2">
				<span className="text-sm text-muted-foreground">Período:</span>
				<Popover>
					<PopoverTrigger asChild>
						<Button
							variant="outline"
							className={cn(
								"w-[240px] justify-start text-left font-normal",
								!filters.dateRange && "text-muted-foreground",
							)}
						>
							<CalendarIcon className="mr-2 h-4 w-4" />
							{dateRangeDisplay}
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-auto p-0" align="start">
						<div className="p-3 border-b space-y-2">
							<p className="text-sm font-medium">Períodos rápidos</p>
							<div className="flex flex-col gap-1">
								{DATE_PRESETS.map((preset) => (
									<Button
										key={preset.value}
										variant={filters.dateRange?.preset === preset.value ? "default" : "ghost"}
										size="sm"
										className="justify-start"
										onClick={() => handlePresetSelect(preset.value)}
									>
										{preset.label}
									</Button>
								))}
							</div>
						</div>
						<div className="p-3">
							<p className="text-sm font-medium mb-2">Período personalizado</p>
							<Calendar
								mode="range"
								selected={
									filters.dateRange
										? {
												from: filters.dateRange.start,
												to: filters.dateRange.end,
											}
										: undefined
								}
								onSelect={handleDateRangeSelect}
								locale={ptBR}
								numberOfMonths={2}
								disabled={(date) => date > new Date()}
							/>
						</div>
					</PopoverContent>
				</Popover>
			</div>

			{/* Clear Filters Button */}
			{hasActiveFilters && (
				<Button
					variant="ghost"
					size="sm"
					onClick={handleClearFilters}
					className="text-muted-foreground hover:text-foreground"
				>
					<X className="w-4 h-4 mr-1" />
					Limpar filtros
				</Button>
			)}
		</div>
	);
}
