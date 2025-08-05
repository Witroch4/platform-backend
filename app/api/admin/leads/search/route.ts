// app/api/admin/leads/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPrismaInstance } from '@/lib/connections';
import { LeadSource } from '@prisma/client';

/**
 * GET - Busca avançada de leads com múltiplos critérios
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    
    // Parâmetros de busca
    const query = searchParams.get('q') || '';
    const source = searchParams.get('source') as LeadSource | null;
    const tags = searchParams.get('tags')?.split(',').filter(Boolean) || [];
    const hasEmail = searchParams.get('hasEmail') === 'true';
    const hasPhone = searchParams.get('hasPhone') === 'true';
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    
    // Parâmetros de paginação
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const skip = (page - 1) * limit;

    // Construir condições de busca
    const whereConditions: any = {
      userId: session.user.id,
    };

    // Filtro por source
    if (source && Object.values(LeadSource).includes(source)) {
      whereConditions.source = source;
    }

    // Filtro por tags
    if (tags.length > 0) {
      whereConditions.tags = {
        hasSome: tags,
      };
    }

    // Filtro por presença de email
    if (hasEmail) {
      whereConditions.email = { not: null };
    }

    // Filtro por presença de telefone
    if (hasPhone) {
      whereConditions.phone = { not: null };
    }

    // Filtro por data
    if (dateFrom || dateTo) {
      whereConditions.createdAt = {};
      if (dateFrom) {
        whereConditions.createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        whereConditions.createdAt.lte = new Date(dateTo);
      }
    }

    // Busca por texto em múltiplos campos
    if (query.trim()) {
      const searchTerms = query.trim().split(' ').filter(Boolean);
      
      whereConditions.OR = [
        // Busca em campos básicos
        { name: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query.replace(/\D/g, '') } },
        { sourceIdentifier: { contains: query, mode: 'insensitive' } },
        
        // Busca em tags
        { tags: { hasSome: searchTerms } },
        
        // Busca em dados específicos do Instagram
        ...(source === LeadSource.INSTAGRAM || !source ? [
          {
            instagramProfile: {
              OR: [
                { lead: { name: { contains: query, mode: 'insensitive' } } },
              ],
            },
          },
        ] : []),
        
        // Busca em dados específicos da OAB
        ...(source === LeadSource.CHATWIT_OAB || !source ? [
          {
            oabData: {
              OR: [
                { anotacoes: { contains: query, mode: 'insensitive' } },
                { seccional: { contains: query, mode: 'insensitive' } },
                { areaJuridica: { contains: query, mode: 'insensitive' } },
                { situacao: { contains: query, mode: 'insensitive' } },
                { inscricao: { contains: query, mode: 'insensitive' } },
              ],
            },
          },
        ] : []),
      ];
    }

    console.log(`[Lead Search API] Buscando leads - Query: "${query}", Source: ${source}, Página: ${page}`);

    // Executar busca
    const [leads, total] = await Promise.all([
      getPrismaInstance().lead.findMany({
        where: whereConditions,
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          account: {
            select: { id: true, provider: true },
          },
          instagramProfile: true,
          oabData: {
            select: {
              id: true,
              concluido: true,
              anotacoes: true,
              seccional: true,
              areaJuridica: true,
              notaFinal: true,
              situacao: true,
              inscricao: true,
              especialidade: true,
            },
          },
          _count: {
            select: {
              chats: true,
              automacoes: true,
              disparos: true,
            },
          },
        },
        orderBy: [
          // Priorizar leads com mais atividade
          { disparos: { _count: 'desc' } },
          { chats: { _count: 'desc' } },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      getPrismaInstance().lead.count({ where: whereConditions }),
    ]);

    // Formatar resposta com destaque dos termos encontrados
    const formattedLeads = leads.map(lead => {
      const result: any = {
        id: lead.id,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        avatarUrl: lead.avatarUrl,
        source: lead.source,
        sourceIdentifier: lead.sourceIdentifier,
        tags: lead.tags,
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
        user: lead.user,
        account: lead.account,
        stats: {
          chatsCount: lead._count.chats,
          automacoesCount: lead._count.automacoes,
          disparosCount: lead._count?.disparos ?? 0,
        },
      };

      // Adicionar dados específicos por source
      if (lead.source === LeadSource.INSTAGRAM && lead.instagramProfile) {
        result.instagramProfile = lead.instagramProfile;
      }

      if (lead.source === LeadSource.CHATWIT_OAB && lead.oabData) {
        result.oabData = lead.oabData;
      }

      // Adicionar informações de relevância da busca
      if (query.trim()) {
        const matchedFields: string[] = [];
        const queryLower = query.toLowerCase();
        
        if (lead.name?.toLowerCase().includes(queryLower)) matchedFields.push('name');
        if (lead.email?.toLowerCase().includes(queryLower)) matchedFields.push('email');
        if (lead.phone?.includes(query.replace(/\D/g, ''))) matchedFields.push('phone');
        if (lead.sourceIdentifier?.toLowerCase().includes(queryLower)) matchedFields.push('sourceIdentifier');
        if (lead.tags.some(tag => tag.toLowerCase().includes(queryLower))) matchedFields.push('tags');
        
        if (lead.oabData) {
          if (lead.oabData.anotacoes?.toLowerCase().includes(queryLower)) matchedFields.push('oabData.anotacoes');
          if (lead.oabData.seccional?.toLowerCase().includes(queryLower)) matchedFields.push('oabData.seccional');
          if (lead.oabData.areaJuridica?.toLowerCase().includes(queryLower)) matchedFields.push('oabData.areaJuridica');
          if (lead.oabData.situacao?.toLowerCase().includes(queryLower)) matchedFields.push('oabData.situacao');
          if (lead.oabData.inscricao?.toLowerCase().includes(queryLower)) matchedFields.push('oabData.inscricao');
        }

        result.searchRelevance = {
          matchedFields,
          score: matchedFields.length + (result.stats.disparosCount * 0.1) + (result.stats.chatsCount * 0.2),
        };
      }

      return result;
    });

    // Calcular metadados de paginação
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    // Estatísticas da busca
    const searchStats = {
      totalResults: total,
      bySource: {} as Record<string, number>,
      withEmail: 0,
      withPhone: 0,
      withTags: 0,
    };

    // Calcular estatísticas por source
    if (total > 0) {
      const sourceStats = await getPrismaInstance().lead.groupBy({
        by: ['source'],
        where: whereConditions,
        _count: true,
      });

      sourceStats.forEach(stat => {
        searchStats.bySource[stat.source] = stat._count;
      });

      // Contar leads com email, telefone e tags
      const [withEmailCount, withPhoneCount, withTagsCount] = await Promise.all([
        getPrismaInstance().lead.count({
          where: { ...whereConditions, email: { not: null } },
        }),
        getPrismaInstance().lead.count({
          where: { ...whereConditions, phone: { not: null } },
        }),
        getPrismaInstance().lead.count({
          where: { ...whereConditions, tags: { isEmpty: false } },
        }),
      ]);

      searchStats.withEmail = withEmailCount;
      searchStats.withPhone = withPhoneCount;
      searchStats.withTags = withTagsCount;
    }

    return NextResponse.json({
      leads: formattedLeads,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage,
        hasPrevPage,
      },
      searchParams: {
        query,
        source,
        tags,
        hasEmail,
        hasPhone,
        dateFrom,
        dateTo,
      },
      stats: searchStats,
    });

  } catch (error) {
    console.error('[Lead Search API] Erro na busca:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}