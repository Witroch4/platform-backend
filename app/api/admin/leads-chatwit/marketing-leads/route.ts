import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Number.parseInt(searchParams.get('page') || '1');
    const limit = Number.parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const fezRecurso = searchParams.get('fezRecurso') === 'true';

    const skip = (page - 1) * limit;

    console.log(`[Marketing Leads API] Buscando leads para marketing - Página: ${page}, Limite: ${limit}, Busca: "${search}", Recurso: ${fezRecurso}`);

    // Construir condições de busca
    const whereConditions: any = {
      AND: [
        // Filtrar apenas leads com telefone válido
        {
          lead: {
            phone: {
              not: null
            }
          }
        },
        {
          lead: {
            phone: {
              not: ""
            }
          }
        }
      ]
    };

    // Buscar informações do usuário atual
    const currentUser = await db.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    if (!currentUser) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    // Buscar o usuário Chatwit
    const usuarioChatwit = await db.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id },
      select: { 
        chatwitAccountId: true,
        chatwitAccessToken: true 
      }
    });

    // Controle de acesso baseado em role
    if (currentUser.role !== "SUPERADMIN") {
      if (usuarioChatwit?.chatwitAccessToken) {
        // Para usuários não-SUPERADMIN, filtrar apenas leads do próprio usuário
        whereConditions.AND.push({
          usuarioChatwit: {
            appUserId: session.user.id
          }
        });
      } else {
        // Se o usuário não tem token, não pode ver nenhum lead
        return NextResponse.json({
          leads: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
          },
          success: true
        });
      }
    }
    // Se for SUPERADMIN, não adiciona filtro = mostra todos os leads

    // Adicionar filtro de recurso se fornecido
    if (fezRecurso) {
      whereConditions.AND.push({
        fezRecurso: true
      });
    }

    // Adicionar condições de busca se fornecidas
    if (search.trim()) {
      whereConditions.AND.push({
        OR: [
          {
            lead: {
              name: {
                contains: search,
                mode: "insensitive"
              }
            }
          },
          {
            nomeReal: {
              contains: search,
              mode: "insensitive"
            }
          },
          {
            lead: {
              email: {
                contains: search,
                mode: "insensitive"
              }
            }
          },
          {
            lead: {
              phone: {
                contains: search,
                mode: "insensitive"
              }
            }
          }
        ]
      });
    }

    // Buscar leads
    const leads = await db.leadOabData.findMany({
      where: whereConditions,
      skip,
      take: limit,
      include: {
        usuarioChatwit: {
          select: {
            id: true,
            name: true,
            availableName: true,
            channel: true,
            accountName: true
          }
        },
        lead: true
      }
    });

    // Contar total de leads
    const total = await db.leadOabData.count({
      where: whereConditions
    });

    const totalPages = Math.ceil(total / limit);

    console.log(`[Marketing Leads API] Encontrados ${leads.length} leads de ${total} total`);

    return NextResponse.json({
      leads,
      pagination: {
        page,
        limit,
        total,
        totalPages
      },
      success: true
    });

  } catch (error) {
    console.error("[API] Erro ao buscar leads para marketing:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
} 