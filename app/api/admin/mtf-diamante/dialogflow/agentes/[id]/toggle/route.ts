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

// Local: /api/admin/dialogflow/agentes/[id]/toggle
// ... (importações e código inicial permanecem os mesmos) ...

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

    const agenteParaAtivar = await prisma.agenteDialogflow.findFirst({
      where: { id: id, usuarioChatwitId: usuarioChatwit.id },
      include: { caixa: true }
    });

    if (!agenteParaAtivar || !agenteParaAtivar.caixa) {
      return NextResponse.json({ error: 'Agente ou caixa associada não encontrado' }, { status: 404 });
    }

    // --- LÓGICA DE DESATIVAÇÃO (JÁ ESTAVA CORRETA) ---
    if (agenteParaAtivar.ativo) {
      console.log(`🔄 [AgenteToggle] Desativando agente '${agenteParaAtivar.nome}'...`);
      if (agenteParaAtivar.hookId) {
        try {
          await axios.patch(
            `${baseURL}/api/v1/accounts/${agenteParaAtivar.caixa.chatwitAccountId}/integrations/hooks/${agenteParaAtivar.hookId}`,
            { status: 0 }, // 0 para inativo
            getAxiosConfig(accessToken)
          );
          console.log(`✅ [AgenteToggle] Hook ${agenteParaAtivar.hookId} desativado na API.`);
        } catch (apiError: any) {
          console.error(`❌ Erro ao desativar hook na API: ${apiError.message}. Mesmo assim, desativando no DB local.`);
          // Continuar para garantir que o estado local fique consistente com a intenção do usuário
        }
      }
      
      const agenteDesativado = await prisma.agenteDialogflow.update({
        where: { id: id },
        data: { ativo: false }
      });
      
      return NextResponse.json({ message: 'Agente desativado com sucesso', agente: agenteDesativado });
    }

    // --- LÓGICA DE ATIVAÇÃO (CORRIGIDA) ---
    console.log(`🔄 [AgenteToggle] Ativando agente '${agenteParaAtivar.nome}'...`);

    const agenteAtualizado = await prisma.$transaction(async (tx) => {
      const accountId = agenteParaAtivar.caixa.chatwitAccountId;

      // 1. Desativar qualquer outro agente ativo na mesma caixa (lógica mantida, está correta)
      const agenteAtivoAtual = await tx.agenteDialogflow.findFirst({
        where: {
          caixaId: agenteParaAtivar.caixaId,
          ativo: true,
          id: { not: id }
        }
      });

      if (agenteAtivoAtual && agenteAtivoAtual.hookId) {
        console.log(`[Transação] Desativando agente antigo: '${agenteAtivoAtual.nome}'.`);
        try {
          await axios.patch(
            `${baseURL}/api/v1/accounts/${accountId}/integrations/hooks/${agenteAtivoAtual.hookId}`,
            { status: 0 },
            getAxiosConfig(accessToken)
          );
          await tx.agenteDialogflow.update({
            where: { id: agenteAtivoAtual.id },
            data: { ativo: false }
          });
          console.log(`[Transação] Agente '${agenteAtivoAtual.nome}' desativado com sucesso.`);
        } catch (e: any) {
          console.error(`❌ FALHA CRÍTICA ao desativar hook do agente antigo: ${e.message}`);
          throw new Error(`Falha ao desativar o hook do agente '${agenteAtivoAtual.nome}'`);
        }
      }

      // 2. Ativar o novo agente (LÓGICA CORRIGIDA)
      let hookIdParaSalvar = agenteParaAtivar.hookId;

      try {
        if (hookIdParaSalvar) {
          // SE JÁ TEM HOOK ID, APENAS ATUALIZA O STATUS (PATCH)
          console.log(`[Transação] Reativando hook existente (${hookIdParaSalvar}) para o agente '${agenteParaAtivar.nome}'...`);
          await axios.patch(
            `${baseURL}/api/v1/accounts/${accountId}/integrations/hooks/${hookIdParaSalvar}`,
            { status: 1 }, // 1 para ativo
            getAxiosConfig(accessToken)
          );
          console.log(`[Transação] Hook ${hookIdParaSalvar} reativado com sucesso na API.`);

        } else {
          // SE NÃO TEM HOOK ID, CRIA PELA PRIMEIRA VEZ (POST)
          console.log(`[Transação] Criando novo hook para o agente '${agenteParaAtivar.nome}' (primeira ativação)...`);
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
          const hookResponse = await axios.post(
            `${baseURL}/api/v1/accounts/${accountId}/integrations/hooks`, 
            hookData, 
            getAxiosConfig(accessToken)
          );
          
          hookIdParaSalvar = hookResponse.data.id.toString();
          console.log(`[Transação] Novo hook criado com sucesso. Hook ID: ${hookIdParaSalvar}`);
        }
      } catch (apiError: any) {
         console.error('❌ FALHA CRÍTICA: Erro ao criar/ativar hook na API:', { message: apiError.message, data: apiError.response?.data });
         throw new Error(`Erro na API externa ao ativar agente: ${apiError.response?.data?.message || apiError.message}`);
      }
      
      // 3. Atualizar o novo agente como ativo no nosso DB
      return tx.agenteDialogflow.update({
        where: { id: id },
        data: { ativo: true, hookId: hookIdParaSalvar }
      });
    });

    console.log(`✅ [AgenteToggle] Agente '${agenteAtualizado.nome}' ativado com sucesso.`);
    return NextResponse.json({ message: 'Agente ativado com sucesso', agente: agenteAtualizado });

  } catch (error: any) {
    console.error('❌ [AgenteToggle] Erro na operação:', error);
    return NextResponse.json({ error: 'Erro interno do servidor', details: error.message }, { status: 500 });
  }
}