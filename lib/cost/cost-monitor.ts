/**
 * Sistema de Monitoramento de Custos de IA
 * Implementa métricas, alertas e observabilidade para o sistema de custos
 */

import { Queue, QueueEvents } from "bullmq";
import { getRedisInstance } from "../connections";
import { apm } from "../monitoring/application-performance-monitor";
import log from "../log";
import { isMonitorLogEnabled } from "../config";

// Interfaces para métricas de custo
export interface CostMetrics {
	timestamp: Date;
	eventsProcessed: number;
	eventsSuccessful: number;
	eventsFailed: number;
	averageProcessingTime: number;
	totalCostUSD: number;
	costByProvider: Record<string, number>;
	costByModel: Record<string, number>;
	pendingEvents: number;
	errorRate: number;
}

export interface CostAlert {
	id: string;
	type: "HIGH_ERROR_RATE" | "PROCESSING_DELAY" | "BUDGET_EXCEEDED" | "PRICING_FAILURE";
	severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
	message: string;
	metrics: Record<string, any>;
	timestamp: Date;
	resolved: boolean;
	resolvedAt?: Date;
}

export interface CostSystemHealth {
	status: "HEALTHY" | "DEGRADED" | "FAILED";
	eventsProcessedPerMinute: number;
	errorRate: number;
	averageLatency: number;
	pendingEvents: number;
	lastProcessedEvent: Date | null;
	uptime: number;
}

// Thresholds para alertas
const COST_ALERT_THRESHOLDS = {
	MAX_ERROR_RATE: 5, // 5%
	MAX_PROCESSING_DELAY: 300000, // 5 minutos
	MAX_PENDING_EVENTS: 1000,
	MAX_PROCESSING_TIME: 30000, // 30 segundos
} as const;

export class CostMonitor {
	private static instance: CostMonitor;
	private redis = getRedisInstance();
	private costQueue?: Queue;
	private queueEvents?: QueueEvents;
	private metricsHistory: CostMetrics[] = [];
	private alerts: Map<string, CostAlert> = new Map();
	private isMonitoring = false;
	private monitoringInterval?: NodeJS.Timeout;

	private readonly METRICS_HISTORY_SIZE = 1000;
	private readonly MONITORING_INTERVAL = 30000; // 30 segundos

	constructor() {
		this.initializeMonitoring();
	}

	static getInstance(): CostMonitor {
		if (!this.instance) {
			this.instance = new CostMonitor();
		}
		return this.instance;
	}

	/**
	 * Inicializa o monitoramento do sistema de custos
	 */
	private async initializeMonitoring(): Promise<void> {
		try {
			log.info("[CostMonitor] Inicializando monitoramento de custos...");

			// Importar e conectar à fila de custos
			const { createCostQueue } = await import("./queue-config");
			this.costQueue = createCostQueue();

			// Configurar eventos da fila
			this.queueEvents = new QueueEvents("cost-events", {
				connection: this.redis,
			});

			this.setupQueueEventListeners();
			this.startPeriodicMonitoring();

			this.isMonitoring = true;
			log.info("[CostMonitor] ✅ Monitoramento de custos inicializado");
		} catch (error) {
			log.error("[CostMonitor] Erro ao inicializar monitoramento:", error);
			throw error;
		}
	}

