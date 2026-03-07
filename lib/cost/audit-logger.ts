/**
 * Sistema de Auditoria e Logs Estruturados para Custos de IA
 * Implementa logging detalhado de todos os acessos e mudanças no sistema de custos
 */

import { getPrismaInstance } from "../connections";
import log from "../log";

// Tipos de eventos de auditoria
export type CostAuditEventType =
	| "COST_EVENT_CREATED"
	| "COST_EVENT_PRICED"
	| "COST_EVENT_FAILED"
	| "BUDGET_CREATED"
	| "BUDGET_UPDATED"
	| "BUDGET_DELETED"
	| "BUDGET_EXCEEDED"
	| "BUDGET_ALERT_SENT"
	| "PRICE_CARD_CREATED"
	| "PRICE_CARD_UPDATED"
	| "FX_RATE_UPDATED"
	| "COST_DATA_ACCESSED"
	| "COST_REPORT_GENERATED"
	| "COST_ALERT_CREATED"
	| "COST_ALERT_RESOLVED"
	| "COST_SYSTEM_ERROR";

// Interface para eventos de auditoria
export interface CostAuditEvent {
	eventType: CostAuditEventType;
	userId?: string;
	sessionId?: string;
	inboxId?: string;
	resourceType: "COST_EVENT" | "BUDGET" | "PRICE_CARD" | "FX_RATE" | "ALERT" | "REPORT";
	resourceId?: string;
	action: "CREATE" | "READ" | "UPDATE" | "DELETE" | "PROCESS" | "ALERT" | "ERROR";
	details: Record<string, any>;
	metadata?: {
		ipAddress?: string;
		userAgent?: string;
		correlationId?: string;
		traceId?: string;
		source?: string;
		version?: string;
	};
	timestamp: Date;
	severity: "INFO" | "WARN" | "ERROR" | "CRITICAL";
}

// Interface para configuração de retenção
export interface RetentionConfig {
	auditLogs: number; // dias
	costEvents: number; // dias
	metrics: number; // dias
	alerts: number; // dias
}

export class CostAuditLogger {
	private static instance: CostAuditLogger;
	private prisma = getPrismaInstance();
	private retentionConfig: RetentionConfig = {
		auditLogs: 365, // 12 meses
		costEvents: 365, // 12 meses
		metrics: 90, // 3 meses
		alerts: 180, // 6 meses
	};

	constructor(config?: Partial<RetentionConfig>) {
		if (config) {
			this.retentionConfig = { ...this.retentionConfig, ...config };
		}
		this.initializeCleanupSchedule();
	}

	static getInstance(config?: Partial<RetentionConfig>): CostAuditLogger {
		if (!this.instance) {
			this.instance = new CostAuditLogger(config);
		}
		return this.instance;
	}

	/**
	 * Registra um evento de auditoria
	 */
	async logEvent(event: Omit<CostAuditEvent, "timestamp">): Promise<void> {
		try {
			const auditEvent: CostAuditEvent = {
				...event,
				timestamp: new Date(),
			};

			// Log estruturado no console
			this.logToConsole(auditEvent);

			// Salvar no banco de dados
			await this.logToDatabase(auditEvent);

			// Log adicional para eventos críticos
			if (auditEvent.severity === "CRITICAL") {
				await this.handleCriticalEvent(auditEvent);
			}
		} catch (error) {
			log.error("[CostAuditLogger] Erro ao registrar evento de auditoria:", {
				error: (error as Error).message,
				eventType: event.eventType,
				resourceType: event.resourceType,
			});
		}
	}

	/**
	 * Log estruturado no console
	 */
	private logToConsole(event: CostAuditEvent): void {
		const logData = {
			timestamp: event.timestamp.toISOString(),
			eventType: event.eventType,
			userId: event.userId,
			sessionId: event.sessionId,
			inboxId: event.inboxId,
			resourceType: event.resourceType,
			resourceId: event.resourceId,
			action: event.action,
			severity: event.severity,
			details: event.details,
			metadata: event.metadata,
		};

		switch (event.severity) {
			case "INFO":
				log.info(`[CostAudit] ${event.eventType}`, logData);
				break;
			case "WARN":
				log.warn(`[CostAudit] ${event.eventType}`, logData);
				break;
			case "ERROR":
			case "CRITICAL":
				log.error(`[CostAudit] ${event.eventType}`, logData);
				break;
		}
	}

