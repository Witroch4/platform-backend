// app/api/admin/leads/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { LeadSource } from '@prisma/client';

/**
 * GET - Busca um lead específico com dados condicionais baseados no source
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'ID do lead é obrigatório' },
        { status: 400 }
      );
    }

    // Buscar lead com todos os dados relacionados
    const lead = await prisma.lead.findFirst({
      where: {
        id,
        userId: session.user.id, // Garantir que o lead pertence ao usuário
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        account: {
          select: { id: true, provider: true, igUserId: true, igUsername: true },
        },
        instagramProfile: true,
        oabData: {
          include: {
            usuarioChatwit: {
              select: { id: true, name: true, accountName: true },
            },
            arquivos: {
              select: {
                id: true,
                fileType: true,
                dataUrl: true,
                pdfConvertido: true,
                createdAt: true,
              },
            },
            espelhoBiblioteca: {
              select: {
                id: true,
                nome: true,
                descricao: true,
              },
            },
          },
        },
        automacoes: {
          include: {
            automacao: {
              select: {
                id: true,
                palavrasChave: true,
                fraseBoasVindas: true,
                live: true,
                createdAt: true,
              },
            },
          },
        },
        chats: {
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 10, // Últimas 10 mensagens
              select: {
                id: true,
                content: true,
                isFromLead: true,
                createdAt: true,
              },
            },
          },
        },
        disparos: {
          orderBy: { createdAt: 'desc' },
          take: 20, // Últimos 20 disparos
          select: {
            id: true,
            templateName: true,
            status: true,
            scheduledAt: true,
            sentAt: true,
            errorMessage: true,
            createdAt: true,
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
    });

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead não encontrado' },
        { status: 404 }
      );
    }

    // Formatar resposta com dados condicionais baseados no source
    const response: any = {
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
      automacoes: lead.automacoes,
      chats: lead.chats,
      disparos: lead.disparos,
    };

    // Adicionar dados específicos baseados no source
    if (lead.source === LeadSource.INSTAGRAM && lead.instagramProfile) {
      response.instagramProfile = lead.instagramProfile;
    }

    if (lead.source === LeadSource.CHATWIT_OAB && lead.oabData) {
      response.oabData = lead.oabData;
    }

    console.log(`[Lead Detail API] Lead encontrado: ${lead.id} (${lead.source})`);

    return NextResponse.json(response);

  } catch (error) {
    console.error('[Lead Detail API] Erro ao buscar lead:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

/**
 * PUT - Atualiza um lead com dados condicionais baseados no source
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'ID do lead é obrigatório' },
        { status: 400 }
      );
    }

    // Verificar se o lead existe e pertence ao usuário
    const existingLead = await prisma.lead.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        instagramProfile: true,
        oabData: true,
      },
    });

    if (!existingLead) {
      return NextResponse.json(
        { error: 'Lead não encontrado' },
        { status: 404 }
      );
    }

    const {
      name,
      email,
      phone,
      avatarUrl,
      tags,
      // Dados específicos por source
      instagramProfile,
      oabData,
    } = body;

    // Preparar dados de atualização
    const updateData: any = {};

    // Campos básicos
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
    if (tags !== undefined) updateData.tags = tags;

    // Atualizar dados específicos por source
    if (existingLead.source === LeadSource.INSTAGRAM && instagramProfile) {
      if (existingLead.instagramProfile) {
        // Atualizar perfil existente
        updateData.instagramProfile = {
          update: {
            isFollower: instagramProfile.isFollower,
            lastMessageAt: instagramProfile.lastMessageAt ? new Date(instagramProfile.lastMessageAt) : null,
            isOnline: instagramProfile.isOnline,
          },
        };
      } else {
        // Criar novo perfil
        updateData.instagramProfile = {
          create: {
            isFollower: instagramProfile.isFollower || false,
            lastMessageAt: instagramProfile.lastMessageAt ? new Date(instagramProfile.lastMessageAt) : null,
            isOnline: instagramProfile.isOnline || false,
          },
        };
      }
    }

    if (existingLead.source === LeadSource.CHATWIT_OAB && oabData) {
      if (existingLead.oabData) {
        // Atualizar dados OAB existentes
        const oabUpdateData: any = {};
        if (oabData.concluido !== undefined) oabUpdateData.concluido = oabData.concluido;
        if (oabData.anotacoes !== undefined) oabUpdateData.anotacoes = oabData.anotacoes;
        if (oabData.seccional !== undefined) oabUpdateData.seccional = oabData.seccional;
        if (oabData.areaJuridica !== undefined) oabUpdateData.areaJuridica = oabData.areaJuridica;
        if (oabData.especialidade !== undefined) oabUpdateData.especialidade = oabData.especialidade;
        if (oabData.inscricao !== undefined) oabUpdateData.inscricao = oabData.inscricao;
        if (oabData.situacao !== undefined) oabUpdateData.situacao = oabData.situacao;
        if (oabData.notaFinal !== undefined) oabUpdateData.notaFinal = oabData.notaFinal;
        if (oabData.fezRecurso !== undefined) oabUpdateData.fezRecurso = oabData.fezRecurso;
        if (oabData.datasRecurso !== undefined) oabUpdateData.datasRecurso = oabData.datasRecurso;

        updateData.oabData = {
          update: oabUpdateData,
        };
      }
    }

    // Executar atualização
    const updatedLead = await prisma.lead.update({
      where: { id },
      data: updateData,
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
      },
    });

    console.log(`[Lead Detail API] Lead atualizado: ${updatedLead.id} (${updatedLead.source})`);

    return NextResponse.json(updatedLead);

  } catch (error) {
    console.error('[Lead Detail API] Erro ao atualizar lead:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Remove um lead
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'ID do lead é obrigatório' },
        { status: 400 }
      );
    }

    // Verificar se o lead existe e pertence ao usuário
    const existingLead = await prisma.lead.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!existingLead) {
      return NextResponse.json(
        { error: 'Lead não encontrado' },
        { status: 404 }
      );
    }

    // Remover lead (dados relacionados serão removidos em cascata)
    await prisma.lead.delete({
      where: { id },
    });

    console.log(`[Lead Detail API] Lead removido: ${id} (${existingLead.source})`);

    return NextResponse.json({ message: 'Lead removido com sucesso' });

  } catch (error) {
    console.error('[Lead Detail API] Erro ao remover lead:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}