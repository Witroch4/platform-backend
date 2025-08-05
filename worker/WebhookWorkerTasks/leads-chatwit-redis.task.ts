import type { Job } from 'bullmq';
import { getPrismaInstance } from '../../lib/connections';
import { getRedisInstance } from '../../lib/connections';
import type { ILeadJobData } from '../../lib/queue/leads-chatwit.queue';

// Cache Redis distribuído usando o sistema de conexões singleton
const redis = getRedisInstance();

// Chaves Redis para organização
const CACHE_PREFIX = 'leads_cache:';
const TIMEOUT_PREFIX = 'leads_timeout:';
const PROCESSING_PREFIX = 'leads_processing:';

// Tempo de acumulação em ms (6 segundos)
const ACCUMULATION_DELAY = 6000;

/**
 * Processa um job da fila "filaLeadsChatwit" usando cache Redis distribuído.
 */
export async function processLeadChatwitTask(job: Job<ILeadJobData>) {
  const { payload } = job.data;
  const sourceId = payload.origemLead.source_id;
  
  const cacheKey = `${CACHE_PREFIX}${sourceId}`;
  const timeoutKey = `${TIMEOUT_PREFIX}${sourceId}`;
  
  // Log mais detalhado dos arquivos recebidos em cada job
  const arquivos = payload.origemLead.arquivos || [];
  console.log(`[BullMQ-Redis] Job ${job.id} recebido com ${arquivos.length} arquivos para lead ${sourceId}`);
  
  try {
    // Verificar estado atual do cache Redis
    const cacheSize = await redis.llen(cacheKey);
    console.log(`[BullMQ-Redis] Job ${job.id} - Estado do cache para lead ${sourceId}: ${cacheSize} jobs acumulados`);
    
    // Log de cada arquivo para verificar se estão vindo corretamente
    arquivos.forEach((arq, idx) => {
      console.log(`[BullMQ-Redis] Job ${job.id} - Arquivo ${idx+1}: ${arq.file_type} - URL: ${arq.data_url ? (arq.data_url.substring(0, 30) + '...') : 'vazio'}`);
    });
    
    // Preparar dados do job para armazenar no Redis
    const jobData = JSON.stringify({
      id: job.id,
      payload: job.data.payload,
      timestamp: Date.now()
    });
    
    // Adicionar job ao cache Redis atomicamente
    const pipeline = redis.pipeline();
    pipeline.lpush(cacheKey, jobData);
    pipeline.expire(cacheKey, 300); // Expira em 5 minutos como segurança
    
    await pipeline.exec();
    
    // Verificar se já existe um timeout ativo
    const hasTimeout = await redis.exists(timeoutKey);
    
    if (!hasTimeout) {
      console.log(`[BullMQ-Redis] Job ${job.id} - Criando nova entrada de timeout para lead ${sourceId}`);
      
      // Marcar timeout como ativo no Redis
      await redis.setex(timeoutKey, Math.ceil(ACCUMULATION_DELAY / 1000), 'active');
      
      // Agendar processamento após delay
      setTimeout(async () => {
        await processAccumulatedJobsRedis(sourceId);
      }, ACCUMULATION_DELAY);
      
      console.log(`[BullMQ-Redis] Job ${job.id} - Timeout de ${ACCUMULATION_DELAY}ms iniciado para lead ${sourceId}`);
    } else {
      const newCacheSize = await redis.llen(cacheKey);
      console.log(`[BullMQ-Redis] Job ${job.id} - Adicionando ao cache existente para lead ${sourceId}. Total: ${newCacheSize} jobs`);
    }
    
    return { status: 'acumulando', sourceId };
    
  } catch (error) {
    console.error(`[BullMQ-Redis] Erro ao processar job ${job.id}:`, error);
    throw error;
  }
}

/**
 * Processa todos os jobs acumulados para um determinado sourceId usando Redis
 */
async function processAccumulatedJobsRedis(sourceId: string) {
  const cacheKey = `${CACHE_PREFIX}${sourceId}`;
  const timeoutKey = `${TIMEOUT_PREFIX}${sourceId}`;
  const processingKey = `${PROCESSING_PREFIX}${sourceId}`;
  
  try {
    // Verificar se já está sendo processado por outro worker
    const isProcessing = await redis.exists(processingKey);
    if (isProcessing) {
      console.log(`[BullMQ-Redis] Lead ${sourceId} já está sendo processado por outro worker`);
      return;
    }
    
    // Marcar como processando (TTL de 60s como segurança)
    await redis.setex(processingKey, 60, 'processing');
    
    // Buscar e remover todos os jobs do cache atomicamente
    const pipeline = redis.pipeline();
    pipeline.lrange(cacheKey, 0, -1);
    pipeline.del(cacheKey);
    pipeline.del(timeoutKey);
    
    const results = await pipeline.exec();
    if (!results || !results[0] || !results[0][1]) {
      console.log(`[BullMQ-Redis] Nenhum job encontrado no cache para lead ${sourceId}`);
      await redis.del(processingKey);
      return;
    }
    
    const jobsData = results[0][1] as string[];
    if (jobsData.length === 0) {
      console.log(`[BullMQ-Redis] Cache vazio para lead ${sourceId}`);
      await redis.del(processingKey);
      return;
    }
    
    // Converter dados dos jobs (reverter ordem para FIFO)
    const jobsArray = jobsData.map(jobStr => JSON.parse(jobStr)).reverse();
    
    console.log(`[BullMQ-Redis] ===== INICIANDO PROCESSAMENTO EM LOTE (REDIS) =====`);
    console.log(`[BullMQ-Redis] Lead: ${sourceId}`);
    console.log(`[BullMQ-Redis] Total de jobs no lote: ${jobsArray.length}`);
    console.log(`[BullMQ-Redis] IDs dos jobs: [${jobsArray.map(j => j.id).join(', ')}]`);
    console.log(`[BullMQ-Redis] ==================================================`);
    
    // Processar usando a mesma lógica, mas com dados do Redis
    await processBatchFromRedis(sourceId, jobsArray);
    
  } catch (error) {
    console.error(`[BullMQ-Redis] Erro ao processar lote para lead ${sourceId}:`, error);
    throw error;
  } finally {
    // Limpar flag de processamento
    await redis.del(processingKey);
  }
}

