// Local: /api/admin/dialogflow/agentes/[id]/toggle

import { type NextRequest, NextResponse } from "next/server";
import { db as prisma } from "@/lib/db";
import { auth } from "@/auth";
import axios, { AxiosError } from "axios";

// Helper para a configuração do Axios (mantido)
const getAxiosConfig = (token: string) => ({
  headers: {
    api_access_token: token,
    "Content-Type": "application/json",
  },
});

/**
 * ATIVA um agente Dialogflow.
 * Cria um novo hook de integração e garante que nenhum outro agente esteja ativo na mesma caixa.
 * Método: POST
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id },
    });

    if (!usuarioChatwit?.chatwitAccessToken) {
      return NextResponse.json(
        { error: "Token de acesso não configurado" },
        { status: 400 }
      );
    }

    const agenteParaAtivar = await prisma.agenteDialogflow.findFirst({
      where: { id: id, usuarioChatwitId: usuarioChatwit.id },
      include: { inbox: true },
    });

    if (!agenteParaAtivar || !agenteParaAtivar.inbox) {
      return NextResponse.json(
        { error: "Agente ou inbox associada não encontrado" },
        { status: 404 }
      );
    }

    if (agenteParaAtivar.ativo) {
      return NextResponse.json(
        { message: "Agente já está ativo", agente: agenteParaAtivar },
        { status: 200 }
      );
    }

    const accessToken = usuarioChatwit.chatwitAccessToken;
    const baseURL = process.env.CHATWIT_BASE_URL;
    const accountId = usuarioChatwit.chatwitAccountId;

    console.log(
      `🔄 [Agente Ativação] Iniciando ativação do agente '${agenteParaAtivar.nome}'...`
    );

    const agenteAtualizado = await prisma.$transaction(async (tx) => {
      // 1. Garante que outros agentes na mesma inbox sejam desativados localmente primeiro
      console.log(`[Transação] Verificando agentes ativos na inbox ${agenteParaAtivar.inboxId}...`);
      
      const agentesAtivos = await tx.agenteDialogflow.findMany({
        where: {
          inboxId: agenteParaAtivar.inboxId,
          ativo: true,
        },
      });
      
      console.log(`[Transação] Encontrados ${agentesAtivos.length} agentes ativos na inbox`);
      agentesAtivos.forEach(agente => {
        console.log(`[Transação] - Agente ativo: ${agente.nome} (ID: ${agente.id})`);
      });

      const agentesParaDesativar = await tx.agenteDialogflow.updateMany({
        where: {
          inboxId: agenteParaAtivar.inboxId,
          ativo: true,
          id: { not: id },
        },
        data: { ativo: false },
      });
      
      console.log(
        `[Transação] ${agentesParaDesativar.count} agentes foram desativados localmente.`
      );

      // 1.5. Deletar hooks dos agentes que foram desativados
      if (agentesParaDesativar.count > 0) {
        console.log(`[Transação] Deletando hooks dos agentes desativados...`);
        
        // Buscar os agentes que foram desativados para pegar seus hookIds
        const agentesDesativados = await tx.agenteDialogflow.findMany({
          where: {
            inboxId: agenteParaAtivar.inboxId,
            ativo: false,
            id: { not: id },
            hookId: { not: null }, // Só agentes que têm hookId
          },
        });

        console.log(`[Transação] Encontrados ${agentesDesativados.length} agentes com hooks para deletar`);

        // Deletar cada hook no Chatwit
        for (const agente of agentesDesativados) {
          if (agente.hookId) {
            try {
              console.log(`[Transação] Deletando hook ${agente.hookId} do agente ${agente.nome}...`);
              
              await axios.delete(
                `${baseURL}/api/v1/accounts/${accountId}/integrations/hooks/${agente.hookId}`,
                getAxiosConfig(accessToken)
              );
              
              console.log(`[Transação] Hook ${agente.hookId} deletado com sucesso`);
              
              // Limpar o hookId no banco
              await tx.agenteDialogflow.update({
                where: { id: agente.id },
                data: { hookId: null },
              });
              
            } catch (hookError) {
              console.error(`[Transação] Erro ao deletar hook ${agente.hookId}:`, hookError);
              // Não falha a transação se não conseguir deletar o hook
            }
          }
        }
      }

      // 2. Cria o novo hook na API externa
      console.log(`[Transação] Criando novo hook via POST...`);
      let novoHookId: string;
      try {
        const hookResponse = await axios.post(
          `${baseURL}/api/v1/accounts/${accountId}/integrations/hooks`,
          {
            app_id: "dialogflow",
            inbox_id: Number.parseInt(agenteParaAtivar.inbox.inboxId),
            status: 1, // Sempre ativo
            settings: {
              project_id: agenteParaAtivar.projectId,
              credentials: JSON.parse(agenteParaAtivar.credentials),
              region: agenteParaAtivar.region, // Adicionando a região
            },
          },
          getAxiosConfig(accessToken)
        );
        novoHookId = hookResponse.data.id.toString();
        console.log(
          `[Transação] Novo hook ${novoHookId} criado com sucesso na API.`
        );
        console.log(
          `[Transação] Configurações enviadas: project_id=${agenteParaAtivar.projectId}, region=${agenteParaAtivar.region}`
        );
      } catch (apiError) {
        const errorMessage =
          ((apiError as AxiosError).response?.data as any)?.message ||
          (apiError as Error).message;
        console.error(`❌ FALHA CRÍTICA na API durante a criação do hook:`, {
          message: errorMessage,
        });
        throw new Error(`Erro ao criar hook na API externa: ${errorMessage}`);
      }

      // 3. Atualiza o agente no nosso banco com o status ativo e o novo hookId
      return tx.agenteDialogflow.update({
        where: { id: id },
        data: { ativo: true, hookId: novoHookId },
      });
    });

    console.log(
      `✅ [Agente Ativação] Agente '${agenteAtualizado.nome}' ativado com sucesso.`
    );
    return NextResponse.json({
      message: `Agente ativado com sucesso`,
      agente: agenteAtualizado,
    });
  } catch (error: any) {
    console.error(`❌ [Agente Ativação] Erro na operação:`, error);
    return NextResponse.json(
      { error: "Erro interno do servidor", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DESATIVA um agente Dialogflow.
 * Deleta o hook de integração associado.
 * Método: DELETE
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id },
    });

    if (!usuarioChatwit?.chatwitAccessToken) {
      return NextResponse.json(
        { error: "Token de acesso não configurado" },
        { status: 400 }
      );
    }

    const agenteParaDesativar = await prisma.agenteDialogflow.findFirst({
      where: { id: id, usuarioChatwitId: usuarioChatwit.id },
      include: { inbox: true },
    });

    if (!agenteParaDesativar || !agenteParaDesativar.inbox) {
      return NextResponse.json(
        { error: "Agente ou inbox associada não encontrado" },
        { status: 404 }
      );
    }

    if (!agenteParaDesativar.ativo) {
      return NextResponse.json(
        { message: "Agente já está desativado", agente: agenteParaDesativar },
        { status: 200 }
      );
    }

    const accessToken = usuarioChatwit.chatwitAccessToken;
    const baseURL = process.env.CHATWIT_BASE_URL;

    console.log(
      `🔄 [Agente Desativação] Iniciando desativação do agente '${agenteParaDesativar.nome}'...`
    );

    const agenteAtualizado = await prisma.$transaction(async (tx) => {
      const hookIdParaDeletar = agenteParaDesativar.hookId;

      // Debug: Log detalhado do agente e hook
      console.log(`[Transação] Debug do agente para desativação:`, {
        agenteId: agenteParaDesativar.id,
        agenteNome: agenteParaDesativar.nome,
        hookId: hookIdParaDeletar,
        ativo: agenteParaDesativar.ativo,
        inboxId: agenteParaDesativar.inboxId
      });

      // 1. Se houver um hookId, tenta deletá-lo na API externa
      if (hookIdParaDeletar) {
        const accountId = usuarioChatwit.chatwitAccountId;
        console.log(
          `[Transação] Tentando deletar o hook ${hookIdParaDeletar} via DELETE...`
        );
        console.log(`[Transação] URL da API: ${baseURL}/api/v1/accounts/${accountId}/integrations/hooks/${hookIdParaDeletar}`);
        
        try {
          const response = await axios.delete(
            `${baseURL}/api/v1/accounts/${accountId}/integrations/hooks/${hookIdParaDeletar}`,
            getAxiosConfig(accessToken)
          );
          console.log(
            `[Transação] Hook ${hookIdParaDeletar} deletado com sucesso na API. Status: ${response.status}`
          );
        } catch (apiError) {
          // Debug: Log detalhado do erro
          console.log(`[Transação] Erro ao deletar hook:`, {
            status: (apiError as AxiosError).response?.status,
            statusText: (apiError as AxiosError).response?.statusText,
            data: (apiError as AxiosError).response?.data,
            message: (apiError as Error).message
          });

          // Se o hook não foi encontrado (404), consideramos a operação um sucesso,
          // pois o estado desejado (sem hook) foi alcançado.
          if (
            axios.isAxiosError(apiError) &&
            apiError.response?.status === 404
          ) {
            console.warn(
              `[Transação] Hook ${hookIdParaDeletar} não encontrado na API (404). O estado já está consistente.`
            );
          } else {
            // Para qualquer outro erro, a transação deve falhar
            const errorMessage =
              ((apiError as AxiosError).response?.data as any)?.message ||
              (apiError as Error).message;
            console.error(
              `❌ FALHA CRÍTICA na API durante a deleção do hook:`,
              { message: errorMessage }
            );
            throw new Error(
              `Erro ao deletar hook na API externa: ${errorMessage}`
            );
          }
        }
      } else {
        console.log(
          `[Transação] Agente sem hookId para deletar. Nenhuma chamada à API é necessária.`
        );
      }

      // 2. Atualiza o estado do agente no nosso banco de dados
      return tx.agenteDialogflow.update({
        where: { id: id },
        data: { ativo: false, hookId: null }, // Limpa o hookId por consistência
      });
    });

    console.log(
      `✅ [Agente Desativação] Agente '${agenteAtualizado.nome}' desativado com sucesso.`
    );
    return NextResponse.json({
      message: `Agente desativado com sucesso`,
      agente: agenteAtualizado,
    });
  } catch (error: any) {
    console.error(`❌ [Agente Desativação] Erro na operação:`, error);
    return NextResponse.json(
      { error: "Erro interno do servidor", details: error.message },
      { status: 500 }
    );
  }
}