	/**
	 * Salva evento no banco de dados
	 */
	private async logToDatabase(event: CostAuditEvent): Promise<void> {
		try {
			// "system" is not a real User id — store as null to avoid FK violation
			const auditUserId =
				event.userId && event.userId !== "system" ? event.userId : null;
			await this.prisma.auditLog.create({
				data: {
					userId: auditUserId,
					action: `COST_${event.action}`,
					resourceType: event.resourceType,
					resourceId: event.resourceId || "unknown",
					details: {
						eventType: event.eventType,
						severity: event.severity,
						details: event.details,
						metadata: event.metadata,
						sessionId: event.sessionId,
						inboxId: event.inboxId,
						timestamp: event.timestamp.toISOString(),
					},
					ipAddress: event.metadata?.ipAddress || "127.0.0.1",
					userAgent: event.metadata?.userAgent || "CostSystem",
				},
			});
		} catch (error) {
			log.error("[CostAuditLogger] Erro ao salvar no banco:", error);
		}
	}

	/**
	 * Trata eventos críticos
	 */
	private async handleCriticalEvent(event: CostAuditEvent): Promise<void> {
		try {
			// Log adicional para eventos críticos
			console.error(`🚨 [CRITICAL COST EVENT] ${event.eventType}:`, {
				timestamp: event.timestamp.toISOString(),
				details: event.details,
				metadata: event.metadata,
			});

			// TODO: Integrar com sistema de alertas (email, Slack, etc.)
			// Exemplo:
			// await this.sendCriticalAlert(event);
		} catch (error) {
			log.error("[CostAuditLogger] Erro ao tratar evento crítico:", error);
		}
	}

	/**
	 * Métodos específicos para diferentes tipos de eventos
	 */

	// Eventos de custo
	async logCostEventCreated(data: {
		eventId: string;
		provider: string;
		product: string;
		units: number;
		sessionId?: string;
		inboxId?: string;
		userId?: string;
		correlationId?: string;
	}): Promise<void> {
		await this.logEvent({
			eventType: "COST_EVENT_CREATED",
			userId: data.userId,
			sessionId: data.sessionId,
			inboxId: data.inboxId,
			resourceType: "COST_EVENT",
			resourceId: data.eventId,
			action: "CREATE",
			details: {
				provider: data.provider,
				product: data.product,
				units: data.units,
			},
			metadata: {
				correlationId: data.correlationId,
				source: "cost-wrapper",
			},
			severity: "INFO",
		});
	}

	async logCostEventPriced(data: {
		eventId: string;
		unitPrice: number;
		totalCost: number;
		currency: string;
		processingTime: number;
	}): Promise<void> {
		await this.logEvent({
			eventType: "COST_EVENT_PRICED",
			resourceType: "COST_EVENT",
			resourceId: data.eventId,
			action: "PROCESS",
			details: {
				unitPrice: data.unitPrice,
				totalCost: data.totalCost,
				currency: data.currency,
				processingTime: data.processingTime,
			},
			metadata: {
				source: "cost-worker",
			},
			severity: "INFO",
		});
	}

	async logCostEventFailed(data: {
		eventId: string;
		error: string;
		attempts: number;
		willRetry: boolean;
	}): Promise<void> {
		await this.logEvent({
			eventType: "COST_EVENT_FAILED",
			resourceType: "COST_EVENT",
			resourceId: data.eventId,
			action: "ERROR",
			details: {
				error: data.error,
				attempts: data.attempts,
				willRetry: data.willRetry,
			},
			metadata: {
				source: "cost-worker",
			},
			severity: data.willRetry ? "WARN" : "ERROR",
		});
	}

	// Eventos de orçamento
	async logBudgetCreated(data: {
		budgetId: string;
		name: string;
		limitUSD: number;
		inboxId?: string;
		userId?: string;
		createdBy: string;
	}): Promise<void> {
		await this.logEvent({
			eventType: "BUDGET_CREATED",
			userId: data.createdBy,
			inboxId: data.inboxId,
			resourceType: "BUDGET",
			resourceId: data.budgetId,
			action: "CREATE",
			details: {
				name: data.name,
				limitUSD: data.limitUSD,
				targetInboxId: data.inboxId,
				targetUserId: data.userId,
			},
			severity: "INFO",
		});
	}

