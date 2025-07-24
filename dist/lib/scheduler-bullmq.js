"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleAgendamentoBullMQ = scheduleAgendamentoBullMQ;
exports.cancelAgendamentoBullMQ = cancelAgendamentoBullMQ;
exports.initializeExistingAgendamentos = initializeExistingAgendamentos;
const prisma_1 = require("@/lib/prisma");
const agendamento_queue_1 = require("@/lib/queue/agendamento.queue");
// Variável para controlar se já inicializamos os agendamentos
let agendamentosInitialized = false;
/**
 * Agenda um agendamento no BullMQ
 * @param data Dados do agendamento
 */
async function scheduleAgendamentoBullMQ(data) {
    try {
        const agendamentoId = typeof data.id === 'number' ? String(data.id) : data.id;
        // Agenda o job na fila BullMQ
        await (0, agendamento_queue_1.scheduleAgendamentoJob)({
            id: agendamentoId,
            Data: new Date(data.Data),
            userId: data.userID,
            accountId: data.accountId,
            Diario: data.Diario,
        });
        console.log(`[Scheduler] Agendamento ${agendamentoId} agendado para ${data.Data}`);
        return { success: true };
    }
    catch (error) {
        console.error('[Scheduler] Erro ao agendar:', error);
        return { success: false, error };
    }
}
/**
 * Cancela um agendamento no BullMQ
 * @param agendamentoId ID do agendamento a ser cancelado
 */
async function cancelAgendamentoBullMQ(agendamentoId) {
    try {
        const id = typeof agendamentoId === 'number' ? String(agendamentoId) : agendamentoId;
        // Cancela o job na fila BullMQ
        await (0, agendamento_queue_1.cancelAgendamentoJob)(id);
        console.log(`[Scheduler] Agendamento ${id} cancelado com sucesso`);
        return { success: true };
    }
    catch (error) {
        console.error(`[Scheduler] Erro ao cancelar agendamento ${agendamentoId}:`, error);
        return { success: false, error };
    }
}
/**
 * Inicializa os agendamentos existentes no banco de dados
 * Deve ser chamado na inicialização do servidor
 */
async function initializeExistingAgendamentos() {
    // Evita inicialização duplicada
    if (agendamentosInitialized) {
        console.log('[Scheduler] Agendamentos já foram inicializados anteriormente. Ignorando.');
        return { success: true, count: 0, alreadyInitialized: true };
    }
    try {
        // Busca todos os agendamentos futuros
        const agendamentos = await prisma_1.prisma.agendamento.findMany({
            where: {
                Data: {
                    gte: new Date(), // Apenas agendamentos futuros
                },
            },
        });
        console.log(`[Scheduler] Inicializando ${agendamentos.length} agendamentos existentes`);
        // Agenda cada um na fila
        for (const agendamento of agendamentos) {
            await (0, agendamento_queue_1.scheduleAgendamentoJob)({
                id: agendamento.id,
                Data: agendamento.Data,
                userId: agendamento.userId,
                accountId: agendamento.accountId,
                Diario: agendamento.Diario,
            });
        }
        console.log('[Scheduler] Todos os agendamentos existentes foram inicializados');
        // Marca como inicializado
        agendamentosInitialized = true;
        return { success: true, count: agendamentos.length };
    }
    catch (error) {
        console.error('[Scheduler] Erro ao inicializar agendamentos existentes:', error);
        return { success: false, error };
    }
}
