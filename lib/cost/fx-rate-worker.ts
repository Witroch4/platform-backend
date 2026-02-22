/**
 * Worker para atualização diária de taxas de câmbio
 */

import { Queue } from "bullmq";
import log from "@/lib/log";
import FxRateService from "./fx-rate-service";
import { getRedisInstance } from "@/lib/connections";
import { getQueueJobDefaults } from "@/lib/queue/job-defaults";

const FX_RATE_QUEUE_NAME = "fx-rate-updates";

export const fxRateQueue = new Queue(FX_RATE_QUEUE_NAME, {
	connection: getRedisInstance(),
	defaultJobOptions: getQueueJobDefaults(FX_RATE_QUEUE_NAME),
});

// Processor function — used by worker/registry.ts (Worker created by init.ts)
export async function processFxRateJob(job: import("bullmq").Job): Promise<void> {
	const { name, data } = job;

	log.info(`Processando job de taxa de câmbio: ${name}`, { jobId: job.id, data });

	try {
		switch (name) {
			case "update-daily-rate":
				await updateDailyRate();
				break;

			case "cleanup-old-rates":
				await cleanupOldRates();
				break;

			case "backfill-rates":
				await backfillRates(data.startDate, data.endDate);
				break;

			default:
				throw new Error(`Tipo de job desconhecido: ${name}`);
		}

		log.info(`Job de taxa de câmbio concluído: ${name}`, { jobId: job.id });
	} catch (error) {
		log.error(`Erro no job de taxa de câmbio: ${name}`, {
			jobId: job.id,
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}

/**
 * Atualiza taxa diária
 */
async function updateDailyRate(): Promise<void> {
	log.info("Iniciando atualização diária de taxa USD/BRL");

	try {
		const rate = await FxRateService.updateCurrentRate();
		log.info(`Taxa USD/BRL atualizada com sucesso: ${rate}`);
	} catch (error) {
		log.error("Erro na atualização diária de taxa:", error);
		throw error;
	}
}

/**
 * Limpa taxas antigas
 */
async function cleanupOldRates(): Promise<void> {
	log.info("Iniciando limpeza de taxas antigas");

	try {
		const deletedCount = await FxRateService.cleanupOldRates();
		log.info(`Limpeza concluída: ${deletedCount} taxas antigas removidas`);
	} catch (error) {
		log.error("Erro na limpeza de taxas antigas:", error);
		throw error;
	}
}

/**
 * Preenche taxas para um período (backfill)
 */
async function backfillRates(startDate: string, endDate: string): Promise<void> {
	log.info(`Iniciando backfill de taxas: ${startDate} até ${endDate}`);

	try {
		const start = new Date(startDate);
		const end = new Date(endDate);

		// Para backfill, vamos buscar apenas a taxa atual e aplicar para todas as datas
		// Em um cenário real, você poderia usar uma API histórica
		const currentRate = await FxRateService.fetchCurrentRate();

		const current = new Date(start);
		let daysProcessed = 0;

		while (current <= end) {
			await FxRateService.storeRate(currentRate, new Date(current));
			current.setDate(current.getDate() + 1);
			daysProcessed++;

			// Pequena pausa para não sobrecarregar
			if (daysProcessed % 10 === 0) {
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		}

		log.info(`Backfill concluído: ${daysProcessed} dias processados`);
	} catch (error) {
		log.error("Erro no backfill de taxas:", error);
		throw error;
	}
}

/**
 * Executa backfill de taxas para um período (on-demand via API route)
 */
export async function scheduleBackfillRates(startDate: Date, endDate: Date): Promise<void> {
	try {
		await fxRateQueue.add(
			"backfill-rates",
			{
				startDate: startDate.toISOString().split("T")[0],
				endDate: endDate.toISOString().split("T")[0],
			},
			{
				priority: 5,
			},
		);

		log.info(
			`Job de backfill agendado: ${startDate.toISOString().split("T")[0]} até ${endDate.toISOString().split("T")[0]}`,
		);
	} catch (error) {
		log.error("Erro ao agendar backfill de taxas:", error);
		throw error;
	}
}

/**
 * Bootstrap: busca taxa inicial se não existir nenhuma no banco.
 * Chamado uma vez pelo init.ts. Scheduling recorrente vem do registry.
 */
export async function ensureInitialFxRate(): Promise<void> {
	const latestRate = await FxRateService.getLatestStoredRate();
	if (!latestRate) {
		log.info("[FxRate] Nenhuma taxa encontrada, buscando taxa inicial...");
		await FxRateService.updateCurrentRate();
		log.info("[FxRate] Taxa inicial carregada com sucesso");
	}
}

// Scheduling (repeat jobs) moved to worker/registry.ts (centro da verdade)
// Event handlers moved to worker/init.ts via attachStandardEventHandlers (registry pattern)