/**
 * Processa um lote de jobs vindos do Redis
 */
async function processBatchFromRedis(sourceId: string, jobsArray: any[]) {
  try {
    // Pega o primeiro job para dados do usuário e informações básicas do lead
    const firstJobData = jobsArray[0];
    const { usuario, origemLead } = firstJobData.payload;
    
    // 1) Find or create/update do usuário
    let usuarioDb = await getPrismaInstance().usuarioChatwit.findFirst({
      where: {
        chatwitAccountId: usuario.account.id.toString(),
        accountName: usuario.account.name
      }
    });

    if (usuarioDb) {
      usuarioDb = await getPrismaInstance().usuarioChatwit.update({
        where: { id: usuarioDb.id },
        data: {
          channel: usuario.channel,
          chatwitAccountId: usuario.account.id.toString() // Atualizar chatwitAccountId
        }
      });
    } else {
      // Buscar o usuário do app pelo externalUserId
      const appUser = await getPrismaInstance().user.findFirst({
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

      usuarioDb = await getPrismaInstance().usuarioChatwit.create({
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
    const lead = await getPrismaInstance().lead.upsert({
      where: { 
        source_sourceIdentifier_accountId: {
          source: 'CHATWIT_OAB',
          sourceIdentifier: origemLead.source_id,
          accountId: '' // Para leads sem account específica
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
        accountId: '',
        tags: [],
        userId: usuarioDb.appUserId
      }
    });

    // 3) Criar ou atualizar o LeadOabData (dados específicos da OAB)
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

    // 4) Coleta todos os arquivos de todos os jobs do Redis
    const todosArquivos: any[] = [];
    
    for (const jobData of jobsArray) {
      const arquivos = jobData.payload.origemLead.arquivos || [];
      console.log(`[BullMQ-Redis] Job ${jobData.id} tem ${arquivos.length} arquivos para processamento em lote`);
      
      // Adiciona todos os arquivos sem filtragem
      todosArquivos.push(...arquivos);
    }

    console.log(`[BullMQ-Redis] Total de arquivos coletados: ${todosArquivos.length}`);

    // 5) Criar anexos em lote - sem nenhuma deduplicação
    if (todosArquivos.length > 0) {
      // Insere em blocos para evitar problemas com muitos arquivos
      const batchSize = 10;
      for (let i = 0; i < todosArquivos.length; i += batchSize) {
        const batch = todosArquivos.slice(i, i + batchSize);
        try {
          const result = await getPrismaInstance().arquivoLeadOab.createMany({
            data: batch.map(a => ({
              leadOabDataId: leadOabData.id,
              fileType: a.file_type,
              dataUrl: a.data_url
            })),
            // Não pula duplicatas - tenta inserir todos
            skipDuplicates: false
          });
          console.log(`[BullMQ-Redis] Batch ${Math.floor(i/batchSize) + 1}: inseridos ${result.count} arquivos`);
        } catch (error) {
          console.error(`[BullMQ-Redis] Erro ao inserir batch de arquivos:`, error);
        }
      }
      
      // Verifica quantos arquivos temos no total após a operação
      const totalArquivos = await getPrismaInstance().arquivoLeadOab.count({
        where: { leadOabDataId: leadOabData.id }
      });
      
      console.log(`[BullMQ-Redis] Total de arquivos no banco para o lead ${sourceId}: ${totalArquivos}`);
    }

    // Log de conclusão (não podemos marcar jobs como processados pois vieram do Redis)
    console.log(`[BullMQ-Redis] ===== PROCESSAMENTO EM LOTE CONCLUÍDO (REDIS) =====`);
    console.log(`[BullMQ-Redis] Lead: ${sourceId}`);
    console.log(`[BullMQ-Redis] Jobs processados: ${jobsArray.length}`);
    console.log(`[BullMQ-Redis] Arquivos inseridos: ${todosArquivos.length}`);
    console.log(`[BullMQ-Redis] Lead ID: ${lead.id}`);
    console.log(`[BullMQ-Redis] LeadOabData ID: ${leadOabData.id}`);
    console.log(`[BullMQ-Redis] ==============================================`);
    
    return { leadId: leadOabData.id, jobsProcessados: jobsArray.length, arquivos: todosArquivos.length };
    
  } catch (error) {
    console.error(`[BullMQ-Redis] Erro ao processar lote Redis para lead ${sourceId}:`, error);
    throw error;
  }
}