import type { Job } from 'bullmq';
import axios from 'axios';
import { getPrismaInstance } from '@/lib/connections';
import { prepareWebhookData } from '@/lib/agendamento.service';
import { scheduleAgendamentoJob } from '@/lib/queue/agendamento.queue';
import type { IAgendamentoJobData } from '@/lib/queue/agendamento.queue';

const webhookUrl = process.env.WEBHOOK_URL || 'https://default-webhook-url.com';

export async function processAgendamentoTask(job: Job<IAgendamentoJobData>) {
  console.log(`[BullMQ] Processando job de agendamento: ${job.id}`);
  console.log(`[BullMQ] Dados do job:`, job.data);

  const agendamentoId = job.data.agendamentoId;

  try {
    const agendamento = await getPrismaInstance().agendamento.findUnique({
      where: { id: agendamentoId },
    });

    if (!agendamento) {
      console.log(`[BullMQ] Agendamento ${agendamentoId} não encontrado no banco de dados. Job cancelado.`);
      return { success: false, message: 'Agendamento não encontrado' };
    }

    const webhookData = await prepareWebhookData(agendamentoId);

    const response = await axios.post(webhookUrl, webhookData, {
      headers: { 'Content-Type': 'application/json' },
    });

    console.log(`[BullMQ] Webhook enviado com sucesso para o agendamento ${agendamentoId}. Resposta: ${response.status}`);

    if (job.data.Diario) {
      const jobDate = new Date(job.data.Data);
      const nextDay = new Date(jobDate);
      nextDay.setDate(nextDay.getDate() + 1);

      console.log(`[BullMQ] Reagendando job diário para: ${nextDay.toISOString()}`);

      await scheduleAgendamentoJob({
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

      await scheduleAgendamentoJob({
        id: agendamentoId,
        Data: nextWeek,
        userId: job.data.userId,
        accountId: job.data.accountId,
        Semanal: true,
      });
    }

    return { success: true, message: 'Agendamento processado com sucesso' };
  } catch (error: any) {
    console.error(`[BullMQ] Erro ao processar job de agendamento: ${error.message}`);
    throw error;
  }
} 