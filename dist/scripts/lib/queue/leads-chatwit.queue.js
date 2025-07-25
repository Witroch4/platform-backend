"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.leadsQueue = exports.LEADS_QUEUE_NAME = void 0;
exports.addLeadJob = addLeadJob;
exports.addFinalAnalysisJob = addFinalAnalysisJob;
const bullmq_1 = require("bullmq");
const redis_1 = require("../../../lib/redis");
exports.LEADS_QUEUE_NAME = 'filaLeadsChatwit';
exports.leadsQueue = new bullmq_1.Queue(exports.LEADS_QUEUE_NAME, {
    connection: redis_1.connection,
    defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: 10_000,
        removeOnFail: 5_000
    }
});
async function addLeadJob(data) {
    const sourceId = data.payload.origemLead.source_id;
    // Use o sourceId como nome do job para facilitar o rastreamento
    await exports.leadsQueue.add(`lead-${sourceId}`, data, {
    // Não define novas opções aqui para usar as padrões,
    // evitando sobrescrever os valores definidos acima
    });
    console.log(`[BullMQ] Job enfileirado para lead ${sourceId}`);
}
async function addFinalAnalysisJob(data) {
    await exports.leadsQueue.add('process-final-analysis', data, {
    // Opções padrão serão aplicadas
    });
    console.log(`[BullMQ] Job de análise final enfileirado para lead ${data.leadId}`);
}
