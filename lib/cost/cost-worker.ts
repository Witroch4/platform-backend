import { Worker, Job } from "bullmq";
import { getPrismaInstance } from "@/lib/connections";
import { getRedisInstance } from "@/lib/connections";
import { Provider, Unit, EventStatus, PrismaClient } from "@prisma/client";
import { costWorkerOptions, COST_QUEUE_NAME, createDeadLetterQueue } from "./queue-config";
import { pricingService, processPendingPricingEvents } from "./pricing-service";
import { costErrorHandler, handleJobError } from "./error-handler";
import { idempotencyService, checkEventIdempotency, registerProcessedEvent } from "./idempotency-service";
import { costAuditLogger } from "./audit-logger";
import { runQualityEvaluation, getLatestEvaluationReport } from "./evaluation-pipeline";
import { createRequestCostTracker } from "./request-cost-tracker";
import { AgentConfig } from "@/services/openai";
import log from "@/lib/log";

const prisma = getPrismaInstance();

/**
 * Interface para dados de eventos de custo
 */
export interface CostEventData {
	ts: string;
	provider: string;
	product: string;
	unit: string;
	units: number;
	region?: string;
	externalId?: string;
	traceId?: string;
	sessionId?: string;
	inboxId?: string;
	userId?: string;
	intent?: string;
	raw: Record<string, any>;
}

/**
 * Resolve o preço unitário para um evento de custo
 * Usa o serviço de precificação com cache e fallbacks
 */
export async function resolveUnitPrice(
	provider: Provider,
	product: string,
	unit: Unit,
	when: Date,
	region?: string,
): Promise<{
	pricePerUnit: number;
	currency: string;
	priceCardId: string;
} | null> {
	try {
		const resolved = await pricingService.resolveUnitPrice(provider, product, unit, when, region);

		if (!resolved) {
			return null;
		}

		return {
			pricePerUnit: resolved.pricePerUnit,
			currency: resolved.currency,
			priceCardId: resolved.priceCardId,
		};
	} catch (error) {
		console.error("Erro ao resolver preço unitário:", error);
		return null;
	}
}

/**
 * Calcula o custo baseado no tipo de unidade
 */
export function calculateCost(units: number, unitPrice: number, unit: Unit): number {
	// Para tokens, o preço é por milhão (1M tokens)
	if (unit.startsWith("TOKENS_")) {
		return (units / 1_000_000) * unitPrice;
	}

	// Para outros tipos (templates, imagens, etc.), preço por unidade
	return units * unitPrice;
}

/**
 * Verifica se um evento já foi processado (idempotência)
 * Usa o serviço de idempotência avançado
 */
export async function isEventAlreadyProcessed(eventData: CostEventData): Promise<boolean> {
	try {
		return await checkEventIdempotency(eventData);
	} catch (error) {
		log.error("Erro ao verificar idempotência de evento", {
			error: error?.toString(),
			provider: eventData.provider,
			product: eventData.product,
			externalId: eventData.externalId,
		});
		return false;
	}
}

/**
 * Processa um evento de custo individual
 */
