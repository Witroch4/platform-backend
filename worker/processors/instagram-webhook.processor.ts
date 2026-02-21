/**
 * Instagram Webhook Processor
 * Extracted from automacao.worker.ts to eliminate side-effect Worker instantiation.
 * The Worker is now created by init.ts via the registry.
 */

import type { Job } from "bullmq";
import type { IInstagramWebhookJobData } from "@/lib/queue/instagram-webhook.queue";
import { handleInstagramWebhook } from "../automacao/eu-quero/automation";

export async function processInstagramWebhook(job: Job<IInstagramWebhookJobData>): Promise<void> {
	console.log(`[InstagramWebhookWorker] Processando job: ${job.id}, data:`, JSON.stringify(job.data, null, 2));
	await handleInstagramWebhook(job.data);
	console.log("[InstagramWebhookWorker] Evento(s) processado(s) com sucesso!");
}
