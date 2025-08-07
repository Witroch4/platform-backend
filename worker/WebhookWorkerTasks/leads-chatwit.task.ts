import type { Job } from 'bullmq';
import { getPrismaInstance } from '../../lib/connections';
import type { ILeadJobData } from '../../lib/queue/leads-chatwit.queue';

/**
 * Processa um job da fila "filaLeadsChatwit" - Processamento individual imediato.
 */
export async function processLeadChatwitTask(job: Job<ILeadJobData>) {
  const { payload } = job.data;
  const sourceId = payload.origemLead.source_id;
  
  // Log de início do processamento
  const arquivos = payload.origemLead.arquivos || [];
  console.log(`[BullMQ-Individual] Job ${job.id} processando ${arquivos.length} arquivos para lead ${sourceId}`);
  
  try {
    // Processar IMEDIATAMENTE cada job individual
    await processIndividualJob(sourceId, job.id, payload);
    
    console.log(`[BullMQ-Individual] Job ${job.id} concluído com sucesso para lead ${sourceId}`);
    return { status: 'processado', sourceId, jobId: job.id };
    
  } catch (error) {
    console.error(`[BullMQ-Individual] Erro ao processar job ${job.id}:`, error);
    throw error;
  }
}

/**
 * Processa um job individual imediatamente
 */
async function processIndividualJob(sourceId: string, jobId: any, payload: any) {
  try {
    // Extrair dados do payload atual
    const { usuario, origemLead } = payload;
    
    // Converter todos os IDs para string antes de usar
    const chatwitAccountId = String(usuario.account.id);
    const chatwitInboxId = String(usuario.inbox.id);
    const leadSourceId = String(origemLead.source_id);
    
    console.log(`[BullMQ-Individual] IDs convertidos para string:`, {
      chatwitAccountId,
      chatwitInboxId, 
      leadSourceId,
      accountName: usuario.account.name,
      inboxName: usuario.inbox.name
    });
    
    // 1) Find or create/update do usuário
    let usuarioDb = await getPrismaInstance().usuarioChatwit.findFirst({
      where: {
        chatwitAccountId: chatwitAccountId,
        accountName: usuario.account.name
      }
    });

    if (usuarioDb) {
      usuarioDb = await getPrismaInstance().usuarioChatwit.update({
        where: { id: usuarioDb.id },
        data: {
          channel: usuario.channel,
          chatwitAccountId: chatwitAccountId // Usar variável convertida
        }
      });
    } else {
      // Buscar o usuário do app pelo externalUserId
      const appUser = await getPrismaInstance().user.findFirst({
        where: {
          accounts: {
            some: {
              providerAccountId: chatwitAccountId
            }
          }
        }
      });

      if (!appUser) {
        throw new Error(`Usuário do app não encontrado para accountId: ${chatwitAccountId}`);
      }

      usuarioDb = await getPrismaInstance().usuarioChatwit.create({
        data: {
          appUserId: appUser.id, // Usar appUserId em vez de userId
          name: usuario.account.name,
          accountName: usuario.account.name,
          channel: usuario.channel,
          chatwitAccountId: chatwitAccountId // Usar variável convertida
        }
      });
    }

    // 2) Criar ou buscar Account específica para esta conta Chatwit
    const CHATWIT_ACCOUNT_ID = `CHATWIT_${chatwitAccountId}`; // Ex: CHATWIT_3
    
    // Garantir que existe uma Account específica para esta conta Chatwit
    let chatwitAccount = await getPrismaInstance().account.findUnique({
      where: { id: CHATWIT_ACCOUNT_ID }
    });
    
    if (!chatwitAccount) {
      // Criar Account específica para esta conta Chatwit
      chatwitAccount = await getPrismaInstance().account.create({
        data: {
          id: CHATWIT_ACCOUNT_ID,
          userId: usuarioDb.appUserId, // Associar ao usuário
          type: 'chatwit',
          provider: 'chatwit',
          providerAccountId: chatwitAccountId, // ID original da conta Chatwit
        }
      });
      console.log(`[BullMQ-Individual] Account criada para Chatwit ${chatwitAccountId}:`, chatwitAccount.id);
    }
    
    const lead = await getPrismaInstance().lead.upsert({
      where: { 
        source_sourceIdentifier_accountId: {
          source: 'CHATWIT_OAB',
          sourceIdentifier: leadSourceId, // ID único do lead na origem (Chatwit)
          accountId: CHATWIT_ACCOUNT_ID // Account específica para esta conta Chatwit
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
        sourceIdentifier: leadSourceId, // ID único do lead na origem (Chatwit)
        accountId: CHATWIT_ACCOUNT_ID, // Account específica para esta conta Chatwit
        tags: [],
        userId: usuarioDb.appUserId // Pertence ao User, mas associação é via UsuarioChatwit->LeadOabData
      }
    });

    console.log(`[BullMQ-Individual] Lead criado/atualizado:`, {
      leadId: lead.id,
      sourceIdentifier: leadSourceId,
      accountId: CHATWIT_ACCOUNT_ID,
      usuarioChatwitId: usuarioDb.id,
      appUserId: usuarioDb.appUserId
    });

    // 4) Criar ou atualizar o LeadOabData (dados específicos da OAB)
    const leadOabData = await getPrismaInstance().leadOabData.upsert({
      where: { leadId: lead.id },
      update: {
        leadUrl: origemLead.leadUrl
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

    // Atualizar o timestamp do Lead pai
    await getPrismaInstance().lead.update({
      where: { id: lead.id },
      data: {
        updatedAt: new Date()
      }
    });

    // 5) Coleta os arquivos do job atual
    const arquivos = origemLead.arquivos || [];
    console.log(`[BullMQ-Individual] Job ${jobId} tem ${arquivos.length} arquivos para processamento individual`);

    // 6) Criar anexos individuais
    if (arquivos.length > 0) {
      try {
        const result = await getPrismaInstance().arquivoLeadOab.createMany({
          data: arquivos.map(a => ({
            leadOabDataId: leadOabData.id,
            fileType: a.file_type,
            dataUrl: a.data_url
          })),
          skipDuplicates: false
        });
        console.log(`[BullMQ-Individual] Inseridos ${result.count} arquivos para job ${jobId}`);
      } catch (error) {
        console.error(`[BullMQ-Individual] Erro ao inserir arquivos do job ${jobId}:`, error);
      }
      
      // Verifica quantos arquivos temos no total após a operação
      const totalArquivos = await getPrismaInstance().arquivoLeadOab.count({
        where: { leadOabDataId: leadOabData.id }
      });
      
      console.log(`[BullMQ-Individual] Total de arquivos no banco para o lead ${sourceId}: ${totalArquivos}`);
    }

    // Log de conclusão
    console.log(`[BullMQ-Individual] Arquivo processado individualmente - Lead: ${sourceId}, Job: ${jobId}, Arquivos: ${arquivos.length}`);
    
    return { leadId: leadOabData.id, jobsProcessados: 1, arquivos: arquivos.length };
    
  } catch (error) {
    console.error(`[BullMQ-Individual] Erro ao processar job individual ${jobId} para lead ${sourceId}:`, error);
    throw error;
  }
}


