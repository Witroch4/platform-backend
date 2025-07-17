"use strict";
// bull-board-server.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const api_1 = require("@bull-board/api");
const bullMQAdapter_1 = require("@bull-board/api/bullMQAdapter");
const express_2 = require("@bull-board/express");
const agendamento_queue_1 = require("./lib/queue/agendamento.queue");
const instagram_webhook_queue_1 = require("./lib/queue/instagram-webhook.queue");
const followUpQueue_1 = require("./worker/queues/followUpQueue");
const manuscrito_queue_1 = require("./lib/queue/manuscrito.queue");
const init_1 = require("./worker/init");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const serverAdapter = new express_2.ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');
// Registra todas as filas no Bull Board
const bullBoard = (0, api_1.createBullBoard)({
    queues: [
        // @ts-ignore - Ignorando erro de tipos devido à incompatibilidade entre versões
        new bullMQAdapter_1.BullMQAdapter(agendamento_queue_1.agendamentoQueue),
        // @ts-ignore - Ignorando erro de tipos devido à incompatibilidade entre versões
        new bullMQAdapter_1.BullMQAdapter(instagram_webhook_queue_1.instagramWebhookQueue),
        // @ts-ignore - Ignorando erro de tipos devido à incompatibilidade entre versões
        new bullMQAdapter_1.BullMQAdapter(instagram_webhook_queue_1.autoNotificationsQueue),
        // @ts-ignore - Ignorando erro de tipos devido à incompatibilidade entre versões
        new bullMQAdapter_1.BullMQAdapter(followUpQueue_1.followUpQueue),
        // @ts-ignore - Ignorando erro de tipos devido à incompatibilidade entre versões
        new bullMQAdapter_1.BullMQAdapter(manuscrito_queue_1.manuscritoQueue)
    ],
    serverAdapter,
});
app.use('/admin/queues', serverAdapter.getRouter());
const PORT = process.env.BULL_BOARD_PORT || 3005;
// Inicializa os workers e agendamentos existentes de forma centralizada
async function initializeAllWorkers() {
    console.log('[BullBoard] Iniciando inicialização centralizada dos workers...');
    try {
        // Inicializa o worker de agendamento diretamente
        // await initAgendamentoWorker();
        // Inicializa os agendamentos existentes e outros workers
        const result = await (0, init_1.initializeWorkers)();
        console.log('[BullBoard] Todos os workers inicializados com sucesso');
        return result;
    }
    catch (error) {
        console.error('[BullBoard] Erro ao inicializar workers:', error);
        throw error;
    }
}
// Inicializa os workers e depois inicia o servidor
initializeAllWorkers()
    .then(() => {
    app.listen(PORT, () => {
        console.log(`Bull Board rodando em http://localhost:${PORT}/admin/queues`);
    });
})
    .catch((error) => {
    console.error('[BullBoard] Erro crítico na inicialização:', error);
    process.exit(1);
});
