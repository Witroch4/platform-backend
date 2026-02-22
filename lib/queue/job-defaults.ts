/**
 * Defaults centralizados de jobs BullMQ por fila.
 *
 * Arquivo sem dependências de worker/ — pode ser importado tanto pelos
 * queue files quanto por worker/registry.ts sem gerar circular dependency.
 *
 * Para adicionar/alterar defaults de uma fila, edite aqui e o registry.ts
 * passará os valores corretos automaticamente via getQueueJobDefaults().
 */

import type { JobsOptions } from "bullmq";

export const GLOBAL_JOB_DEFAULTS: Partial<JobsOptions> = {
	attempts: 3,
	backoff: { type: "exponential", delay: 2000 },
	removeOnComplete: 50,
	removeOnFail: 20,
};

const QUEUE_JOB_DEFAULTS: Record<string, Partial<JobsOptions>> = {
	filaLeadsChatwit: {
		attempts: 5,
		backoff: { type: "exponential", delay: 1_000 },
		removeOnComplete: 10_000,
		removeOnFail: 5_000,
	},
	"flow-builder-queues": {
		attempts: 3,
		backoff: { type: "exponential", delay: 2000 },
		removeOnComplete: 100,
		removeOnFail: 50,
	},
	"flow-campaign": {
		attempts: 3,
		backoff: { type: "exponential", delay: 5000 },
		removeOnComplete: 200,
		removeOnFail: 100,
		priority: 8,
	},
	"cost-events": {
		priority: 10,
		removeOnComplete: 100,
		removeOnFail: 50,
		attempts: 3,
		backoff: { type: "exponential", delay: 2000 },
	},
	"budget-monitor": {
		removeOnComplete: 10,
		removeOnFail: 5,
		attempts: 3,
		backoff: { type: "exponential", delay: 2000 },
	},
	"fx-rate-updates": {
		removeOnComplete: 10,
		removeOnFail: 5,
		attempts: 3,
		backoff: { type: "exponential", delay: 2000 },
	},
};

/**
 * Retorna os defaults de job para uma fila específica.
 * Fallback para GLOBAL_JOB_DEFAULTS se a fila não tiver configuração própria.
 */
export function getQueueJobDefaults(queueName: string): Partial<JobsOptions> {
	return QUEUE_JOB_DEFAULTS[queueName] ?? GLOBAL_JOB_DEFAULTS;
}