export async function processCostEvent(eventData: CostEventData): Promise<void> {
	const when = new Date(eventData.ts);

	// Validação de dados básicos
	if (!eventData.provider || !eventData.product || !eventData.unit) {
		throw new Error(
			`Dados de evento incompletos: provider=${eventData.provider}, product=${eventData.product}, unit=${eventData.unit}`,
		);
	}

	// Validação de unidades
	if (typeof eventData.units !== "number" || eventData.units < 0) {
		throw new Error(`Unidades inválidas: ${eventData.units}`);
	}

	// Converte strings para enums
	const provider = eventData.provider as Provider;
	const unit = eventData.unit as Unit;

	// Verifica idempotência usando serviço avançado
	const alreadyProcessed = await isEventAlreadyProcessed(eventData);

	if (alreadyProcessed) {
		log.info("Evento duplicado ignorado", {
			provider: eventData.provider,
			product: eventData.product,
			externalId: eventData.externalId,
			traceId: eventData.traceId,
		});
		return;
	}

	// Resolve preço unitário
	const priceInfo = await resolveUnitPrice(provider, eventData.product, unit, when, eventData.region);

	let unitPrice: number | null = null;
	let cost: number | null = null;
	let currency = "USD";
	let status: EventStatus = "PENDING_PRICING";

	if (priceInfo) {
		unitPrice = priceInfo.pricePerUnit;
		currency = priceInfo.currency;
		cost = calculateCost(eventData.units, unitPrice, unit);
		status = "PRICED";
	}

	// Persiste o evento no banco
	const createdEvent = await prisma.costEvent.create({
		data: {
			ts: when,
			provider,
			product: eventData.product,
			unit,
			units: eventData.units,
			currency,
			unitPrice: unitPrice,
			cost: cost,
			status,
			externalId: eventData.externalId || null,
			traceId: eventData.traceId || null,
			sessionId: eventData.sessionId || null,
			inboxId: eventData.inboxId || null,
			userId: eventData.userId || null,
			intent: eventData.intent || null,
			raw: eventData.raw || {},
		},
	});

	// Registra evento como processado para idempotência
	await registerProcessedEvent(eventData, createdEvent.id);

	// Incrementa contador de jobs processados
	const redis = getRedisInstance();
	const today = new Date().toISOString().split("T")[0];
	await redis.incr(`cost:jobs:daily:${today}`);

	// Audit logging
	const processingTime = Date.now() - when.getTime();

	if (status === "PRICED") {
		await costAuditLogger.logCostEventPriced({
			eventId: createdEvent.id,
			unitPrice: unitPrice!,
			totalCost: cost!,
			currency,
			processingTime,
		});
	} else {
		await costAuditLogger.logCostEventCreated({
			eventId: createdEvent.id,
			provider: eventData.provider,
			product: eventData.product,
			units: eventData.units,
			sessionId: eventData.sessionId,
			inboxId: eventData.inboxId,
			userId: eventData.userId,
			correlationId: eventData.traceId,
		});
	}

	// Log estruturado para auditoria
	log.info("Evento de custo processado", {
		eventId: createdEvent.id,
		provider: eventData.provider,
		product: eventData.product,
		unit: eventData.unit,
		units: eventData.units,
		cost,
		currency,
		status,
		externalId: eventData.externalId,
		traceId: eventData.traceId,
		inboxId: eventData.inboxId,
		userId: eventData.userId,
		processingTimeMs: processingTime,
	});
}

/**
 * Processa eventos PENDING_PRICING em lote usando o serviço de precificação
 */
export async function reprocessPendingEvents(limit: number = 100): Promise<number> {
	try {
		const result = await processPendingPricingEvents(limit);
		return result.processed;
	} catch (error) {
		console.error("Erro ao reprocessar eventos pendentes:", error);
		return 0;
	}
}

/**
 * Processor function — used by worker/registry.ts (Worker created by init.ts)
 * Handles all cost job types via switch/case dispatch.
 */
export async function processCostJob(job: Job): Promise<void> {
	const { name, data } = job;
	const startTime = Date.now();

	try {
		switch (name) {
			case "cost-event":
				await processCostEvent(data as CostEventData);
				break;

			case "reprocess-pending":
				const limit = data.limit || 100;
				await reprocessPendingEvents(limit);
				break;

			case "cleanup-cache":
				await idempotencyService.cleanupExpiredCache();
				await costErrorHandler.cleanupOldErrors(data.daysToKeep || 30);
				break;

			case "quality-evaluation":
				await runQualityEvaluationJob(data);
				break;

			case "cost-analytics":
				await generateCostAnalyticsReport(data);
				break;

			case "budget-check":
				await performBudgetCheck(data);
				break;

			default:
				log.warn("Tipo de job desconhecido", { jobName: name, jobId: job.id });
		}

		// Log de sucesso
		const processingTime = Date.now() - startTime;
		log.info("Job processado com sucesso", {
			jobId: job.id,
			jobName: name,
			processingTimeMs: processingTime,
			attempts: job.attemptsMade,
		});
	} catch (error) {
		const processingTime = Date.now() - startTime;

		log.error("Erro ao processar job", {
			jobId: job.id,
			jobName: name,
			error: error?.toString(),
			processingTimeMs: processingTime,
			attempts: job.attemptsMade,
			maxAttempts: job.opts.attempts || 3,
		});

		// Audit logging para falhas
		await costAuditLogger.logCostEventFailed({
			eventId: job.id || "unknown",
			error: (error as Error).message,
			attempts: job.attemptsMade || 0,
			willRetry: (job.attemptsMade || 0) < (job.opts.attempts || 3),
		});

		// Usa o error handler avançado
		const errorResult = await handleJobError(
			error as Error,
			job.id || "unknown",
			name,
			data,
			job.attemptsMade,
			job.opts.attempts || 3,
		);

		// Se deve mover para DLQ, o error handler já fez isso
		if (errorResult.shouldMoveToDeadLetter) {
			log.warn("Job movido para Dead Letter Queue", {
				jobId: job.id,
				jobName: name,
				finalAttempt: job.attemptsMade,
			});
		}

		// Re-throw para que o BullMQ saiba que falhou
		throw error;
	}
}

