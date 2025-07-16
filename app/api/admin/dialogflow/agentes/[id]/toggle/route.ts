// Local: /api/admin/dialogflow/agentes/[id]/toggle

import { NextRequest, NextResponse } from 'next/server';
import { db as prisma } from '@/lib/db';
import { auth } from '@/auth';
import axios from 'axios';

// Helper para a configuração do Axios
const getAxiosConfig = (token: string) => ({
  headers: {
    'api_access_token': token,
    'Content-Type': 'application/json'
  }
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id }
    });

    if (!usuarioChatwit?.chatwitAccessToken) {
      return NextResponse.json({ error: 'Token de acesso não configurado' }, { status: 400 });
    }
    
    const accessToken = usuarioChatwit.chatwitAccessToken;
    const baseURL = process.env.CHATWIT_BASE_URL;

    // Busca o agente que será alterado e sua caixa
    const agenteParaAtivar = await prisma.agenteDialogflow.findFirst({
      where: { id: id, usuarioChatwitId: usuarioChatwit.id },
      include: { caixa: true }
    });

    if (!agenteParaAtivar || !agenteParaAtivar.caixa) {
      return NextResponse.json({ error: 'Agente ou caixa associada não encontrado' }, { status: 404 });
    }

    // Se o agente já está ativo, o objetivo é apenas desativá-lo.
    if (agenteParaAtivar.ativo) {
      console.log(`🔄 [AgenteToggle] Desativando agente '${agenteParaAtivar.nome}'...`);
      if (agenteParaAtivar.hookId) {
        try {
          // Desativa o hook na API externa
          await axios.patch(
            `${baseURL}/api/v1/accounts/${agenteParaAtivar.caixa.chatwitAccountId}/integrations/hooks/${agenteParaAtivar.hookId}`,
            { status: 0 },
            getAxiosConfig(accessToken)
          );
          console.log(`✅ [AgenteToggle] Hook ${agenteParaAtivar.hookId} desativado na API.`);
        } catch (apiError: any) {
          // Mesmo que falhe na API, continua para desativar no nosso DB, mas loga o erro.
          console.error(`❌ Erro ao desativar hook na API: ${apiError.message}`);
          // Você pode optar por retornar um erro aqui se a desativação na API for crítica
          // return NextResponse.json({ error: 'Falha ao desativar na API externa' }, { status: 502 });
        }
      }
      
      // Atualiza o status no banco de dados
      const agenteDesativado = await prisma.agenteDialogflow.update({
        where: { id: id },
        data: { ativo: false }
      });
      
      return NextResponse.json({ message: 'Agente desativado com sucesso', agente: agenteDesativado });
    }

    // --- Lógica para ATIVAR um novo agente ---
    // Este é o fluxo crítico que precisa de uma transação.
    
    console.log(`🔄 [AgenteToggle] Ativando agente '${agenteParaAtivar.nome}'...`);

    const agenteAtualizado = await prisma.$transaction(async (tx) => {
      const accountId = agenteParaAtivar.caixa.chatwitAccountId;

      // 1. Encontrar e desativar QUALQUER outro agente ativo na mesma caixa
      const agenteAtivoAtual = await tx.agenteDialogflow.findFirst({
        where: {
          caixaId: agenteParaAtivar.caixaId,
          ativo: true,
          id: { not: id } // Garante que não é o agente que queremos ativar
        }
      });

      if (agenteAtivoAtual) {
        console.log(`[Transação] Encontrado agente ativo: '${agenteAtivoAtual.nome}'. Desativando...`);
        // Desativa o hook do agente antigo na API
        if (agenteAtivoAtual.hookId) {
          try {
            await axios.patch(
              `${baseURL}/api/v1/accounts/${accountId}/integrations/hooks/${agenteAtivoAtual.hookId}`,
              { status: 0 },
              getAxiosConfig(accessToken)
            );
            console.log(`[Transação] Hook ${agenteAtivoAtual.hookId} do agente antigo desativado na API.`);
          } catch (e: any) {
            console.error(`❌ FALHA CRÍTICA: Não foi possível desativar o hook do agente antigo. Abortando operação.`);
            // Lançar um erro aqui aborta a transação inteira
            throw new Error(`Falha ao desativar o hook do agente '${agenteAtivoAtual.nome}'`);
          }
        }
        // Desativa o agente antigo no nosso banco de dados
        await tx.agenteDialogflow.update({
          where: { id: agenteAtivoAtual.id },
          data: { ativo: false }
        });
        console.log(`[Transação] Agente '${agenteAtivoAtual.nome}' desativado no banco de dados.`);
      }

      // 2. Ativar o novo agente
      let hookId;
      try {
        const settingsPayload = {
          project_id: agenteParaAtivar.projectId,
          credentials: JSON.parse(agenteParaAtivar.credentials)
        };
        const hookData = { 
          app_id: 'dialogflow', 
          inbox_id: parseInt(agenteParaAtivar.caixa.inboxId), 
          status: 1, 
          settings: settingsPayload 
        };

        // Para simplificar, vamos sempre criar/atualizar via API de integração principal.
        // A API do Chatwoot deve ser inteligente o suficiente para atualizar se já existir um para a inbox.
        // O ideal seria usar uma rota `upsert` se existisse. Como não há, criar ou atualizar é o caminho.
        // A lógica de procurar o hook antes pode ser mantida se necessário, mas a falha ocorria na ativação.
        console.log(`[Transação] Criando/Atualizando hook para o agente '${agenteParaAtivar.nome}'...`);
        const hookResponse = await axios.post(
          `${baseURL}/api/v1/accounts/${accountId}/integrations/hooks`, 
          hookData, 
          getAxiosConfig(accessToken)
        );
        
        hookId = hookResponse.data.id;
        console.log(`[Transação] Hook criado/atualizado com sucesso na API. Novo Hook ID: ${hookId}`);
        
      } catch (apiError: any) {
        console.error('❌ FALHA CRÍTICA: Erro ao criar/ativar novo hook na API:', { message: apiError.message, data: apiError.response?.data });
        // Lançar um erro aqui aborta a transação inteira
        throw new Error(`Erro ao comunicar com a API externa para ativar o agente: ${apiError.response?.data?.message || apiError.message}`);
      }
      
      // 3. Atualizar o novo agente como ativo no nosso DB
      return tx.agenteDialogflow.update({
        where: { id: id },
        data: { ativo: true, hookId: hookId.toString() }
      });
    });

    console.log(`✅ [AgenteToggle] Agente '${agenteAtualizado.nome}' ativado com sucesso.`);
    return NextResponse.json({ message: 'Agente ativado com sucesso', agente: agenteAtualizado });

  } catch (error: any) {
    console.error('❌ [AgenteToggle] Erro na operação:', error);
    // Retorna a mensagem de erro da transação ou um erro genérico
    return NextResponse.json({ error: 'Erro interno do servidor', details: error.message }, { status: 500 });
  }
}