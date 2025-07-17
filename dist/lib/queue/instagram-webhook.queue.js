"use strict";
// lib/queue/instagram-webhook.queue.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.addWelcomeNotificationJob = exports.addCheckExpiringTokensJob = exports.autoNotificationsQueue = exports.instagramWebhookQueue = exports.AutoNotificationType = exports.AUTO_NOTIFICATIONS_QUEUE_NAME = exports.INSTAGRAM_WEBHOOK_QUEUE_NAME = void 0;
const bullmq_1 = require("bullmq");
const redis_1 = require("../../lib/redis");
/**
 * Nome da fila para os webhooks do Instagram.
 */
exports.INSTAGRAM_WEBHOOK_QUEUE_NAME = 'instagram-webhooks';
/**
 * Nome da fila para notificações automáticas.
 */
exports.AUTO_NOTIFICATIONS_QUEUE_NAME = 'auto-notifications';
/**
 * Tipos de jobs de notificação automática
 */
var AutoNotificationType;
(function (AutoNotificationType) {
    AutoNotificationType["WELCOME"] = "welcome";
    AutoNotificationType["EXPIRING_TOKENS"] = "expiring-tokens";
})(AutoNotificationType || (exports.AutoNotificationType = AutoNotificationType = {}));
/**
 * Instância da fila de webhooks do Instagram.
 */
exports.instagramWebhookQueue = new bullmq_1.Queue(exports.INSTAGRAM_WEBHOOK_QUEUE_NAME, { connection: redis_1.connection });
/**
 * Instância da fila de notificações automáticas.
 */
exports.autoNotificationsQueue = new bullmq_1.Queue(exports.AUTO_NOTIFICATIONS_QUEUE_NAME, { connection: redis_1.connection });
/**
 * Adiciona um job para verificar tokens expirando.
 * @param days Número de dias para verificar (3 ou 10)
 */
const addCheckExpiringTokensJob = async (days = 10) => {
    await exports.autoNotificationsQueue.add(`check-expiring-tokens-${days}`, {
        type: AutoNotificationType.EXPIRING_TOKENS,
        days
    }, {
        // Repetir diariamente à meia-noite
        repeat: {
            pattern: '0 0 * * *' // Cron para meia-noite todos os dias
        }
    });
    console.log(`Job para verificar tokens expirando em ${days} dias adicionado à fila`);
};
exports.addCheckExpiringTokensJob = addCheckExpiringTokensJob;
/**
 * Adiciona um job para enviar notificação de boas-vindas para um novo usuário.
 * @deprecated Esta função está obsoleta. As notificações de boas-vindas agora são processadas diretamente pela API.
 * @param userId ID do usuário que acabou de se registrar
 */
const addWelcomeNotificationJob = async (userId) => {
    console.warn(`OBSOLETO: addWelcomeNotificationJob está obsoleta. As notificações de boas-vindas agora são processadas diretamente pela API.`);
    await exports.autoNotificationsQueue.add(`welcome-notification-${userId}`, {
        type: AutoNotificationType.WELCOME,
        userId
    }, {
        // Executar após 1 minuto do registro
        delay: 60000
    });
    console.log(`Job para enviar notificação de boas-vindas para o usuário ${userId} adicionado à fila (OBSOLETO)`);
};
exports.addWelcomeNotificationJob = addWelcomeNotificationJob;
