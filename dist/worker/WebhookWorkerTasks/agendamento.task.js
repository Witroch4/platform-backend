"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processAgendamentoTask = processAgendamentoTask;
const axios_1 = __importDefault(require("axios"));
const prisma_1 = require("../../lib/prisma");
const agendamento_service_1 = require("../../lib/agendamento.service");
const agendamento_queue_1 = require("../../lib/queue/agendamento.queue");
const webhookUrl = process.env.WEBHOOK_URL || 'https://default-webhook-url.com';
async function processAgendamentoTask(job) {
    console.log(`[BullMQ] Processando job de agendamento: ${job.id}`);
    console.log(`[BullMQ] Dados do job:`, job.data);
    const agendamentoId = job.data.agendamentoId;
    try {
        const agendamento = await prisma_1.prisma.agendamento.findUnique({
            where: { id: agendamentoId },
        });
        if (!agendamento) {
            console.log(`[BullMQ] Agendamento ${agendamentoId} não encontrado no banco de dados. Job cancelado.`);
            return { success: false, message: 'Agendamento não encontrado' };
        }
        const webhookData = await (0, agendamento_service_1.prepareWebhookData)(agendamentoId);
        const response = await axios_1.default.post(webhookUrl, webhookData, {
            headers: { 'Content-Type': 'application/json' },
        });
        console.log(`[BullMQ] Webhook enviado com sucesso para o agendamento ${agendamentoId}. Resposta: ${response.status}`);
        if (job.data.Diario) {
            const jobDate = new Date(job.data.Data);
            const nextDay = new Date(jobDate);
            nextDay.setDate(nextDay.getDate() + 1);
            console.log(`[BullMQ] Reagendando job diário para: ${nextDay.toISOString()}`);
            await (0, agendamento_queue_1.scheduleAgendamentoJob)({
                id: agendamentoId,
                Data: nextDay,
                userId: job.data.userId,
                accountId: job.data.accountId,
                Diario: true,
            });
        }
        if (job.data.Semanal) {
            const jobDate = new Date(job.data.Data);
            const nextWeek = new Date(jobDate);
            nextWeek.setDate(nextWeek.getDate() + 7);
            console.log(`[BullMQ] Reagendando job semanal para: ${nextWeek.toISOString()}`);
            await (0, agendamento_queue_1.scheduleAgendamentoJob)({
                id: agendamentoId,
                Data: nextWeek,
                userId: job.data.userId,
                accountId: job.data.accountId,
                Semanal: true,
            });
        }
        return { success: true, message: 'Agendamento processado com sucesso' };
    }
    catch (error) {
        console.error(`[BullMQ] Erro ao processar job de agendamento: ${error.message}`);
        throw error;
    }
}
