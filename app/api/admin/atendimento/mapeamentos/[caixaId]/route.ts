import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';

// GET: Lista todos os mapeamentos de uma caixa de entrada
export async function GET(request: NextRequest, { params }: { params: Promise<{ caixaId: string }> }) {
  const { caixaId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const mapeamentos = await db.mapeamentoIntencao.findMany({
      where: { caixaEntradaId: caixaId },
      include: {
        template: { select: { id: true, name: true } },
        mensagemInterativa: { select: { id: true, nome: true } },
      },
      orderBy: { intentName: 'asc' },
    });

    return NextResponse.json(mapeamentos);
  } catch (error) {
    console.error('Erro ao buscar mapeamentos:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST: Cria ou atualiza um mapeamento
export async function POST(request: NextRequest, { params }: { params: Promise<{ caixaId: string }> }) {
  const { caixaId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { id: mappingId, intentName, templateId, mensagemInterativaId } = body;

    if (!intentName || (!templateId && !mensagemInterativaId)) {
      return NextResponse.json({ error: 'Intenção e uma resposta (template ou mensagem) são obrigatórios.' }, { status: 400 });
    }
    
    if (templateId && mensagemInterativaId) {
        return NextResponse.json({ error: 'Escolha apenas uma resposta: template ou mensagem interativa.' }, { status: 400 });
    }

    const data = {
      intentName,
      caixaEntradaId: caixaId,
      templateId: templateId || null,
      mensagemInterativaId: mensagemInterativaId || null,
    };

    const savedMapping = await db.mapeamentoIntencao.upsert({
      where: { id: mappingId || '' },
      update: data,
      create: data,
    });

    return NextResponse.json(savedMapping, { status: 201 });
  } catch (error) {
    console.error('Erro ao salvar mapeamento:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
} 