	async logBudgetExceeded(data: {
		budgetId: string;
		name: string;
		limitUSD: number;
		currentSpent: number;
		percentage: number;
		inboxId?: string;
		userId?: string;
	}): Promise<void> {
		await this.logEvent({
			eventType: "BUDGET_EXCEEDED",
			inboxId: data.inboxId,
			resourceType: "BUDGET",
			resourceId: data.budgetId,
			action: "ALERT",
			details: {
				name: data.name,
				limitUSD: data.limitUSD,
				currentSpent: data.currentSpent,
				percentage: data.percentage,
				targetInboxId: data.inboxId,
				targetUserId: data.userId,
			},
			severity: data.percentage > 120 ? "CRITICAL" : "ERROR",
		});
	}

	// Eventos de acesso a dados
	async logCostDataAccessed(data: {
		userId: string;
		action: "overview" | "breakdown" | "events" | "export";
		filters?: Record<string, any>;
		resultCount?: number;
		ipAddress?: string;
		userAgent?: string;
	}): Promise<void> {
		await this.logEvent({
			eventType: "COST_DATA_ACCESSED",
			userId: data.userId,
			resourceType: "REPORT",
			action: "READ",
			details: {
				accessType: data.action,
				filters: data.filters,
				resultCount: data.resultCount,
			},
			metadata: {
				ipAddress: data.ipAddress,
				userAgent: data.userAgent,
				source: "dashboard-api",
			},
			severity: "INFO",
		});
	}

	// Eventos de preços
	async logPriceCardUpdated(data: {
		priceCardId: string;
		provider: string;
		product: string;
		oldPrice?: number;
		newPrice: number;
		effectiveFrom: Date;
		updatedBy: string;
	}): Promise<void> {
		await this.logEvent({
			eventType: "PRICE_CARD_UPDATED",
			userId: data.updatedBy,
			resourceType: "PRICE_CARD",
			resourceId: data.priceCardId,
			action: "UPDATE",
			details: {
				provider: data.provider,
				product: data.product,
				oldPrice: data.oldPrice,
				newPrice: data.newPrice,
				effectiveFrom: data.effectiveFrom.toISOString(),
			},
			severity: "INFO",
		});
	}

	// Eventos de taxa de câmbio
	async logFxRateUpdated(data: {
		base: string;
		quote: string;
		oldRate?: number;
		newRate: number;
		date: Date;
	}): Promise<void> {
		await this.logEvent({
			eventType: "FX_RATE_UPDATED",
			resourceType: "FX_RATE",
			resourceId: `${data.base}_${data.quote}_${data.date.toISOString().split("T")[0]}`,
			action: "UPDATE",
			details: {
				base: data.base,
				quote: data.quote,
				oldRate: data.oldRate,
				newRate: data.newRate,
				date: data.date.toISOString(),
			},
			metadata: {
				source: "fx-rate-worker",
			},
			severity: "INFO",
		});
	}

	/**
	 * Consulta logs de auditoria
	 */
	async getAuditLogs(filters: {
		eventType?: CostAuditEventType;
		userId?: string;
		resourceType?: string;
		resourceId?: string;
		startDate?: Date;
		endDate?: Date;
		severity?: string;
		limit?: number;
		offset?: number;
	}): Promise<{
		logs: any[];
		total: number;
	}> {
		try {
			const where: any = {};

			if (filters.userId) {
				where.userId = filters.userId;
			}

			if (filters.resourceType) {
				where.resourceType = filters.resourceType;
			}

			if (filters.resourceId) {
				where.resourceId = filters.resourceId;
			}

			if (filters.startDate || filters.endDate) {
				where.createdAt = {};
				if (filters.startDate) {
					where.createdAt.gte = filters.startDate;
				}
				if (filters.endDate) {
					where.createdAt.lte = filters.endDate;
				}
			}

			// Filtros específicos de custo via details JSON
			const detailsFilter: any = {};
			if (filters.eventType) {
				detailsFilter.eventType = filters.eventType;
			}
			if (filters.severity) {
				detailsFilter.severity = filters.severity;
			}

			if (Object.keys(detailsFilter).length > 0) {
				where.details = {
					path: Object.keys(detailsFilter),
					equals: Object.values(detailsFilter),
				};
			}

			const [logs, total] = await Promise.all([
				this.prisma.auditLog.findMany({
					where,
					orderBy: { createdAt: "desc" },
					take: filters.limit || 100,
					skip: filters.offset || 0,
				}),
				this.prisma.auditLog.count({ where }),
			]);

			return { logs, total };
		} catch (error) {
			log.error("[CostAuditLogger] Erro ao consultar logs de auditoria:", error);
			throw error;
		}
	}

