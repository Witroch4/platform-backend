import { type NextRequest, NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections"
const prisma = getPrismaInstance();
import { auth } from "@/auth";
import axios from "axios";

// GET - Listar caixas configuradas
export async function GET() {
  try {
    console.log("🔍 [CaixasEntrada] Iniciando busca de caixas...");

    const session = await auth();
    if (!session?.user?.id) {
      console.log("❌ [CaixasEntrada] Usuário não autorizado");
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    console.log("👤 [CaixasEntrada] Usuário autenticado:", session.user.id);

    // Buscar o usuário Chatwit
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id },
    });

    if (!usuarioChatwit) {
      return NextResponse.json(
        { error: "Usuário Chatwit não encontrado" },
        { status: 404 }
      );
    }

    // Debug: Verificar agentes diretamente no banco primeiro
    const totalAgentes = await prisma.agenteDialogflow.count({
      where: { usuarioChatwitId: usuarioChatwit.id },
    });
    console.log(
      `🔍 [CaixasEntrada] Total de agentes no banco: ${totalAgentes}`
    );

    // Buscar caixas com agentes incluídos
    const caixas = await prisma.chatwitInbox.findMany({
      where: { usuarioChatwitId: usuarioChatwit.id },
      include: {
        agentes: {
          orderBy: { createdAt: "desc" }
        },
      },
      orderBy: { createdAt: "desc" },
    });

    console.log("📋 [CaixasEntrada] Caixas encontradas:", caixas.length);

    // Debug detalhado: verificar se os agentes estão sendo incluídos
    caixas.forEach((caixa, index) => {
      console.log(`📦 [CaixasEntrada] Caixa ${index + 1}: ${caixa.nome}`);
      console.log(`   - ID: ${caixa.id}`);
      console.log(`   - InboxID: ${caixa.inboxId}`);
      console.log(`   - Agentes: ${caixa.agentes?.length || 0}`);

      if (caixa.agentes && caixa.agentes.length > 0) {
        caixa.agentes.forEach((agente, agenteIndex) => {
          console.log(
            `     🤖 Agente ${agenteIndex + 1}: ${agente.nome} (${agente.ativo ? "ATIVO" : "INATIVO"})`
          );
          console.log(`        - ID: ${agente.id}`);
          console.log(`        - ProjectID: ${agente.projectId}`);
          console.log(`        - HookID: ${agente.hookId}`);
          console.log(`        - InboxID: ${agente.inboxId}`);
        });
      } else {
        console.log(`     ⚠️ Nenhum agente encontrado para esta caixa`);
      }
    });

    return NextResponse.json({ caixas });
  } catch (error) {
    const err = error as Error;
    console.error("❌ [CaixasEntrada] Erro ao buscar caixas:", error);
    return NextResponse.json(
      { error: "Erro interno", details: err.message },
      { status: 500 }
    );
  }
}

