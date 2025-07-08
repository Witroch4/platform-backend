import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';

    const skip = (page - 1) * limit;

    console.log(`[Marketing Leads API] Buscando leads para marketing - Página: ${page}, Limite: ${limit}, Busca: "${search}"`);

    // Construir condições de busca
    const whereConditions: any = {
      AND: [
        // Filtrar apenas leads com telefone válido
        {
          phoneNumber: {
            not: null
          }
        },
        {
          phoneNumber: {
            not: ""
          }
        }
      ]
    };

    // Filtrar por token do usuário se não for SUPERADMIN
    if (session.user.role !== "SUPERADMIN") {
      if (session.user.customAccessToken) {
        whereConditions.AND.push({
          chatwitAccessToken: session.user.customAccessToken
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

    // Adicionar condições de busca se fornecidas
    if (search.trim()) {
      whereConditions.AND.push({
        OR: [
          {
            name: {
              contains: search,
              mode: "insensitive"
            }
          },
          {
            nomeReal: {
              contains: search,
              mode: "insensitive"
            }
          },
          {
            email: {
              contains: search,
              mode: "insensitive"
            }
          },
          {
            phoneNumber: {
              contains: search,
              mode: "insensitive"
            }
          }
        ]
      });
    }

    // Buscar leads
    const leads = await db.leadChatwit.findMany({
      where: whereConditions,
      skip,
      take: limit,
      include: {
        usuario: {
          select: {
            id: true,
            name: true,
            availableName: true,
            channel: true,
            accountId: true,
            accountName: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Contar total de leads
    const total = await db.leadChatwit.count({
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