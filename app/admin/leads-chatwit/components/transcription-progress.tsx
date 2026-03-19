// app/admin/leads-chatwit/components/transcription-progress.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, XCircle, Loader2, Clock, Zap, ArrowRightLeft, DollarSign, Cpu } from "lucide-react";

// ----- Estimativa de custo por modelo (USD por 1M tokens) -----
const PRICE_PER_1M: Record<string, { in: number; out: number }> = {
	"gemini-3.1-pro-preview": { in: 2.0, out: 12.0 },
	"gemini-3-flash-preview": { in: 0.5, out: 3.0 },
	"gemini-3-pro-preview": { in: 2.0, out: 12.0 },
	"gemini-2.5-pro": { in: 1.25, out: 10.0 },
	"gemini-2.5-flash": { in: 0.3, out: 2.5 },
	"gemini-2.5-flash-lite": { in: 0.1, out: 0.4 },
	"gemini-flash-latest": { in: 0.3, out: 2.5 },
	"gpt-4.1": { in: 2.0, out: 8.0 },
	"gpt-4.1-mini": { in: 0.4, out: 1.6 },
	"gpt-4.1-nano": { in: 0.1, out: 0.4 },
	"gpt-4o": { in: 2.5, out: 10.0 },
	"gpt-4o-mini": { in: 0.15, out: 0.6 },
};
const USD_TO_BRL = 6;

function estimateCostUSD(model: string, tokensIn: number, tokensOut: number): number {
	const pricing = PRICE_PER_1M[model];
	if (!pricing) return 0;
	return (tokensIn / 1_000_000) * pricing.in + (tokensOut / 1_000_000) * pricing.out;
}

// ----- Types -----

type PageStatus = "pending" | "processing" | "done" | "failed";

interface PageState {
	status: PageStatus;
	provider?: string;
	model?: string;
	tokensIn?: number;
	tokensOut?: number;
	durationMs?: number;
	wasFallback?: boolean;
}

interface TranscriptionProgressProps {
	leadId: string;
	totalPages: number;
}

// ----- Component -----