	/**
	 * Configura listeners para eventos da fila
	 */
	private setupQueueEventListeners(): void {
		if (!this.queueEvents) return;

		// Job completado com sucesso
		this.queueEvents.on("completed", async ({ jobId }) => {
			try {
				const job = await this.costQueue?.getJob(jobId);
				if (job) {
					this.recordJobSuccess(job);
				}
			} catch (error) {
				log.error("[CostMonitor] Erro ao processar evento completed:", error);
			}
		});

		// Job falhou
		this.queueEvents.on("failed", async ({ jobId, failedReason }) => {
			try {
				const job = await this.costQueue?.getJob(jobId);
				if (job) {
					this.recordJobFailure(job, failedReason);
				}
			} catch (error) {
				log.error("[CostMonitor] Erro ao processar evento failed:", error);
			}
		});

		// Job travado
		this.queueEvents.on("stalled", async ({ jobId }) => {
			try {
				const job = await this.costQueue?.getJob(jobId);
				log.warn("[CostMonitor] Job de custo travado:", {
					jobId,
					jobName: job?.name,
					attempts: job?.attemptsMade,
				});

				await this.createAlert({
					type: "PROCESSING_DELAY",
					severity: "MEDIUM",
					message: `Job de custo travado: ${jobId}`,
					metrics: { jobId, jobName: job?.name },
				});
			} catch (error) {
				log.error("[CostMonitor] Erro ao processar evento stalled:", error);
			}
		});

		// Erro na fila
		this.queueEvents.on("error", (error: Error) => {
			log.error("[CostMonitor] Erro na fila de custos:", error);

			this.createAlert({
				type: "PRICING_FAILURE",
				severity: "HIGH",
				message: `Erro na fila de custos: ${error.message}`,
				metrics: { error: error.message },
			});
		});
	}

	/**
	 * Registra sucesso de job
	 */
	private recordJobSuccess(job: any): void {
		const processingTime = job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 0;

		// Registrar métricas no APM
		apm.recordWorkerMetrics({
			jobId: job.id || "unknown",
			jobType: "cost-event",
			processingTime,
			queueWaitTime: job.processedOn && job.timestamp ? job.processedOn - job.timestamp : 0,
			success: true,
			timestamp: new Date(),
			correlationId: job.data?.externalId || "unknown",
			retryCount: job.attemptsMade || 0,
		});

		log.debug("[CostMonitor] Job de custo processado com sucesso:", {
			jobId: job.id,
			processingTime,
			attempts: job.attemptsMade,
		});
	}

	/**
	 * Registra falha de job
	 */
	private recordJobFailure(job: any, failedReason: string): void {
		const processingTime = job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 0;

		// Registrar métricas no APM
		apm.recordWorkerMetrics({
			jobId: job.id || "unknown",
			jobType: "cost-event",
			processingTime,
			queueWaitTime: job.processedOn && job.timestamp ? job.processedOn - job.timestamp : 0,
			success: false,
			error: failedReason,
			timestamp: new Date(),
			correlationId: job.data?.externalId || "unknown",
			retryCount: job.attemptsMade || 0,
		});

		log.error("[CostMonitor] Job de custo falhou:", {
			jobId: job.id,
			error: failedReason,
			attempts: job.attemptsMade,
		});

		// Criar alerta se muitas falhas
		if ((job.attemptsMade || 0) >= 3) {
			this.createAlert({
				type: "PRICING_FAILURE",
				severity: "HIGH",
				message: `Job de custo falhou após múltiplas tentativas: ${failedReason}`,
				metrics: {
					jobId: job.id,
					error: failedReason,
					attempts: job.attemptsMade,
				},
			});
		}
	}

	/**
	 * Inicia monitoramento periódico
	 */
	private startPeriodicMonitoring(): void {
		this.monitoringInterval = setInterval(() => {
			this.collectMetrics().catch((error) => {
				log.error("[CostMonitor] Erro ao coletar métricas:", error);
			});
		}, this.MONITORING_INTERVAL);

		log.info("[CostMonitor] Monitoramento periódico iniciado");
	}