// POST - Criar nova caixa
export async function POST(request: NextRequest) {
  try {
    console.log("🚀 [CaixasEntrada] Iniciando criação de caixa...");

    const session = await auth();
    if (!session?.user?.id) {
      console.log("❌ [CaixasEntrada] Usuário não autorizado");
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await request.json();
    console.log("📝 [CaixasEntrada] Dados recebidos:", {
      nome: body.nome,
      accountId: body.accountId,
      inboxId: body.inboxId,
      inboxName: body.inboxName,
      channelType: body.channelType,
    });

    const { nome, accountId, inboxId, inboxName, channelType } = body;

    // Validar campos obrigatórios
    if (!nome || !accountId || !inboxId || !channelType) {
      console.log("❌ [CaixasEntrada] Campos obrigatórios não preenchidos");
      return NextResponse.json(
        { error: "Campos obrigatórios não preenchidos" },
        { status: 400 }
      );
    }

    // Buscar o usuário Chatwit
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id },
    });

    if (!usuarioChatwit) {
      return NextResponse.json(
        { error: "Usuário Chatwit não encontrado" },
        { status: 404 }
      );
    }

    // Verificar se a caixa já existe
    const caixaExistente = await prisma.chatwitInbox.findFirst({
      where: {
        usuarioChatwitId: usuarioChatwit.id,
        inboxId: inboxId,
      },
    });

    if (caixaExistente) {
      console.log("❌ [CaixasEntrada] Caixa já configurada");
      return NextResponse.json(
        { error: "Esta caixa de entrada já está configurada" },
        { status: 400 }
      );
    }

    // Criar caixa no banco
    console.log("💾 [CaixasEntrada] Salvando caixa no banco...");

    const caixa = await prisma.chatwitInbox.create({
      data: {
        nome,
        inboxId,
        channelType,
        usuarioChatwitId: usuarioChatwit.id,
      },
      include: {
        agentes: true,
      },
    });

    console.log("✅ [CaixasEntrada] Caixa criada com sucesso:", caixa.id);

    // --- BUSCAR E SINCRONIZAR AGENTES DIALOGFLOW ATIVOS DA ORIGEM ---
    const accessToken = usuarioChatwit.chatwitAccessToken;
    const baseURL = process.env.CHATWIT_BASE_URL;

    if (accessToken && baseURL) {
      try {
        console.log(
          "🔍 [CaixasEntrada] Buscando agentes Dialogflow ativos na origem para inbox:",
          inboxId
        );

        const appsResponse = await axios.get(
          `${baseURL}/api/v1/accounts/${accountId}/integrations/apps`,
          {
            headers: {
              api_access_token: accessToken,
              "Content-Type": "application/json",
            },
          }
        );

        const dialogflowApp = appsResponse.data.payload?.find(
          (app: any) => app.id === "dialogflow"
        );

        if (dialogflowApp?.hooks) {
          // Buscar todos os hooks Dialogflow para esta inbox
          const hooksParaInbox = dialogflowApp.hooks.filter(
            (h: any) => h.inbox?.id === Number.parseInt(inboxId)
          );

          console.log(
            `📋 [CaixasEntrada] Encontrados ${hooksParaInbox.length} agentes Dialogflow para esta inbox`
          );

          // Criar um agente para cada hook encontrado
          for (const hook of hooksParaInbox) {
            try {
              const agenteNome =
                hook.settings?.agent_name ||
                hook.settings?.project_id ||
                `Dialogflow-${hook.id}`;

              // Debug detalhado das configurações do hook
              console.log(`🔍 [CaixasEntrada] Configurações do hook ${hook.id}:`, {
                agent_name: hook.settings?.agent_name,
                project_id: hook.settings?.project_id,
                region: hook.settings?.region,
                status: hook.status,
                inbox_id: hook.inbox?.id
              });

              // Verificar se já existe um agente ativo nesta caixa
              const agenteAtivoExistente = await prisma.agenteDialogflow.findFirst({
                where: {
                  inboxId: caixa.id,
                  ativo: true,
                },
              });

              // Se já existe um agente ativo, criar este como inativo
              const deveSerAtivo = hook.status === true && !agenteAtivoExistente;

              const novoAgente = await prisma.agenteDialogflow.create({
                data: {
                  nome: agenteNome,
                  projectId: hook.settings?.project_id || "",
                  credentials: JSON.stringify(hook.settings?.credentials || {}),
                  region: hook.settings?.region || "global",
                  ativo: deveSerAtivo,
                  hookId: hook.id?.toString(),
                  inboxId: caixa.id,
                  usuarioChatwitId: usuarioChatwit.id,
                },
              });

              console.log(
                `✅ [CaixasEntrada] Agente "${agenteNome}" criado automaticamente (${deveSerAtivo ? "ATIVO" : "INATIVO"})`
              );
              console.log(`   📍 Região salva: ${novoAgente.region}`);
              
              if (hook.status === true && !deveSerAtivo) {
                console.log(`   ⚠️ Agente não foi ativado porque já existe outro agente ativo na caixa`);
              }
            } catch (agenteError: any) {
              console.error(
                `❌ [CaixasEntrada] Erro ao criar agente para hook ${hook.id}:`,
                agenteError.message
              );
            }
          }

          if (hooksParaInbox.length === 0) {
            console.log(
              "ℹ️ [CaixasEntrada] Nenhum agente Dialogflow encontrado para esta inbox na origem."
            );
          }
        } else {
          console.log(
            "ℹ️ [CaixasEntrada] Nenhuma integração Dialogflow encontrada na conta."
          );
        }
      } catch (e: any) {
        console.error(
          "❌ [CaixasEntrada] Erro ao buscar integrações Dialogflow:",
          e.message
        );
        console.error(
          "❌ [CaixasEntrada] Detalhes do erro:",
          e.response?.data || e
        );
      }
    } else {
      console.log(
        "⚠️ [CaixasEntrada] AccessToken ou baseURL não configurados. Não foi possível sincronizar agentes da origem."
      );
      console.log(
        "⚠️ [CaixasEntrada] Configure CHATWIT_BASE_URL no .env e verifique o token de acesso."
      );
    }

    return NextResponse.json({
      message: "Caixa configurada com sucesso",
      caixa,
    });
  } catch (error) {
    const err = error as Error;
    console.error("❌ [CaixasEntrada] Erro ao criar caixa:", error);
    return NextResponse.json(
      {
        error: "Erro interno",
        details: err.message,
      },
      { status: 500 }
    );
  }
}

// DELETE - Deletar caixa
export async function DELETE(request: NextRequest) {
  try {
    console.log("🗑️ [CaixasEntrada] Iniciando exclusão de caixa...");

    const session = await auth();
    if (!session?.user?.id) {
      console.log("❌ [CaixasEntrada] Usuário não autorizado");
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const caixaId = searchParams.get("id");

    if (!caixaId) {
      console.log("❌ [CaixasEntrada] ID da caixa não fornecido");
      return NextResponse.json(
        { error: "ID da caixa é obrigatório" },
        { status: 400 }
      );
    }

    console.log("🔍 [CaixasEntrada] Buscando caixa:", caixaId);

    // Buscar o usuário Chatwit
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id },
    });

    if (!usuarioChatwit) {
      return NextResponse.json(
        { error: "Usuário Chatwit não encontrado" },
        { status: 404 }
      );
    }

    // Buscar a caixa
    const caixa = await prisma.chatwitInbox.findFirst({
      where: {
        id: caixaId,
        usuarioChatwitId: usuarioChatwit.id,
      },
    });

    if (!caixa) {
      console.log("❌ [CaixasEntrada] Caixa não encontrada");
      return NextResponse.json(
        { error: "Caixa não encontrada" },
        { status: 404 }
      );
    }

    // Deletar caixa do banco (os agentes serão deletados automaticamente)
    await prisma.chatwitInbox.delete({
      where: { id: caixaId },
    });

    console.log("✅ [CaixasEntrada] Caixa deletada com sucesso");

    return NextResponse.json({ message: "Caixa deletada com sucesso" });
  } catch (error) {
    const err = error as Error;
    console.error("❌ [CaixasEntrada] Erro ao deletar caixa:", error);
    return NextResponse.json(
      {
        error: "Erro interno",
        details: err.message,
      },
      { status: 500 }
    );
  }
}
