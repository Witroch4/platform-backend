"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.leadCellsQueue = void 0;
exports.addManuscritoJob = addManuscritoJob;
exports.addEspelhoJob = addEspelhoJob;
exports.addAnaliseJob = addAnaliseJob;
exports.addLeadCellJob = addLeadCellJob;
const bullmq_1 = require("bullmq");
const redis_1 = require("../../../lib/redis");
// Queue unificada para todos os tipos de processamento
const leadCellsQueue = new bullmq_1.Queue('leadCells', {
    connection: redis_1.connection,
    defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 5,
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000,
        },
    },
});
exports.leadCellsQueue = leadCellsQueue;
// Função para adicionar job de manuscrito
async function addManuscritoJob(data) {
    console.log('[Queue] Adicionando job de manuscrito:', data.leadID);
    const job = await leadCellsQueue.add('processLeadCell', data, {
        priority: 1, // Alta prioridade para manuscritos
        delay: 0,
    });
    console.log(`[Queue] Job de manuscrito criado com ID: ${job.id}`);
    return job;
}
// Função para adicionar job de espelho
async function addEspelhoJob(data) {
    console.log('[Queue] Adicionando job de espelho:', data.leadID);
    const job = await leadCellsQueue.add('processLeadCell', data, {
        priority: 2, // Prioridade média para espelhos
        delay: 0,
    });
    console.log(`[Queue] Job de espelho criado com ID: ${job.id}`);
    return job;
}
// Função para adicionar job de análise
async function addAnaliseJob(data) {
    console.log('[Queue] Adicionando job de análise:', data.leadID);
    const job = await leadCellsQueue.add('processLeadCell', data, {
        priority: 3, // Prioridade baixa para análises
        delay: 0,
    });
    console.log(`[Queue] Job de análise criado com ID: ${job.id}`);
    return job;
}
// Função genérica para adicionar qualquer tipo de job
async function addLeadCellJob(data) {
    console.log('[Queue] Adicionando job de lead cell:', data.leadID);
    // Determinar prioridade baseada no tipo
    let priority = 3; // padrão
    if ('manuscrito' in data && data.manuscrito)
        priority = 1;
    else if (('espelho' in data && data.espelho) || ('espelhoparabiblioteca' in data && data.espelhoparabiblioteca))
        priority = 2;
    const job = await leadCellsQueue.add('processLeadCell', data, {
        priority,
        delay: 0,
    });
    console.log(`[Queue] Job de lead cell criado com ID: ${job.id}`);
    return job;
}
