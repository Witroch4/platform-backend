import { NextRequest, NextResponse } from 'next/server';
import { db as prisma } from '@/lib/db';
import { auth } from '@/auth';

// GET - Listar lotes
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Buscar o usuário Chatwit
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id }
    });

    if (!usuarioChatwit) {
      return NextResponse.json({ error: 'Usuário Chatwit não encontrado' }, { status: 404 });
    }

    const lotes = await prisma.loteOab.findMany({
      where: { usuarioChatwitId: usuarioChatwit.id },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ lotes });
  } catch (error) {
    console.error('Erro ao buscar lotes:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// POST - Criar novo lote
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { nome, valor, valorAnalise, chavePix, dataInicio, dataFim } = body;

    // Validar campos obrigatórios
    if (!nome || !valor || !valorAnalise || !chavePix || !dataInicio || !dataFim) {
      return NextResponse.json({ error: 'Campos obrigatórios não preenchidos' }, { status: 400 });
    }

    // Buscar o usuário Chatwit
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id }
    });

    if (!usuarioChatwit) {
      return NextResponse.json({ error: 'Usuário Chatwit não encontrado' }, { status: 404 });
    }

    // Criar lote no banco
    const lote = await prisma.loteOab.create({
      data: {
        nome,
        valor,
        valorAnalise,
        chavePix,
        dataInicio: new Date(dataInicio),
        dataFim: new Date(dataFim),
        usuarioChatwitId: usuarioChatwit.id
      }
    });

    return NextResponse.json({ 
      message: 'Lote criado com sucesso',
      lote 
    });
  } catch (error) {
    console.error('Erro ao criar lote:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
} 