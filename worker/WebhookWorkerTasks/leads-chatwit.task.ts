import { Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { ILeadJobData } from '@/lib/queue/leads-chatwit.queue';

// Cache para acumular jobs do mesmo lead
const leadJobsCache: Record<string, {
  jobs: Job<ILeadJobData>[];
  timeout: NodeJS.Timeout | null;
}> = {};

// Tempo de acumulação em ms (6 segundos)
const ACCUMULATION_DELAY = 6000;

/**
 * Processa um job da fila "filaLeadsChatwit".
 */
export async function processLeadChatwitTask(job: Job<ILeadJobData>) {
  const { payload } = job.data;
  const sourceId = payload.origemLead.source_id;
  
  // Log mais detalhado dos arquivos recebidos em cada job
  const arquivos = payload.origemLead.arquivos || [];
  console.log(`[BullMQ] Job ${job.id} recebido com ${arquivos.length} arquivos para lead ${sourceId}`);
  
  // Log de cada arquivo para verificar se estão vindo corretamente
  arquivos.forEach((arq, idx) => {
    console.log(`[BullMQ] Job ${job.id} - Arquivo ${idx+1}: ${arq.file_type} - URL: ${arq.data_url ? (arq.data_url.substring(0, 30) + '...') : 'vazio'}`);
  });
  
  // Se não existe este lead no cache, cria entrada
  if (!leadJobsCache[sourceId]) {
    leadJobsCache[sourceId] = {
      jobs: [job],
      timeout: setTimeout(() => processAccumulatedJobs(sourceId), ACCUMULATION_DELAY)
    };
    return { status: 'acumulando', sourceId };
  }
  
  // Adiciona o job ao cache e reinicia o timeout
  clearTimeout(leadJobsCache[sourceId].timeout!);
  leadJobsCache[sourceId].jobs.push(job);
  leadJobsCache[sourceId].timeout = setTimeout(() => processAccumulatedJobs(sourceId), ACCUMULATION_DELAY);
  
  return { status: 'acumulando', sourceId };
}

/**
 * Processa todos os jobs acumulados para um determinado sourceId
 */
async function processAccumulatedJobs(sourceId: string) {
  if (!leadJobsCache[sourceId]) return;
  
  const { jobs } = leadJobsCache[sourceId];
  console.log(`[BullMQ] Processando lote de ${jobs.length} jobs para lead ${sourceId}`);
  
  try {
    // Pega o primeiro job para dados do usuário e informações básicas do lead
    const firstJob = jobs[0];
    const { usuario, origemLead } = firstJob.data.payload;
    
    // 1) Find or create/update do usuário
    let usuarioDb = await prisma.usuarioChatwit.findFirst({
      where: {
        userId: Number(usuario.account.id),
        accountName: usuario.account.name
      }
    });

    if (usuarioDb) {
      usuarioDb = await prisma.usuarioChatwit.update({
        where: { id: usuarioDb.id },
        data: {
          channel: usuario.channel,
          inboxId: usuario.inbox?.id ?? undefined,
          inboxName: usuario.inbox?.name
        }
      });
    } else {
      usuarioDb = await prisma.usuarioChatwit.create({
        data: {
          userId: Number(usuario.account.id),
          name: usuario.account.name,
          accountId: Number(usuario.account.id),
          accountName: usuario.account.name,
          channel: usuario.channel,
          inboxId: usuario.inbox?.id ?? undefined,
          inboxName: usuario.inbox?.name
        }
      });
    }

    // 2) Upsert do lead usando sourceId agora marcado @unique
    const lead = await prisma.leadChatwit.upsert({
      where: { sourceId },
      update: {
        thumbnail: origemLead.thumbnail,
        leadUrl: origemLead.leadUrl,
        chatwitAccessToken: firstJob.data.payload.usuario.CHATWIT_ACCESS_TOKEN
      },
      create: {
        usuarioId: usuarioDb.id,
        sourceId: origemLead.source_id,
        name: origemLead.name || 'Lead sem nome',
        phoneNumber: origemLead.phone_number,
        thumbnail: origemLead.thumbnail,
        leadUrl: origemLead.leadUrl,
        chatwitAccessToken: firstJob.data.payload.usuario.CHATWIT_ACCESS_TOKEN
      }
    });

    // 3) Coleta todos os arquivos de todos os jobs
    let todosArquivos = [];
    
    for (const job of jobs) {
      const arquivos = job.data.payload.origemLead.arquivos || [];
      console.log(`[BullMQ] Job ${job.id} tem ${arquivos.length} arquivos para processamento em lote`);
      
      // Adiciona todos os arquivos sem filtragem
      todosArquivos.push(...arquivos);
    }

    console.log(`[BullMQ] Total de arquivos coletados: ${todosArquivos.length}`);

    // 4) Criar anexos em lote - sem nenhuma deduplicação
    if (todosArquivos.length > 0) {
      // Insere em blocos para evitar problemas com muitos arquivos
      const batchSize = 10;
      for (let i = 0; i < todosArquivos.length; i += batchSize) {
        const batch = todosArquivos.slice(i, i + batchSize);
        try {
          const result = await prisma.arquivoLeadChatwit.createMany({
            data: batch.map(a => ({
              leadId: lead.id,
              fileType: a.file_type,
              dataUrl: a.data_url
            })),
            // Não pula duplicatas - tenta inserir todos
            skipDuplicates: false
          });
          console.log(`[BullMQ] Batch ${Math.floor(i/batchSize) + 1}: inseridos ${result.count} arquivos`);
        } catch (error) {
          console.error(`[BullMQ] Erro ao inserir batch de arquivos:`, error);
        }
      }
      
      // Verifica quantos arquivos temos no total após a operação
      const totalArquivos = await prisma.arquivoLeadChatwit.count({
        where: { leadId: lead.id }
      });
      
      console.log(`[BullMQ] Total de arquivos no banco para o lead ${sourceId}: ${totalArquivos}`);
    }

    // Marca os jobs como bem-sucedidos
    for (const job of jobs) {
      await job.updateProgress({ processed: true, leadId: lead.id });
    }

    console.log(`[BullMQ] Processamento em lote concluído para lead ${sourceId}.`);
    return { leadId: lead.id, jobsProcessados: jobs.length, arquivos: todosArquivos.length };
  } catch (error) {
    console.error(`[BullMQ] Erro ao processar lote para lead ${sourceId}:`, error);
    throw error;
  } finally {
    // Limpa o cache para este sourceId
    delete leadJobsCache[sourceId];
  }
}
