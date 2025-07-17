"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeWorkers = initializeWorkers;
const webhook_worker_1 = require("./webhook.worker");
const scheduler_bullmq_1 = require("@/lib/scheduler-bullmq");
const webhook_worker_2 = require("./webhook.worker");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
/**
 * Inicializa todos os workers e agendamentos existentes
 */
async function initializeWorkers() {
    try {
        console.log('[Worker] Inicializando workers...');
        // Inicializa o worker de agendamento (agora é feito no bull-board-server.ts)
        // await initAgendamentoWorker();
        // Inicializa o worker de manuscrito
        await (0, webhook_worker_1.initManuscritoWorker)();
        // Inicializa o worker de leads-chatwit
        await (0, webhook_worker_1.initLeadsChatwitWorker)();
        // Inicializa os jobs recorrentes (apenas uma vez)
        await (0, webhook_worker_2.initJobs)();
        // Inicializa os agendamentos existentes
        const result = await (0, scheduler_bullmq_1.initializeExistingAgendamentos)();
        console.log(`[Worker] Workers inicializados com sucesso. ${result.count} agendamentos carregados.`);
        return { success: true, count: result.count };
    }
    catch (error) {
        console.error('[Worker] Erro ao inicializar workers:', error);
        return { success: false, error };
    }
}
// Se este arquivo for executado diretamente (não importado)
if (require.main === module) {
    initializeWorkers()
        .then(() => {
        console.log('[Worker] Inicialização concluída.');
    })
        .catch((error) => {
        console.error('[Worker] Erro na inicialização:', error);
        process.exit(1);
    });
}
