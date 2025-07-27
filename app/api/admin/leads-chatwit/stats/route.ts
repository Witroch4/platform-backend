import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

/**
 * GET - Retorna estatísticas dos leads do Chatwit (filtradas por role e token)
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Buscar informações do usuário atual
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (!currentUser) {
      return NextResponse.json(
        { error: "Usuário não encontrado" },
        { status: 404 }
      );
    }

    // Buscar o usuário Chatwit
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id },
      select: { chatwitAccessToken: true },
    });

    // Definir filtros baseados na role
    let leadFilter: any = {};
    let arquivoFilter: any = {};

    if (currentUser.role !== "SUPERADMIN") {
      // Para ADMIN, filtrar apenas leads relacionados ao token do usuário
      if (!usuarioChatwit?.chatwitAccessToken) {
        return NextResponse.json({
          stats: {
            totalLeads: 0,
            totalArquivos: 0,
            pendentes: 0,
          },
          charts: {
            leadsPorMes: [],
            leadsPorCanal: [],
          },
        });
      }

      // Para usuários não-SUPERADMIN, filtrar apenas dados do próprio usuário
      leadFilter = {
        usuarioChatwit: {
          appUserId: session.user.id,
        },
      };

      arquivoFilter = {
        leadOabData: {
          usuarioChatwit: {
            appUserId: session.user.id,
          },
        },
      };
    }
    // Se for SUPERADMIN, os filtros continuam vazios = mostra todos os dados

    // Contar leads (filtrados ou todos) - agora em paralelo
    const [totalLeads, totalArquivos, pendentes, aguardandoProcessamento] =
      await Promise.all([
        prisma.leadOabData.count({
          where: {
            ...leadFilter,
          },
        }),
        prisma.arquivoLeadOab.count({ where: arquivoFilter }),
        prisma.leadOabData.count({
          where: {
            ...leadFilter,
            concluido: false,
          },
        }),
        prisma.leadOabData.count({
          where: {
            ...leadFilter,
            OR: [
              { aguardandoManuscrito: true },
              { aguardandoEspelho: true },
              { aguardandoAnalise: true },
            ],
          },
        }),
      ]);
    // Stats básicas
    const stats: any = {
      totalLeads,
      totalArquivos,
      pendentes,
      aguardandoProcessamento,
    };

    // Adicionar totalUsuarios apenas para SUPERADMIN
    if (currentUser.role === "SUPERADMIN") {
      stats.totalUsuarios = await prisma.usuarioChatwit.count();
    }

    // Estatísticas mensais para gráficos
    const hoje = new Date();
    const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimosDoisMeses = Array.from({ length: 6 }, (_, i) => {
      const date = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      return {
        mes: date.toLocaleDateString("pt-BR", { month: "long" }),
        ano: date.getFullYear(),
        mesNumero: date.getMonth() + 1,
        primeiroDia: new Date(date.getFullYear(), date.getMonth(), 1),
        ultimoDia: new Date(date.getFullYear(), date.getMonth() + 1, 0),
      };
    });

    // Dados para gráfico de leads por mês (filtrados)
    const dadosLeadsPorMes = await Promise.all(
      ultimosDoisMeses.map(async (mesInfo) => {
        const leadsCount = await prisma.leadOabData.count({
          where: {
            ...leadFilter,
            lead: {
              createdAt: {
                gte: mesInfo.primeiroDia,
                lte: mesInfo.ultimoDia,
              },
            },
          },
        });

        const leadsConcluidos = await prisma.leadOabData.count({
          where: {
            ...leadFilter,
            lead: {
              createdAt: {
                gte: mesInfo.primeiroDia,
                lte: mesInfo.ultimoDia,
              },
            },
            concluido: true,
          },
        });

        return {
          month: mesInfo.mes,
          leadsTotal: leadsCount,
          leadsConcluidos: leadsConcluidos,
        };
      })
    );

    // Dados para gráfico de leads por canal (filtrados)
    const leadsPorCanalDb = await prisma.usuarioChatwit.findMany({
      where:
        currentUser.role !== "SUPERADMIN" ? { appUserId: session.user.id } : {},
      select: {
        channel: true,
        leadsOabData: {
          select: {
            id: true,
          },
        },
      },
    });
    const leadsPorCanal = leadsPorCanalDb
      .map((item: any) => ({
        channel: item.channel,
        leads: item.leadsOabData.length || 0,
      }))
      .sort((a: any, b: any) => b.leads - a.leads);

    // Retornar todos os dados (filtrados por role)
    return NextResponse.json({
      stats,
      charts: {
        leadsPorMes: dadosLeadsPorMes.reverse(),
        leadsPorCanal,
      },
    });
  } catch (error) {
    console.error("[API Stats] Erro ao buscar estatísticas:", error);
    return NextResponse.json(
      { error: "Erro interno ao buscar estatísticas" },
      { status: 500 }
    );
  }
}
