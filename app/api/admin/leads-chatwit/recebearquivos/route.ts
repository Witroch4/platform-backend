// app/api/admin/leads-chatwit/recebearquivos/route.ts
import { NextResponse } from 'next/server';
import { getPrismaInstance } from '@/lib/connections';
import { addLeadJob } from '@/lib/queue/leads-chatwit.queue';
import type { WebhookPayload } from '@/types/webhook';
import { getWebhooksConfig } from '@/lib/config';

// Verificar se deve usar processamento direto (default: true)
const webhooksConfig = getWebhooksConfig();
const WEBHOOK_DIRECT_PROCESSING = webhooksConfig.direct_processing;

/**
 * Processa um lead diretamente (sem fila) - mesma lógica do worker
 */
async function processLeadDirectly(payload: WebhookPayload) {
  const { usuario, origemLead } = payload;
  const sourceId = origemLead.source_id;
  
  // Converter todos os IDs para string antes de usar
  const chatwitAccountId = String(usuario.account.id);
  const chatwitInboxId = String(usuario.inbox.id);
  const leadSourceId = String(origemLead.source_id);
  
  console.log(`[Webhook-Direct] IDs convertidos para string:`, {
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
        chatwitAccountId: chatwitAccountId
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
        appUserId: appUser.id,
        name: usuario.account.name,
        accountName: usuario.account.name,
        channel: usuario.channel,
        chatwitAccountId: chatwitAccountId
      }
    });
  }

  // 2) Criar ou buscar Account específica para esta conta Chatwit
  const CHATWIT_ACCOUNT_ID = `CHATWIT_${chatwitAccountId}`;
  
  let chatwitAccount = await getPrismaInstance().account.findUnique({
    where: { id: CHATWIT_ACCOUNT_ID }
  });
  
  if (!chatwitAccount) {
    chatwitAccount = await getPrismaInstance().account.create({
      data: {
        id: CHATWIT_ACCOUNT_ID,
        userId: usuarioDb.appUserId,
        type: 'chatwit',
        provider: 'chatwit',
        providerAccountId: chatwitAccountId,
      }
    });
    console.log(`[Webhook-Direct] Account criada para Chatwit ${chatwitAccountId}:`, chatwitAccount.id);
  }
  
  // 3) Criar/atualizar Lead
  const lead = await getPrismaInstance().lead.upsert({
    where: { 
      source_sourceIdentifier_accountId: {
        source: 'CHATWIT_OAB',
        sourceIdentifier: leadSourceId,
        accountId: CHATWIT_ACCOUNT_ID
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
      sourceIdentifier: leadSourceId,
      accountId: CHATWIT_ACCOUNT_ID,
      tags: [],
      userId: usuarioDb.appUserId
    }
  });

  console.log(`[Webhook-Direct] Lead criado/atualizado:`, {
    leadId: lead.id,
    sourceIdentifier: leadSourceId,
    accountId: CHATWIT_ACCOUNT_ID,
    usuarioChatwitId: usuarioDb.id,
    appUserId: usuarioDb.appUserId
  });

  // 4) Criar ou atualizar o LeadOabData
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

  // 5) Processar arquivos
  const arquivos = origemLead.arquivos || [];
  console.log(`[Webhook-Direct] Processando ${arquivos.length} arquivos diretamente`);

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
      console.log(`[Webhook-Direct] Inseridos ${result.count} arquivos diretamente`);
    } catch (error) {
      console.error(`[Webhook-Direct] Erro ao inserir arquivos:`, error);
    }
    
    // Verificar total de arquivos
    const totalArquivos = await getPrismaInstance().arquivoLeadOab.count({
      where: { leadOabDataId: leadOabData.id }
    });
    
    console.log(`[Webhook-Direct] Total de arquivos no banco para o lead ${sourceId}: ${totalArquivos}`);
  }

  // Log de conclusão
  console.log(`[Webhook-Direct] Lead processado diretamente - Lead: ${sourceId}, Arquivos: ${arquivos.length}`);
  
  return { leadId: leadOabData.id, arquivos: arquivos.length };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const payloadRaw = await request.json();

    // se vier array, pega o primeiro objeto
    const payload: WebhookPayload = Array.isArray(payloadRaw)
      ? payloadRaw[0]
      : payloadRaw;

    // validações mínimas
    if (!payload?.origemLead?.source_id) {
      return NextResponse.json(
        { success: false, error: 'source_id ausente' },
        { status: 400 }
      );
    }

    // validação do token de acesso (obrigatório) - agora busca dentro do campo usuario
    if (!payload?.usuario?.CHATWIT_ACCESS_TOKEN) {
      return NextResponse.json(
        { success: false, error: 'CHATWIT_ACCESS_TOKEN ausente no campo usuario' },
        { status: 400 }
      );
    }

    const processingMode = WEBHOOK_DIRECT_PROCESSING ? 'DIRETO' : 'FILA';
    console.log(`[Webhook-${processingMode}] Processando lead (modo: ${processingMode}) para token: ${payload.usuario.CHATWIT_ACCESS_TOKEN}`);
    
    // LOG DETALHADO dos dados recebidos
    console.log(`[Webhook-${processingMode}] === DADOS COMPLETOS DO USUARIO ===`);
    console.log(`[Webhook-${processingMode}] usuario.account.id:`, payload.usuario?.account?.id, `(tipo: ${typeof payload.usuario?.account?.id})`);
    console.log(`[Webhook-${processingMode}] usuario.account.name:`, payload.usuario?.account?.name);
    console.log(`[Webhook-${processingMode}] usuario.inbox.id:`, payload.usuario?.inbox?.id, `(tipo: ${typeof payload.usuario?.inbox?.id})`);
    console.log(`[Webhook-${processingMode}] usuario.inbox.name:`, payload.usuario?.inbox?.name);
    console.log(`[Webhook-${processingMode}] usuario.channel:`, payload.usuario?.channel);
    console.log(`[Webhook-${processingMode}] === DADOS DO LEAD ===`);
    console.log(`[Webhook-${processingMode}] origemLead.source_id:`, payload.origemLead?.source_id, `(tipo: ${typeof payload.origemLead?.source_id})`);
    console.log(`[Webhook-${processingMode}] origemLead.name:`, payload.origemLead?.name);
    console.log(`[Webhook-${processingMode}] origemLead.phone_number:`, payload.origemLead?.phone_number);
    console.log(`[Webhook-${processingMode}] origemLead.arquivos:`, payload.origemLead?.arquivos?.length || 0, 'arquivos');

    if (WEBHOOK_DIRECT_PROCESSING) {
      // PROCESSAMENTO DIRETO (sem fila)
      const result = await processLeadDirectly(payload);

      return NextResponse.json(
        { 
          success: true, 
          processed: true,
          mode: 'direct',
          leadId: result.leadId,
          arquivos: result.arquivos,
          sourceId: payload.origemLead.source_id
        },
        { status: 200 }
      );
    } else {
      // PROCESSAMENTO VIA FILA (para teste do worker)
      await addLeadJob({ payload });

      return NextResponse.json(
        { 
          success: true, 
          queued: true,
          mode: 'queue',
          sourceId: payload.origemLead.source_id
        },
        { status: 202 }
      );
    }
  } catch (err: any) {
    const processingMode = WEBHOOK_DIRECT_PROCESSING ? 'DIRETO' : 'FILA';
    console.error(`[Webhook-${processingMode}] erro ao processar:`, err);
    return NextResponse.json(
      { success: false, error: 'erro interno', mode: processingMode.toLowerCase(), details: err.message },
      { status: 500 }
    );
  }
}

export async function GET(): Promise<Response> {
  const processingMode = WEBHOOK_DIRECT_PROCESSING ? 'direto (sem fila)' : 'via fila BullMQ';
  return NextResponse.json(
    { 
      status: `Webhook operante - processando ${processingMode}`,
      mode: WEBHOOK_DIRECT_PROCESSING ? 'direct' : 'queue',
      concurrency: process.env.LEADS_CHATWIT_CONCURRENCY || 'default'
    },
    { status: 200 }
  );
}