	/**
	 * Inicializa limpeza automática de dados antigos
	 */
	private initializeCleanupSchedule(): void {
		// Executar limpeza diariamente às 2:00 AM
		const cleanupInterval = 24 * 60 * 60 * 1000; // 24 horas

		setInterval(() => {
			this.performCleanup().catch((error) => {
				log.error("[CostAuditLogger] Erro na limpeza automática:", error);
			});
		}, cleanupInterval);

		// Executar limpeza inicial após 1 minuto
		setTimeout(() => {
			this.performCleanup().catch((error) => {
				log.error("[CostAuditLogger] Erro na limpeza inicial:", error);
			});
		}, 60000);

		log.info("[CostAuditLogger] Limpeza automática configurada", {
			retentionConfig: this.retentionConfig,
		});
	}

	/**
	 * Executa limpeza de dados antigos
	 */
	async performCleanup(): Promise<void> {
		try {
			log.info("[CostAuditLogger] Iniciando limpeza de dados antigos...");

			const now = new Date();

			// Limpeza de logs de auditoria
			const auditCutoff = new Date(now.getTime() - this.retentionConfig.auditLogs * 24 * 60 * 60 * 1000);
			const deletedAuditLogs = await this.prisma.auditLog.deleteMany({
				where: {
					createdAt: { lt: auditCutoff },
					action: { startsWith: "COST_" },
				},
			});

			// Limpeza de eventos de custo antigos (se aplicável)
			const costEventsCutoff = new Date(now.getTime() - this.retentionConfig.costEvents * 24 * 60 * 60 * 1000);
			const deletedCostEvents = (await this.prisma.costEvent?.deleteMany({
				where: {
					ts: { lt: costEventsCutoff },
					status: "PRICED", // Manter eventos não processados
				},
			})) || { count: 0 };

			log.info("[CostAuditLogger] Limpeza concluída", {
				deletedAuditLogs: deletedAuditLogs.count,
				deletedCostEvents: deletedCostEvents.count,
				auditCutoff: auditCutoff.toISOString(),
				costEventsCutoff: costEventsCutoff.toISOString(),
			});
		} catch (error) {
			log.error("[CostAuditLogger] Erro durante limpeza:", error);
		}
	}

	/**
	 * Obtém estatísticas de auditoria
	 */
	async getAuditStats(days: number = 30): Promise<{
		totalEvents: number;
		eventsByType: Record<string, number>;
		eventsBySeverity: Record<string, number>;
		eventsByUser: Record<string, number>;
		recentActivity: any[];
	}> {
		try {
			const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

			const logs = await this.prisma.auditLog.findMany({
				where: {
					createdAt: { gte: startDate },
					action: { startsWith: "COST_" },
				},
				orderBy: { createdAt: "desc" },
				take: 1000,
			});

			const eventsByType: Record<string, number> = {};
			const eventsBySeverity: Record<string, number> = {};
			const eventsByUser: Record<string, number> = {};

			logs.forEach((log) => {
				const details = log.details as any;

				// Por tipo de evento
				const eventType = details?.eventType || "UNKNOWN";
				eventsByType[eventType] = (eventsByType[eventType] || 0) + 1;

				// Por severidade
				const severity = details?.severity || "INFO";
				eventsBySeverity[severity] = (eventsBySeverity[severity] || 0) + 1;

				// Por usuário
				const userId = log.userId || "system";
				eventsByUser[userId] = (eventsByUser[userId] || 0) + 1;
			});

			return {
				totalEvents: logs.length,
				eventsByType,
				eventsBySeverity,
				eventsByUser,
				recentActivity: logs.slice(0, 20), // 20 eventos mais recentes
			};
		} catch (error) {
			log.error("[CostAuditLogger] Erro ao obter estatísticas:", error);
			throw error;
		}
	}
}

// Instância global
export const costAuditLogger = CostAuditLogger.getInstance();

// Funções utilitárias
export function logCostEvent(eventType: CostAuditEventType, data: any): Promise<void> {
	return costAuditLogger.logEvent({
		eventType,
		resourceType: "COST_EVENT",
		action: "PROCESS",
		details: data,
		severity: "INFO",
	});
}

export function logCostError(error: string, data: any): Promise<void> {
	return costAuditLogger.logEvent({
		eventType: "COST_SYSTEM_ERROR",
		resourceType: "COST_EVENT",
		action: "ERROR",
		details: { error, ...data },
		severity: "ERROR",
	});
}
