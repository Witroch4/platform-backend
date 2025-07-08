import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { auth } from "@/auth";

const prisma = new PrismaClient();

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
      select: { role: true, customAccessToken: true }
    });

    if (!currentUser) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    // Definir filtros baseados na role
    let leadFilter: any = {};
    let arquivoFilter: any = {};

    if (currentUser.role !== "SUPERADMIN") {
      // Para ADMIN, filtrar apenas leads com o mesmo token
      if (!currentUser.customAccessToken) {
        return NextResponse.json({
          stats: {
            totalLeads: 0,
            totalArquivos: 0,
            pendentes: 0
          },
          charts: {
            leadsPorMes: [],
            leadsPorCanal: []
          }
        });
      }

      leadFilter = {
        chatwitAccessToken: currentUser.customAccessToken
      };

      arquivoFilter = {
        lead: {
          chatwitAccessToken: currentUser.customAccessToken
        }
      };
    }

    // Contar leads (filtrados ou todos)
    const totalLeads = await prisma.leadChatwit.count({
      where: leadFilter
    });

    // Contar arquivos (filtrados ou todos)
    const totalArquivos = await prisma.arquivoLeadChatwit.count({
      where: arquivoFilter
    });
    
    // Contar leads pendentes (não concluídos) - filtrados ou todos
    const pendentes = await prisma.leadChatwit.count({
      where: {
        ...leadFilter,
        concluido: false
      }
    });

    // Stats básicas
    const stats: any = {
      totalLeads,
      totalArquivos,
      pendentes
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
        mes: date.toLocaleDateString('pt-BR', { month: 'long' }),
        ano: date.getFullYear(),
        mesNumero: date.getMonth() + 1,
        primeiroDia: new Date(date.getFullYear(), date.getMonth(), 1),
        ultimoDia: new Date(date.getFullYear(), date.getMonth() + 1, 0)
      };
    });

    // Dados para gráfico de leads por mês (filtrados)
    const dadosLeadsPorMes = await Promise.all(
      ultimosDoisMeses.map(async (mesInfo) => {
        const leadsCount = await prisma.leadChatwit.count({
          where: {
            ...leadFilter,
            createdAt: {
              gte: mesInfo.primeiroDia,
              lte: mesInfo.ultimoDia
            }
          }
        });
        
        const leadsConcluidos = await prisma.leadChatwit.count({
          where: {
            ...leadFilter,
            createdAt: {
              gte: mesInfo.primeiroDia,
              lte: mesInfo.ultimoDia
            },
            concluido: true
          }
        });

        return {
          month: mesInfo.mes,
          leadsTotal: leadsCount,
          leadsConcluidos: leadsConcluidos
        };
      })
    );

    // Dados para gráfico de leads por canal (filtrados)
    const leadsComUsuarios = await prisma.leadChatwit.findMany({
      where: leadFilter,
      include: {
        usuario: {
          select: {
            channel: true
          }
        }
      }
    });

    // Agrupamento manual por canal
    const canalAgrupamento: Record<string, number> = {};
    leadsComUsuarios.forEach(lead => {
      const canal = lead.usuario?.channel || 'Desconhecido';
      canalAgrupamento[canal] = (canalAgrupamento[canal] || 0) + 1;
    });

    // Converter para o formato esperado pelo gráfico
    const leadsPorCanal = Object.entries(canalAgrupamento).map(([channel, leads]) => ({
      channel,
      leads
    })).sort((a, b) => b.leads - a.leads); // Ordenar do maior para o menor

    // Retornar todos os dados (filtrados por role)
    return NextResponse.json({
      stats,
      charts: {
        leadsPorMes: dadosLeadsPorMes.reverse(),
        leadsPorCanal
      }
    });
  } catch (error) {
    console.error("[API Stats] Erro ao buscar estatísticas:", error);
    return NextResponse.json(
      { error: "Erro interno ao buscar estatísticas" },
      { status: 500 }
    );
  }
} 