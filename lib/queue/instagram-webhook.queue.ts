// lib/queue/instagram-webhook.queue.ts

import { Queue } from "bullmq";
import { getRedisInstance } from "@/lib/connections";

/**
 * Nome da fila para os webhooks do Instagram.
 */
export const INSTAGRAM_WEBHOOK_QUEUE_NAME = "instagram-webhooks";

/**
 * Nome da fila para notificações automáticas.
 */
export const AUTO_NOTIFICATIONS_QUEUE_NAME = "auto-notifications";

/**
 * Interface para os dados do job do webhook do Instagram.
 */
export interface IInstagramWebhookJobData {
	object: string;
	entry: any[];
	// Adicione outros campos conforme necessário
}

/**
 * Tipos de jobs de notificação automática
 */
export enum AutoNotificationType {
	WELCOME = "welcome",
	EXPIRING_TOKENS = "expiring-tokens",
}

/**
 * Interface para os dados do job de notificação automática.
 */
export interface IAutoNotificationJobData {
	type: AutoNotificationType;
	// Para tokens expirando, especificar dias
	days?: number;
	// Para notificação de boas-vindas, especificar userId
	userId?: string;
}

/**
 * Instância da fila de webhooks do Instagram.
 */
export const instagramWebhookQueue = new Queue<IInstagramWebhookJobData>(INSTAGRAM_WEBHOOK_QUEUE_NAME, {
	connection: getRedisInstance(),
});

/**
 * Instância da fila de notificações automáticas.
 */
export const autoNotificationsQueue = new Queue<IAutoNotificationJobData>(AUTO_NOTIFICATIONS_QUEUE_NAME, {
	connection: getRedisInstance(),
});

/**
 * Adiciona um job para verificar tokens expirando.
 * @param days Número de dias para verificar (3 ou 10)
 */
export const addCheckExpiringTokensJob = async (days = 10) => {
	await autoNotificationsQueue.add(
		`check-expiring-tokens-${days}`,
		{
			type: AutoNotificationType.EXPIRING_TOKENS,
			days,
		},
		{
			// Repetir diariamente à meia-noite
			repeat: {
				pattern: "0 0 * * *", // Cron para meia-noite todos os dias
			},
		},
	);
	console.log(`Job para verificar tokens expirando em ${days} dias adicionado à fila`);
};

/**
 * Adiciona um job para enviar notificação de boas-vindas para um novo usuário.
 * @deprecated Esta função está obsoleta. As notificações de boas-vindas agora são processadas diretamente pela API.
 * @param userId ID do usuário que acabou de se registrar
 */
export const addWelcomeNotificationJob = async (userId: string) => {
	console.warn(
		`OBSOLETO: addWelcomeNotificationJob está obsoleta. As notificações de boas-vindas agora são processadas diretamente pela API.`,
	);
	await autoNotificationsQueue.add(
		`welcome-notification-${userId}`,
		{
			type: AutoNotificationType.WELCOME,
			userId,
		},
		{
			// Executar após 1 minuto do registro
			delay: 60000,
		},
	);
	console.log(`Job para enviar notificação de boas-vindas para o usuário ${userId} adicionado à fila (OBSOLETO)`);
};
