import { Queue, Worker, QueueOptions, WorkerOptions } from "bullmq";
import { getRedisInstance } from "@/lib/connections";
import { getQueueJobDefaults } from "@/lib/queue/job-defaults";

/**
 * Configuração da fila de eventos de custo
 * Usa baixa prioridade para não impactar performance das operações principais
 */
export const COST_QUEUE_NAME = "cost-events";

export const costQueueOptions: QueueOptions = {
	connection: getRedisInstance(),
	defaultJobOptions: getQueueJobDefaults(COST_QUEUE_NAME),
};

export const costWorkerOptions: WorkerOptions = {
	connection: getRedisInstance(),

	// Configurações de concorrência
	concurrency: 2, // baixa concorrência para não impactar performance

	// Configurações de processamento de jobs travados
	maxStalledCount: 1,
	stalledInterval: 30000, // verifica jobs travados a cada 30s

	// Configurações de retry e timeout
	settings: {
		backoffStrategy: (attemptsMade: number) => {
			return Math.min(Math.pow(2, attemptsMade) * 1000, 30000);
		},
	},
};

/**
 * Cria uma instância da fila de custos
 */
export function createCostQueue(): Queue {
	return new Queue(COST_QUEUE_NAME, costQueueOptions);
}

/**
 * Configurações específicas para diferentes tipos de eventos
 */
export const eventTypeConfigs = {
	// Eventos OpenAI - processamento rápido
	"openai-tokens": {
		priority: 5,
		attempts: 2,
		delay: 0,
	},

	// Eventos WhatsApp - pode ter delay para aguardar confirmação de entrega
	"whatsapp-template": {
		priority: 8,
		attempts: 3,
		delay: 5000, // 5s de delay para aguardar webhook de confirmação
	},

	// Eventos de erro - prioridade mais baixa
	"error-event": {
		priority: 15,
		attempts: 1,
		delay: 0,
	},

	// Reprocessamento de eventos pendentes
	"reprocess-pending": {
		priority: 12,
		attempts: 5,
		delay: 60000, // 1 minuto de delay
	},
};

/**
 * Configuração de Dead Letter Queue para eventos que falharam definitivamente
 */
export const deadLetterQueueOptions: QueueOptions = {
	connection: getRedisInstance(),
	defaultJobOptions: {
		removeOnComplete: 1000, // manter mais eventos para análise
		removeOnFail: 500,
		attempts: 1, // não retry na DLQ
	},
};

export const DEAD_LETTER_QUEUE_NAME = "cost-events-dlq";

/**
 * Cria uma instância da Dead Letter Queue
 */
export function createDeadLetterQueue(): Queue {
	return new Queue(DEAD_LETTER_QUEUE_NAME, deadLetterQueueOptions);
}

/**
 * Configurações de bulk operations para otimizar performance
 */
export const bulkOperationConfig = {
	// Tamanho máximo do batch para operações bulk
	maxBatchSize: 100,

	// Tempo máximo para aguardar antes de processar um batch incompleto
	maxWaitTime: 5000, // 5 segundos

	// Configurações de retry para operações bulk
	bulkRetryOptions: {
		attempts: 2,
		backoff: {
			type: "fixed" as const,
			delay: 1000,
		},
	},
};

/**
 * Utilitário para adicionar eventos em bulk com otimização
 */
export async function addCostEventsBulk(
	queue: Queue<any, any, string>,
	events: Array<{
		name: string;
		data: any;
		opts?: any;
	}>,
): Promise<void> {
	if (events.length === 0) return;

	try {
		// Divide em batches se necessário
		const batchSize = bulkOperationConfig.maxBatchSize;
		const batches: Array<typeof events> = [];

		for (let i = 0; i < events.length; i += batchSize) {
			batches.push(events.slice(i, i + batchSize));
		}

		// Processa cada batch
		for (const batch of batches) {
			await queue.addBulk(batch);
		}
	} catch (error) {
		console.error("Erro ao adicionar eventos em bulk:", error);

		// Fallback: tenta adicionar individualmente
		for (const event of events) {
			try {
				await queue.add(event.name, event.data, event.opts);
			} catch (individualError) {
				console.error(`Erro ao adicionar evento individual ${event.name}:`, individualError);
			}
		}
	}
}

/**
 * Configuração de monitoramento da fila
 */
export const queueMonitoringConfig = {
	// Métricas a serem coletadas
	metrics: {
		// Contadores básicos
		totalJobs: true,
		completedJobs: true,
		failedJobs: true,
		activeJobs: true,
		waitingJobs: true,
		delayedJobs: true,

		// Métricas de performance
		processingTime: true,
		waitTime: true,

		// Métricas de erro
		errorRate: true,
		retryRate: true,
	},

	// Intervalos de coleta
	collectionInterval: 60000, // 1 minuto

	// Alertas
	alerts: {
		// Alerta se taxa de erro > 5%
		errorRateThreshold: 0.05,

		// Alerta se fila tem > 1000 jobs aguardando
		queueSizeThreshold: 1000,

		// Alerta se tempo médio de processamento > 10s
		processingTimeThreshold: 10000,
	},
};

/**
 * Função para limpar filas antigas (manutenção)
 */
export async function cleanupCostQueues(): Promise<void> {
	const queue = createCostQueue();
	const dlq = createDeadLetterQueue();

	try {
		// Limpa jobs antigos da fila principal
		await queue.clean(24 * 60 * 60 * 1000, 100, "completed"); // 24h
		await queue.clean(7 * 24 * 60 * 60 * 1000, 50, "failed"); // 7 dias

		// Limpa jobs muito antigos da DLQ
		await dlq.clean(30 * 24 * 60 * 60 * 1000, 0, "completed"); // 30 dias
		await dlq.clean(30 * 24 * 60 * 60 * 1000, 0, "failed"); // 30 dias

		console.log("Limpeza das filas de custo concluída");
	} catch (error) {
		console.error("Erro na limpeza das filas de custo:", error);
	}
}

/**
 * Configuração de health check para as filas
 */
export async function checkCostQueueHealth(): Promise<{
	healthy: boolean;
	details: Record<string, any>;
}> {
	const queue = createCostQueue();

	try {
		const [waiting, active, completed, failed, delayed] = await Promise.all([
			queue.getWaiting(),
			queue.getActive(),
			queue.getCompleted(),
			queue.getFailed(),
			queue.getDelayed(),
		]);

		const totalJobs = waiting.length + active.length + completed.length + failed.length + delayed.length;
		const errorRate = totalJobs > 0 ? failed.length / totalJobs : 0;

		const healthy =
			errorRate < queueMonitoringConfig.alerts.errorRateThreshold &&
			waiting.length < queueMonitoringConfig.alerts.queueSizeThreshold;

		return {
			healthy,
			details: {
				waiting: waiting.length,
				active: active.length,
				completed: completed.length,
				failed: failed.length,
				delayed: delayed.length,
				errorRate: errorRate,
				totalJobs: totalJobs,
			},
		};
	} catch (error) {
		return {
			healthy: false,
			details: {
				error: error?.toString(),
			},
		};
	}
}
