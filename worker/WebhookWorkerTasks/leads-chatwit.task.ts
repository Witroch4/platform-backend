import type { Job } from 'bullmq';
import { prisma } from '../../lib/prisma';
import type { ILeadJobData } from '../../lib/queue/leads-chatwit.queue';

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
        chatwitAccountId: usuario.account.id.toString(),
        accountName: usuario.account.name
      }
    });

    if (usuarioDb) {
      usuarioDb = await prisma.usuarioChatwit.update({
        where: { id: usuarioDb.id },
        data: {
          channel: usuario.channel,
          chatwitAccountId: usuario.account.id.toString() // Atualizar chatwitAccountId
        }
      });
    } else {
      // Buscar o usuário do app pelo externalUserId
      const appUser = await prisma.user.findFirst({
        where: {
          accounts: {
            some: {
              providerAccountId: usuario.account.id.toString()
            }
          }
        }
      });

      if (!appUser) {
        throw new Error(`Usuário do app não encontrado para accountId: ${usuario.account.id}`);
      }

      usuarioDb = await prisma.usuarioChatwit.create({
        data: {
          appUserId: appUser.id, // Usar appUserId em vez de userId
          name: usuario.account.name,
          accountName: usuario.account.name,
          channel: usuario.channel,
          chatwitAccountId: usuario.account.id.toString() // Salvar chatwitAccountId
        }
      });
    }

    // 2) Criar ou atualizar o Lead (nome do Chatwit)
    const lead = await prisma.lead.upsert({
      where: { 
        source_sourceIdentifier_accountId: {
          source: 'CHATWIT_OAB',
          sourceIdentifier: origemLead.source_id,
          accountId: null // Para leads sem account específica
        }
      },
      update: {
        name: origemLead.name || 'Lead sem nome',
        phone: origemLead.phone_number,
        avatarUrl: origemLead.thumbnail,
        updatedAt: new Date()
      },
      create: {
        name: origemLead.name || 'Lead sem nome',
        phone: origemLead.phone_number,
        avatarUrl: origemLead.thumbnail,
        source: 'CHATWIT_OAB',
        sourceIdentifier: origemLead.source_id,
        tags: [],
        userId: usuarioDb.appUserId
      }
    });

    // 3) Criar ou atualizar o LeadOabData (dados específicos da OAB)
    const leadOabData = await prisma.leadOabData.upsert({
      where: { leadId: lead.id },
      update: {
        leadUrl: origemLead.leadUrl,
        updatedAt: new Date()
      },
      create: {
        leadId: lead.id,
        leadUrl: origemLead.leadUrl,
        usuarioChatwitId: usuarioDb.id,
        concluido: false,
        fezRecurso: false,
        manuscritoProcessado: false,
        aguardandoManuscrito: false,
        espelhoProcessado: false,
        aguardandoEspelho: false,
        analiseProcessada: false,
        aguardandoAnalise: false,
        analiseValidada: false,
        consultoriaFase2: false,
        recursoValidado: false,
        aguardandoRecurso: false
      }
    });

    // 4) Coleta todos os arquivos de todos os jobs
    const todosArquivos: any[] = [];
    
    for (const job of jobs) {
      const arquivos = job.data.payload.origemLead.arquivos || [];
      console.log(`[BullMQ] Job ${job.id} tem ${arquivos.length} arquivos para processamento em lote`);
      
      // Adiciona todos os arquivos sem filtragem
      todosArquivos.push(...arquivos);
    }

    console.log(`[BullMQ] Total de arquivos coletados: ${todosArquivos.length}`);

    // 5) Criar anexos em lote - sem nenhuma deduplicação
    if (todosArquivos.length > 0) {
      // Insere em blocos para evitar problemas com muitos arquivos
      const batchSize = 10;
      for (let i = 0; i < todosArquivos.length; i += batchSize) {
        const batch = todosArquivos.slice(i, i + batchSize);
        try {
          const result = await prisma.arquivoLeadOab.createMany({
            data: batch.map(a => ({
              leadOabDataId: leadOabData.id,
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
      const totalArquivos = await prisma.arquivoLeadOab.count({
        where: { leadOabDataId: leadOabData.id }
      });
      
      console.log(`[BullMQ] Total de arquivos no banco para o lead ${sourceId}: ${totalArquivos}`);
    }

    // Marca os jobs como bem-sucedidos
    for (const job of jobs) {
      await job.updateProgress({ processed: true, leadId: leadOabData.id });
    }

    console.log(`[BullMQ] Processamento em lote concluído para lead ${sourceId}.`);
    console.log(`[BullMQ] Lead criado: ${lead.id}, LeadOabData: ${leadOabData.id}`);
    return { leadId: leadOabData.id, jobsProcessados: jobs.length, arquivos: todosArquivos.length };
  } catch (error) {
    console.error(`[BullMQ] Erro ao processar lote para lead ${sourceId}:`, error);
    throw error;
  } finally {
    // Limpa o cache para este sourceId
    delete leadJobsCache[sourceId];
  }
}