export function TranscriptionProgress({ leadId, totalPages }: TranscriptionProgressProps) {
	const [pages, setPages] = useState<Map<number, PageState>>(() => {
		const initial = new Map<number, PageState>();
		for (let i = 1; i <= totalPages; i++) {
			initial.set(i, { status: "pending" });
		}
		return initial;
	});
	const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | undefined>();
	const [completed, setCompleted] = useState(false);
	const [totalTokensSummary, setTotalTokensSummary] = useState<{ input: number; output: number } | null>(null);

	useEffect(() => {
		if (!leadId) return;

		const syncFromStatus = async () => {
			try {
				const response = await fetch(`/api/admin/leads-chatwit/operations/status?leadId=${encodeURIComponent(leadId)}&stage=transcription`);
				if (!response.ok) return;
				const status = await response.json();
				if (status.status === "processing" && status.progress) {
					const progress = status.progress as {
						currentPage?: number;
						totalPages?: number;
						percentage?: number;
						estimatedTimeRemaining?: number;
					};

					if (progress.currentPage && progress.totalPages) {
						handleStarted({ totalPages: progress.totalPages });
						handlePageComplete({
							page: progress.currentPage,
							totalPages: progress.totalPages,
							percentage: progress.percentage ?? 0,
							estimatedTimeRemaining: progress.estimatedTimeRemaining,
						});
					}
				} else if (status.status === "completed") {
					setCompleted(true);
				}
			} catch {
				// fallback silencioso
			}
		};

		void syncFromStatus();

		const handleLeadNotification = (event: Event) => {
			const customEvent = event as CustomEvent<{
				leadId?: string;
				notification?: { category?: string; event?: any };
			}>;
			const detail = customEvent.detail;
			if (!detail || detail.leadId !== leadId) {
				return;
			}
			if (detail.notification?.category !== "transcription" || !detail.notification.event) {
				return;
			}

			const data = detail.notification.event;
			if (data.type === "page-complete") {
				handlePageComplete(data);
			} else if (data.type === "completed") {
				handleCompleted(data);
			} else if (data.type === "started") {
				handleStarted(data);
			}
		};

		const handleConnectionChange = (event: Event) => {
			const customEvent = event as CustomEvent<{ status?: string }>;
			if (customEvent.detail?.status === "disconnected") {
				void syncFromStatus();
			}
		};

		window.addEventListener("lead-notification", handleLeadNotification as EventListener);
		window.addEventListener("lead-operations-connection", handleConnectionChange as EventListener);

		return () => {
			window.removeEventListener("lead-notification", handleLeadNotification as EventListener);
			window.removeEventListener("lead-operations-connection", handleConnectionChange as EventListener);
		};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [leadId]);

	const handleStarted = useCallback((data: { totalPages?: number }) => {
		if (data.totalPages && data.totalPages !== totalPages) {
			setPages((prev) => {
				const next = new Map(prev);
				for (let i = 1; i <= (data.totalPages ?? totalPages); i++) {
					if (!next.has(i)) next.set(i, { status: "pending" });
				}
				return next;
			});
		}
	}, [totalPages]);

	const handlePageComplete = useCallback((data: {
		page: number; totalPages: number; percentage: number;
		estimatedTimeRemaining?: number; provider?: string; model?: string;
		tokensIn?: number; tokensOut?: number; durationMs?: number; wasFallback?: boolean;
	}) => {
		setPages((prev) => {
			const next = new Map(prev);
			next.set(data.page, {
				status: "done",
				provider: data.provider,
				model: data.model,
				tokensIn: data.tokensIn,
				tokensOut: data.tokensOut,
				durationMs: data.durationMs,
				wasFallback: data.wasFallback,
			});
			return next;
		});
		setEstimatedTimeRemaining(data.estimatedTimeRemaining);
	}, []);

	const handleCompleted = useCallback((data: {
		totalInputTokens?: number; totalOutputTokens?: number;
		perPage?: Array<{ page: number; input: number; output: number; provider: string; model: string; durationMs: number; wasFallback: boolean }>;
	}) => {
		setCompleted(true);
		if (data.totalInputTokens !== undefined && data.totalOutputTokens !== undefined) {
			setTotalTokensSummary({ input: data.totalInputTokens, output: data.totalOutputTokens });
		}
		// Update per-page data from final summary
		if (data.perPage) {
			setPages((prev) => {
				const next = new Map(prev);
				for (const p of data.perPage!) {
					next.set(p.page, {
						status: "done",
						provider: p.provider,
						model: p.model,
						tokensIn: p.input,
						tokensOut: p.output,
						durationMs: p.durationMs,
						wasFallback: p.wasFallback,
					});
				}
				return next;
			});
		}
		setEstimatedTimeRemaining(undefined);
	}, []);

	// Derived stats
	const sortedPages = Array.from(pages.entries()).sort(([a], [b]) => a - b);
	const doneCount = sortedPages.filter(([, p]) => p.status === "done").length;
	const percentage = totalPages > 0 ? Math.round((doneCount / totalPages) * 100) : 0;

	// Cost estimation from per-page data
	let totalCostUSD = 0;
	for (const [, page] of sortedPages) {
		if (page.model && page.tokensIn !== undefined && page.tokensOut !== undefined) {
			totalCostUSD += estimateCostUSD(page.model, page.tokensIn, page.tokensOut);
		}
	}
	const totalCostBRL = totalCostUSD * USD_TO_BRL;

	// Total tokens from per-page (realtime) or summary
	const realtimeIn = sortedPages.reduce((sum, [, p]) => sum + (p.tokensIn ?? 0), 0);
	const realtimeOut = sortedPages.reduce((sum, [, p]) => sum + (p.tokensOut ?? 0), 0);
	const displayIn = totalTokensSummary?.input ?? realtimeIn;
	const displayOut = totalTokensSummary?.output ?? realtimeOut;

	return (
		<div className="flex flex-col gap-4 w-full">
			{/* Header metrics */}
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
				<MetricCard
					icon={<Cpu className="h-3.5 w-3.5" />}
					label="Páginas"
					value={`${doneCount}/${totalPages}`}
				/>
				<MetricCard
					icon={<Zap className="h-3.5 w-3.5" />}
					label="Tokens"
					value={displayIn + displayOut > 0 ? `${formatTokens(displayIn + displayOut)}` : "—"}
					sub={displayIn + displayOut > 0 ? `${formatTokens(displayIn)} in · ${formatTokens(displayOut)} out` : undefined}
				/>
				<MetricCard
					icon={<DollarSign className="h-3.5 w-3.5" />}
					label="Custo est."
					value={totalCostUSD > 0 ? `$${totalCostUSD.toFixed(4)}` : "—"}
					sub={totalCostBRL > 0 ? `~R$${totalCostBRL.toFixed(2)}` : undefined}
				/>
				<MetricCard
					icon={<Clock className="h-3.5 w-3.5" />}
					label="Restante"
					value={completed ? "Concluído" : estimatedTimeRemaining !== undefined ? `~${estimatedTimeRemaining}s` : "—"}
				/>
			</div>

			{/* Progress bar */}
			<div className="space-y-1.5">
				<Progress value={percentage} className="h-2" />
				<p className="text-xs text-muted-foreground text-right">{percentage}%</p>
			</div>

			{/* Per-page list */}
			<div className="rounded-md border divide-y max-h-[280px] overflow-y-auto">
				{sortedPages.map(([pageNum, pageState]) => (
					<PageRow key={pageNum} page={pageNum} state={pageState} />
				))}
			</div>
		</div>
	);
}

// ----- Sub-components -----

function MetricCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
	return (
		<div className="rounded-md border bg-muted/30 px-3 py-2">
			<div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
				{icon}
				<span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
			</div>
			<p className="text-sm font-semibold tabular-nums">{value}</p>
			{sub && <p className="text-[10px] text-muted-foreground tabular-nums">{sub}</p>}
		</div>
	);
}

