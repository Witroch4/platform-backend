"use strict";
// lib/queue/agendamento.queue.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.agendamentoQueue = void 0;
exports.scheduleAgendamentoJob = scheduleAgendamentoJob;
exports.cancelAgendamentoJob = cancelAgendamentoJob;
const bullmq_1 = require("bullmq");
const redis_1 = require("@/lib/redis");
const AGENDAMENTO_QUEUE_NAME = 'agendamento';
/**
 * Criação da Fila de Agendamento
 */
exports.agendamentoQueue = new bullmq_1.Queue('agendamento', {
    connection: redis_1.connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
    }
});
/**
 * Agenda um job na fila com delay calculado.
 * @param agendamento Objeto com os dados do agendamento (id, Data, userID, accountId, Diario, Semanal)
 */
async function scheduleAgendamentoJob(agendamento) {
    // Calcula o delay em milissegundos
    const delay = new Date(agendamento.Data).getTime() - Date.now();
    const delayMs = Math.max(delay, 0); // Garante que o delay não seja negativo
    const jobData = {
        agendamentoId: agendamento.id,
        Data: agendamento.Data.toISOString(),
        userId: agendamento.userId,
        accountId: agendamento.accountId,
        Diario: agendamento.Diario,
        Semanal: agendamento.Semanal,
    };
    console.log(`[AgendamentoQueue] Agendando job para ${agendamento.Data.toISOString()} (delay: ${delayMs}ms)`);
    await exports.agendamentoQueue.add('process-agendamento', jobData, {
        delay: delayMs,
        jobId: `ag-job-${agendamento.id}-${Date.now()}`, // Garante ID único mesmo para reagendamentos
    });
}
/**
 * Cancela um job de agendamento na fila
 * @param agendamentoId ID do agendamento a ser cancelado
 */
// DEPOIS: filtre direto pelo agendamentoId que tá no payload
async function cancelAgendamentoJob(agendamentoId) {
    // pode buscar apenas os jobs delayed ou waiting:
    const jobs = await exports.agendamentoQueue.getJobs(['delayed', 'waiting']);
    const jobsToRemove = jobs.filter(job => job.data.agendamentoId === agendamentoId);
    console.log(`[AgendamentoQueue] Cancelando ${jobsToRemove.length} jobs para o agendamento ${agendamentoId}`);
    await Promise.all(jobsToRemove.map(job => job.remove()));
}