	/**
	 * Coleta métricas do sistema de custos
	 */
	async collectMetrics(): Promise<CostMetrics> {
		try {
			const timestamp = new Date();
			const timeWindow = 60 * 1000; // 1 minuto
			const windowStart = new Date(timestamp.getTime() - timeWindow);

			// Obter estatísticas da fila
			const [waiting, active, completed, failed] = await Promise.all([
				this.costQueue?.getWaiting() || [],
				this.costQueue?.getActive() || [],
				this.costQueue?.getCompleted() || [],
				this.costQueue?.getFailed() || [],
			]);

			// Calcular métricas dos jobs recentes
			const recentJobs = [...completed, ...failed].filter(
				(job) => job.timestamp && job.timestamp > windowStart.getTime(),
			);

			const eventsProcessed = recentJobs.length;
			const eventsSuccessful = completed.filter((job) => job.timestamp && job.timestamp > windowStart.getTime()).length;
			const eventsFailed = failed.filter((job) => job.timestamp && job.timestamp > windowStart.getTime()).length;

			// Calcular tempo médio de processamento
			const jobsWithProcessingTime = recentJobs.filter((job) => job.finishedOn && job.processedOn);
			const averageProcessingTime =
				jobsWithProcessingTime.length > 0
					? jobsWithProcessingTime.reduce((sum, job) => sum + (job.finishedOn! - job.processedOn!), 0) /
						jobsWithProcessingTime.length
					: 0;

			// Calcular custos por provider e modelo (simulado - seria obtido do banco)
			const costByProvider = await this.getCostsByProvider(windowStart, timestamp);
			const costByModel = await this.getCostsByModel(windowStart, timestamp);
			const totalCostUSD = Object.values(costByProvider).reduce((sum, cost) => sum + cost, 0);

			const errorRate = eventsProcessed > 0 ? (eventsFailed / eventsProcessed) * 100 : 0;

			const metrics: CostMetrics = {
				timestamp,
				eventsProcessed,
				eventsSuccessful,
				eventsFailed,
				averageProcessingTime,
				totalCostUSD,
				costByProvider,
				costByModel,
				pendingEvents: waiting.length + active.length,
				errorRate,
			};

			// Armazenar métricas
			this.metricsHistory.push(metrics);
			if (this.metricsHistory.length > this.METRICS_HISTORY_SIZE) {
				this.metricsHistory.shift();
			}

			// Verificar alertas
			await this.checkMetricsAlerts(metrics);

			if (isMonitorLogEnabled()) {
				log.debug("[CostMonitor] Métricas coletadas:", {
					eventsProcessed,
					errorRate: `${errorRate.toFixed(2)}%`,
					pendingEvents: metrics.pendingEvents,
					totalCostUSD: `$${totalCostUSD.toFixed(4)}`,
				});
			}

			return metrics;
		} catch (error) {
			log.error("[CostMonitor] Erro ao coletar métricas:", error);
			throw error;
		}
	}

	/**
	 * Obtém custos por provider (simulado - implementar com dados reais)
	 */
	private async getCostsByProvider(start: Date, end: Date): Promise<Record<string, number>> {
		// TODO: Implementar consulta real ao banco de dados
		// Por enquanto, retorna dados simulados
		return {
			OPENAI: Math.random() * 10,
			META_WHATSAPP: Math.random() * 5,
		};
	}

	/**
	 * Obtém custos por modelo (simulado - implementar com dados reais)
	 */
	private async getCostsByModel(start: Date, end: Date): Promise<Record<string, number>> {
		// TODO: Implementar consulta real ao banco de dados
		// Por enquanto, retorna dados simulados
		return {
			"gpt-4o": Math.random() * 8,
			"gpt-4o-mini": Math.random() * 2,
			"whatsapp-template": Math.random() * 5,
		};
	}