// Event handlers moved to worker/init.ts via attachStandardEventHandlers (registry pattern)

/**
 * Run quality evaluation job
 */
async function runQualityEvaluationJob(data: {
	agent: AgentConfig;
	userId: string;
	sampleSize?: number;
}): Promise<void> {
	try {
		log.info("Starting quality evaluation job", {
			userId: data.userId,
			sampleSize: data.sampleSize,
		});

		const report = await runQualityEvaluation(data.agent, data.userId, {
			sampleSize: data.sampleSize || 50,
		});

		log.info("Quality evaluation completed", {
			userId: data.userId,
			totalExamples: report.totalExamples,
			overallAccuracy: report.qualityMetrics.overallClassificationAccuracy,
			regressionDetected: report.regressionDetected,
		});

		// Alert if regression detected
		if (report.regressionDetected) {
			log.warn("Quality regression detected", {
				userId: data.userId,
				recommendations: report.recommendations,
			});
		}
	} catch (error) {
		log.error("Quality evaluation job failed", {
			userId: data.userId,
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}

/**
 * Generate cost analytics report
 */
async function generateCostAnalyticsReport(data: {
	userId: string;
	timeRange: { start: string; end: string };
}): Promise<void> {
	try {
		const costTracker = createRequestCostTracker();

		const analytics = await costTracker.getCostAnalytics(data.userId, {
			start: new Date(data.timeRange.start),
			end: new Date(data.timeRange.end),
		});

		log.info("Cost analytics generated", {
			userId: data.userId,
			totalCost: analytics.totalCost,
			requestCount: analytics.requestCount,
			averageCostPerRequest: analytics.averageCostPerRequest,
		});

		// Store analytics in Redis for dashboard access
		const redis = getRedisInstance();
		const cacheKey = `cost:analytics:${data.userId}:${Date.now()}`;
		await redis.setex(cacheKey, 3600, JSON.stringify(analytics)); // 1h TTL
	} catch (error) {
		log.error("Cost analytics job failed", {
			userId: data.userId,
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}

/**
 * Perform budget check and alerts
 */
async function performBudgetCheck(data: {
	userId: string;
	dailyBudget: number;
	monthlyBudget: number;
}): Promise<void> {
	try {
		const today = new Date();
		const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
		const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

		// Get daily usage
		const dailyUsage = await prisma.costEvent.aggregate({
			where: {
				userId: data.userId,
				ts: { gte: startOfDay },
				status: "PRICED",
			},
			_sum: { cost: true },
		});

		// Get monthly usage
		const monthlyUsage = await prisma.costEvent.aggregate({
			where: {
				userId: data.userId,
				ts: { gte: startOfMonth },
				status: "PRICED",
			},
			_sum: { cost: true },
		});

		const dailyUsed = Number(dailyUsage._sum.cost || 0);
		const monthlyUsed = Number(monthlyUsage._sum.cost || 0);

		const dailyPercent = (dailyUsed / data.dailyBudget) * 100;
		const monthlyPercent = (monthlyUsed / data.monthlyBudget) * 100;

		log.info("Budget check completed", {
			userId: data.userId,
			dailyUsed,
			dailyBudget: data.dailyBudget,
			dailyPercent,
			monthlyUsed,
			monthlyBudget: data.monthlyBudget,
			monthlyPercent,
		});

		// Alert if over 80% of budget
		if (dailyPercent >= 80) {
			log.warn("Daily budget alert", {
				userId: data.userId,
				usagePercent: dailyPercent,
				used: dailyUsed,
				budget: data.dailyBudget,
			});
		}

		if (monthlyPercent >= 80) {
			log.warn("Monthly budget alert", {
				userId: data.userId,
				usagePercent: monthlyPercent,
				used: monthlyUsed,
				budget: data.monthlyBudget,
			});
		}
	} catch (error) {
		log.error("Budget check job failed", {
			userId: data.userId,
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}