function PageRow({ page, state }: { page: number; state: PageState }) {
	return (
		<div className="flex items-center gap-3 px-3 py-2 text-sm">
			{/* Status icon */}
			<div className="flex-shrink-0 w-5">
				{state.status === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
				{state.status === "failed" && <XCircle className="h-4 w-4 text-destructive" />}
				{state.status === "processing" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
				{state.status === "pending" && <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />}
			</div>

			{/* Page number */}
			<span className="font-medium tabular-nums w-16">Pág {page}</span>

			{/* Provider + model */}
			{state.model && (
				<TooltipProvider delayDuration={200}>
					<Tooltip>
						<TooltipTrigger asChild>
							<Badge variant={state.wasFallback ? "destructive" : "secondary"} className="text-[10px] h-5 gap-1">
								{state.wasFallback && <ArrowRightLeft className="h-2.5 w-2.5" />}
								{state.model}
							</Badge>
						</TooltipTrigger>
						<TooltipContent>
							<p>{state.provider?.toUpperCase()} · {state.wasFallback ? "Fallback" : "Primary"}</p>
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			)}

			{/* Tokens */}
			{(state.tokensIn !== undefined && state.tokensIn > 0) && (
				<span className="text-xs text-muted-foreground tabular-nums ml-auto">
					{formatTokens(state.tokensIn)} in · {formatTokens(state.tokensOut ?? 0)} out
				</span>
			)}

			{/* Duration */}
			{state.durationMs !== undefined && (
				<span className="text-xs text-muted-foreground tabular-nums">
					{(state.durationMs / 1000).toFixed(1)}s
				</span>
			)}
		</div>
	);
}

function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return String(n);
}
