// lib/queue/instagram-webhook.queue.ts

import { Queue } from "bullmq";
import { getRedisInstance } from "@/lib/connections";

/**
 * Nome da fila para os webhooks do Instagram.
 */
export const INSTAGRAM_WEBHOOK_QUEUE_NAME = "instagram-webhooks";

/**
 * Interface para os dados do job do webhook do Instagram.
 */
export interface IInstagramWebhookJobData {
	object: string;
	entry: any[];
}

// [CLEANUP 2026-02-21] Auto-notifications queue REMOVIDA (zombie — sem consumer BullMQ)
// Tokens expirando agora verificados via cron direto (worker/cron-jobs.ts)
// Boas-vindas processadas diretamente pela API

/**
 * Tipos de jobs de notificação automática
 * Mantido para backward compat do cron-jobs.ts
 */
export enum AutoNotificationType {
	WELCOME = "welcome",
	EXPIRING_TOKENS = "expiring-tokens",
}

/**
 * Instância da fila de webhooks do Instagram.
 */
export const instagramWebhookQueue = new Queue<IInstagramWebhookJobData>(INSTAGRAM_WEBHOOK_QUEUE_NAME, {
	connection: getRedisInstance(),
});