	/**
	 * Verifica alertas baseados nas métricas
	 */
	private async checkMetricsAlerts(metrics: CostMetrics): Promise<void> {
		// Alerta para alta taxa de erro
		if (metrics.errorRate > COST_ALERT_THRESHOLDS.MAX_ERROR_RATE) {
			await this.createAlert({
				type: "HIGH_ERROR_RATE",
				severity: metrics.errorRate > 15 ? "CRITICAL" : "HIGH",
				message: `Alta taxa de erro no processamento de custos: ${metrics.errorRate.toFixed(2)}%`,
				metrics: {
					errorRate: metrics.errorRate,
					eventsFailed: metrics.eventsFailed,
					eventsProcessed: metrics.eventsProcessed,
				},
			});
		}

		// Alerta para muitos eventos pendentes
		if (metrics.pendingEvents > COST_ALERT_THRESHOLDS.MAX_PENDING_EVENTS) {
			await this.createAlert({
				type: "PROCESSING_DELAY",
				severity: metrics.pendingEvents > 2000 ? "CRITICAL" : "HIGH",
				message: `Muitos eventos de custo pendentes: ${metrics.pendingEvents}`,
				metrics: { pendingEvents: metrics.pendingEvents },
			});
		}

		// Alerta para tempo de processamento alto
		if (metrics.averageProcessingTime > COST_ALERT_THRESHOLDS.MAX_PROCESSING_TIME) {
			await this.createAlert({
				type: "PROCESSING_DELAY",
				severity: "MEDIUM",
				message: `Tempo de processamento de custos alto: ${metrics.averageProcessingTime}ms`,
				metrics: { averageProcessingTime: metrics.averageProcessingTime },
			});
		}
	}

