import { Queue } from 'bullmq';
import { getRedisInstance } from '@/lib/connections';
import type { WebhookPayload } from '@/types/webhook';   // mesmo tipo usado na rota

export const LEADS_QUEUE_NAME = 'filaLeadsChatwit';

export interface ILeadJobData {
  payload: WebhookPayload;        // o payload bruto recebido do Chatwit
}

export interface IFinalAnalysisJobData {
  leadId: string;        // ID do lead para análise final
}

export const leadsQueue = new Queue<ILeadJobData | IFinalAnalysisJobData>(
  LEADS_QUEUE_NAME,
  { 
    connection: getRedisInstance(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 1_000 },
      removeOnComplete: 10_000,
      removeOnFail: 5_000
    }
  }
);

export async function addLeadJob(data: ILeadJobData) {
  const sourceId = data.payload.origemLead.source_id;
  
  try {
    // Use o sourceId como nome do job para facilitar o rastreamento
    const job = await leadsQueue.add(
      `lead-${sourceId}`,
      data,
      {
        // Não define novas opções aqui para usar as padrões,
        // evitando sobrescrever os valores definidos acima
      }
    );
    console.log(`[BullMQ] Job ${job.id} enfileirado para lead ${sourceId} com ${data.payload.origemLead.arquivos?.length || 0} arquivos`);
    return job;
  } catch (error) {
    console.error(`[BullMQ] ERRO ao enfileirar job para lead ${sourceId}:`, error);
    throw error;
  }
}

export async function addFinalAnalysisJob(data: IFinalAnalysisJobData) {
  await leadsQueue.add(
    'process-final-analysis',
    data,
    {
      // Opções padrão serão aplicadas
    }
  );
  console.log(`[BullMQ] Job de análise final enfileirado para lead ${data.leadId}`);
}
