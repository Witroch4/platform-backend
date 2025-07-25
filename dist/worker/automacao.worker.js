"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.instagramWebhookWorker = void 0;
//worker\automacao.worker.ts
const bullmq_1 = require("bullmq");
const redis_1 = require("../lib/redis");
const dotenv_1 = __importDefault(require("dotenv"));
const instagram_webhook_queue_1 = require("../lib/queue/instagram-webhook.queue");
const automation_1 = require("./automacao/eu-quero/automation");
dotenv_1.default.config();
/**
 * Worker principal que escuta a fila INSTAGRAM_WEBHOOK_QUEUE_NAME
 * e delega o processamento para a lógica de automação ("eu-quero").
 */
exports.instagramWebhookWorker = new bullmq_1.Worker(instagram_webhook_queue_1.INSTAGRAM_WEBHOOK_QUEUE_NAME, async (job) => {
    try {
        console.log(`[InstagramWebhookWorker] Processando job: ${job.id}, data:`, JSON.stringify(job.data, null, 2));
        // Delegar para a função que trata a automação "eu-quero"
        await (0, automation_1.handleInstagramWebhook)(job.data);
        console.log("[InstagramWebhookWorker] Evento(s) processado(s) com sucesso!");
    }
    catch (error) {
        console.error("[InstagramWebhookWorker] Erro ao processar evento:", error.message);
        throw error;
    }
}, { connection: redis_1.connection });
// Logs do BullMQ
exports.instagramWebhookWorker.on("active", (job) => {
    console.log(`[InstagramWebhookWorker] Job ativo: id=${job.id}`);
});
exports.instagramWebhookWorker.on("completed", (job) => {
    console.log(`[InstagramWebhookWorker] Job concluído: id=${job.id}`);
});
exports.instagramWebhookWorker.on("failed", (job, err) => {
    console.error(`[InstagramWebhookWorker] Job falhou: id=${job?.id}, Erro: ${err.message}`);
});
exports.instagramWebhookWorker.on("error", (err) => {
    console.error("[InstagramWebhookWorker] Erro no worker:", err);
});
console.log(`[InstagramWebhookWorker] Iniciado e aguardando jobs na fila "${instagram_webhook_queue_1.INSTAGRAM_WEBHOOK_QUEUE_NAME}"...`);
