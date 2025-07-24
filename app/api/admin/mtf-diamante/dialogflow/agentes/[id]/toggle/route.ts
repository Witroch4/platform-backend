// Local: /api/admin/dialogflow/agentes/[id]/toggle

import { type NextRequest, NextResponse } from 'next/server';
import { db as prisma } from '@/lib/db';
import { auth } from '@/auth';
import axios, { AxiosError } from 'axios';

// Helper para a configuração do Axios (mantido)
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

    const agenteParaAlternar = await prisma.agenteDialogflow.findFirst({
      where: { id: id, usuarioChatwitId: usuarioChatwit.id },
      include: { caixa: true }
    });

    if (!agenteParaAlternar || !agenteParaAlternar.caixa) {
      return NextResponse.json({ error: 'Agente ou caixa associada não encontrado' }, { status: 404 });
    }

    const accessToken = usuarioChatwit.chatwitAccessToken;
    const baseURL = process.env.CHATWIT_BASE_URL;
    
    const deveAtivar = !agenteParaAlternar.ativo;
    const novoStatusApi = deveAtivar ? 1 : 0;
    const acao = deveAtivar ? 'Ativação' : 'Desativação';
    
    console.log(`🔄 [AgenteToggle] Iniciando ${acao} do agente '${agenteParaAlternar.nome}'...`);

    const agenteAtualizado = await prisma.$transaction(async (tx) => {
      const accountId = agenteParaAlternar.caixa.chatwitAccountId;
      let hookIdParaSalvar = agenteParaAlternar.hookId;

      // Garante que só pode haver um agente ativo por vez
      if (deveAtivar) {
        await tx.agenteDialogflow.updateMany({
          where: { caixaId: agenteParaAlternar.caixaId, ativo: true, id: { not: id } },
          data: { ativo: false }
        });
        console.log(`[Transação] Outros agentes na mesma caixa foram desativados localmente.`);
      }

      try {
        if (hookIdParaSalvar) {
          console.log(`[Transação] Tentando ${acao} via PATCH no hook ${hookIdParaSalvar}...`);
          await axios.patch(
            `${baseURL}/api/v1/accounts/${accountId}/integrations/hooks/${hookIdParaSalvar}`,
            { status: novoStatusApi },
            getAxiosConfig(accessToken)
          );
        } else if (deveAtivar) {
          console.log(`[Transação] Agente sem hookId. Criando novo hook via POST...`);
          const hookResponse = await axios.post(
            `${baseURL}/api/v1/accounts/${accountId}/integrations/hooks`, 
            {
              app_id: 'dialogflow',
              inbox_id: Number.parseInt(agenteParaAlternar.caixa.inboxId),
              status: 1,
              settings: {
                project_id: agenteParaAlternar.projectId,
                credentials: JSON.parse(agenteParaAlternar.credentials)
              }
            }, 
            getAxiosConfig(accessToken)
          );
          hookIdParaSalvar = hookResponse.data.id.toString();
        } else {
          console.log(`[Transação] Agente sem hookId para desativar. Nenhuma chamada à API é necessária.`);
        }
      } catch (apiError) {
        // ==================================================================
        // == PONTO CHAVE DA CORREÇÃO: TRATAMENTO INTELIGENTE DO ERRO 404 ==
        // ==================================================================
        if (axios.isAxiosError(apiError) && apiError.response?.status === 404) {
          console.warn(`[Transação] Hook ${hookIdParaSalvar} não encontrado na API (404).`);
          
          if (deveAtivar) {
            // Se a AÇÃO ERA ATIVAR e o hook não existe, criamos um novo.
            console.log(`[Transação] Hook órfão detectado durante ativação. Criando um novo...`);
            const hookResponse = await axios.post(
              `${baseURL}/api/v1/accounts/${accountId}/integrations/hooks`,
              {
                app_id: 'dialogflow',
                inbox_id: Number.parseInt(agenteParaAlternar.caixa.inboxId),
                status: 1,
                settings: {
                  project_id: agenteParaAlternar.projectId,
                  credentials: JSON.parse(agenteParaAlternar.credentials)
                }
              },
              getAxiosConfig(accessToken)
            );
            hookIdParaSalvar = hookResponse.data.id.toString();
            console.log(`[Transação] Novo hook ${hookIdParaSalvar} criado com sucesso.`);
          } else {
            // Se a AÇÃO ERA DESATIVAR e o hook não existe, está tudo bem.
            // Apenas limpamos o hookId local para corrigir a dessincronização.
            console.log(`[Transação] Hook órfão detectado durante desativação. Apenas limpando ID local.`);
            hookIdParaSalvar = null;
          }
        } else {
          // Para qualquer outro erro, a transação deve falhar
          const errorMessage = ((apiError as AxiosError).response?.data as any)?.message || (apiError as Error).message;
          console.error(`❌ FALHA CRÍTICA na API durante ${acao}:`, { message: errorMessage });
          throw new Error(`Erro na API externa: ${errorMessage}`);
        }
      }

      // Atualiza o estado final do agente no nosso banco de dados
      return tx.agenteDialogflow.update({
        where: { id: id },
        data: { ativo: deveAtivar, hookId: hookIdParaSalvar }
      });
    });

    console.log(`✅ [AgenteToggle] ${acao} do agente '${agenteAtualizado.nome}' concluída com sucesso.`);
    return NextResponse.json({ message: `Agente ${deveAtivar ? 'ativado' : 'desativado'} com sucesso`, agente: agenteAtualizado });

  } catch (error: any) {
    console.error(`❌ [AgenteToggle] Erro na operação:`, error);
    return NextResponse.json({ error: 'Erro interno do servidor', details: error.message }, { status: 500 });
  }
}