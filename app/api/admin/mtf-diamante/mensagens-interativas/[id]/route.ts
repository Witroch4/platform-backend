
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';

// GET: Lista todas as mensagens interativas de uma caixa
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const mensagens = await db.mensagemInterativa.findMany({
      where: { caixaEntradaId: id },
      include: { botoes: true },
      orderBy: { nome: 'asc' },
    });

    return NextResponse.json(mensagens);
  } catch (error) {
    console.error(`Erro ao buscar mensagens interativas:`, error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST: Cria ou atualiza uma mensagem interativa
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const caixaId = id; // O ID da rota é o caixaId para POST
    const body = await request.json();
    const { id: mensagemId, nome, tipo, texto, headerTipo, headerConteudo, rodape, botoes } = body;

    if (!nome || !texto || !botoes || botoes.length === 0) {
      return NextResponse.json({ error: 'Nome, texto e pelo menos um botão são obrigatórios' }, { status: 400 });
    }
    
    const usuarioChatwit = await db.usuarioChatwit.findUnique({
        where: { appUserId: session.user.id },
    });

    if (!usuarioChatwit) {
        return NextResponse.json({ error: 'Usuário Chatwit não encontrado' }, { status: 404 });
    }

    // Lógica de Upsert para criar ou atualizar
    const savedMessage = await db.mensagemInterativa.upsert({
      where: { id: mensagemId || '' }, // Se não houver ID, a condição falha e ele cria
      update: {
        nome,
        texto,
        headerTipo,
        headerConteudo,
        rodape,
        botoes: {
          deleteMany: {},
          create: botoes.map((b: { titulo: string }, index: number) => ({ titulo: b.titulo, ordem: index + 1 })),
        },
      },
      create: {
        nome,
        tipo: tipo || 'atendimento', // um tipo padrão
        texto,
        headerTipo,
        headerConteudo,
        rodape,
        caixaEntradaId: caixaId,
        usuarioChatwitId: usuarioChatwit.id,
        botoes: {
          create: botoes.map((b: { titulo: string }, index: number) => ({ titulo: b.titulo, ordem: index + 1 })),
        },
      },
    });

    return NextResponse.json(savedMessage, { status: 201 });
  } catch (error) {
    console.error(`Erro ao criar/atualizar mensagem interativa:`, error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// DELETE: Exclui uma mensagem interativa
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    if (!id) {
        return NextResponse.json({ error: 'ID da mensagem é obrigatório' }, { status: 400 });
    }

    // O Prisma vai deletar em cascata os botões associados se o schema estiver configurado corretamente
    await db.mensagemInterativa.delete({
      where: { id: id },
    });

    return NextResponse.json({ message: 'Mensagem excluída com sucesso' }, { status: 200 });
  } catch (error) {
    console.error('Erro ao excluir mensagem interativa:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