	/**
	 * Cria um alerta
	 */
	private async createAlert(alertData: Omit<CostAlert, "id" | "timestamp" | "resolved">): Promise<void> {
		const alert: CostAlert = {
			id: `cost_alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
			timestamp: new Date(),
			resolved: false,
			...alertData,
		};

		// Evitar spam de alertas similares
		const existingAlert = Array.from(this.alerts.values()).find(
			(a) => a.type === alert.type && !a.resolved && Date.now() - a.timestamp.getTime() < 300000, // 5 minutos
		);

		if (existingAlert) {
			return; // Não criar alerta duplicado
		}

		this.alerts.set(alert.id, alert);

		// Log do alerta
		log.warn(`[CostMonitor] 🚨 ALERTA ${alert.severity}: ${alert.message}`);

		// Registrar no APM
		apm.triggerAlert({
			level: alert.severity.toLowerCase() as any,
			component: "cost-system",
			message: alert.message,
			metrics: alert.metrics,
		});

		// Enviar notificação se crítico
		if (alert.severity === "CRITICAL") {
			await this.sendCriticalAlert(alert);
		}
	}

	/**
	 * Envia alerta crítico
	 */
	private async sendCriticalAlert(alert: CostAlert): Promise<void> {
		try {
			log.error(`[CostMonitor] 🚨 ALERTA CRÍTICO DE CUSTOS: ${alert.message}`);

			// TODO: Integrar com sistema de notificações
			// Exemplo: enviar email, Slack, etc.
		} catch (error) {
			log.error("[CostMonitor] Erro ao enviar alerta crítico:", error);
		}
	}

	/**
	 * Obtém saúde do sistema de custos
	 */
	getSystemHealth(): CostSystemHealth {
		const recentMetrics = this.metricsHistory.slice(-5); // Últimas 5 coletas

		if (recentMetrics.length === 0) {
			return {
				status: "FAILED",
				eventsProcessedPerMinute: 0,
				errorRate: 0,
				averageLatency: 0,
				pendingEvents: 0,
				lastProcessedEvent: null,
				uptime: process.uptime(),
			};
		}

		const latestMetrics = recentMetrics[recentMetrics.length - 1];
		const avgErrorRate = recentMetrics.reduce((sum, m) => sum + m.errorRate, 0) / recentMetrics.length;
		const avgLatency = recentMetrics.reduce((sum, m) => sum + m.averageProcessingTime, 0) / recentMetrics.length;
		const avgEventsPerMinute = recentMetrics.reduce((sum, m) => sum + m.eventsProcessed, 0) / recentMetrics.length;

		let status: CostSystemHealth["status"] = "HEALTHY";
		if (avgErrorRate > 15 || latestMetrics.pendingEvents > 2000) {
			status = "FAILED";
		} else if (avgErrorRate > 5 || latestMetrics.pendingEvents > 500 || avgLatency > 30000) {
			status = "DEGRADED";
		}

		return {
			status,
			eventsProcessedPerMinute: Math.round(avgEventsPerMinute),
			errorRate: Math.round(avgErrorRate * 100) / 100,
			averageLatency: Math.round(avgLatency),
			pendingEvents: latestMetrics.pendingEvents,
			lastProcessedEvent: latestMetrics.timestamp,
			uptime: process.uptime(),
		};
	}

	/**
	 * Obtém métricas recentes
	 */
	getRecentMetrics(limit: number = 60): CostMetrics[] {
		return this.metricsHistory.slice(-limit);
	}

	/**
	 * Obtém alertas ativos
	 */
	getActiveAlerts(): CostAlert[] {
		return Array.from(this.alerts.values()).filter((alert) => !alert.resolved);
	}

	/**
	 * Resolve um alerta
	 */
	async resolveAlert(alertId: string): Promise<boolean> {
		const alert = this.alerts.get(alertId);
		if (!alert) return false;

		alert.resolved = true;
		alert.resolvedAt = new Date();

		log.info(`[CostMonitor] ✅ Alerta de custo resolvido: ${alert.message}`);

		return true;
	}

	/**
	 * Obtém dashboard de métricas
	 */
	getDashboard(): {
		health: CostSystemHealth;
		recentMetrics: CostMetrics[];
		activeAlerts: CostAlert[];
		summary: {
			totalEventsToday: number;
			totalCostToday: number;
			errorRateToday: number;
			averageProcessingTime: number;
		};
	} {
		const health = this.getSystemHealth();
		const recentMetrics = this.getRecentMetrics(60);
		const activeAlerts = this.getActiveAlerts();

		// Calcular resumo do dia
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const todayMetrics = recentMetrics.filter((m) => m.timestamp >= today);
		const totalEventsToday = todayMetrics.reduce((sum, m) => sum + m.eventsProcessed, 0);
		const totalCostToday = todayMetrics.reduce((sum, m) => sum + m.totalCostUSD, 0);
		const errorRateToday =
			todayMetrics.length > 0 ? todayMetrics.reduce((sum, m) => sum + m.errorRate, 0) / todayMetrics.length : 0;
		const averageProcessingTime =
			todayMetrics.length > 0
				? todayMetrics.reduce((sum, m) => sum + m.averageProcessingTime, 0) / todayMetrics.length
				: 0;

		return {
			health,
			recentMetrics,
			activeAlerts,
			summary: {
				totalEventsToday,
				totalCostToday: Math.round(totalCostToday * 10000) / 10000,
				errorRateToday: Math.round(errorRateToday * 100) / 100,
				averageProcessingTime: Math.round(averageProcessingTime),
			},
		};
	}

	/**
	 * Para o monitoramento
	 */
	stop(): void {
		if (this.monitoringInterval) {
			clearInterval(this.monitoringInterval);
			this.monitoringInterval = undefined;
		}

		if (this.queueEvents) {
			this.queueEvents.close();
			this.queueEvents = undefined;
		}

		this.isMonitoring = false;
		log.info("[CostMonitor] 🛑 Monitoramento de custos parado");
	}

	/**
	 * Verifica se o monitoramento está ativo
	 */
	isActive(): boolean {
		return this.isMonitoring;
	}
}

// Instância global
export const costMonitor = CostMonitor.getInstance();

// Funções utilitárias
export function getCostSystemHealth(): CostSystemHealth {
	return costMonitor.getSystemHealth();
}

export function getCostMetrics(limit?: number): CostMetrics[] {
	return costMonitor.getRecentMetrics(limit);
}

export function getCostAlerts(): CostAlert[] {
	return costMonitor.getActiveAlerts();
}

export function getCostDashboard() {
	return costMonitor.getDashboard();
}
