//worker\automacao.worker.ts
import { Worker, type Job } from "bullmq";
import { getRedisInstance } from "@/lib/connections";
import dotenv from "dotenv";
import { INSTAGRAM_WEBHOOK_QUEUE_NAME, type IInstagramWebhookJobData } from "@/lib/queue/instagram-webhook.queue";
import { handleInstagramWebhook } from "./automacao/eu-quero/automation";

dotenv.config();

/**
 * Worker principal que escuta a fila INSTAGRAM_WEBHOOK_QUEUE_NAME
 * e delega o processamento para a lógica de automação ("eu-quero").
 */
export const instagramWebhookWorker = new Worker<IInstagramWebhookJobData>(
	INSTAGRAM_WEBHOOK_QUEUE_NAME,
	async (job: Job<IInstagramWebhookJobData>) => {
		try {
			console.log(`[InstagramWebhookWorker] Processando job: ${job.id}, data:`, JSON.stringify(job.data, null, 2));

			// Delegar para a função que trata a automação "eu-quero"
			await handleInstagramWebhook(job.data);

			console.log("[InstagramWebhookWorker] Evento(s) processado(s) com sucesso!");
		} catch (error: any) {
			console.error("[InstagramWebhookWorker] Erro ao processar evento:", error.message);
			throw error;
		}
	},
	{ connection: getRedisInstance() },
);

// Logs do BullMQ
instagramWebhookWorker.on("active", (job) => {
	console.log(`[InstagramWebhookWorker] Job ativo: id=${job.id}`);
});
instagramWebhookWorker.on("completed", (job) => {
	console.log(`[InstagramWebhookWorker] Job concluído: id=${job.id}`);
});
instagramWebhookWorker.on("failed", (job, err) => {
	console.error(`[InstagramWebhookWorker] Job falhou: id=${job?.id}, Erro: ${err.message}`);
});
instagramWebhookWorker.on("error", (err) => {
	console.error("[InstagramWebhookWorker] Erro no worker:", err);
});

console.log(`[InstagramWebhookWorker] Iniciado e aguardando jobs na fila "${INSTAGRAM_WEBHOOK_QUEUE_NAME}"...`);
